#!/usr/bin/env node
// One-shot: bind every issue (open + closed) in `cfg.repo` to the NEW project
// board (`cfg.projectId`) and replay each issue's hidden field-DB values
// (Status, Priority, Size, Estimate, Sequence) onto its new project item.
//
// Reads:
//   - `<!-- aitm-fields: ... -->`           — canonical field-DB (priority/size/estimate/sequence)
//   - `<!-- aitm-last-known-state: <slug> -->` — kanban slug
//
// Status mapping for new vocab:
//   backlog→Backlog, assigned→Assigned, refine→Refine, plan→Plan,
//   develop→Develop, test→Test, review→Review, done→Done.
// Closed issues are forced to `Done` regardless of marker, and skip Sequence.
//
// Usage:
//   node scripts/maintenance/bind-issues-to-new-project.mjs --dry-run
//   node scripts/maintenance/bind-issues-to-new-project.mjs
//   node scripts/maintenance/bind-issues-to-new-project.mjs --repo owner/name --project PVT_xxx

import {
  publishMigrationFields,
  copyInitialMigrationFields,
  withMigrationIssueOwner,
  fetchMigrationIssueBody,
} from '../task-tracker/lib/decomposition-migration-writer.mjs';
import { assertDecompositionPublicationOwner } from '../task-tracker/lib/decomposition-projection.mjs';

import { loadConfig } from '../task-tracker/config.mjs';
import { loadProjectFieldDefs, buildFieldSyncPlan } from '../task-tracker/project-fields.mjs';
import { parseIssueFieldDb } from '../task-tracker/issue-field-db.mjs';
import { readLastKnownState } from '../task-tracker/gh-timing-comment.mjs';
import { stateIds } from '../task-tracker/lib/lifecycle-policy/index.mjs';
import {
  fieldOptionMap,
  projectItemForIssue,
  writeProjectFieldValue,
} from '../gh/lib/github-projects.mjs';
import { listAllIssues } from '../gh/lib/list-issues.mjs';

const VALID_STATES = new Set(stateIds());

function statusName(state) {
  if (state === 'ready-for-plan') return 'Ready for Planning';
  return state
    .split('-')
    .map((part) => `${part[0].toUpperCase()}${part.slice(1)}`)
    .join(' ');
}

function parseArgs(argv) {
  const args = { dryRun: false, repo: null, project: null };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--dry-run') args.dryRun = true;
    else if (argv[i] === '--repo') args.repo = argv[++i];
    else if (argv[i] === '--project') args.project = argv[++i];
  }
  return args;
}

export function statusForIssue(body, state) {
  if (String(state).toLowerCase() === 'closed') return 'Done';
  const { state: markerState } = readLastKnownState(body);
  return VALID_STATES.has(markerState) ? statusName(markerState) : null;
}

