#!/usr/bin/env node
// #1206 — explicitly rename the configured Status option in place.

import { loadConfig } from '../task-tracker/config.mjs';
import { gql } from '../gh/lib/github-projects.mjs';
import { runAssignedStatusMigration } from '../task-tracker/lib/assigned-status-migration.mjs';
import { confirmBlastRadius } from '../task-tracker/lib/blast-radius-guard.mjs';
import { emitSelfDoc, wantsHelp } from '../lib/self-doc.mjs';

const USAGE =
  'Usage: node scripts/migrate/rename-on-deck-to-assigned.mjs [--apply] [--yes]\n' +
  'Default: dry-run. Pass --apply to rename the existing option in place.\n' +
  'Pass --yes to bypass blast-radius confirmation when required.\n';

const args = process.argv.slice(2);
if (wantsHelp(args)) {
  emitSelfDoc('rename-on-deck-to-assigned');
  process.exit(0);
}
const unknown = args.filter((arg) => !['--apply', '--yes'].includes(arg));
if (unknown.length > 0) {
  process.stderr.write(`Unrecognized argument: ${unknown[0]}\n${USAGE}`);
  process.exit(2);
}

const apply = args.includes('--apply');
const yes = args.includes('--yes');

try {
  const cfg = loadConfig();
  const migration = {
    projectId: cfg.projectId,
    kanbanFieldId: cfg.kanbanFieldId,
    configuredOptionId: cfg.kanbanOptionAssigned,
    gql,
  };
  const preview = await runAssignedStatusMigration({ ...migration, apply: false });
  let result = preview;

  if (apply && preview.changed) {
    const decision = await confirmBlastRadius({
      targets: [`Status option ${preview.optionId}`],
      targetLabel: 'project Status option',
      yes,
    });
    if (!decision.proceed) {
      process.exitCode = 2;
    } else {
      result = await runAssignedStatusMigration({ ...migration, apply: true });
    }
  }

  if (process.exitCode === 2) {
    // The blast-radius guard already emitted the refusal and mutation target.
  } else if (!result.changed) {
    process.stdout.write(
      `No change: Status option ${result.optionId} is already named Assigned.\n`
    );
  } else if (!apply) {
    process.stdout.write(
      `Dry run: rename Status option ${result.optionId} from "On Deck" to "Assigned"; ` +
        'the option id and all item assignments are retained.\n' +
        'Re-run with --apply to perform this migration.\n'
    );
  } else {
    process.stdout.write(
      `Applied: Status option ${result.optionId} is now "Assigned" with the same option id; ` +
        'item assignments were retained.\n'
    );
  }
} catch (error) {
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 1;
}
