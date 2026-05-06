#!/usr/bin/env node
import { execFile } from 'node:child_process';
import { spawnSync } from 'node:child_process';
import { promisify } from 'node:util';
import { writeFileSync, unlinkSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { loadConfig } from '../task-tracker/config.mjs';
import { ensureIssueFieldDb } from '../task-tracker/issue-field-db.mjs';
import { buildFieldSyncPlan, loadProjectFieldDefs } from '../task-tracker/project-fields.mjs';
import {
  addIssueToProject,
  fieldOptionMap,
  gh,
  projectItemForIssue,
  projectValuesForIssue,
  writeProjectFieldValue,
} from './lib/github-projects.mjs';

const pexec = promisify(execFile);
const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const skipInit = args.includes('--skip-init');
const includeClosed = args.includes('--closed') || args.includes('--all');

const projectDir = process.env.AI_TASK_MANAGER_PROJECT_DIR || process.env.CLAUDE_PROJECT_DIR || process.cwd();

async function run(cmd, args, opts = {}) {
  const { stdout } = await pexec(cmd, args, { cwd: projectDir, timeout: 60000, ...opts });
  return stdout;
}

async function writeIssueBody(repo, issueNumber, body) {
  const tmp = path.join(os.tmpdir(), `aitm-migrate-${issueNumber}-${Date.now()}.md`);
  try {
    writeFileSync(tmp, body, 'utf8');
    await gh(['issue', 'edit', String(issueNumber), '-R', repo, '--body-file', tmp]);
  } finally {
    try { unlinkSync(tmp); } catch {}
  }
}

async function main() {
  const oldCfg = loadConfig();
  if (!skipInit && !dryRun) {
    const initScript = new URL('./init-project-config.sh', import.meta.url).pathname;
    const res = spawnSync('bash', [initScript, '--target', projectDir], {
      cwd: projectDir,
      stdio: 'inherit',
      env: process.env,
    });
    if (res.status !== 0) process.exit(res.status || 1);
  }

  const cfg = loadConfig();
  if (!cfg.repo) throw new Error('repo not configured');
  if (!cfg.projectId) throw new Error('projectId not configured');
  const fieldDefs = loadProjectFieldDefs(projectDir);
  const state = includeClosed ? 'all' : 'open';
  const raw = await gh(['issue', 'list', '-R', cfg.repo, '--state', state, '--limit', '1000', '--json', 'number,id,body,title']);
  const issues = JSON.parse(raw);
  const optionMap = dryRun ? {} : await fieldOptionMap(cfg.projectId);

  console.log(`Migrating ${issues.length} ${state} issue(s) into configured project.`);
  let healed = 0;
  let synced = 0;
  for (const issue of issues) {
    const oldProjectValues = await projectValuesForIssue({ cfg: oldCfg, fieldDefs, issueNumber: issue.number });
    const ensured = ensureIssueFieldDb(issue.body || '', fieldDefs, oldProjectValues);
    if (ensured.healed || ensured.changed) healed++;
    const syncPlan = buildFieldSyncPlan({ cfg, fieldDefs, values: ensured.values });
    console.log(`#${issue.number} ${issue.title}: ${syncPlan.length} field value(s)`);
    if (dryRun) continue;
    if (ensured.changed) await writeIssueBody(cfg.repo, issue.number, ensured.body);
    const existing = await projectItemForIssue({ repo: cfg.repo, projectId: cfg.projectId, issueNumber: issue.number });
    const itemId = existing.itemId || await addIssueToProject(cfg.projectId, issue.id || existing.issueId);
    for (const item of syncPlan) {
      await writeProjectFieldValue({ projectId: cfg.projectId, itemId, fieldId: item.fieldId, value: item.value, optionMap });
    }
    synced++;
  }

  console.log(dryRun
    ? `Dry run complete. ${healed} issue body DB(s) would be healed.`
    : `Migration complete. ${synced} issue(s) synced; ${healed} issue body DB(s) healed.`);
}

main().catch(err => {
  console.error(`migrate-project: ${err.message}`);
  process.exit(1);
});
