// #1217 — shared, main-worktree-visible lifecycle freeze for the live R4P cutover.

import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

import { findMainWorktreePath } from '../fleet-registry.mjs';

export function readyForPlanMigrationJournalPath(projectDir = process.cwd()) {
  const main = findMainWorktreePath(projectDir);
  return path.join(main, '.db', 'aitm', 'ready-for-plan-migration.json');
}

export function loadReadyForPlanMigrationJournal({ projectDir, journalPath } = {}) {
  const target = journalPath || readyForPlanMigrationJournalPath(projectDir);
  if (!existsSync(target)) return null;
  const journal = JSON.parse(readFileSync(target, 'utf8'));
  if (!journal || typeof journal !== 'object' || Array.isArray(journal)) {
    throw new Error('Ready for Planning migration journal is malformed');
  }
  return journal;
}

export function isReadyForPlanMigrationActive(options = {}) {
  const journal = loadReadyForPlanMigrationJournal(options);
  return Boolean(journal && journal.phase !== 'final-verification');
}
