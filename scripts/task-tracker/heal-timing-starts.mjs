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

function parseArgs(argv) {
  const out = { issue: null, apply: false, help: false };
  for (const a of argv) {
    if (a === '--apply') out.apply = true;
    else if (a === '--check-only') out.apply = false;
    else if (a === '--help' || a === '-h') out.help = true;
    else if (/^#?\d+$/.test(a)) out.issue = a.replace(/^#/, '');
  }
  return out;
}

function printUsage() {
  process.stdout.write(
    'Usage: node scripts/task-tracker/heal-timing-starts.mjs <issue#> [--apply | --check-only]\n'
  );
}

function timingLockPath(issueNumber, projDir) {
  const safe = String(issueNumber).replace(/[^A-Za-z0-9_-]/g, '_');
  return resolveTimingLockPath(safe, projDir);
}

async function main(argv) {
  const args = parseArgs(argv);
  if (args.help || !args.issue) {
    printUsage();
    process.exit(args.help ? 0 : 2);
  }
  const cfg = await loadConfig();
  const repo = cfg.repo;
  if (!repo) {
    process.stderr.write('heal-timing-starts: no repo configured\n');
    process.exit(2);
  }

  // Serialize the read-transform-write against concurrent timing appenders on
  // the same per-issue lock `postTimingEvent` uses.
  const lockPath = timingLockPath(args.issue, getProjectDir());
  const res = await withLock(
    lockPath,
    () => runHeal({ issueNumber: args.issue, repo, apply: args.apply }),
    {
      timeoutMs: 10_000,
      retries: 2,
    }
  );

  const verb = args.apply ? 'apply' : 'check-only';
  process.stdout.write(
    `#${args.issue} [${verb}] ${res.status}: ${res.startsBefore} start row(s)` +
      (res.status === 'no-comment' ? '' : ` → ${res.startsAfter} after heal`) +
      '\n'
  );
  if (res.status === 'dry-run') {
    process.stdout.write('(dry-run — re-run with --apply to write)\n');
  }
}

const isMain = import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  main(process.argv.slice(2)).catch((err) => {
    process.stderr.write(`heal-timing-starts: ${err.stack || err.message}\n`);
    process.exit(1);
  });
}
