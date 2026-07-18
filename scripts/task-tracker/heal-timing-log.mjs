#!/usr/bin/env node
// EPIC #823 timing model v2 (C4) — historical ⏱ Timing Log heal driver.
//
// A one-time, idempotent, re-runnable sweep that upgrades v1 timing logs to the
// v2 grammar via the pure `healTimingLog` transform (lib/heal-timing-log.mjs):
// strip every retired `idle`/`active-work` row, recompute each `<phase>:completed`
// row's active/idle from its span minus pause/switch-out→resume brackets, and
// fold stripped Δ Words into the enclosing completion row.
//
// Two modes:
//
//   Per-issue:
//     node scripts/task-tracker/heal-timing-log.mjs <issue#> [--apply | --check-only]
//
//   Backlog sweep (open AND closed by default — this is a historical migration):
//     node scripts/task-tracker/heal-timing-log.mjs --sweep [--state open|closed|all]
//                                                           [--apply] [--scope N,N,...]
//
// Default is ALWAYS dry-run (read-only). `--apply` is the only switch that
// writes. Every write routes through `updateTimingComment` (GraphQL) serialized
// on the same per-issue timing lock `postTimingEvent` uses, so the sweep is
// idempotent and restart-safe. Re-running a healed log is a byte-identical no-op.

import {
  findTimingComment as realFindTimingComment,
  updateTimingComment as realUpdateTimingComment,
} from './gh-timing-comment.mjs';
import { withLock } from './locks.mjs';
import { getProjectDir, timingLockPath as resolveTimingLockPath } from './paths.mjs';
import { loadConfig } from './config.mjs';
import { gql, splitRepo } from '../gh/lib/github-projects.mjs';
import { healTimingLog, countRetiredRows } from './lib/heal-timing-log.mjs';
import { assertKnownArgv, reportStrictArgvError } from './lib/argv-strict.mjs';

// Core, testable with injected I/O. `deps.findTimingComment` /
// `deps.updateTimingComment` default to the real GraphQL-backed helpers.
export async function runHeal({ issueNumber, repo, apply = false, deps = {} } = {}) {
  if (issueNumber == null) throw new Error('runHeal: issueNumber is required');
  if (!repo) throw new Error('runHeal: repo is required');
  const findTimingComment = deps.findTimingComment || realFindTimingComment;
  const updateTimingComment = deps.updateTimingComment || realUpdateTimingComment;

  const comment = await findTimingComment(String(issueNumber), repo);
  if (!comment) {
    return { status: 'no-comment', retiredBefore: 0, retiredAfter: 0, commentId: null };
  }
  const retiredBefore = countRetiredRows(comment.body);
  const healed = healTimingLog(comment.body);
  const retiredAfter = countRetiredRows(healed);
  const changed = healed !== comment.body;

  if (!changed) {
    return { status: 'already-canonical', retiredBefore, retiredAfter, commentId: comment.id };
  }
  if (!apply) {
    return { status: 'dry-run', retiredBefore, retiredAfter, commentId: comment.id };
  }
  await updateTimingComment(comment.id, repo, healed);
  return { status: 'healed', retiredBefore, retiredAfter, commentId: comment.id };
}

