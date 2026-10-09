// #1217 / #1857 — durable shared lifecycle freeze for the live R4P cutover.
import path from 'node:path';
import { findMainWorktreePath } from '../fleet-registry.mjs';
import { tmpAitmDir } from '../paths.mjs';
import { readRuntimeJsonRecord } from './runtime-writer.mjs';

export function readyForPlanMigrationJournalPath(projectDir = process.cwd()) {
  const main = findMainWorktreePath(projectDir);
  return path.join(tmpAitmDir(main), 'migrations', 'ready-for-plan-migration.json');
}

export function loadReadyForPlanMigrationJournal({ projectDir, journalPath } = {}) {
  const target = journalPath || readyForPlanMigrationJournalPath(projectDir);
  return readRuntimeJsonRecord(target, { optional: true });
}

export function isReadyForPlanMigrationActive(options = {}) {
  const journal = loadReadyForPlanMigrationJournal(options);
  return Boolean(journal && journal.phase !== 'final-verification');
}
