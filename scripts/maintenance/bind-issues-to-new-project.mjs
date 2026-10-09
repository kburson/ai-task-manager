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

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

import { loadConfig } from '../task-tracker/config.mjs';
import { loadProjectFieldDefs, buildFieldSyncPlan } from '../task-tracker/project-fields.mjs';
import { parseIssueFieldDb } from '../task-tracker/issue-field-db.mjs';
import { readLastKnownState } from '../task-tracker/gh-timing-comment.mjs';
import { stateIds } from '../task-tracker/lib/lifecycle-policy/index.mjs';
import {
  addIssueToProject,
  fieldOptionMap,
  projectItemForIssue,
  writeProjectFieldValue,
} from '../gh/lib/github-projects.mjs';
import { listAllIssues } from '../gh/lib/list-issues.mjs';

const pexec = promisify(execFile);

const VALID_STATES = new Set(stateIds());

function statusName(state) {
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

async function fetchIssueBody(repo, issueNumber) {
  const { stdout } = await pexec(
    'gh',
    ['api', `repos/${repo}/issues/${issueNumber}`, '--jq', '.body // ""'],
    { timeout: 15000 }
  );
  return stdout;
}

export function statusForIssue(body, state) {
  if (String(state).toLowerCase() === 'closed') return 'Done';
  const { state: markerState } = readLastKnownState(body);
  return VALID_STATES.has(markerState) ? statusName(markerState) : null;
}

export async function runBindIssuesToNewProject(
  { cfg, dryRun = false, repo: repoArg, projectId: projectArg } = {},
  deps = {}
) {
  const repo = repoArg || cfg?.repo;
  const projectId = projectArg || cfg?.projectId;
  if (!repo || !projectId) {
    throw new Error('need repo + projectId (cfg or --repo / --project)');
  }

  if (!cfg?.kanbanFieldId) throw new Error('cfg.kanbanFieldId missing — re-run init');

  const getFieldDefs = deps.loadProjectFieldDefs || loadProjectFieldDefs;
  const getOptionMap = deps.fieldOptionMap || fieldOptionMap;
  const getIssues = deps.listAllIssues || listAllIssues;
  const getProjectItem = deps.projectItemForIssue || projectItemForIssue;
  const addProjectItem = deps.addIssueToProject || addIssueToProject;
  const getBody = deps.fetchIssueBody || fetchIssueBody;
  const writeFieldValue = deps.writeProjectFieldValue || writeProjectFieldValue;
  const out = deps.out || process.stdout;
  const errorOut = deps.err || process.stderr;
  const fieldDefs = getFieldDefs();
  const optionMap = await getOptionMap(projectId);

  out.write(`Binding issues to ${projectId} on ${repo} (${dryRun ? 'DRY-RUN' : 'APPLY'})...\n`);
  const issues = await getIssues(repo);
  out.write(`  found ${issues.length} issues (open + closed)\n`);

  let added = 0;
  let alreadyOn = 0;
  let statusSet = 0;
  let fieldsSet = 0;
  let noFieldDb = 0;
  let errors = 0;

  for (const issue of issues) {
    try {
      const { issueId, itemId: existingItemId } = await getProjectItem({
        repo,
        projectId,
        issueNumber: issue.number,
      });

      let itemId = existingItemId;
      if (!itemId) {
        if (dryRun) {
          out.write(`  [dry-run] #${issue.number}: would add to project\n`);
          added++;
        } else {
          itemId = await addProjectItem(projectId, issueId);
          added++;
          out.write(`  + #${issue.number}: added (item ${itemId})\n`);
        }
      } else {
        alreadyOn++;
      }

      const body = await getBody(repo, issue.number);
      const status = statusForIssue(body, issue.state);

      if (status && (itemId || dryRun)) {
        if (dryRun) {
          out.write(`  [dry-run] #${issue.number}: Status → ${status}\n`);
          statusSet++;
        } else {
          const ok = await writeFieldValue({
            repo,
            issueNumber: issue.number,
            projectId,
            itemId,
            fieldId: cfg.kanbanFieldId,
            statusFieldId: cfg.kanbanFieldId,
            value: { singleSelectOptionName: status },
            optionMap,
            gqlFn: deps.gqlFn,
            withIssueLockFn: deps.withIssueLockFn,
            projectDir: deps.projectDir,
            env: deps.env,
          });
          if (ok) {
            statusSet++;
            out.write(`  ✓ #${issue.number}: Status=${status}\n`);
          } else {
            errors++;
            errorOut.write(`  ⚠ #${issue.number}: option '${status}' not found on new board\n`);
          }
        }
      } else if (!status) {
        out.write(`  · #${issue.number}: no Status (no aitm-last-known-state marker)\n`);
      }

      const parsed = parseIssueFieldDb(body);
      if (!parsed.ok) {
        noFieldDb++;
        continue;
      }
      const values = { ...parsed.values };
      if (issue.state === 'closed') delete values.rank;
      const plan = buildFieldSyncPlan({ cfg, fieldDefs, values });
      for (const step of plan) {
        if (dryRun) {
          out.write(`  [dry-run] #${issue.number}: ${step.key} → ${JSON.stringify(step.value)}\n`);
          fieldsSet++;
          continue;
        }
        try {
          await writeFieldValue({
            projectId,
            itemId,
            fieldId: step.fieldId,
            statusFieldId: cfg.kanbanFieldId,
            value: step.value,
            optionMap,
            gqlFn: deps.gqlFn,
          });
          fieldsSet++;
        } catch (error) {
          errors++;
          errorOut.write(`  ⚠ #${issue.number}: write ${step.key} failed: ${error.message}\n`);
        }
      }
    } catch (error) {
      errors++;
      errorOut.write(`  ⚠ #${issue.number}: ${error.message}\n`);
    }
  }

  out.write(
    `\nSummary: ${added} added, ${alreadyOn} already on board, ${statusSet} status writes, ${fieldsSet} field writes, ${noFieldDb} without aitm-fields, ${errors} errors.\n`
  );
  return { added, alreadyOn, statusSet, fieldsSet, noFieldDb, errors };
}

async function main() {
  const { dryRun, repo: repoArg, project: projectArg } = parseArgs(process.argv.slice(2));
  const cfg = loadConfig();
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
  const result = await runBindIssuesToNewProject({
    cfg,
    dryRun,
    repo,
    projectId,
  });
  process.exit(result.errors > 0 ? 1 : 0);
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
