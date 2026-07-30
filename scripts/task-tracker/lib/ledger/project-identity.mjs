import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { WorkLeaseError } from '@kburson/aitm-ledger';

function readConfig(configPath) {
  if (!existsSync(configPath)) return {};
  try {
    const parsed = JSON.parse(readFileSync(configPath, 'utf8'));
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
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
    winner = databaseId || configId || uuid();
    if (typeof winner !== 'string' || winner.trim() === '') {
      throw new WorkLeaseError('invalid-request', 'ledger project identity must be non-empty');
    }
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
