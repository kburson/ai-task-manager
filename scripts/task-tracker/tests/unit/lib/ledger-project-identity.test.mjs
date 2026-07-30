// @story #1049
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { openProjectDatabase } from '../../../../../packages/aitm-ledger/src/sqlite/open.mjs';
import { ensureLedgerProjectIdentity } from '../../../lib/ledger/project-identity.mjs';

function sandbox() {
  const root = mkdtempSync(path.join(os.tmpdir(), 'aitm-project-id-'));
  return {
    root,
    dbPath: path.join(root, '.db', 'aitm', 'project.sqlite'),
    configPath: path.join(root, '.ai-task-manager', 'task-tracker.json'),
  };
}

function metadataId(db) {
  return db.prepare("SELECT value FROM ledger_metadata WHERE key = 'ledgerProjectId'").get()?.value;
}

test('neither side bootstraps DB first then atomically persists the same identity', () => {
  const box = sandbox();
  try {
    const db = openProjectDatabase({ databasePath: box.dbPath });
    const identity = ensureLedgerProjectIdentity({
      db,
      configPath: box.configPath,
      uuid: () => '11111111-1111-4111-8111-111111111111',
    });
    assert.equal(identity, '11111111-1111-4111-8111-111111111111');
    assert.equal(metadataId(db), identity);
    assert.equal(JSON.parse(readFileSync(box.configPath, 'utf8')).ledgerProjectId, identity);
    db.close();
  } finally {
    rmSync(box.root, { recursive: true, force: true });
  }
});

test('restart repairs a crash after DB commit and config-only bootstrap initializes DB', () => {
  const box = sandbox();
  try {
    const db = openProjectDatabase({ databasePath: box.dbPath });
    assert.throws(
      () =>
        ensureLedgerProjectIdentity({
          db,
          configPath: box.configPath,
          uuid: () => '22222222-2222-4222-8222-222222222222',
          afterDatabaseCommit: () => {
            throw new Error('simulated crash');
          },
        }),
      /simulated crash/
    );
    assert.equal(existsSync(box.configPath), false);
    const repaired = ensureLedgerProjectIdentity({ db, configPath: box.configPath });
    assert.equal(repaired, '22222222-2222-4222-8222-222222222222');
    db.close();

    const other = sandbox();
    try {
      mkdirSync(path.dirname(other.configPath), { recursive: true });
      writeFileSync(
        other.configPath,
        JSON.stringify({
          projectId: 'PVT_GITHUB_PROJECT',
          ledgerProjectId: '33333333-3333-4333-8333-333333333333',
        })
      );
      const db2 = openProjectDatabase({ databasePath: other.dbPath });
      assert.equal(
        ensureLedgerProjectIdentity({ db: db2, configPath: other.configPath }),
        '33333333-3333-4333-8333-333333333333'
      );
      assert.equal(metadataId(db2), '33333333-3333-4333-8333-333333333333');
      assert.notEqual(metadataId(db2), 'PVT_GITHUB_PROJECT');
      db2.close();
    } finally {
      rmSync(other.root, { recursive: true, force: true });
    }
  } finally {
    rmSync(box.root, { recursive: true, force: true });
  }
});

test('equal identities converge across connections and mismatch fails closed', () => {
  const box = sandbox();
  try {
    const one = openProjectDatabase({ databasePath: box.dbPath });
    const id = ensureLedgerProjectIdentity({
      db: one,
      configPath: box.configPath,
      uuid: () => '44444444-4444-4444-8444-444444444444',
    });
    const two = openProjectDatabase({ databasePath: box.dbPath });
    assert.equal(ensureLedgerProjectIdentity({ db: two, configPath: box.configPath }), id);
    const config = JSON.parse(readFileSync(box.configPath, 'utf8'));
    writeFileSync(box.configPath, JSON.stringify({ ...config, ledgerProjectId: 'different' }));
    assert.throws(
      () => ensureLedgerProjectIdentity({ db: two, configPath: box.configPath }),
      (error) => error.code === 'invalid-request'
    );
    one.close();
    two.close();
  } finally {
    rmSync(box.root, { recursive: true, force: true });
  }
});

test('malformed config fails closed without destructive replacement', () => {
  const box = sandbox();
  try {
    mkdirSync(path.dirname(box.configPath), { recursive: true });
    writeFileSync(box.configPath, '{ malformed');
    const db = openProjectDatabase({ databasePath: box.dbPath });
    assert.throws(
      () =>
        ensureLedgerProjectIdentity({
          db,
          configPath: box.configPath,
          uuid: () => '55555555-5555-4555-8555-555555555555',
        }),
      (error) => error.code === 'invalid-request'
    );
    assert.equal(readFileSync(box.configPath, 'utf8'), '{ malformed');
    assert.equal(metadataId(db), undefined);
    db.close();
  } finally {
    rmSync(box.root, { recursive: true, force: true });
  }
});

test('ledger identity must be a UUID distinct from the GitHub Projects identity', () => {
  const box = sandbox();
  try {
    mkdirSync(path.dirname(box.configPath), { recursive: true });
    writeFileSync(
      box.configPath,
      JSON.stringify({
        projectId: 'PVT_GITHUB_PROJECT',
        ledgerProjectId: 'PVT_GITHUB_PROJECT',
      })
    );
    const db = openProjectDatabase({ databasePath: box.dbPath });
    assert.throws(
      () => ensureLedgerProjectIdentity({ db, configPath: box.configPath }),
      (error) => error.code === 'invalid-request'
    );
    assert.equal(metadataId(db), undefined);

    writeFileSync(
      box.configPath,
      JSON.stringify({
        projectId: 'PVT_GITHUB_PROJECT',
        ledgerProjectId: 'not-a-uuid',
      })
    );
    assert.throws(
      () => ensureLedgerProjectIdentity({ db, configPath: box.configPath }),
      (error) => error.code === 'invalid-request'
    );
    assert.equal(metadataId(db), undefined);
    db.close();
  } finally {
    rmSync(box.root, { recursive: true, force: true });
  }
});
