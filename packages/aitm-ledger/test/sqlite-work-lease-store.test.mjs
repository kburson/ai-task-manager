// @story #1049
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fork } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { openProjectDatabase } from '../src/sqlite/open.mjs';
import { SqliteWorkLeaseStore } from '../src/sqlite/work-lease-store.mjs';
import { assertLeaseStoreConformance } from './fixtures/lease-conformance.mjs';

const NOW = '2026-07-30T12:00:00.000Z';
const CONTENDER_FIXTURE = fileURLToPath(
  new URL('./fixtures/sqlite-contender.mjs', import.meta.url)
);

function holder(overrides = {}) {
  return {
    principalKind: 'worker',
    provider: 'codex',
    agentRunId: 'run-1',
    sessionId: 'session-1',
    hostId: 'host-1',
    worktreeId: 'wt:v1:one',
    pathHash: 'path-one',
    branch: 'feature/child/1049',
    pid: 123,
    ...overrides,
  };
}

function acquire(overrides = {}) {
  return {
    projectId: 'project-1',
    issueId: '1049',
    mode: 'write',
    idempotencyKey: 'acquire-1',
    requestedAt: NOW,
    ttlMs: 900_000,
    holder: holder(),
    ...overrides,
  };
}

test('open configures durable schema, WAL, foreign keys, and busy timeout', () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'aitm-sqlite-open-'));
  try {
    const db = openProjectDatabase({ databasePath: path.join(dir, 'project.sqlite') });
    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table'")
      .all()
      .map((row) => row.name);
    for (const table of [
      'schema_migrations',
      'ledger_metadata',
      'work_leases',
      'work_lease_events',
      'work_bindings',
      'lease_fences',
    ]) {
      assert.ok(tables.includes(table), `missing table ${table}`);
    }
    assert.equal(db.prepare('PRAGMA journal_mode').get().journal_mode, 'wal');
    assert.equal(db.prepare('PRAGMA foreign_keys').get().foreign_keys, 1);
    assert.equal(db.prepare('PRAGMA busy_timeout').get().timeout, 5000);
    db.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('SQLite adapter satisfies the shared lease conformance suite', async () => {
  const stores = [];
  try {
    await assertLeaseStoreConformance({
      assert,
      createStore: () => {
        const db = openProjectDatabase({ databasePath: ':memory:' });
        const store = new SqliteWorkLeaseStore({ db, isHolderLive: () => false });
        stores.push(store);
        return store;
      },
    });
  } finally {
    for (const store of stores) store.close();
  }
});

test('linked connections serialize one winner and persist idempotent responses', () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'aitm-sqlite-contention-'));
  const databasePath = path.join(dir, 'project.sqlite');
  try {
    const first = new SqliteWorkLeaseStore({ db: openProjectDatabase({ databasePath }) });
    const second = new SqliteWorkLeaseStore({ db: openProjectDatabase({ databasePath }) });
    const lease = first.acquire(acquire());
    assert.throws(
      () =>
        second.acquire(
          acquire({
            idempotencyKey: 'contended',
            holder: holder({ agentRunId: 'run-2', sessionId: 'session-2', pid: 456 }),
          })
        ),
      (error) => error.code === 'lease-contended'
    );
    first.release({
      projectId: 'project-1',
      leaseId: lease.leaseId,
      fencingToken: lease.fencingToken,
      idempotencyKey: 'release-1',
      releasedAt: NOW,
      reason: 'done',
    });
    assert.throws(
      () =>
        second.acquire(
          acquire({
            idempotencyKey: 'contended',
            holder: holder({ agentRunId: 'run-2', sessionId: 'session-2', pid: 456 }),
          })
        ),
      (error) => error.code === 'lease-contended',
      'terminal contention replay survives state change and connection boundary'
    );
    first.close();
    second.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

function runContender(databasePath, request) {
  return new Promise((resolve, reject) => {
    const child = fork(CONTENDER_FIXTURE, {
      stdio: ['ignore', 'ignore', 'pipe', 'ipc'],
    });
    let stderr = '';
    child.stderr.setEncoding('utf8');
    child.stderr.on('data', (chunk) => {
      stderr += chunk;
    });
    child.once('error', reject);
    child.once('message', resolve);
    child.once('exit', (code) => {
      if (code && code !== 0) {
        reject(new Error(`contender exited ${code}: ${stderr}`));
      }
    });
    child.send({ databasePath, request });
  });
}

test('separate processes contend through one database with one sanitized loser', async () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'aitm-sqlite-process-contention-'));
  const databasePath = path.join(dir, 'project.sqlite');
  try {
    const results = await Promise.all([
      runContender(databasePath, acquire({ idempotencyKey: 'process-one' })),
      runContender(
        databasePath,
        acquire({
          idempotencyKey: 'process-two',
          holder: holder({
            agentRunId: 'run-2',
            sessionId: 'session-2',
            worktreeId: 'wt:v1:two',
            pathHash: 'path-two',
            pid: 456,
          }),
        })
      ),
    ]);
    const winners = results.filter((result) => result.ok);
    const losers = results.filter((result) => !result.ok);
    assert.equal(winners.length, 1);
    assert.equal(losers.length, 1);
    assert.equal(losers[0].error.code, 'lease-contended');
    assert.equal('stack' in losers[0].error, false);
    assert.equal(JSON.stringify(losers[0]).includes(databasePath), false);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('paused leases retain both unique constraints and live holders resist takeover', () => {
  const db = openProjectDatabase({ databasePath: ':memory:' });
  const store = new SqliteWorkLeaseStore({ db, isHolderLive: () => true });
  const lease = store.acquire(acquire());
  db.prepare("UPDATE work_leases SET state = 'paused' WHERE lease_id = ?").run(lease.leaseId);
  assert.throws(
    () =>
      store.acquire(
        acquire({
          idempotencyKey: 'paused-issue',
          holder: holder({ agentRunId: 'run-2', sessionId: 'session-2', pid: 456 }),
        })
      ),
    (error) => error.code === 'lease-contended'
  );
  assert.throws(
    () =>
      store.acquire(
        acquire({
          issueId: '1051',
          idempotencyKey: 'paused-worktree',
          holder: holder({ agentRunId: 'run-3', sessionId: 'session-3', pid: 789 }),
        })
      ),
    (error) => error.code === 'worktree-contended'
  );
  assert.throws(
    () =>
      store.takeover({
        projectId: 'project-1',
        issueId: '1049',
        expectedLeaseId: lease.leaseId,
        expectedToken: lease.fencingToken,
        idempotencyKey: 'live-takeover',
        observedAt: NOW,
        reason: 'operator asked',
        requester: holder({ agentRunId: 'run-4', sessionId: 'session-4', pid: 1000 }),
        evidence: {
          kind: 'operator-attestation',
          hostId: 'host-1',
          pid: 123,
          checkedAt: NOW,
          detailsHash: 'attestation',
        },
      }),
    (error) => error.code === 'holder-live'
  );
  store.close();
});

test('takeover fails closed when liveness authority is unavailable', () => {
  const store = new SqliteWorkLeaseStore({
    db: openProjectDatabase({ databasePath: ':memory:' }),
  });
  const lease = store.acquire(acquire());
  assert.throws(
    () =>
      store.takeover({
        projectId: 'project-1',
        issueId: '1049',
        expectedLeaseId: lease.leaseId,
        expectedToken: lease.fencingToken,
        idempotencyKey: 'unverified-expiry',
        observedAt: '2026-07-30T12:30:00.000Z',
        reason: 'TTL elapsed',
        requester: holder({
          agentRunId: 'run-2',
          sessionId: 'session-2',
          worktreeId: 'wt:v1:two',
          pathHash: 'path-two',
          pid: 456,
        }),
        evidence: {
          kind: 'remote-expired',
          hostId: 'host-1',
          pid: 123,
          checkedAt: '2026-07-30T12:30:00.000Z',
          detailsHash: 'expiry-only',
        },
      }),
    (error) => error.code === 'authority-unavailable'
  );
  assert.equal(store.observe({ projectId: 'project-1', issueId: '1049' }).leaseId, lease.leaseId);
  store.close();
});
