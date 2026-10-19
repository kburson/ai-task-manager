#!/usr/bin/env node
import { enforceDirectGuidance } from '../task-tracker/lib/direct-guidance-admission.mjs';
enforceDirectGuidance(import.meta.url, 'migrate-project');
import { execFileSync } from 'node:child_process';
import { loadConfig } from '../task-tracker/config.mjs';
import { getProjectDir } from '../task-tracker/paths.mjs';
import { ensureIssueFieldDb, parseIssueFieldDb } from '../task-tracker/issue-field-db.mjs';
import { buildFieldSyncPlan, loadProjectFieldDefs } from '../task-tracker/project-fields.mjs';
import {
  fieldOptionMap,
  gh,
  gql,
  projectValuesForIssue,
  projectItemForIssue,
} from './lib/github-projects.mjs';
import {
  publishMigrationFields,
  copyInitialMigrationFields,
  withMigrationIssueOwner,
  fetchMigrationIssueBody,
} from '../task-tracker/lib/decomposition-migration-writer.mjs';
import { mutateIssueBody } from '../task-tracker/lib/issue-body-mutate.mjs';
import { stripBodyVersion } from '../task-tracker/lib/versioned-issue-write.mjs';
import { wantsHelp, emitSelfDoc } from '../lib/self-doc.mjs';

const args = process.argv.slice(2);
if (import.meta.url === `file://${process.argv[1]}` && wantsHelp(args)) {
  emitSelfDoc('migrate-project');
  process.exit(0);
}
const dryRun = args.includes('--dry-run');
const skipInit = args.includes('--skip-init');
const includeClosed = args.includes('--closed') || args.includes('--all');
const keepRetired = args.includes('--keep-retired');

// Fields previously written by the board sync that have since been retired.
// Migration deletes these from the project unless --keep-retired is passed.
const RETIRED_FIELDS = ['Context Length'];

async function deleteRetiredFields(projectId) {
  const data = await gql(
    `
    query($project: ID!) {
      node(id: $project) {
        ... on ProjectV2 {
          fields(first: 100) {
            nodes { ... on ProjectV2FieldCommon { id name } }
          }
        }
      }
    }`,
    { project: projectId }
  );
  const targets = (data.node.fields.nodes || []).filter(
    (f) => f?.name && RETIRED_FIELDS.includes(f.name)
  );
  for (const f of targets) {
    if (dryRun) {
      console.log(`Would delete retired field: ${f.name}`);
      continue;
    }
    await gql(
      `
      mutation($field: ID!) {
        deleteProjectV2Field(input: { fieldId: $field }) { projectV2Field { ... on ProjectV2FieldCommon { id } } }
      }`,
      { field: f.id }
    );
    console.log(`Deleted retired field: ${f.name}`);
  }
}

const projectDir = getProjectDir();

