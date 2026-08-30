#!/usr/bin/env node
// #1107 — repair one missing departure immediately before an unpaired Timing
// Log reengagement. Dry-run is the default; --apply is the only write path.

import {
  findTimingComment as realFindTimingComment,
  updateTimingComment as realUpdateTimingComment,
} from './gh-timing-comment.mjs';
import { loadConfig } from './config.mjs';
import { withLock } from './locks.mjs';
import { getProjectDir, timingLockPath as resolveTimingLockPath } from './paths.mjs';
import {
  findUnpairedReengagements,
  recoverRedundantSameSecondPair as recoverSameSecondPair,
  repairMissingDeparture,
} from './lib/heal-timing-departure.mjs';
import { assertKnownArgv, reportStrictArgvError } from './lib/argv-strict.mjs';
import { confirmBlastRadius } from './lib/blast-radius-guard.mjs';
import { wantsHelp, emitSelfDoc } from '../lib/self-doc.mjs';

if (import.meta.url === `file://${process.argv[1]}` && wantsHelp(process.argv.slice(2))) {
  emitSelfDoc('heal-timing-departure');
  process.exit(0);
}

export async function runHealDeparture({
  issueNumber,
  repo,
  apply = false,
  rowIndex,
  event = 'pause:other',
  description,
  ts,
  recoverRedundantSameSecondPair = false,
  deps = {},
} = {}) {
  if (issueNumber == null) throw new Error('runHealDeparture: issueNumber is required');
  if (!repo) throw new Error('runHealDeparture: repo is required');
  const findTimingComment = deps.findTimingComment || realFindTimingComment;
  const updateTimingComment = deps.updateTimingComment || realUpdateTimingComment;
  const comment = await findTimingComment(String(issueNumber), repo);
  if (!comment) {
    return { status: 'no-comment', candidatesBefore: 0, candidatesAfter: 0, commentId: null };
  }

  if (recoverRedundantSameSecondPair) {
    const candidatesBefore = findUnpairedReengagements(comment.body).length;
    const healed = recoverSameSecondPair(comment.body, { rowIndex });
    const candidatesAfter = findUnpairedReengagements(healed).length;
    const result = {
      candidatesBefore,
      candidatesAfter,
      commentId: comment.id,
      recoveredRows: 2,
    };
    if (!apply) return { status: 'dry-run', ...result };
    await updateTimingComment(comment.id, repo, healed);
    return { status: 'recovered', ...result };
  }

  const candidatesBefore = findUnpairedReengagements(comment.body).length;
  if (candidatesBefore === 0) {
    return {
      status: 'already-canonical',
      candidatesBefore,
      candidatesAfter: 0,
      commentId: comment.id,
    };
  }
  const healed = repairMissingDeparture(comment.body, { rowIndex, event, description, ts });
  const candidatesAfter = findUnpairedReengagements(healed).length;
  const result = { candidatesBefore, candidatesAfter, commentId: comment.id };
  if (!apply) return { status: 'dry-run', ...result };
  await updateTimingComment(comment.id, repo, healed);
  return { status: 'healed', ...result };
}

export function parseArgs(argv) {
  const out = {
    issue: null,
    apply: false,
    yes: false,
    help: false,
    rowIndex: undefined,
    event: 'pause:other',
    description: undefined,
    ts: undefined,
    recoverRedundantSameSecondPair: false,
  };
  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index];
    if (arg === '--apply') out.apply = true;
    else if (arg === '--check-only') out.apply = false;
    else if (arg === '--yes') out.yes = true;
    else if (arg === '--recover-redundant-same-second-pair')
      out.recoverRedundantSameSecondPair = true;
    else if (arg === '--help' || arg === '-h') out.help = true;
    else if (arg === '--row-index') out.rowIndex = Number(argv[++index]);
    else if (arg === '--event') out.event = argv[++index];
    else if (arg === '--description') out.description = argv[++index];
    else if (arg === '--at') out.ts = argv[++index];
    else if (/^#?[1-9]\d*$/.test(arg)) out.issue = arg.replace(/^#/, '');
  }
  return out;
}

