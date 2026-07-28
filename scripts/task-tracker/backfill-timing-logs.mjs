#!/usr/bin/env node
// Backfill historical 0m timing-log rows (#242 — child f of #238).
//
// Pre-#159 state-move verbs appended timing rows with hardcoded
// `activeMin: 0, idleMin: 0`. Those zeros are not real: a legacy row's
// true active span is recoverable from the gap between its own timestamp
// and the previous row's timestamp, minus any recorded pause windows in
// that gap. This tool walks the ⏱ Timing Log comment, rewrites each such
// row's Active/Idle cells to the `Xh Ym Zs` form, and appends a row-second
// marker — exactly the byte-shape `buildRow` emits for seconds-precision
// rows (#239). Rows with no usable bracketing timestamp, or whose recovered
// active span exceeds a cross-session sanity cap, are tagged
// `<!-- aitm-backfill-unrecoverable -->` and left otherwise untouched.
//
// The repair engine (`backfillTimingBody`) is a pure body-in / body-out
// function so the test suite exercises it offline. The CLI is a thin shell
// that locates the comment, runs the engine, and (with `--apply`) writes a
// `.tmp/heal/` backup before committing the edited comment via the
// `updateIssueComment` GraphQL mutation.

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import {
  computeStateMoveDelta,
  pauseSpansBetween,
  formatDurationSeconds,
  parseRowSecMarker,
  _tsToMs as tsToMs,
} from './lib/timing-rows.mjs';
import { findTimingComment, updateTimingComment } from './gh-timing-comment.mjs';
import { loadConfig } from './config.mjs';
import { getProjectDir } from './paths.mjs';
import { assertKnownArgv, reportStrictArgvError } from './lib/argv-strict.mjs';
import { confirmBlastRadius } from './lib/blast-radius-guard.mjs';
import { wantsHelp, emitSelfDoc } from '../lib/self-doc.mjs';

if (import.meta.url === `file://${process.argv[1]}` && wantsHelp(process.argv.slice(2))) {
  emitSelfDoc('backfill-timing-logs');
  process.exit(0);
}

const pexec = promisify(execFile);

// A single legacy state move that "actually took" longer than this is far
// more likely a cross-session gap (the previous row belongs to an earlier
// working session hours/days ago) than one continuous move. Rows whose
// recovered active span exceeds the cap are tagged unrecoverable rather than
// credited with implausible time. Overridable via `--cap-hours`.
export const DEFAULT_SANITY_CAP_SEC = 12 * 3600;
export const UNRECOVERABLE_MARKER = '<!-- aitm-backfill-unrecoverable -->';

// Table-format timestamp (legacy HH:MM or seconds-precision HH:MM:SS).
const TS_CELL_RE = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}(?::\d{2})? [+-]\d{2}:\d{2}$/;

function isDataRow(line) {
  return line.startsWith('| ') && !line.startsWith('| Timestamp') && !line.startsWith('|---');
}

// Split a row into its 7 trimmed visible cells plus any trailing text that
// follows the final pipe (where hidden markers live). Returns null when the
// line does not have the 7-column shape.
function parseRow(line) {
  const parts = line.split('|');
  if (parts.length < 9) return null; // leading '' + 7 cols + trailing
  const cells = parts.slice(1, 8).map((c) => c.trim());
  const trailing = parts.slice(8).join('|').trim();
  return { cells, trailing };
}

// Legacy minute-zero cell forms. A row qualifies for backfill only when
// BOTH Active and Idle read one of these AND it carries no row-second marker.
function isZeroCell(v) {
  return v === '0' || v === '0m' || v === '0 min';
}

