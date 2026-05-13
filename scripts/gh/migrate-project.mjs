#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { writeFileSync, unlinkSync } from 'node:fs';
import path from 'node:path';
import { loadConfig } from '../task-tracker/config.mjs';
import { getProjectDir, projectTmpDir } from '../task-tracker/paths.mjs';
import { ensureIssueFieldDb } from '../task-tracker/issue-field-db.mjs';
import { buildFieldSyncPlan, loadProjectFieldDefs } from '../task-tracker/project-fields.mjs';
import {
  fieldOptionMap,
  gh,
  gql,
  projectValuesForIssue,
  writeProjectFieldValue,
} from './lib/github-projects.mjs';
import { tetherIssueToProject } from './lib/project-tether.mjs';

const args = process.argv.slice(2);
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

async function writeIssueBody(repo, issueNumber, body) {
  const tmp = path.join(projectTmpDir(projectDir), `aitm-migrate-${issueNumber}-${Date.now()}.md`);
  try {
    writeFileSync(tmp, body, 'utf8');
    await gh(['issue', 'edit', String(issueNumber), '-R', repo, '--body-file', tmp]);
  } finally {
    try {
      unlinkSync(tmp);
    } catch {}
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
  for (const issue of issues) {
    const oldProjectValues = await projectValuesForIssue({
      cfg: oldCfg,
      fieldDefs,
      issueNumber: issue.number,
    });
    const ensured = ensureIssueFieldDb(issue.body || '', fieldDefs, oldProjectValues);
    if (ensured.healed || ensured.changed) healed++;
    const syncPlan = buildFieldSyncPlan({ cfg, fieldDefs, values: ensured.values });
    console.log(`#${issue.number} ${issue.title}: ${syncPlan.length} field value(s)`);
    if (dryRun) continue;
    if (ensured.changed) await writeIssueBody(cfg.repo, issue.number, ensured.body);
    const { itemId } = await tetherIssueToProject({ cfg, issueNumber: issue.number });
    for (const item of syncPlan) {
      await writeProjectFieldValue({
        projectId: cfg.projectId,
        itemId,
        fieldId: item.fieldId,
        value: item.value,
        optionMap,
      });
    }
    synced++;
  }

  console.log(
    dryRun
      ? `Dry run complete. ${healed} issue body DB(s) would be healed.`
      : `Migration complete. ${synced} issue(s) synced; ${healed} issue body DB(s) healed.`
  );
}

main().catch((err) => {
  console.error(`migrate-project: ${err.message}`);
  process.exit(1);
});
