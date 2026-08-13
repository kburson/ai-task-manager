#!/usr/bin/env node
// #1217 — dry-run and apply the live Assigned -> Ready for Planning cutover.

import { loadConfig } from '../task-tracker/config.mjs';
import {
  applyReadyForPlanMigration,
  inspectReadyForPlanMigration,
  migrationRecoveryAction,
  resolveMigrationPlan,
} from '../task-tracker/lib/ready-for-plan-migration.mjs';
import { confirmBlastRadius } from '../task-tracker/lib/blast-radius-guard.mjs';
import { loadReadyForPlanMigrationJournal } from '../task-tracker/lib/ready-for-plan-migration-freeze.mjs';
import { emitSelfDoc, wantsHelp } from '../lib/self-doc.mjs';

const USAGE = `Usage: node scripts/migrate/assigned-to-ready-for-plan.mjs [--apply] [--yes] [--views-verified]
Default: dry-run with zero writes. --apply performs the journaled live migration.
The durable journal supports safe retry after interruption. --views-verified records operator read-back
of the Assigned-work filters and Ready for Planning saved view when no supported API is available.
`;

const args = process.argv.slice(2);
if (wantsHelp(args)) {
  emitSelfDoc('assigned-to-ready-for-plan');
  process.exit(0);
}
const allowed = new Set(['--apply', '--yes', '--views-verified']);
const unknown = args.find((arg) => !allowed.has(arg));
if (unknown) {
  process.stderr.write(`Unrecognized argument: ${unknown}\n${USAGE}`);
  process.exit(2);
}

try {
  const cfg = loadConfig();
  const priorJournal = loadReadyForPlanMigrationJournal({ projectDir: process.cwd() });
  const apply = args.includes('--apply');
  const plan = await resolveMigrationPlan({
    apply,
    journal: priorJournal,
    inspect: () => inspectReadyForPlanMigration({ cfg }),
  });
  process.stdout.write(
    `Dry run: ${plan.items.length} Assigned item(s), zero writes, Status option ${plan.option.id}; ` +
      `target order ${plan.option.order.join(' -> ')}.\n`
  );
  for (const item of plan.items) {
    process.stdout.write(
      `  ${item.repository}#${item.issueNumber} item=${item.itemId} assignees=${item.assignees.join(',') || '(none)'}\n`
    );
  }
  if (!apply) process.exit(0);

  const decision = await confirmBlastRadius({
    targets: [
      ...plan.items.map(({ repository, issueNumber }) => `${repository}#${issueNumber}`),
      `Status option ${plan.option.id}`,
      'project configuration',
    ],
    targetLabel: 'migration target',
    yes: args.includes('--yes'),
  });
  if (!decision.proceed) process.exit(2);
  const result = await applyReadyForPlanMigration({
    plan,
    cfg,
    projectDir: process.cwd(),
    deps: args.includes('--views-verified')
      ? {
          verifyViews: async ({ plan: migrationPlan }) => ({
            verified: true,
            mode: 'operator-confirmed',
            instructions: migrationPlan.views,
          }),
        }
      : {},
  });
  process.stdout.write(
    `Applied and verified: migrated ${result.migratedItems} item(s); Status option ${result.optionId} is Ready for Planning; journal phase=${result.journal.phase}.\n`
  );
} catch (error) {
  process.stderr.write(`${error.message}\n`);
  let journal = null;
  try {
    journal = loadReadyForPlanMigrationJournal({ projectDir: process.cwd() });
  } catch (journalError) {
    process.stderr.write(`Migration journal read failed: ${journalError.message}\n`);
  }
  process.stderr.write(`${migrationRecoveryAction(journal)}\n`);
  process.exitCode = 1;
}