// Pure repair engine. Body in → `{ newBody, stats }` out. `stats` reports
// `{ candidates, backfilled, unrecoverable, skipped }`. Idempotent: a row
// already carrying a row-second marker or the unrecoverable marker is left
// untouched, so re-running on an already-backfilled body returns the input
// byte-for-byte.
export function backfillTimingBody(body, { sanityCapSec = DEFAULT_SANITY_CAP_SEC } = {}) {
  const src = String(body || '');
  const lines = src.split('\n');
  const stats = { candidates: 0, backfilled: 0, unrecoverable: 0, skipped: 0 };
  let prevTs = null;

  const out = lines.map((line) => {
    if (!isDataRow(line)) return line;
    const parsed = parseRow(line);
    if (!parsed) return line;
    const ts = parsed.cells[0];
    if (!TS_CELL_RE.test(ts)) return line; // not a real timing row

    const curPrev = prevTs;
    prevTs = ts; // every real row brackets the next one

    if (line.includes('aitm-backfill-unrecoverable')) {
      stats.skipped++;
      return line;
    }
    if (parseRowSecMarker(line)) {
      stats.skipped++;
      return line; // post-#159 / already backfilled
    }
    if (!(isZeroCell(parsed.cells[2]) && isZeroCell(parsed.cells[3]))) {
      stats.skipped++;
      return line; // legacy non-zero row — real minute value, leave it
    }

    // Zero candidate.
    stats.candidates++;
    if (!curPrev) {
      stats.unrecoverable++;
      return `${line} ${UNRECOVERABLE_MARKER}`;
    }
    const prevMs = tsToMs(curPrev);
    const nowMs = tsToMs(ts);
    const pauseSpans = pauseSpansBetween(src, prevMs, nowMs);
    const { activeSec, idleSec } = computeStateMoveDelta({
      prevRowTs: curPrev,
      nowTs: ts,
      pauseSpans,
    });
    if (activeSec > sanityCapSec) {
      stats.unrecoverable++;
      return `${line} ${UNRECOVERABLE_MARKER}`;
    }

    const newCells = [...parsed.cells];
    newCells[2] = formatDurationSeconds(activeSec);
    newCells[3] = formatDurationSeconds(idleSec);
    const table = `| ${newCells.join(' | ')} |`;
    const marker = `<!-- row-sec: a=${activeSec} i=${idleSec} -->`;
    const trailing = parsed.trailing ? ` ${parsed.trailing}` : '';
    stats.backfilled++;
    return `${table} ${marker}${trailing}`;
  });

  return { newBody: out.join('\n'), stats };
}

// ---- CLI ----

export function printUsage(out = (s) => process.stdout.write(s)) {
  out(
    'Usage: backfill-timing-logs.mjs (--issue N | --all-open) [--apply] [--cap-hours H] [--yes]\n' +
      '  Dry-run by default; --apply mutates the timing comment (backup written to .tmp/heal/).\n' +
      '  --yes  skip the blast-radius confirmation prompt on a multi-issue --apply\n'
  );
}