export async function migrateProjectIssue({
  cfg,
  oldCfg = cfg,
  issue,
  fieldDefs,
  optionMap,
  dryRun = false,
  deps = {},
}) {
  const issueNumber = Number(issue.number);
  const run = async () => {
    let body = await fetchMigrationIssueBody({ cfg, issueNumber, deps });
    const oldValues = await (deps.projectValuesForIssue ?? projectValuesForIssue)({
      cfg: oldCfg,
      fieldDefs,
      issueNumber,
    });
    const ensured = ensureIssueFieldDb(body, fieldDefs, oldValues);
    const fieldCount = buildFieldSyncPlan({ cfg, fieldDefs, values: ensured.values }).length;
    if (dryRun) return { status: 'dry-run', healed: ensured.healed, fieldCount };
    const parsed = parseIssueFieldDb(body);
    if (!parsed.ok) {
      if (parsed.reason !== 'missing')
        return { status: 'refused', reason: `migrate-project:field-db-${parsed.reason}` };
      await (deps.mutateIssueBody ?? mutateIssueBody)({
        issueNumber,
        repo: cfg.repo,
        deps: deps.decomposition,
        mutate: (base) => {
          if (stripBodyVersion(base) !== stripBodyVersion(body))
            throw new Error('migrate-project:encoding-source-drift');
          return ensureIssueFieldDb(base, fieldDefs, oldValues).body;
        },
      });
      body = await fetchMigrationIssueBody({ cfg, issueNumber, deps });
      if (!parseIssueFieldDb(body).ok)
        return { status: 'partial', reason: 'migrate-project:encoding-unconfirmed' };
    }
    const membership = await (deps.projectItemForIssue ?? projectItemForIssue)({
      repo: cfg.repo,
      projectId: cfg.projectId,
      issueNumber,
    });
    const input = { cfg, issueNumber, values: ensured.values, fieldDefs, optionMap, deps };
    const result = membership.itemId
      ? await publishMigrationFields({
          ...input,
          itemId: membership.itemId,
          writerId: 'migrate-project',
        })
      : await copyInitialMigrationFields({
          ...input,
          issueId: membership.issueId ?? issue.id,
          body,
        });
    return { ...result, healed: ensured.healed, fieldCount };
  };
  try {
    return dryRun ? await run() : await withMigrationIssueOwner({ issueNumber, deps }, run);
  } catch (error) {
    return { status: 'partial', reason: error.message };
  }
}

async function main() {
  const oldCfg = loadConfig();
  if (!skipInit && !dryRun) {
    const initScript = new URL('./init-project-config.sh', import.meta.url).pathname;
    // Interactive setup wizard — stdio is inherited so the user answers
    // prompts. No `timeout:` here: a fixed budget would kill a slow human
    // typing answers. Sibling automated child-process calls in this file go
    // through `gh`/`gql` helpers which set their own GH_API_TIMEOUT_MS.
    // execFileSync throws on non-zero exit; with stdio:'inherit' the user has
    // already seen any error output, so propagate the exit code unchanged.
    try {
      execFileSync('bash', [initScript, '--target', projectDir], {
        cwd: projectDir,
        stdio: 'inherit',
        env: process.env,
      });
    } catch (err) {
      process.exit(typeof err.status === 'number' && err.status ? err.status : 1);
    }
  }

  const cfg = loadConfig();
  if (!cfg.repo) throw new Error('repo not configured');
  if (!cfg.projectId) throw new Error('projectId not configured');
  const fieldDefs = loadProjectFieldDefs(projectDir);
  const state = includeClosed ? 'all' : 'open';
  const raw = await gh([
    'issue',
    'list',
    '-R',
    cfg.repo,
    '--state',
    state,
    '--limit',
    '1000',
    '--json',
    'number,id,body,title',
  ]);
  const issues = JSON.parse(raw);
  const optionMap = dryRun ? {} : await fieldOptionMap(cfg.projectId);

  if (!keepRetired) await deleteRetiredFields(cfg.projectId);

  console.log(`Migrating ${issues.length} ${state} issue(s) into configured project.`);
  let healed = 0;
  let synced = 0;
  let failed = 0;
  for (const issue of issues) {
    const result = await migrateProjectIssue({ cfg, oldCfg, issue, fieldDefs, optionMap, dryRun });
    if (result.healed) healed++;
    console.log(
      `#${issue.number} ${issue.title}: ${result.fieldCount ?? 0} field value(s), ${result.status}`
    );
    if (['copied', 'recorded', 'unchanged'].includes(result.status)) synced++;
    else if (result.status !== 'dry-run') {
      failed++;
      console.error(`#${issue.number}: ${result.reason ?? result.status}`);
    }
  }
  if (failed) process.exitCode = 1;

  console.log(
    dryRun
      ? `Dry run complete. ${healed} issue body DB(s) would be healed.`
      : `${failed ? 'Migration partial' : 'Migration complete'}. ${synced} issue(s) synced; ${healed} issue body DB(s) healed.`
  );
}

if (import.meta.url === `file://${process.argv[1]}`)
  main().catch((err) => {
    console.error(`migrate-project: ${err.message}`);
    process.exit(1);
  });
