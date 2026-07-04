// @story #650
// Offline coverage-lift for scripts/gh/verify-open-issue-bodies.mjs. Drives the
// pure reporting core (hasStrictDiscussMarker/buildSweepReport/formatSweepReport),
// the paged listOpenIssues fetch, and the exported main(argv, deps) through an
// injected execFile + loadConfig — no gh, no network. Covers the {discuss} skip
// path, the verifier-fail path, both format branches, multi-page paging, the
// no-repo guard, and the JSON/text output + exit-code (0 vs 5) branches.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  hasStrictDiscussMarker,
  buildSweepReport,
  formatSweepReport,
  listOpenIssues,
  main,
} from '../../../gh/verify-open-issue-bodies.mjs';

const argv = (...rest) => ['node', 'verify-open-issue-bodies.mjs', ...rest];

// A bare `{discuss}` stub — skipped by the sweep, never scored.
const DISCUSS = { number: 1, title: 'stub', body: '{discuss}' };
// A hand-rolled body missing every canonical section — fails the verifier.
const BROKEN = { number: 2, title: 'broken', body: 'just some prose\n' };

// Fake execFile (node callback signature) returning `pages` of issues, one page
// per invocation, then an empty array. Records each call.
function fakeExecFile(pages) {
  const calls = [];
  let i = 0;
  const fn = (file, args, options, cb) => {
    calls.push({ file, args, options });
    const batch = i < pages.length ? pages[i] : [];
    i++;
    cb(null, { stdout: JSON.stringify(batch), stderr: '' });
  };
  fn.calls = calls;
  return fn;
}

function harness({ cfg = { repo: 'o/r' }, execFile } = {}) {
  const logs = [];
  const errs = [];
  const exits = [];
  const overrides = {
    execFile: execFile || fakeExecFile([[]]),
    loadConfig: () => cfg,
    log: (s) => logs.push(s),
    err: (s) => errs.push(s),
    exit: (c) => exits.push(c),
  };
  return { overrides, logs, errs, exits };
}

test('hasStrictDiscussMarker: bare line true; prose/backtick/null false', () => {
  assert.equal(hasStrictDiscussMarker('  {discuss}  '), true);
  assert.equal(hasStrictDiscussMarker('see the `{discuss}` marker'), false);
  assert.equal(hasStrictDiscussMarker('{discuss} then more'), false);
  assert.equal(hasStrictDiscussMarker(null), false);
});

test('buildSweepReport: {discuss} skipped, broken body fails', () => {
  const { reports, failCount } = buildSweepReport([DISCUSS, BROKEN]);
  assert.equal(failCount, 1);
  const disc = reports.find((r) => r.number === 1);
  assert.equal(disc.skipped, true);
  assert.equal(disc.ok, true);
  const brk = reports.find((r) => r.number === 2);
  assert.equal(brk.ok, false);
  assert.ok(brk.missing.length > 0);
});

test('buildSweepReport: missing title defaults to empty string', () => {
  const { reports } = buildSweepReport([{ number: 9, body: '{discuss}' }]);
  assert.equal(reports[0].title, '');
});

test('formatSweepReport: fail branch lists issue + missing + skip note', () => {
  const out = formatSweepReport(buildSweepReport([DISCUSS, BROKEN]));
  assert.match(out, /#2 — broken/);
  assert.match(out, /✗/);
  assert.match(out, /⏭ skipped/);
  assert.match(out, /failed the verifier \(1 skipped: \{discuss\} stubs\)/);
});

test('formatSweepReport: all-canonical branch (all skipped → 0 scored)', () => {
  const out = formatSweepReport(buildSweepReport([DISCUSS]));
  assert.match(out, /All 0 open issue bodies are canonical \(1 skipped: \{discuss\} stubs\)/);
});

test('listOpenIssues: pages until a short/empty batch ends the loop', async () => {
  // page 1 full (100), page 2 short (1) → stops after page 2. execFile called 2x.
  const fullPage = Array.from({ length: 100 }, (_, k) => ({ number: k, title: 't', body: 'b' }));
  const fx = fakeExecFile([fullPage, [{ number: 999, title: 't', body: 'b' }]]);
  const issues = await listOpenIssues('o/r', { execFile: fx });
  assert.equal(issues.length, 101);
  assert.equal(fx.calls.length, 2);
  assert.match(fx.calls[0].args.join(' '), /page=1/);
  assert.match(fx.calls[1].args.join(' '), /page=2/);
});

test('listOpenIssues: empty first batch ends immediately', async () => {
  const fx = fakeExecFile([[]]);
  const issues = await listOpenIssues('o/r', { execFile: fx });
  assert.equal(issues.length, 0);
  assert.equal(fx.calls.length, 1);
});

test('main: no repo configured → err + exit 1', async () => {
  const h = harness({ cfg: {} });
  await main(argv(), h.overrides);
  assert.deepEqual(h.exits, [1]);
  assert.match(h.errs.join(''), /No repo configured/);
});

test('main: text output, all canonical → exit 0', async () => {
  const h = harness({ execFile: fakeExecFile([[DISCUSS]]) });
  await main(argv(), h.overrides);
  assert.deepEqual(h.exits, [0]);
  assert.match(h.logs.join(''), /All 1 open issue bodies|All 0 open issue bodies/);
});

test('main: --json output, a failing body → exit 5', async () => {
  const h = harness({ execFile: fakeExecFile([[BROKEN]]) });
  await main(argv('--json'), h.overrides);
  assert.deepEqual(h.exits, [5]);
  const printed = JSON.parse(h.logs.join(''));
  assert.equal(printed.failCount, 1);
  assert.equal(printed.reports[0].number, 2);
});
