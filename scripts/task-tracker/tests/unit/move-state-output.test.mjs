// @story #757
// The promote/demote output contract (Design §9 + §12). `moveState` returns an
// enriched result; `readout.mjs` turns it into either a per-element success
// readout that asserts each element is verified-as-stored, or a failure error
// specific enough to route the operator's next action (file a bug / re-run /
// demote to fix code). Both formatters are PURE — driven here over synthetic
// result objects with no `gh` spawn and no network.
import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { formatMoveReadout, formatMoveError } from '../../lib/move-state/readout.mjs';

const complete = (over = {}) => ({
  exit: null,
  phase: 'complete',
  sentinelPresent: true,
  boardMoved: true,
  tail: { failures: [], total: 8 },
  ...over,
});

// --- AC1: success prints a per-element verified-as-stored readout ------------
test('success readout asserts each element verified-as-stored + sentinel + tail summary (#757 AC1)', () => {
  const out = formatMoveReadout({ result: complete(), issue: '42', from: 'develop', to: 'test' });
  assert.match(out, /move #42 develop→test complete/, 'header names the move');
  // Each element line is present AND asserted verified-as-stored.
  assert.match(out, /exit flush\s*:.*develop row closed.*\(verified\)/, 'exit-flush verified');
  assert.match(
    out,
    /entry stamp\s*:.*aitm-entered-test present.*\(verified\)/,
    'entry-stamp verified'
  );
  assert.match(out, /entry row\s*:.*test row opened.*\(verified\)/, 'entry-row verified');
  assert.match(out, /status\s*:.*Status == Test.*\(verified\)/, 'status verified-as-stored');
  assert.match(
    out,
    /sentinel\s*:.*aitm-move-complete state=test.*written last/,
    'sentinel written last'
  );
  assert.match(out, /tail\s*:.*8\/8 best-effort steps ok/, 'clean tail summary N/M');
});

test('success readout names deferred tail steps when some best-effort steps failed (#757 AC1)', () => {
  const out = formatMoveReadout({
    result: complete({
      tail: { failures: [{ name: 'unparkDoneDependents', error: new Error('x') }], total: 8 },
    }),
    issue: '42',
    from: 'develop',
    to: 'test',
  });
  assert.match(out, /tail\s*:.*7\/8/, 'ok count excludes the failed step');
  assert.match(out, /deferred/, 'flags deferred steps');
  assert.match(out, /unparkDoneDependents/, 'names the deferred step');
});

test('idempotent replay renders an "already complete" header (#757 AC1)', () => {
  const out = formatMoveReadout({
    result: complete({ alreadyComplete: true }),
    issue: '42',
    from: 'develop',
    to: 'test',
  });
  assert.match(out, /already complete/, 'replay is labelled as idempotent no-op');
  assert.match(out, /Status == Test.*\(verified\)/, 'still asserts elements verified-as-stored');
});

// --- AC2: failure names the element, before/after Status, sentinel presence ---
test('status-phase failure: names element, BEFORE Status write, sentinel ABSENT (#757 AC2)', () => {
  const out = formatMoveError({
    result: {
      exit: 9,
      phase: 'status',
      sentinelPresent: false,
      boardMoved: false,
      tail: { failures: [], total: 8 },
    },
    issue: '42',
    from: 'develop',
    to: 'test',
  });
  assert.match(out, /move #42 develop→test FAILED/, 'header marks failure');
  assert.match(out, /failed element\s*:.*status write/i, 'names the failed element');
  assert.match(out, /before .*Status write/i, 'positions the failure before the Status write');
  assert.match(out, /sentinel\s*:.*absent/i, 'reports sentinel absent');
  assert.match(out, /incomplete/i, 'absent sentinel ⇒ incomplete, safe to re-run');
});

test('sentinel-phase failure: AFTER Status write, board moved, sentinel ABSENT ⇒ converge (#757 AC2)', () => {
  const out = formatMoveError({
    result: {
      exit: 7,
      phase: 'sentinel',
      sentinelPresent: false,
      boardMoved: true,
      tail: { failures: [], total: 8 },
    },
    issue: '42',
    from: 'develop',
    to: 'test',
  });
  assert.match(out, /failed element\s*:.*sentinel/i, 'names the sentinel element');
  assert.match(out, /after .*Status write/i, 'positions the failure after the Status write');
  assert.match(out, /sentinel\s*:.*absent/i, 'sentinel absent');
  assert.match(out, /converge/i, 'board moved but unstamped ⇒ re-run to converge');
});

// --- AC3: the failure carries a one-line next-action recommendation ----------
test('status-phase failure recommends re-run (#757 AC3)', () => {
  const out = formatMoveError({
    result: {
      exit: 9,
      phase: 'status',
      sentinelPresent: false,
      boardMoved: false,
      tail: { failures: [] },
    },
    issue: '42',
    from: 'develop',
    to: 'test',
  });
  assert.match(out, /recommendation\s*:.*re-run/i, 'roll-forward failure ⇒ re-run');
});

test('sentinel-phase failure recommends re-run to converge (#757 AC3)', () => {
  const out = formatMoveError({
    result: {
      exit: 7,
      phase: 'sentinel',
      sentinelPresent: false,
      boardMoved: true,
      tail: { failures: [] },
    },
    issue: '42',
    from: 'develop',
    to: 'test',
  });
  assert.match(out, /recommendation\s*:.*re-run/i, 'unstamped move ⇒ re-run');
});

test('guard-phase failure recommends demote to fix code (#757 AC3)', () => {
  const out = formatMoveError({
    result: {
      exit: 5,
      phase: 'guard',
      sentinelPresent: false,
      boardMoved: false,
      tail: { failures: [] },
    },
    issue: '42',
    from: 'develop',
    to: 'test',
  });
  assert.match(
    out,
    /recommendation\s*:.*demote to fix code/i,
    'blocked transition ⇒ demote to fix code'
  );
});

test('unclassifiable exit recommends filing a bug (#757 AC3)', () => {
  const out = formatMoveError({
    result: {
      exit: 99,
      phase: 'mystery',
      sentinelPresent: false,
      boardMoved: false,
      tail: { failures: [] },
    },
    issue: '42',
    from: 'develop',
    to: 'test',
  });
  assert.match(out, /recommendation\s*:.*file a bug/i, 'unknown class ⇒ file a bug');
});

test('sentinel present on a reported failure ⇒ treat as complete/reconcile (#757 AC2)', () => {
  const out = formatMoveError({
    result: {
      exit: 7,
      phase: 'sentinel',
      sentinelPresent: true,
      boardMoved: true,
      tail: { failures: [] },
    },
    issue: '42',
    from: 'develop',
    to: 'test',
  });
  assert.match(out, /sentinel\s*:.*present/i, 'sentinel present is surfaced');
  assert.match(
    out,
    /complete|reconcile/i,
    'present sentinel ⇒ move is actually complete / reconcile'
  );
});
