import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { WorkLeaseError } from '@kburson/aitm-ledger';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function readConfig(configPath) {
  if (!existsSync(configPath)) return {};
  let parsed;
  try {
    parsed = JSON.parse(readFileSync(configPath, 'utf8'));
  } catch (error) {
    throw new WorkLeaseError('invalid-request', 'task-tracker config is not valid JSON', {
      configPath,
      cause: error?.message,
    });
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new WorkLeaseError('invalid-request', 'task-tracker config must be a JSON object', {
      configPath,
    });
  }
  return parsed;
}

function assertLedgerProjectId(value, githubProjectId) {
  if (typeof value !== 'string' || !UUID_PATTERN.test(value)) {
    throw new WorkLeaseError('invalid-request', 'ledger project identity must be a UUID');
  }
  if (typeof githubProjectId === 'string' && githubProjectId !== '' && value === githubProjectId) {
    throw new WorkLeaseError(
      'invalid-request',
      'ledger project identity must differ from the GitHub Projects identity'
    );
  }
  return value;
}

function atomicWriteConfig(configPath, config) {
  mkdirSync(path.dirname(configPath), { recursive: true });
  const temporary = `${configPath}.tmp.${process.pid}.${Date.now()}`;
  try {
    writeFileSync(temporary, JSON.stringify(config, null, 2) + '\n', 'utf8');
    renameSync(temporary, configPath);
  } finally {
    if (existsSync(temporary)) rmSync(temporary);
  }
}

function metadataId(db) {
  return db.prepare("SELECT value FROM ledger_metadata WHERE key = 'ledgerProjectId'").get()?.value;
}

export function ensureLedgerProjectIdentity({
  db,
  configPath,
  uuid = randomUUID,
  now = () => new Date(),
  afterDatabaseCommit,
} = {}) {
  if (!db) throw new WorkLeaseError('invalid-request', 'db is required');
  if (typeof configPath !== 'string' || configPath.trim() === '') {
    throw new WorkLeaseError('invalid-request', 'configPath is required');
  }

  const config = readConfig(configPath);
  const configId =
    typeof config.ledgerProjectId === 'string' && config.ledgerProjectId.trim()
      ? config.ledgerProjectId
      : null;
  let winner;
  let databaseChanged = false;

  db.exec('BEGIN IMMEDIATE');
  try {
    const databaseId = metadataId(db);
    if (configId && databaseId && configId !== databaseId) {
      throw new WorkLeaseError(
        'invalid-request',
        'ledger project identity differs between config and database',
        { configLedgerProjectId: configId, databaseLedgerProjectId: databaseId }
      );
    }
    winner = assertLedgerProjectId(databaseId || configId || uuid(), config.projectId);
    if (!databaseId) {
      db.prepare(
        `INSERT INTO ledger_metadata(key, value, updated_at)
         VALUES ('ledgerProjectId', ?, ?)`
      ).run(winner, now().toISOString());
      databaseChanged = true;
    }
    db.exec('COMMIT');
  } catch (error) {
    try {
      db.exec('ROLLBACK');
    } catch {
      // Preserve the identity failure.
    }
    throw error;
  }

  if (databaseChanged) afterDatabaseCommit?.(winner);
  if (configId !== winner) {
    atomicWriteConfig(configPath, { ...config, ledgerProjectId: winner });
  }
  return winner;
}
