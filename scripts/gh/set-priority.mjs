#!/usr/bin/env node
// Set Priority field on a GitHub issue (and optionally all sub-issues).
// Usage: node scripts/gh/set-priority.mjs <issue#> <priority> [--cascade]
// Priorities: p0 | p1 | p2
// --cascade: also set the same priority on all direct sub-issues

import { loadConfig } from '../task-tracker/config.mjs';
import { gh, gql } from './lib/github-projects.mjs';

const SKIP_NETWORK = process.env.TT_SKIP_NETWORK === '1';

const PRIORITY_TO_CONFIG_KEY = {
  p0: 'priorityOptionP0',
  p1: 'priorityOptionP1',
  p2: 'priorityOptionP2',
};

function usage() {
  process.stderr.write(
    'Usage: node scripts/gh/set-priority.mjs <issue#> <priority> [--cascade]\n' +
      'Priorities: p0 | p1 | p2\n'
  );
  process.exit(1);
}

const cliArgs = process.argv.slice(2);
const issueArg = cliArgs[0];
const priorityArg = cliArgs[1];
const cascade = cliArgs.includes('--cascade');

if (!issueArg || !priorityArg) usage();
if (!/^\d+$/.test(issueArg)) usage();

const priority = priorityArg.toLowerCase();
const configKey = PRIORITY_TO_CONFIG_KEY[priority];
if (!configKey) {
  process.stderr.write(`Unknown priority: ${priorityArg}\nPriorities: p0 | p1 | p2\n`);
  process.exit(1);
}

const cfg = loadConfig();

if (!SKIP_NETWORK && (!cfg.projectId || !cfg.priorityFieldId)) {
  process.stderr.write('Error: Priority field not configured. Run: npx ai-task-manager init\n');
  process.exit(1);
}

const optionId = cfg[configKey];
if (!SKIP_NETWORK && !optionId) {
  process.stderr.write(
    `Error: option ID for priority '${priority}' not configured. Run: npx ai-task-manager init\n`
  );
  process.exit(1);
}

const [owner, repoName] = (cfg.repo || '/').split('/');
const priorityLabel = priority.toUpperCase();

async function getProjectItemId(issueNum, projectId) {
  const data = await gql(
    `
    query($owner: String!, $repo: String!, $issue: Int!) {
      repository(owner: $owner, name: $repo) {
        issue(number: $issue) {
          projectItems(first: 20) { nodes { id project { id } } }
        }
      }
    }`,
    { owner, repo: repoName, issue: Number(issueNum) }
  );
  const nodes = data?.repository?.issue?.projectItems?.nodes || [];
  const match = nodes.find((n) => n?.project?.id === projectId);
  return match?.id || '';
}

async function setPriority(issueNum) {
  if (SKIP_NETWORK) {
    console.log(`  ✓ #${issueNum} → ${priorityLabel}`);
    return;
  }
  const itemId = await getProjectItemId(issueNum, cfg.projectId);
  if (!itemId) {
    console.log(`  Issue #${issueNum} not found in project — skipping`);
    return;
  }
  await gh([
    'project',
    'item-edit',
    '--project-id',
    cfg.projectId,
    '--id',
    itemId,
    '--field-id',
    cfg.priorityFieldId,
    '--single-select-option-id',
    optionId,
  ]);
  console.log(`  ✓ #${issueNum} → ${priorityLabel}`);
}

console.log(`Setting priority on #${issueArg}...`);
await setPriority(issueArg);

if (cascade && !SKIP_NETWORK) {
  console.log(`Cascading to sub-issues of #${issueArg}...`);
  let subNums = [];
  try {
    const data = await gql(
      `
      query($owner: String!, $repo: String!, $issue: Int!) {
        repository(owner: $owner, name: $repo) {
          issue(number: $issue) {
            subIssues(first: 50) { nodes { number } }
          }
        }
      }`,
      { owner, repo: repoName, issue: Number(issueArg) }
    );
    subNums = (data?.repository?.issue?.subIssues?.nodes || []).map((n) => n.number);
  } catch {
    /* subIssues may not be available on all GH plans */
  }

  if (subNums.length === 0) {
    console.log('  No sub-issues found');
  } else {
    for (const num of subNums) {
      await setPriority(String(num));
    }
  }
}
