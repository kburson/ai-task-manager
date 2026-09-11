#!/usr/bin/env node
// @story #1591

import path from 'node:path';
import { pathToFileURL } from 'node:url';

import {
  inventoryLegacyIndex,
  reconcileLegacyIndex,
  verifyLegacyIndexReconciliation,
} from './lib/reconciliation.mjs';

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
    throw new Error(`co-review-index-reconciliation: unknown argument ${argument}`);
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

export function main(argv = process.argv.slice(2)) {
  const options = parseArgs(argv);
  if (options.mode === 'apply') {
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
  try {
    process.stdout.write(`${JSON.stringify(main(), null, 2)}\n`);
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  }
}