export function parseArgs(argv) {
  const args = {
    issue: null,
    allOpen: false,
    apply: false,
    yes: false,
    capSec: DEFAULT_SANITY_CAP_SEC,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--issue') args.issue = Number(String(argv[++i]).replace(/^#/, ''));
    else if (a.startsWith('--issue=')) args.issue = Number(a.slice(8).replace(/^#/, ''));
    else if (a === '--all-open') args.allOpen = true;
    else if (a === '--apply') args.apply = true;
    else if (a === '--yes') args.yes = true;
    else if (a === '--cap-hours') args.capSec = Math.round(Number(argv[++i]) * 3600);
    else if (a.startsWith('--cap-hours=')) args.capSec = Math.round(Number(a.slice(12)) * 3600);
    else if (a === '--help' || a === '-h') {
      args.help = true;
    }
  }
  return args;
}

export async function fetchOpenIssueNumbers(repo, deps = {}) {
  const run = deps.pexec || pexec;
  const { stdout } = await run(
    'gh',
    ['issue', 'list', '-R', repo, '--state', 'open', '--limit', '500', '--json', 'number'],
    { timeout: 30_000, maxBuffer: 10 * 1024 * 1024 }
  );
  try {
    return JSON.parse(stdout).map((o) => o.number);
  } catch {
    return [];
  }
}

export function printDiff(before, after, out = (s) => process.stdout.write(s)) {
  const b = before.split('\n');
  const a = after.split('\n');
  for (let i = 0; i < Math.max(b.length, a.length); i++) {
    if (b[i] !== a[i]) {
      if (b[i] != null) out(`  - ${b[i]}\n`);
      if (a[i] != null) out(`  + ${a[i]}\n`);
    }
  }
}

export async function processIssue(num, { repo, apply, capSec, stamp, deps = {} }) {
  const find = deps.findTimingComment || findTimingComment;
  const update = deps.updateTimingComment || updateTimingComment;
  const out = deps.out || ((s) => process.stdout.write(s));
  const mkdir = deps.mkdir || mkdirSync;
  const write = deps.writeFile || writeFileSync;
  const projectDir = deps.getProjectDir || getProjectDir;
  const comment = await find(String(num), repo, { timeoutMs: 15_000 });
  if (!comment) {
    out(`#${num}: no ⏱ Timing Log comment — skipped\n`);
    return;
  }
  const { newBody, stats } = backfillTimingBody(comment.body, { sanityCapSec: capSec });
  if (newBody === comment.body) {
    out(`#${num}: no change (${stats.candidates} candidate(s), ${stats.skipped} skipped)\n`);
    return;
  }
  out(
    `#${num}: ${stats.backfilled} backfilled, ${stats.unrecoverable} unrecoverable ` +
      `(of ${stats.candidates} candidate(s))\n`
  );
  if (!apply) {
    printDiff(comment.body, newBody, out);
    return;
  }
  const healDir = path.join(projectDir(), '.tmp', 'heal');
  mkdir(healDir, { recursive: true });
  const backupPath = path.join(healDir, `timing-${num}-${stamp}.bak`);
  write(backupPath, comment.body);
  await update(comment.id, repo, newBody, { timeoutMs: 15_000 });
  out(`#${num}: applied — backup ${backupPath}\n`);
}

export async function main(argv, deps = {}) {
  const load = deps.loadConfig || loadConfig;
  const fetchOpen = deps.fetchOpenIssueNumbers || fetchOpenIssueNumbers;
  const process1 = deps.processIssue || processIssue;
  const out = deps.out || ((s) => process.stdout.write(s));
  const err = deps.err || ((s) => process.stderr.write(s));
  const exit = deps.exit || ((c) => process.exit(c));
  const stampNow = deps.stamp || new Date().toISOString().replace(/[:.]/g, '-');

  // #878 — refuse unknown flags before anything else.
  try {
    assertKnownArgv(argv, {
      flags: ['--all-open', '--apply', '--yes'],
      options: ['--issue', '--cap-hours'],
    });
  } catch (e) {
    if (!reportStrictArgvError(e, { err })) throw e;
    printUsage(err);
    return exit(2);
  }

  const args = parseArgs(argv);
  if (args.help) {
    printUsage(out);
    return exit(0);
  }
  if (!args.allOpen && !Number.isFinite(args.issue)) {
    printUsage(out);
    return exit(2);
  }
  const cfg = load();
  const repo = cfg.repo;
  if (!repo) {
    err('backfill-timing-logs: no repo configured\n');
    return exit(2);
  }
  const issues = args.allOpen ? await fetchOpen(repo, deps) : [args.issue];

  if (args.apply) {
    const confirm = deps.confirmBlastRadius || confirmBlastRadius;
    const decision = await confirm({ issueNumbers: issues, yes: args.yes, log: out, warn: err });
    if (!decision.proceed) return exit(2);
  }

  for (const n of issues) {
    try {
      await process1(n, { repo, apply: args.apply, capSec: args.capSec, stamp: stampNow, deps });
    } catch (e) {
      err(`#${n}: ERROR ${e.message}\n`);
    }
  }
  if (!args.apply) {
    out('\n(dry-run — re-run with --apply to write)\n');
  }
}

const isMain = import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  main(process.argv.slice(2)).catch((err) => {
    process.stderr.write(`backfill-timing-logs: ${err.stack || err.message}\n`);
    process.exit(1);
  });
}
