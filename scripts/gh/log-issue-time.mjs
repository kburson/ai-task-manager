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
import { projectTmpDir } from '../task-tracker/paths.mjs';
import { ensureIssueFieldDb } from '../task-tracker/issue-field-db.mjs';
import { buildFieldSyncPlan, loadProjectFieldDefs } from '../task-tracker/project-fields.mjs';
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
const projectDir = process.env.AI_TASK_MANAGER_PROJECT_DIR || process.env.CLAUDE_PROJECT_DIR || process.cwd();

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

// ---- Parse timing table ----

function parseNum(cell) {
  const s = cell.trim().replace(/,/g, '');
  if (s === '—' || s === '') return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function parseTimingComment(body) {
  const lines = body.split('\n');
  let activeMinCol = -1;
  let wordMarkerCol = -1;
  let totalActiveMin = 0;
  let lastWordMarker = null;
  let rowCount = 0;

  for (const line of lines) {
    if (!line.startsWith('|')) continue;
    const cells = line.split('|').slice(1, -1);

    // Header row
    if (cells.some(c => c.trim() === 'Timestamp')) {
      activeMinCol = cells.findIndex(c => c.trim() === 'Active' || c.trim() === 'Active Min');
      wordMarkerCol = cells.findIndex(c => c.trim() === 'Word Marker');
      continue;
    }
    // Separator row
    if (cells.every(c => /^[-: ]+$/.test(c.trim()))) continue;
    // Data row
    if (activeMinCol === -1 || wordMarkerCol === -1) continue;

    const activeMin = parseNum(cells[activeMinCol]);
    const wordMarker = parseNum(cells[wordMarkerCol]);
    if (activeMin != null) totalActiveMin += activeMin;
    if (wordMarker != null) lastWordMarker = wordMarker;
    rowCount++;
  }

  return { totalActiveMin, totalContextWords: lastWordMarker, rowCount };
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
  const contextField = cfg.fieldContextWords
    ? { id: cfg.fieldContextWords }
    : fieldByName('Context Length');
  if (!sessionField) throw new Error('Field "Session Time" not found on project');
  if (!contextField) throw new Error('Field "Context Length" not found on project');

  return {
    itemId: itemNode.id,
    engagedFieldId: engagedField?.id || '',
    sessionFieldId: sessionField.id,
    contextFieldId: contextField.id,
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

  const { totalActiveMin, totalContextWords, rowCount } = parseTimingComment(comment.body);

  if (rowCount === 0) {
    console.error('Timing comment found but contains no data rows');
    process.exit(1);
  }

  console.log(`Issue #${issueNumber}: ${rowCount} timing rows`);
  console.log(`  Engaged Time        : ${totalActiveMin} min`);
  console.log(`  Session Time        : ${totalActiveMin} min`);
  console.log(`  Context Length      : ${(totalContextWords ?? 0).toLocaleString('en-US')} words`);

  if (dryRun) {
    console.log('Dry run — no writes performed.');
    process.exit(0);
  }

  const { itemId, engagedFieldId, sessionFieldId, contextFieldId } = await fetchProjectMeta();
  const fieldDefs = loadProjectFieldDefs();
  const issueBody = await fetchIssueBody();
  const ensured = ensureIssueFieldDb(issueBody, fieldDefs, {
    engagedTime: totalActiveMin,
    sessionTime: totalActiveMin,
    contextLength: totalContextWords ?? 0,
  });
  const values = {
    ...ensured.values,
    engagedTime: totalActiveMin,
    sessionTime: totalActiveMin,
    contextLength: totalContextWords ?? 0,
  };
  const updated = ensureIssueFieldDb(issueBody, fieldDefs, values);
  if (updated.changed) await writeIssueBody(updated.body);

  const syncPlan = buildFieldSyncPlan({ cfg, fieldDefs, values });
  if (syncPlan.length) {
    for (const item of syncPlan) {
      await writeProjectFieldValue({ projectId: cfg.projectId, itemId, fieldId: item.fieldId, value: item.value });
    }
  } else {
    if (engagedFieldId) await writeNumberField(itemId, engagedFieldId, totalActiveMin);
    await writeNumberField(itemId, sessionFieldId, totalActiveMin);
    await writeNumberField(itemId, contextFieldId, totalContextWords ?? 0);
  }

  console.log('Fields updated on GitHub Projects board.');
})().catch(err => {
  console.error(`log-issue-time: ${err.message}`);
  process.exit(1);
});
