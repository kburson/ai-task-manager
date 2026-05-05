#!/usr/bin/env node
// Read an issue's ⏱ Timing Log comment, compute totals, and write them to GitHub Projects V2.
//
// Actual Session Time  = sum of all Active Min rows (each is a delta from its own baseline)
// Context Length       = Word Marker from the last data row (absolute position = final count)
//
// Usage: node log-issue-time.mjs <issue#> [--dry-run]

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { loadConfig } from '../task-tracker/config.mjs';

const pexec = promisify(execFile);

const args = process.argv.slice(2);
const issueArg = args.find(a => /^#?\d+$/.test(a));
const dryRun = args.includes('--dry-run');

if (!issueArg) {
  console.error('Usage: node log-issue-time.mjs <issue#> [--dry-run]');
  process.exit(1);
}

const issueNumber = issueArg.replace('#', '');
const cfg = loadConfig();

if (!cfg.repo) { console.error('repo not configured. Run: /task config repo owner/repo'); process.exit(1); }
if (!cfg.projectId) { console.error('projectId not configured. Run: npx ai-task-manager init'); process.exit(1); }

const [owner, repoName] = cfg.repo.split('/');

async function gh(args) {
  const { stdout } = await pexec('gh', args, { timeout: 10000 });
  return stdout;
}

async function gql(query, variables = {}) {
  const varArgs = Object.entries(variables).flatMap(([k, v]) => ['-F', `${k}=${v}`]);
  const out = await gh(['api', 'graphql', '-f', `query=${query}`, ...varArgs]);
  const parsed = JSON.parse(out);
  if (parsed.errors) throw new Error(parsed.errors.map(e => e.message).join('; '));
  return parsed.data;
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
      activeMinCol = cells.findIndex(c => c.trim() === 'Active Min');
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
              ... on ProjectV2Field { id name }
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
  const fieldByName = name => fields.find(f => f.name === name);

  const sessionField  = fieldByName('Actual Session Time');
  const contextField  = fieldByName('Context Length');
  if (!sessionField) throw new Error('Field "Actual Session Time" not found on project');
  if (!contextField) throw new Error('Field "Context Length" not found on project');

  return { itemId: itemNode.id, sessionFieldId: sessionField.id, contextFieldId: contextField.id };
}

async function writeField(itemId, fieldId, value) {
  await gql(`
    mutation($project: ID!, $item: ID!, $field: ID!, $val: Float!) {
      updateProjectV2ItemFieldValue(input: {
        projectId: $project
        itemId: $item
        fieldId: $field
        value: { number: $val }
      }) { projectV2Item { id } }
    }`,
    { project: cfg.projectId, item: itemId, field: fieldId, val: value }
  );
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
  console.log(`  Actual Session Time : ${totalActiveMin} min`);
  console.log(`  Context Length      : ${(totalContextWords ?? 0).toLocaleString('en-US')} words`);

  if (dryRun) {
    console.log('Dry run — no writes performed.');
    process.exit(0);
  }

  const { itemId, sessionFieldId, contextFieldId } = await fetchProjectMeta();

  await writeField(itemId, sessionFieldId, totalActiveMin);
  await writeField(itemId, contextFieldId, totalContextWords ?? 0);

  console.log('Fields updated on GitHub Projects board.');
})().catch(err => {
  console.error(`log-issue-time: ${err.message}`);
  process.exit(1);
});
