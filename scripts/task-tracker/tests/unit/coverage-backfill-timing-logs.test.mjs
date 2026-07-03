// @story #640
// Offline coverage-lift for the CLI layer of backfill-timing-logs.mjs. The pure
// engine (backfillTimingBody) is covered by backfill-timing-logs.test.mjs; this
// file drives parseArgs, printUsage, fetchOpenIssueNumbers, printDiff,
// processIssue, and main through injected deps — no gh, no network, no fs.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  parseArgs,
  printUsage,
  fetchOpenIssueNumbers,
  printDiff,
  processIssue,
  main,
} from '../../backfill-timing-logs.mjs';

// A timing comment with one legacy zero row bracketed by a prior row → the
// engine will backfill it (Active/Idle recovered from the ts gap).
const TIMING_BODY = [
  '## ⏱ Timing Log',
  '',
  '| Timestamp | State | Active | Idle | Words | Ctx | Note |',
  '|---|---|---|---|---|---|---|',
  '| 2026-01-01 10:00:00 +00:00 | develop | 5m | 0 | 10 | c | seed |',
  '| 2026-01-01 10:05:00 +00:00 | test | 0 | 0 | 20 | c | move |',
].join('\n');

// ── parseArgs ────────────────────────────────────────────────────────────────
test('parseArgs: --issue N / --apply / --cap-hours', () => {
  const a = parseArgs(['--issue', '#42', '--apply', '--cap-hours', '6']);
  assert.equal(a.issue, 42);
  assert.equal(a.apply, true);
  assert.equal(a.capSec, 6 * 3600);
});

test('parseArgs: --issue=N / --cap-hours=H equals forms', () => {
  const a = parseArgs(['--issue=7', '--cap-hours=2']);
  assert.equal(a.issue, 7);
  assert.equal(a.capSec, 2 * 3600);
});

test('parseArgs: --all-open and --help', () => {
  const a = parseArgs(['--all-open', '-h']);
  assert.equal(a.allOpen, true);
  assert.equal(a.help, true);
});

// ── printUsage ───────────────────────────────────────────────────────────────
test('printUsage: writes usage banner to injected sink', () => {
  let s = '';
  printUsage((x) => (s += x));
  assert.match(s, /Usage: backfill-timing-logs\.mjs/);
});

// ── fetchOpenIssueNumbers ────────────────────────────────────────────────────
test('fetchOpenIssueNumbers: maps gh json to numbers', async () => {
  const nums = await fetchOpenIssueNumbers('o/r', {
    pexec: async () => ({ stdout: JSON.stringify([{ number: 1 }, { number: 2 }]) }),
  });
  assert.deepEqual(nums, [1, 2]);
});

test('fetchOpenIssueNumbers: bad json → []', async () => {
  const nums = await fetchOpenIssueNumbers('o/r', {
    pexec: async () => ({ stdout: 'not json' }),
  });
  assert.deepEqual(nums, []);
});

// ── printDiff ─────────────────────────────────────────────────────────────────
test('printDiff: emits - / + only for differing lines', () => {
  let s = '';
  printDiff('a\nb\nc', 'a\nX\nc\nd', (x) => (s += x));
  assert.match(s, /- b/);
  assert.match(s, /\+ X/);
  assert.match(s, /\+ d/); // trailing added line
  assert.doesNotMatch(s, /[-+] a/); // unchanged line untouched
});

// ── processIssue ──────────────────────────────────────────────────────────────
test('processIssue: no timing comment → skipped line', async () => {
  let s = '';
  await processIssue(1, {
    repo: 'o/r',
    apply: false,
    capSec: 43200,
    stamp: 'T',
    deps: { findTimingComment: async () => null, out: (x) => (s += x) },
  });
  assert.match(s, /#1: no ⏱ Timing Log comment — skipped/);
});

test('processIssue: no change (already clean body) → no-change line', async () => {
  const clean = '## ⏱ Timing Log\n\nno rows here\n';
  let s = '';
  await processIssue(2, {
    repo: 'o/r',
    apply: false,
    capSec: 43200,
    stamp: 'T',
    deps: { findTimingComment: async () => ({ id: 'c', body: clean }), out: (x) => (s += x) },
  });
  assert.match(s, /#2: no change/);
});

test('processIssue: dry-run backfill → summary + diff, no write', async () => {
  let s = '';
  let updated = 0;
  await processIssue(3, {
    repo: 'o/r',
    apply: false,
    capSec: 43200,
    stamp: 'T',
    deps: {
      findTimingComment: async () => ({ id: 'c', body: TIMING_BODY }),
      updateTimingComment: async () => {
        updated += 1;
      },
      out: (x) => (s += x),
    },
  });
  assert.match(s, /#3: 1 backfilled/);
  assert.match(s, /row-sec/); // diff shows the rewritten row
  assert.equal(updated, 0); // dry-run never writes
});

test('processIssue: --apply → backup written + comment updated', async () => {
  let s = '';
  const backups = [];
  let updateArgs;
  await processIssue(4, {
    repo: 'o/r',
    apply: true,
    capSec: 43200,
    stamp: 'STAMP',
    deps: {
      findTimingComment: async () => ({ id: 'cid', body: TIMING_BODY }),
      updateTimingComment: async (id, repo, body) => {
        updateArgs = { id, repo, body };
      },
      out: (x) => (s += x),
      mkdir: () => {},
      writeFile: (p, b) => backups.push({ p, b }),
      getProjectDir: () => '/proj',
    },
  });
  assert.equal(backups.length, 1);
  assert.match(backups[0].p, /timing-4-STAMP\.bak$/);
  assert.equal(updateArgs.id, 'cid');
  assert.match(updateArgs.body, /row-sec/);
  assert.match(s, /#4: applied — backup/);
});

// ── main ──────────────────────────────────────────────────────────────────────
test('main: --help prints usage and exits 0', async () => {
  let s = '';
  let code;
  await main(['--help'], {
    out: (x) => (s += x),
    exit: (c) => {
      code = c;
    },
    loadConfig: () => ({ repo: 'o/r' }),
  });
  assert.match(s, /Usage:/);
  assert.equal(code, 0);
});

test('main: no issue selector → usage + exit 2', async () => {
  let code;
  await main([], {
    out: () => {},
    exit: (c) => {
      code = c;
    },
    loadConfig: () => ({ repo: 'o/r' }),
  });
  assert.equal(code, 2);
});

test('main: missing repo → err + exit 2', async () => {
  let e = '';
  let code;
  await main(['--issue', '1'], {
    loadConfig: () => ({}),
    err: (x) => (e += x),
    exit: (c) => {
      code = c;
    },
  });
  assert.match(e, /no repo configured/);
  assert.equal(code, 2);
});

test('main: --all-open loops issues + captures per-issue errors + dry-run footer', async () => {
  let out = '';
  let err = '';
  const processed = [];
  await main(['--all-open'], {
    loadConfig: () => ({ repo: 'o/r' }),
    fetchOpenIssueNumbers: async () => [10, 11],
    processIssue: async (n) => {
      processed.push(n);
      if (n === 11) throw new Error('boom');
    },
    out: (x) => (out += x),
    err: (x) => (err += x),
    exit: () => {},
  });
  assert.deepEqual(processed, [10, 11]);
  assert.match(err, /#11: ERROR boom/);
  assert.match(out, /dry-run — re-run with --apply/);
});

console.log('coverage-backfill-timing-logs.test.mjs: ok');