export async function bindProjectIssue({
  cfg,
  issue,
  fieldDefs,
  optionMap,
  dryRun = false,
  deps = {},
}) {
  const issueNumber = Number(issue.number);
  const run = async () => {
    const body = await fetchMigrationIssueBody({ cfg, issueNumber, deps }),
      parsed = parseIssueFieldDb(body);
    if (!parsed.ok) return { status: 'no-field-db', reason: parsed.reason };
    const values = { ...parsed.values };
    if (String(issue.state).toLowerCase() === 'closed') delete values.rank;
    const membership = await (deps.projectItemForIssue ?? projectItemForIssue)({
      repo: cfg.repo,
      projectId: cfg.projectId,
      issueNumber,
    });
    const status = statusForIssue(body, issue.state),
      fieldCount = buildFieldSyncPlan({ cfg, fieldDefs, values }).length;
    if (dryRun)
      return {
        status: 'dry-run',
        initial: !membership.itemId,
        fieldCount,
        statusSet: Boolean(status),
      };
    const beforeEffects = async (context, createdItemId) => {
      if (!status) return;
      if (context)
        await assertDecompositionPublicationOwner(context, {
          subject: context.subject,
          operationId: context.operationId,
          effectId: 'estimate',
          requireIntent: true,
        });
      const ok = await (deps.writeProjectFieldValue ?? writeProjectFieldValue)({
        projectId: cfg.projectId,
        itemId: createdItemId ?? membership.itemId,
        fieldId: cfg.kanbanFieldId,
        value: { singleSelectOptionName: status },
        optionMap,
      });
      if (ok === false) throw new Error('bind-issues-to-new-project:status-unconfirmed');
    };
    const input = { cfg, issueNumber, values, fieldDefs, optionMap, beforeEffects, deps };
    const result = membership.itemId
      ? await publishMigrationFields({
          ...input,
          itemId: membership.itemId,
          writerId: 'bind-issues-to-new-project',
        })
      : await copyInitialMigrationFields({
          ...input,
          issueId: membership.issueId ?? issue.id,
          body,
        });
    return { ...result, initial: !membership.itemId, fieldCount, statusSet: Boolean(status) };
  };
  try {
    return dryRun ? await run() : await withMigrationIssueOwner({ issueNumber, deps }, run);
  } catch (error) {
    return { status: 'partial', reason: error.message };
  }
}

async function main() {
  const { dryRun, repo: repoArg, project: projectArg } = parseArgs(process.argv.slice(2));
  const loadedCfg = loadConfig();
  const cfg = {
    ...loadedCfg,
    repo: repoArg || loadedCfg.repo,
    projectId: projectArg || loadedCfg.projectId,
  };
  if (projectArg && projectArg !== loadedCfg.projectId)
    throw new Error('project override requires matching configured field ids; re-run init first');
  const repo = repoArg || cfg.repo;
  const projectId = projectArg || cfg.projectId;
  if (!repo || !projectId) {
    process.stderr.write('error: need repo + projectId (cfg or --repo / --project)\n');
    process.exit(2);
  }

  if (!cfg.kanbanFieldId) {
    process.stderr.write('error: cfg.kanbanFieldId missing — re-run init to refresh config\n');
    process.exit(2);
  }

  const fieldDefs = loadProjectFieldDefs();
  const optionMap = await fieldOptionMap(projectId);

  process.stdout.write(
    `Binding issues to ${projectId} on ${repo} (${dryRun ? 'DRY-RUN' : 'APPLY'})...\n`
  );
  const issues = await listAllIssues(repo);
  process.stdout.write(`  found ${issues.length} issues (open + closed)\n`);

  let added = 0;
  let alreadyOn = 0;
  let statusSet = 0;
  let fieldsSet = 0;
  let noFieldDb = 0;
  let errors = 0;

  for (const issue of issues) {
    const result = await bindProjectIssue({ cfg, issue, fieldDefs, optionMap, dryRun });
    if (result.status === 'no-field-db') {
      noFieldDb++;
      continue;
    }
    if (!['copied', 'recorded', 'unchanged', 'dry-run'].includes(result.status)) {
      errors++;
      process.stderr.write(`  #${issue.number}: ${result.status}: ${result.reason ?? ''}\n`);
      continue;
    }
    if (result.initial) added++;
    else alreadyOn++;
    if (result.statusSet) statusSet++;
    fieldsSet += result.fieldCount ?? 0;
    process.stdout.write(`  #${issue.number}: ${result.status}\n`);
  }

  process.stdout.write(
    `\nSummary: ${added} added, ${alreadyOn} already on board, ${statusSet} status writes, ${fieldsSet} field writes, ${noFieldDb} without aitm-fields, ${errors} errors.\n`
  );
  process.exit(errors > 0 ? 1 : 0);
}

const isDirect =
  import.meta.url === `file://${process.argv[1]}` ||
  process.argv[1]?.endsWith('bind-issues-to-new-project.mjs');
if (isDirect) {
  main().catch((err) => {
    process.stderr.write(`fatal: ${err.stack || err.message}\n`);
    process.exit(1);
  });
}