export function parseArgs(argv) {
  const out = { issue: null, sweep: false, apply: false, state: 'all', scope: null, help: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--sweep') out.sweep = true;
    else if (a === '--apply') out.apply = true;
    else if (a === '--check-only') out.apply = false;
    else if (a === '--help' || a === '-h') out.help = true;
    else if (a === '--state') out.state = argv[++i];
    else if (a.startsWith('--state=')) out.state = a.slice('--state='.length);
    else if (a === '--scope')
      out.scope = argv[++i]
        .split(',')
        .map((s) => Number(s.replace(/^#/, '')))
        .filter(Number.isFinite);
    else if (a.startsWith('--scope='))
      out.scope = a
        .slice('--scope='.length)
        .split(',')
        .map((s) => Number(s.replace(/^#/, '')))
        .filter(Number.isFinite);
    else if (/^#?\d+$/.test(a)) out.issue = a.replace(/^#/, '');
  }
  return out;
}

export function printUsage(out = process.stdout) {
  out.write(
    'Usage:\n' +
      '  node scripts/task-tracker/heal-timing-log.mjs <issue#> [--apply | --check-only]\n' +
      '  node scripts/task-tracker/heal-timing-log.mjs --sweep [--state open|closed|all] [--apply] [--scope N,N,...]\n' +
      '  Default: dry-run (read-only). --apply writes. Sweep default --state all.\n'
  );
}

export function timingLockPath(issueNumber, projDir) {
  const safe = String(issueNumber).replace(/[^A-Za-z0-9_-]/g, '_');
  return resolveTimingLockPath(safe, projDir);
}

// Paginated enumeration of project-tethered issue numbers, filtered by state.
// Mirrors heal-timing-starts-sweep.mjs#fetchAllIssueNumbers.
export async function fetchAllIssueNumbers({ repo, state, projectId, deps = {} } = {}) {
  const gqlFn = deps.gql || gql;
  const { owner, repoName } = splitRepo(repo);
  const numbers = [];
  let cursor = null;
  for (let page = 0; page < 50; page++) {
    const data = await gqlFn(
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

// Run one issue through the heal under its per-issue timing lock.
async function healUnderLock({ issueNumber, repo, apply, deps }) {
  const withLockFn = deps.withLock || withLock;
  const getProjectDirFn = deps.getProjectDir || getProjectDir;
  const runHealFn = deps.runHeal || runHeal;
  const lockPath = timingLockPath(issueNumber, getProjectDirFn());
  return withLockFn(lockPath, () => runHealFn({ issueNumber, repo, apply, deps }), {
    timeoutMs: 10_000,
    retries: 2,
  });
}

async function runPerIssue(args, { repo, out, deps }) {
  const res = await healUnderLock({ issueNumber: args.issue, repo, apply: args.apply, deps });
  const verb = args.apply ? 'apply' : 'check-only';
  out.write(
    `#${args.issue} [${verb}] ${res.status}: ${res.retiredBefore} retired row(s)` +
      (res.status === 'no-comment' ? '' : ` → ${res.retiredAfter} after heal`) +
      '\n'
  );
  if (res.status === 'dry-run') out.write('(dry-run — re-run with --apply to write)\n');
}

async function runSweep(args, { cfg, repo, out, err, deps }) {
  if (!cfg.projectId) {
    err.write('heal-timing-log: projectId not configured\n');
    return 1;
  }
  if (!['open', 'closed', 'all'].includes(args.state)) {
    err.write(`heal-timing-log: invalid --state ${args.state}\n`);
    return 2;
  }
  const fetchFn = deps.fetchAllIssueNumbers || fetchAllIssueNumbers;
  const numbers =
    args.scope ?? (await fetchFn({ repo, state: args.state, projectId: cfg.projectId }));

  out.write(
    `heal-timing-log sweep: mode=${args.apply ? 'APPLY (--apply)' : 'dry-run'} ` +
      `state=${args.state} issues=${numbers.length}\n`
  );

  let touched = 0;
  let retired = 0;
  const failed = [];
  for (const n of numbers) {
    try {
      const res = await healUnderLock({ issueNumber: n, repo, apply: args.apply, deps });
      if (res.status === 'dry-run' || res.status === 'healed') {
        touched++;
        retired += res.retiredBefore;
        out.write(`#${n}\t${res.status}\tretired=${res.retiredBefore} → ${res.retiredAfter}\n`);
      }
    } catch (e) {
      failed.push({ issue: n, error: e.message });
      out.write(`#${n}\tERROR: ${e.message}\n`);
    }
  }
  out.write(
    `Summary: issues=${numbers.length} ${args.apply ? 'healed' : 'to-heal'}=${touched} ` +
      `retiredRows=${retired} failed=${failed.length}\n`
  );
  if (!args.apply && touched > 0) out.write('(dry-run — re-run with --apply to write)\n');
  return 0;
}

// I/O + orchestration seams are injectable (`deps`) so `main` is exercisable
// offline; every dep defaults to the real implementation.
export async function main(argv, deps = {}) {
  const loadConfigFn = deps.loadConfig || loadConfig;
  const out = deps.out || process.stdout;
  const err = deps.err || process.stderr;
  const exit = deps.exit || ((code) => process.exit(code));

  // #878 — refuse unknown flags before any config load or gh call. This script
  // also accepts a bare `<issue#>` positional.
  try {
    assertKnownArgv(argv, {
      flags: ['--sweep', '--apply', '--check-only'],
      options: ['--state', '--scope'],
      positionals: { max: 1 },
    });
  } catch (e) {
    if (!reportStrictArgvError(e, { err: (s) => err.write(s) })) throw e;
    printUsage(err);
    return exit(2);
  }

  const args = parseArgs(argv);
  if (args.help || (!args.sweep && !args.issue)) {
    printUsage(out);
    return exit(args.help ? 0 : 2);
  }
  const cfg = await loadConfigFn();
  const repo = cfg.repo;
  if (!repo) {
    err.write('heal-timing-log: no repo configured\n');
    return exit(2);
  }

  if (args.sweep) {
    const code = await runSweep(args, { cfg, repo, out, err, deps });
    return exit(code);
  }
  await runPerIssue(args, { repo, out, deps });
}

const isMain = import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  main(process.argv.slice(2)).catch((err) => {
    process.stderr.write(`heal-timing-log: ${err.stack || err.message}\n`);
    process.exit(1);
  });
}
