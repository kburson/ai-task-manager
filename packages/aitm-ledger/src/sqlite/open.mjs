import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

import { WorkLeaseError } from '../lease/errors.mjs';
import { applyMigration001 } from './migrations/001-leases.mjs';

export function runMigrations(db, { now } = {}) {
  db.exec('BEGIN IMMEDIATE');
  try {
    applyMigration001(db, now);
    db.exec('COMMIT');
  } catch (error) {
    try {
      db.exec('ROLLBACK');
    } catch {
      // Preserve the migration failure.
    }
    throw error;
  }
}

export function openProjectDatabase({
  databasePath,
  expectedLedgerProjectId,
  Database = DatabaseSync,
  now,
} = {}) {
  if (typeof databasePath !== 'string' || databasePath.trim() === '') {
    throw new WorkLeaseError('invalid-request', 'databasePath is required');
  }
  if (databasePath !== ':memory:') mkdirSync(path.dirname(databasePath), { recursive: true });
  const db = new Database(databasePath);
  try {
    db.exec('PRAGMA foreign_keys = ON');
    db.exec('PRAGMA busy_timeout = 5000');
    if (databasePath !== ':memory:') db.exec('PRAGMA journal_mode = WAL');
    runMigrations(db, { now });
    if (expectedLedgerProjectId) {
      const stored = db
        .prepare("SELECT value FROM ledger_metadata WHERE key = 'ledgerProjectId'")
        .get()?.value;
      if (stored && stored !== expectedLedgerProjectId) {
        throw new WorkLeaseError(
          'invalid-request',
          'ledger project identity does not match database metadata',
          { expectedLedgerProjectId, storedLedgerProjectId: stored }
        );
      }
    }
    return db;
  } catch (error) {
    db.close();
    throw error;
  }
}
