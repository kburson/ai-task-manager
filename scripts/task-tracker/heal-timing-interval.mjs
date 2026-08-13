#!/usr/bin/env node
// #1249 — dry-run-first, locked repair for one caller-reported AFK interval.

import {
  findTimingComment as realFindTimingComment,
  updateTimingComment as realUpdateTimingComment,
} from './gh-timing-comment.mjs';
import { loadConfig } from './config.mjs';
import { withLock } from './locks.mjs';
import { getProjectDir, timingLockPath as resolveTimingLockPath } from './paths.mjs';
import { proposeTimingIntervalRepair } from './lib/heal-timing-interval.mjs';
import { assertKnownArgv, reportStrictArgvError } from './lib/argv-strict.mjs';
import { confirmBlastRadius } from './lib/blast-radius-guard.mjs';
import { emitSelfDoc, wantsHelp } from '../lib/self-doc.mjs';

if (import.meta.url === `file://${process.argv[1]}` && wantsHelp(process.argv.slice(2))) {
  emitSelfDoc('heal-timing-interval');
  process.exit(0);
}

export function timingLockPath(issueNumber, projectDir) {
  const safe = String(issueNumber).replace(/[^A-Za-z0-9_-]/g, '_');
  return resolveTimingLockPath(safe, projectDir);
}

function exactTimingComment(comment, expected) {
  return comment != null && comment.body === expected;
}

export async function runHealTimingInterval({
  issueNumber,
  repo,
  start,
  end,
  apply = false,
  deps = {},
} = {}) {
  if (issueNumber == null) throw new Error('runHealTimingInterval: issueNumber is required');
  if (!repo) throw new Error('runHealTimingInterval: repo is required');
  const findTimingComment = deps.findTimingComment || realFindTimingComment;
  const updateTimingComment = deps.updateTimingComment || realUpdateTimingComment;
  const comment = await findTimingComment(String(issueNumber), repo);
  if (!comment) throw new Error(`#${issueNumber} has no Timing Log comment`);

  const proposal = proposeTimingIntervalRepair(comment.body, { start, end });
  if (proposal.status === 'already-applied') return proposal;
  if (!apply) return { ...proposal, status: 'dry-run' };

  let updateError = null;
  try {
    await updateTimingComment(comment.id, repo, proposal.body);
  } catch (error) {
    updateError = error;
  }
  let readBack;
  try {
    readBack = await findTimingComment(String(issueNumber), repo);
  } catch (readBackError) {
    if (!updateError) {
      throw new Error(`heal-timing-interval: exact read-back request failed for #${issueNumber}`, {
        cause: readBackError,
      });
    }
    const error = new Error(
      `heal-timing-interval: ambiguous update could not be reconciled for #${issueNumber}`,
      { cause: updateError }
    );
    error.readBackCause = readBackError;
    throw error;
  }
  if (!exactTimingComment(readBack, proposal.body)) {
    const error = new Error(
      updateError
        ? `heal-timing-interval: ambiguous update did not produce exact read-back for #${issueNumber}`
        : `heal-timing-interval: exact read-back failed for #${issueNumber}`,
      updateError ? { cause: updateError } : undefined
    );
    throw error;
  }
  return {
    ...proposal,
    status: updateError ? 'healed-after-ambiguous-write' : 'healed',
  };
}

export function parseArgs(argv) {
  const args = {
    issue: null,
    start: undefined,
    end: undefined,
    apply: false,
    yes: false,
    help: false,
  };
  const seen = new Set();
  let modeFlag = null;
  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index];
    if (arg === '--apply' || arg === '--check-only') {
      if (modeFlag && modeFlag !== arg) {
        throw new TypeError('cannot combine --apply and --check-only');
      }
      if (modeFlag === arg) throw new TypeError(`duplicate ${arg}`);
      modeFlag = arg;
      args.apply = arg === '--apply';
    } else if (arg === '--yes') args.yes = true;
    else if (arg === '--help' || arg === '-h') args.help = true;
    else if (arg === '--start' || arg === '--end') {
      if (seen.has(arg)) throw new TypeError(`duplicate ${arg}`);
      seen.add(arg);
      const value = argv[++index];
      if (typeof value !== 'string' || value.trim() === '' || value.startsWith('--')) {
        throw new TypeError(`${arg} must be a non-empty timestamp`);
      }
      args[arg.slice(2)] = value;
    } else if (/^#?[1-9]\d*$/.test(arg)) {
      if (args.issue != null) throw new TypeError('exactly one issue number is allowed');
      args.issue = arg.replace(/^#/, '');
    }
  }
  if (!args.help) {
    if (!args.issue) throw new TypeError('issue number is required');
    if (args.start === undefined) throw new TypeError('--start is required');
    if (args.end === undefined) throw new TypeError('--end is required');
  }
  return args;
}

export function printUsage(out = process.stdout) {
  out.write(
    'Usage: node scripts/task-tracker/heal-timing-interval.mjs <issue#> --start TIMESTAMP --end TIMESTAMP [--apply | --check-only] [--yes]\n' +
      '  dry-run is the default; reports authoritative timing-v2 phase totals before and after\n' +
      '  --apply inserts one pause:retroactive/resumed pair after blast-radius confirmation\n'
  );
}

function renderSummary(issue, result, apply) {
  return (
    `#${issue} [${apply ? 'apply' : 'dry-run'}] ${result.status} ${result.phaseEvent}: ` +
    `${result.intervalSec}s; active ${result.before.totalActiveSec}s → ` +
    `${result.after.totalActiveSec}s; idle ${result.before.totalIdleSec}s → ` +
    `${result.after.totalIdleSec}s\n`
  );
}

export async function main(argv, deps = {}) {
  const out = deps.out || process.stdout;
  const err = deps.err || process.stderr;
  const exit = deps.exit || ((code) => process.exit(code));
  try {
    assertKnownArgv(argv, {
      flags: ['--apply', '--check-only', '--yes', '--help', '-h'],
      options: ['--start', '--end'],
      positionals: { max: 1 },
    });
  } catch (error) {
    if (!reportStrictArgvError(error, { err: (message) => err.write(message) })) throw error;
    printUsage(err);
    return exit(2);
  }

  let args;
  try {
    args = parseArgs(argv);
  } catch (error) {
    err.write(`heal-timing-interval: ${error.message}\n`);
    printUsage(err);
    return exit(2);
  }
  if (args.help) {
    printUsage(out);
    return exit(0);
  }

  const cfg = await (deps.loadConfig || loadConfig)();
  if (!cfg.repo) {
    err.write('heal-timing-interval: no repo configured\n');
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

  const projectDir = (deps.getProjectDir || getProjectDir)();
  const lock = deps.withLock || withLock;
  const run = deps.runHealTimingInterval || runHealTimingInterval;
  const result = await lock(
    timingLockPath(args.issue, projectDir),
    () =>
      run({
        issueNumber: args.issue,
        repo: cfg.repo,
        start: args.start,
        end: args.end,
        apply: args.apply,
      }),
    { timeoutMs: 10_000, retries: 2 }
  );
  out.write(renderSummary(args.issue, result, args.apply));
  if (result.status === 'dry-run') out.write('(dry-run — re-run with --apply to write)\n');
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main(process.argv.slice(2)).catch((error) => {
    process.stderr.write(`heal-timing-interval: ${error.stack || error.message}\n`);
    process.exit(1);
  });
}
