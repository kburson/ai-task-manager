#!/usr/bin/env node
// #535 — heal command: collapse a corrupted ⏱ Timing Log to exactly one
// `start` row.
//
// Usage: node scripts/task-tracker/heal-timing-starts.mjs <issue#> [--apply | --check-only]
//
//   --check-only (default)  report the start-row count + what the heal would do
//   --apply                 rewrite the timing comment in place
//
// Reads the timing-log comment via `findTimingComment`, applies the pure
// `healTimingStarts` transform (rewrite every `start` after the first into
// `resumed`), and — under `--apply` — writes it back through
// `updateTimingComment` (GraphQL) serialized on the per-issue timing lock.
// Idempotent: re-running an already-canonical log is a no-op.

import {
  findTimingComment as realFindTimingComment,
  updateTimingComment as realUpdateTimingComment,
} from './gh-timing-comment.mjs';
import { withLock } from './locks.mjs';
import { getProjectDir, timingLockPath as resolveTimingLockPath } from './paths.mjs';
import { loadConfig } from './config.mjs';
import { healTimingStarts, countStartRows } from './lib/heal-timing-starts.mjs';
import { assertKnownArgv, reportStrictArgvError } from './lib/argv-strict.mjs';
import { confirmBlastRadius } from './lib/blast-radius-guard.mjs';

// Core, testable with injected I/O. `deps.findTimingComment` /
// `deps.updateTimingComment` default to the real GraphQL-backed helpers.
export async function runHeal({ issueNumber, repo, apply = false, deps = {} } = {}) {
  if (issueNumber == null) throw new Error('runHeal: issueNumber is required');
  if (!repo) throw new Error('runHeal: repo is required');
  const findTimingComment = deps.findTimingComment || realFindTimingComment;
  const updateTimingComment = deps.updateTimingComment || realUpdateTimingComment;

  const comment = await findTimingComment(String(issueNumber), repo);
  if (!comment) {
    return { status: 'no-comment', startsBefore: 0, startsAfter: 0, commentId: null };
  }
  const startsBefore = countStartRows(comment.body);
  const healed = healTimingStarts(comment.body);
  const startsAfter = countStartRows(healed);
  const changed = healed !== comment.body;

  if (!changed) {
    return {
      status: 'already-canonical',
      startsBefore,
      startsAfter,
      commentId: comment.id,
    };
  }
  if (!apply) {
    return { status: 'dry-run', startsBefore, startsAfter, commentId: comment.id };
  }
  await updateTimingComment(comment.id, repo, healed);
  return { status: 'healed', startsBefore, startsAfter, commentId: comment.id };
}

export function parseArgs(argv) {
  const out = { issue: null, apply: false, help: false, yes: false };
  for (const a of argv) {
    if (a === '--apply') out.apply = true;
    else if (a === '--check-only') out.apply = false;
    else if (a === '--yes') out.yes = true;
    else if (a === '--help' || a === '-h') out.help = true;
    else if (/^#?\d+$/.test(a)) out.issue = a.replace(/^#/, '');
  }
  return out;
}

export function printUsage(out = process.stdout) {
  out.write(
    'Usage: node scripts/task-tracker/heal-timing-starts.mjs <issue#> [--apply | --check-only] [--yes]\n' +
      '  --yes  skip the blast-radius confirmation prompt on --apply\n'
  );
}

export function timingLockPath(issueNumber, projDir) {
  const safe = String(issueNumber).replace(/[^A-Za-z0-9_-]/g, '_');
  return resolveTimingLockPath(safe, projDir);
}

// I/O + orchestration seams are injectable (`deps`) so `main` is exercisable
// offline; every dep defaults to the real implementation, keeping the CLI
// runtime path byte-identical.
export async function main(argv, deps = {}) {
  const loadConfigFn = deps.loadConfig || loadConfig;
  const withLockFn = deps.withLock || withLock;
  const runHealFn = deps.runHeal || runHeal;
  const getProjectDirFn = deps.getProjectDir || getProjectDir;
  const out = deps.out || process.stdout;
  const err = deps.err || process.stderr;
  const exit = deps.exit || ((code) => process.exit(code));

  // #878 — refuse unknown flags before any config load or gh call. The bare
  // `<issue#>` positional is required by this script's own usage.
  try {
    assertKnownArgv(argv, {
      flags: ['--apply', '--check-only', '--yes'],
      positionals: { max: 1 },
    });
  } catch (e) {
    if (!reportStrictArgvError(e, { err: (s) => err.write(s) })) throw e;
    printUsage(err);
    return exit(2);
  }

  const args = parseArgs(argv);
  if (args.help || !args.issue) {
    printUsage(out);
    return exit(args.help ? 0 : 2);
  }
  const cfg = await loadConfigFn();
  const repo = cfg.repo;
  if (!repo) {
    err.write('heal-timing-starts: no repo configured\n');
    return exit(2);
  }

  if (args.apply) {
    const confirm = deps.confirmBlastRadius || confirmBlastRadius;
    const decision = await confirm({
      issueNumbers: [Number(args.issue)],
      yes: args.yes,
      log: (s) => out.write(s),
      warn: (s) => err.write(s),
    });
    if (!decision.proceed) return exit(2);
  }

  // Serialize the read-transform-write against concurrent timing appenders on
  // the same per-issue lock `postTimingEvent` uses.
  const lockPath = timingLockPath(args.issue, getProjectDirFn());
  const res = await withLockFn(
    lockPath,
    () => runHealFn({ issueNumber: args.issue, repo, apply: args.apply }),
    {
      timeoutMs: 10_000,
      retries: 2,
    }
  );

  const verb = args.apply ? 'apply' : 'check-only';
  out.write(
    `#${args.issue} [${verb}] ${res.status}: ${res.startsBefore} start row(s)` +
      (res.status === 'no-comment' ? '' : ` → ${res.startsAfter} after heal`) +
      '\n'
  );
  if (res.status === 'dry-run') {
    out.write('(dry-run — re-run with --apply to write)\n');
  }
}

const isMain = import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  main(process.argv.slice(2)).catch((err) => {
    process.stderr.write(`heal-timing-starts: ${err.stack || err.message}\n`);
    process.exit(1);
  });
}
