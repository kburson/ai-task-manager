#!/usr/bin/env node
// @story #1591

import path from 'node:path';
import { pathToFileURL } from 'node:url';

import {
  inventoryLegacyIndex,
  reconcileLegacyIndex,
  verifyLegacyIndexReconciliation,
} from './lib/reconciliation.mjs';
import { emitSelfDoc, wantsHelp } from '../lib/self-doc.mjs';
import { confirmBlastRadius } from '../task-tracker/lib/blast-radius-guard.mjs';

const USAGE =
  'Usage: node scripts/review/reconcile-legacy-index.mjs [--apply|--verify] [--yes] [--project-dir <path>] [--index-file <path> --journal-file <path>]';

function parseArgs(argv) {
  const options = { mode: 'inspect' };
  let selectedMode = false;
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--apply' || argument === '--verify') {
      if (selectedMode) {
        throw new Error('co-review-index-reconciliation: choose exactly one mode');
      }
      selectedMode = true;
      options.mode = argument.slice(2);
      continue;
    }
    if (argument === '--yes') {
      options.yes = true;
      continue;
    }
    if (['--project-dir', '--index-file', '--journal-file'].includes(argument)) {
      const value = argv[index + 1];
      if (!value || value.startsWith('--')) {
        throw new Error(`co-review-index-reconciliation: ${argument} requires a value`);
      }
      options[
        argument === '--project-dir'
          ? 'projectDir'
          : argument === '--index-file'
            ? 'indexFile'
            : 'journalFile'
      ] = path.resolve(value);
      index += 1;
      continue;
    }
    throw new Error(`co-review-index-reconciliation: unknown flag ${argument}`);
  }
  if (Boolean(options.indexFile) !== Boolean(options.journalFile)) {
    throw new Error(
      'co-review-index-reconciliation: --index-file and --journal-file must be supplied together'
    );
  }
  return options;
}

function inspect(options) {
  const result = inventoryLegacyIndex(options);
  return {
    mode: 'inspect',
    indexFile: result.indexFile,
    journalFile: result.journalFile,
    indexSha256: result.indexSha256,
    archiveFiles: result.archiveSnapshot.length,
    counts: result.counts,
    blockers: result.rows
      .filter(({ disposition }) => disposition === 'retain-unresolved')
      .map(({ protocolId, reason }) => ({ protocolId, reason })),
  };
}

export async function main(argv = process.argv.slice(2), deps = {}) {
  const options = parseArgs(argv);
  if (options.mode === 'apply') {
    const preview = inventoryLegacyIndex(options);
    if (preview.counts.remove > 0) {
      const confirm = deps.confirmBlastRadius || confirmBlastRadius;
      const decision = await confirm({
        targets: [`${preview.counts.remove} removable active row(s) in ${preview.indexFile}`],
        targetLabel: 'legacy index reconciliation',
        threshold: 0,
        yes: options.yes,
        log: deps.guardLog || ((message) => process.stderr.write(message)),
        warn: deps.guardWarn || ((message) => process.stderr.write(message)),
      });
      if (!decision.proceed) {
        throw new Error('co-review-index-reconciliation: blast-radius confirmation refused');
      }
    }
    const result = reconcileLegacyIndex(options);
    return {
      mode: 'apply',
      status: result.status,
      operationId: result.operationId,
      before: result.before,
      after: result.after,
      removedCount: result.removed.length,
      blockerCount: result.blockers.length,
      archiveFiles: result.archiveSnapshot.length,
    };
  }
  if (options.mode === 'verify') {
    return { mode: 'verify', ...verifyLegacyIndexReconciliation(options) };
  }
  return inspect(options);
}

const isEntrypoint =
  process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url;
if (isEntrypoint) {
  if (wantsHelp(process.argv.slice(2))) {
    emitSelfDoc('reconcile-legacy-index');
    process.exit(0);
  }
  try {
    process.stdout.write(`${JSON.stringify(await main(), null, 2)}\n`);
  } catch (error) {
    process.stderr.write(`${error.message}\n${USAGE}\n`);
    process.exitCode = 1;
  }
}
