#!/usr/bin/env node
// #539 — Backlog-wide duplicate-`start` timing-log heal driver. Enumerates
// project-tethered issues (default: closed/done), audits each issue's ⏱ Timing
// Log comment for >1 `start` row, and — only under `--all` — heals every
// corrupted log by rewriting trailing `start` rows to `resumed` (#535 core),
// serialized on the per-issue timing lock.
//
// CLI:
//   node scripts/task-tracker/heal-timing-starts-sweep.mjs [--state closed|open|all]
//                                                          [--all]
//                                                          [--scope N,N,...]
//
// Default: --state closed, dry-run (read-only audit, NO writes). `--all` is the
// ONLY switch that writes; each write routes through the #535 `runHeal` command
// under its per-issue timing lock, so the sweep is idempotent and restart-safe.
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { loadConfig } from './config.mjs';
import { findTimingComment } from './gh-timing-comment.mjs';
import { runHeal } from './heal-timing-starts.mjs';
import { auditBacklog, healBacklog } from './lib/heal-timing-sweep.mjs';
import { gql, splitRepo } from '../gh/lib/github-projects.mjs';
import { wantsHelp, emitSelfDoc } from '../lib/self-doc.mjs';

if (import.meta.url === `file://${process.argv[1]}` && wantsHelp(process.argv.slice(2))) {
  emitSelfDoc('heal-timing-starts-sweep');
  process.exit(0);
}

function parseArgs(argv) {
  const args = { state: 'closed', apply: false, scope: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--all') args.apply = true;
    else if (a === '--state') args.state = argv[++i];
    else if (a.startsWith('--state=')) args.state = a.slice('--state='.length);
    else if (a === '--scope')
      args.scope = argv[++i]
        .split(',')
        .map((s) => Number(s.replace(/^#/, '')))
        .filter(Number.isFinite);
    else if (a.startsWith('--scope='))
      args.scope = a
        .slice('--scope='.length)
        .split(',')
        .map((s) => Number(s.replace(/^#/, '')))
        .filter(Number.isFinite);
    else if (a === '--help' || a === '-h') {
      printUsage();
      process.exit(0);
    }
  }
  if (!['open', 'closed', 'all'].includes(args.state)) {
    process.stderr.write(`heal-timing-starts-sweep: invalid --state ${args.state}\n`);
    process.exit(2);
  }
  return args;
}

function printUsage() {
  process.stdout.write(
    'Usage: heal-timing-starts-sweep.mjs [--state closed|open|all] [--all] [--scope N,N,...]\n' +
      '  Default: --state closed, dry-run. --all applies the heal (writes).\n'
  );
}

// Paginated enumeration of project-tethered issue numbers, filtered by state.
// Mirrors heal-functional-dod.mjs#fetchAllIssueNumbers.
async function fetchAllIssueNumbers({ repo, state, projectId }) {
  const { owner, repoName } = splitRepo(repo);
  const numbers = [];
  let cursor = null;
  for (let page = 0; page < 50; page++) {
    const data = await gql(
      `
      query($owner: String!, $repo: String!, $cursor: String) {
        repository(owner: $owner, name: $repo) {
          issues(first: 100, after: $cursor, states: [OPEN, CLOSED], orderBy: {field: CREATED_AT, direction: ASC}) {
            pageInfo { hasNextPage endCursor }
            nodes {
              number
              state
              projectItems(first: 5) { nodes { project { id } } }
            }
          }
        }
      }
    `,
      { owner, repo: repoName, cursor }
    );
    const issues = data.repository.issues.nodes;
    for (const i of issues) {
      const onProject = i.projectItems.nodes.some((n) => n.project?.id === projectId);
      if (!onProject) continue;
      if (state === 'open' && i.state !== 'OPEN') continue;
      if (state === 'closed' && i.state !== 'CLOSED') continue;
      numbers.push(i.number);
    }
    if (!data.repository.issues.pageInfo.hasNextPage) break;
    cursor = data.repository.issues.pageInfo.endCursor;
  }
  return numbers;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const cfg = loadConfig();
  if (!cfg.repo) {
    process.stderr.write('heal-timing-starts-sweep: repo not configured\n');
    process.exit(1);
  }
  if (!cfg.projectId) {
    process.stderr.write('heal-timing-starts-sweep: projectId not configured\n');
    process.exit(1);
  }

  const numbers =
    args.scope ??
    (await fetchAllIssueNumbers({ repo: cfg.repo, state: args.state, projectId: cfg.projectId }));

  process.stdout.write(
    `heal-timing-starts-sweep: mode=${args.apply ? 'APPLY (--all)' : 'dry-run'} state=${args.state} issues=${numbers.length}\n`
  );

  const readTimingBody = async (issueNumber) => {
    const comment = await findTimingComment(String(issueNumber), cfg.repo);
    return comment?.body ?? '';
  };
  const healOne = (issueNumber) =>
    runHeal({ issueNumber: String(issueNumber), repo: cfg.repo, apply: true });

  if (!args.apply) {
    const audit = await auditBacklog({ issues: numbers, readTimingBody });
    for (const r of audit.corrupted) {
      process.stdout.write(`#${r.issue}\tstarts=${r.starts}\textra=${r.extraStarts}\n`);
    }
    process.stdout.write(
      `Audit: issues=${audit.totalIssues} corrupted=${audit.totalCorrupted} extraStarts=${audit.totalExtraStarts}\n`
    );
    return;
  }

  const res = await healBacklog({ issues: numbers, readTimingBody, healOne });
  for (const h of res.healed) {
    const r = h.result || {};
    process.stdout.write(
      `#${h.issue}\thealed\t${r.startsBefore ?? '?'} -> ${r.startsAfter ?? '?'}\n`
    );
  }
  for (const f of res.failed) {
    process.stdout.write(`#${f.issue}\tERROR: ${f.error}\n`);
  }
  process.stdout.write(
    `Summary: corrupted=${res.totalCorrupted} healed=${res.totalHealed} failed=${res.failed.length} extraStarts=${res.totalExtraStarts}\n`
  );
}

const _isMain = (() => {
  try {
    return process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
  } catch {
    return false;
  }
})();

if (_isMain) {
  main().catch((err) => {
    process.stderr.write(`heal-timing-starts-sweep: ${err.stack || err.message}\n`);
    process.exit(1);
  });
}

export { fetchAllIssueNumbers };
