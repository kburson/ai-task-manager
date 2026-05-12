#!/usr/bin/env node
// Read an issue's ⏱ Timing Log comment, compute totals, and write them to GitHub Projects V2.
//
// Engaged Time / Session Time = sum of all Active Min rows until richer Codex
// engagement metrics are available.
// Context Length              = Word Marker from the last data row.
//
// Usage: node log-issue-time.mjs <issue#> [--dry-run]

import { writeFileSync, unlinkSync } from 'node:fs';
import path from 'node:path';
import { loadConfig } from '../task-tracker/config.mjs';
import { getProjectDir, projectTmpDir } from '../task-tracker/paths.mjs';
import { ensureIssueFieldDb } from '../task-tracker/issue-field-db.mjs';
import { buildFieldSyncPlan, fieldIdFor, loadProjectFieldDefs } from '../task-tracker/project-fields.mjs';
import { parseTimingRows, rollupTotals } from '../task-tracker/timing-rollup.mjs';
import {
  gh,
  gql,
  splitRepo,
  writeProjectFieldValue,
} from './lib/github-projects.mjs';

const args = process.argv.slice(2);
const issueArg = args.find(a => /^#?\d+$/.test(a));
const dryRun = args.includes('--dry-run');

if (!issueArg) {
  console.error('Usage: node log-issue-time.mjs <issue#> [--dry-run]');
  process.exit(1);
}

const issueNumber = issueArg.replace('#', '');
const cfg = loadConfig();
const projectDir = getProjectDir();

if (!cfg.repo) { console.error('repo not configured. Run: /task config repo owner/repo'); process.exit(1); }
if (!cfg.projectId) { console.error('projectId not configured. Run: npx ai-task-manager init'); process.exit(1); }

const { owner, repoName } = splitRepo(cfg.repo);

async function fetchIssueBody() {
  const out = await gh(['issue', 'view', issueNumber, '-R', cfg.repo, '--json', 'body']);
  return JSON.parse(out).body ?? '';
}

async function writeIssueBody(body) {
  const tmp = path.join(projectTmpDir(projectDir), `aitm-fields-${issueNumber}-${Date.now()}.md`);
  try {
    writeFileSync(tmp, body, 'utf8');
    await gh(['issue', 'edit', issueNumber, '-R', cfg.repo, '--body-file', tmp]);
  } finally {
    try { unlinkSync(tmp); } catch {}
  }
}

// ---- GitHub queries ----

async function fetchTimingComment() {
  const out = await gh(['issue', 'view', issueNumber, '-R', cfg.repo, '--json', 'comments']);
  const { comments } = JSON.parse(out);
  return comments.find(c => c.body.includes('⏱ Timing Log')) ?? null;
}

async function fetchProjectMeta() {
  const data = await gql(`
    query($owner: String!, $repo: String!, $issue: Int!, $project: ID!) {
      repository(owner: $owner, name: $repo) {
        issue(number: $issue) {
          projectItems(first: 5) {
            nodes { id project { id } }
          }
        }
      }
      node(id: $project) {
        ... on ProjectV2 {
          fields(first: 50) {
            nodes {
              ... on ProjectV2FieldCommon { id name }
            }
          }
        }
      }
    }`,
    { owner, repo: repoName, issue: Number(issueNumber), project: cfg.projectId }
  );

  const projectItems = data.repository.issue.projectItems.nodes;
  const itemNode = projectItems.find(n => n.project?.id === cfg.projectId) ?? projectItems[0];
  if (!itemNode) throw new Error(`Issue #${issueNumber} is not on project ${cfg.projectId}`);

  const fields = data.node.fields.nodes;
  const fieldByName = (...names) => fields.find(f => names.includes(f.name));

  const engagedField = cfg.fieldEngagedTime
    ? { id: cfg.fieldEngagedTime }
    : fieldByName('Engaged Time', 'Actual Hours');
  const sessionField = cfg.fieldSessionTime
    ? { id: cfg.fieldSessionTime }
    : fieldByName('Session Time', 'Actual Session Time');
  const reviewField = fieldIdFor(cfg, 'reviewTime')
    ? { id: fieldIdFor(cfg, 'reviewTime') }
    : fieldByName('Review Time');
  if (!sessionField) throw new Error('Field "Session Time" not found on project');

  return {
    itemId: itemNode.id,
    engagedFieldId: engagedField?.id || '',
    sessionFieldId: sessionField.id,
    reviewFieldId: reviewField?.id || '',
  };
}

async function writeNumberField(itemId, fieldId, value) {
  await writeProjectFieldValue({ projectId: cfg.projectId, itemId, fieldId, value: { number: value } });
}

// ---- Main ----

(async () => {
  const comment = await fetchTimingComment();
  if (!comment) {
    console.error(`No ⏱ Timing Log comment found on issue #${issueNumber}`);
    process.exit(1);
  }

  const rows = parseTimingRows(comment.body);
  const thresholdMin = Number(cfg.reviewPauseThresholdMin) || 5;
  const { rowCount, totalActiveMin, reviewMin, engagedMin } = rollupTotals(rows, thresholdMin);

  if (rowCount === 0) {
    console.error('Timing comment found but contains no data rows');
    process.exit(1);
  }

  console.log(`Issue #${issueNumber}: ${rowCount} timing rows`);
  console.log(`  Engaged Time        : ${engagedMin} min  (active ${totalActiveMin} + review ${reviewMin})`);
  console.log(`  Session Time        : ${totalActiveMin} min`);
  console.log(`  Review Time         : ${reviewMin} min  (threshold ${thresholdMin} min)`);

  if (dryRun) {
    console.log('Dry run — no writes performed.');
    process.exit(0);
  }

  const { itemId, engagedFieldId, sessionFieldId, reviewFieldId } = await fetchProjectMeta();
  const fieldDefs = loadProjectFieldDefs();
  const issueBody = await fetchIssueBody();
  const ensured = ensureIssueFieldDb(issueBody, fieldDefs, {
    engagedTime: engagedMin,
    sessionTime: totalActiveMin,
    reviewTime: reviewMin,
  });
  const values = {
    ...ensured.values,
    engagedTime: engagedMin,
    sessionTime: totalActiveMin,
    reviewTime: reviewMin,
  };
  const updated = ensureIssueFieldDb(issueBody, fieldDefs, values);
  if (updated.changed) await writeIssueBody(updated.body);

  const syncPlan = buildFieldSyncPlan({ cfg, fieldDefs, values });
  if (syncPlan.length) {
    for (const item of syncPlan) {
      await writeProjectFieldValue({ projectId: cfg.projectId, itemId, fieldId: item.fieldId, value: item.value });
    }
  } else {
    if (engagedFieldId) await writeNumberField(itemId, engagedFieldId, engagedMin);
    await writeNumberField(itemId, sessionFieldId, totalActiveMin);
    if (reviewFieldId) await writeNumberField(itemId, reviewFieldId, reviewMin);
  }

  console.log('Fields updated on GitHub Projects board.');
})().catch(err => {
  console.error(`log-issue-time: ${err.message}`);
  process.exit(1);
});
