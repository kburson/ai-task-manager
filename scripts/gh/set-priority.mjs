#!/usr/bin/env node
// Set Priority field on a GitHub issue (and optionally all sub-issues).
// Usage: node scripts/gh/set-priority.mjs <issue#> <priority> [--cascade]
// Priorities: p0 | p1 | p2 | p3
// --cascade: also set the same priority on all direct sub-issues

import { loadConfig } from '../task-tracker/config.mjs';
import { gh as ghDefault, gql as gqlDefault } from './lib/github-projects.mjs';
import { wantsHelp, emitSelfDoc } from '../lib/self-doc.mjs';

const PRIORITY_TO_CONFIG_KEY = {
  p0: 'priorityOptionP0',
  p1: 'priorityOptionP1',
  p2: 'priorityOptionP2',
  p3: 'priorityOptionP3',
};

export async function getProjectItemId({ gql, owner, repoName, issueNum, projectId }) {
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

export async function setPriority(issueNum, ctx) {
  const { skipNetwork, priorityLabel, gh, gql, cfg, optionId, owner, repoName, log } = ctx;
  if (skipNetwork) {
    log(`  ✓ #${issueNum} → ${priorityLabel}`);
    return;
  }
  const itemId = await getProjectItemId({
    gql,
    owner,
    repoName,
    issueNum,
    projectId: cfg.projectId,
  });
  if (!itemId) {
    log(`  Issue #${issueNum} not found in project — skipping`);
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
  log(`  ✓ #${issueNum} → ${priorityLabel}`);
}

export async function main(argv, deps = {}) {
  const load = deps.loadConfig || loadConfig;
  const gh = deps.gh || ghDefault;
  const gql = deps.gql || gqlDefault;
  const log = deps.log || ((s) => console.log(s));
  const err = deps.err || ((s) => process.stderr.write(s));
  const exit = deps.exit || ((c) => process.exit(c));
  const skipNetwork =
    deps.skipNetwork !== undefined ? deps.skipNetwork : process.env.TT_SKIP_NETWORK === '1';

  const cliArgs = argv.slice(2);
  if (wantsHelp(cliArgs)) {
    emitSelfDoc('set-priority');
    return exit(0);
  }
  const issueArg = cliArgs[0];
  const priorityArg = cliArgs[1];
  const cascade = cliArgs.includes('--cascade');

  const usage = () => {
    err(
      'Usage: node scripts/gh/set-priority.mjs <issue#> <priority> [--cascade]\n' +
        'Priorities: p0 | p1 | p2 | p3\n'
    );
    return exit(1);
  };
  if (!issueArg || !priorityArg) return usage();
  if (!/^\d+$/.test(issueArg)) return usage();

  const priority = priorityArg.toLowerCase();
  const configKey = PRIORITY_TO_CONFIG_KEY[priority];
  if (!configKey) {
    err(`Unknown priority: ${priorityArg}\nPriorities: p0 | p1 | p2 | p3\n`);
    return exit(1);
  }

  const cfg = load();

  if (!skipNetwork && (!cfg.projectId || !cfg.priorityFieldId)) {
    err('Error: Priority field not configured. Run: npx ai-task-manager init\n');
    return exit(1);
  }

  const optionId = cfg[configKey];
  if (!skipNetwork && !optionId) {
    err(
      `Error: option ID for priority '${priority}' not configured. Run: npx ai-task-manager init\n`
    );
    return exit(1);
  }

  const [owner, repoName] = (cfg.repo || '/').split('/');
  const priorityLabel = priority.toUpperCase();
  const ctx = { skipNetwork, priorityLabel, gh, gql, cfg, optionId, owner, repoName, log };

  log(`Setting priority on #${issueArg}...`);
  await setPriority(issueArg, ctx);

  if (cascade && !skipNetwork) {
    log(`Cascading to sub-issues of #${issueArg}...`);
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
      log('  No sub-issues found');
    } else {
      for (const num of subNums) {
        await setPriority(String(num), ctx);
      }
    }
  }
  return undefined;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main(process.argv).catch((err) => {
    process.stderr.write(`fatal: ${err.message}\n`);
    process.exit(1);
  });
}