export function printUsage(out = process.stdout) {
  out.write(
    'Usage: node scripts/task-tracker/heal-timing-departure.mjs <issue#> [--apply | --check-only] [--row-index N] [--event pause:<reason>] [--description TEXT] [--at TIMESTAMP] [--recover-redundant-same-second-pair] [--yes]\n' +
      '  row indexes are zero-based Timing Log data-row indexes; dry-run is the default\n' +
      '  --at places the departure at that timestamp; it must fall strictly between the preceding row and the reengagement\n' +
      '  --recover-redundant-same-second-pair removes one exact zero-duration malformed departure/reengagement pair and requires --row-index\n'
  );
}

export function timingLockPath(issueNumber, projectDir) {
  const safe = String(issueNumber).replace(/[^A-Za-z0-9_-]/g, '_');
  return resolveTimingLockPath(safe, projectDir);
}

export async function main(argv, deps = {}) {
  const out = deps.out || process.stdout;
  const err = deps.err || process.stderr;
  const exit = deps.exit || ((code) => process.exit(code));
  try {
    assertKnownArgv(argv, {
      flags: [
        '--apply',
        '--check-only',
        '--yes',
        '--recover-redundant-same-second-pair',
        '--help',
        '-h',
      ],
      options: ['--row-index', '--event', '--description', '--at'],
      positionals: { max: 1 },
    });
  } catch (error) {
    if (!reportStrictArgvError(error, { err: (message) => err.write(message) })) throw error;
    printUsage(err);
    return exit(2);
  }

  const args = parseArgs(argv);
  if (args.help || !args.issue) {
    printUsage(out);
    return exit(args.help ? 0 : 2);
  }
  if (args.rowIndex !== undefined && (!Number.isInteger(args.rowIndex) || args.rowIndex < 0)) {
    err.write('heal-timing-departure: --row-index must be a non-negative integer\n');
    return exit(2);
  }
  if (args.recoverRedundantSameSecondPair && args.rowIndex === undefined) {
    err.write('heal-timing-departure: recovery requires --row-index\n');
    return exit(2);
  }
  if (
    args.recoverRedundantSameSecondPair &&
    (args.ts !== undefined || args.description !== undefined || args.event !== 'pause:other')
  ) {
    err.write(
      'heal-timing-departure: recovery cannot be combined with --at, --event, or --description\n'
    );
    return exit(2);
  }
  const cfg = await (deps.loadConfig || loadConfig)();
  if (!cfg.repo) {
    err.write('heal-timing-departure: no repo configured\n');
    return exit(2);
  }
  if (args.apply) {
    const decision = await (deps.confirmBlastRadius || confirmBlastRadius)({
      issueNumbers: [Number(args.issue)],
      yes: args.yes,
      log: (message) => out.write(message),
      warn: (message) => err.write(message),
    });
    if (!decision.proceed) return exit(2);
  }

  const run = deps.runHealDeparture || runHealDeparture;
  const lock = deps.withLock || withLock;
  const projectDir = (deps.getProjectDir || getProjectDir)();
  const result = await lock(
    timingLockPath(args.issue, projectDir),
    () =>
      run({
        issueNumber: args.issue,
        repo: cfg.repo,
        apply: args.apply,
        rowIndex: args.rowIndex,
        event: args.event,
        description: args.description,
        ts: args.ts,
        recoverRedundantSameSecondPair: args.recoverRedundantSameSecondPair,
      }),
    { timeoutMs: 10_000, retries: 2 }
  );
  out.write(
    `#${args.issue} [${args.apply ? 'apply' : 'check-only'}] ${result.status}: ` +
      `${result.candidatesBefore} unpaired reengagement(s) → ${result.candidatesAfter}\n`
  );
  if (result.status === 'dry-run') out.write('(dry-run — re-run with --apply to write)\n');
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main(process.argv.slice(2)).catch((error) => {
    process.stderr.write(`heal-timing-departure: ${error.stack || error.message}\n`);
    process.exit(1);
  });
}
