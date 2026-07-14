// @story #822
// #822 vc:5 — Fault Z: a live departure must not stack on an unclosed
// finalize/orphan `idle` tail. The orphan/pause-finalize path ends its window
// with a trailing `idle` (a departure that opens an idle span it cannot close).
// When the live session then accrues real active work and emits its own
// departure (`pause:*` / `switch-out:#N`), the shared choke point
// `ctx.flushActiveToGH` used to append the departure directly → `idle → pause:*`
// (departure-on-departure), which the V3 timing-log-sequence validator (rightly)
// reports as a doubled step. The fix interposes a canonical `resumed`
// reengagement row before the departure so the walk becomes
// `idle → resumed → pause:*` — legal, one interruption.
//
// This test drives the REAL `flushActiveToGH` (built by `buildContext`) with
// `ctx.safeReadLastRow` / `ctx.safePostTiming` overridden, so it exercises the
// actual emitter guard rather than a re-implementation.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { buildContext } from '../../runtime.mjs';
import { lastRowFromBody } from '../../lib/timing-rows.mjs';
import { validate } from '../../lib/agent-review/validators/timing-log-sequence.mjs';

// cells[2] is the Event cell of a freshly-built row string.
function eventOf(row) {
  const cells = String(row)
    .split('|')
    .map((s) => s.trim());
  return (cells[2] ?? '').toLowerCase();
}

// Build a real ctx offline; then override the two seams the guard reads.
function offlineCtx() {
  const prev = {
    net: process.env.TT_SKIP_NETWORK,
    self: process.env.TT_SKIP_FIELD_SELF_CHECK,
  };
  process.env.TT_SKIP_NETWORK = '1';
  process.env.TT_SKIP_FIELD_SELF_CHECK = '1';
  const ctx = buildContext(['status']);
  const restore = () => {
    if (prev.net === undefined) delete process.env.TT_SKIP_NETWORK;
    else process.env.TT_SKIP_NETWORK = prev.net;
    if (prev.self === undefined) delete process.env.TT_SKIP_FIELD_SELF_CHECK;
    else process.env.TT_SKIP_FIELD_SELF_CHECK = prev.self;
  };
  return { ctx, restore };
}

// Drive one flush with a given tail row and departure event, capturing every
// posted row in order. `activeMinutes` sets the width of the active window.
async function driveFlush({ tailEvent, departureEvent, activeMinutes }) {
  const { ctx, restore } = offlineCtx();
  const posted = [];
  ctx.safePostTiming = async (_issue, row) => {
    posted.push(row);
    return { ok: true };
  };
  const entryMs = Date.now() - activeMinutes * 60_000;
  const entryIso = new Date(entryMs).toISOString();
  ctx.safeReadLastRow =
    tailEvent == null ? async () => null : async () => ({ ts: entryIso, event: tailEvent });
  const state = { active: '#812', entryStartTs: entryIso, lastWordMarker: 0 };
  try {
    await ctx.flushActiveToGH(state, departureEvent, 'flush');
  } finally {
    restore();
  }
  return posted.map(eventOf);
}

// --- lastRowFromBody unit: reads the tail {ts, event} from a real body -------

test('lastRowFromBody returns the tail row ts + lowercased event slug', () => {
  const body = [
    '## ⏱ Timing Log',
    '',
    '| Timestamp | Event | Active | Idle | Δ Words | Word Marker | Description |',
    '|---|---|---|---|---|---|---|',
    '| 2026-07-14 03:02:00 -05:00 | active-work | 0h 01m 45s |  |  | 0 | credit |',
    '| 2026-07-14 03:16:01 -05:00 | idle |  | 0h 04m 07s |  | 0 | orphaned |',
    '',
  ].join('\n');
  assert.deepEqual(lastRowFromBody(body), {
    ts: '2026-07-14 03:16:01 -05:00',
    event: 'idle',
  });
  assert.equal(lastRowFromBody(''), null);
  assert.equal(lastRowFromBody(null), null);
});

// --- The fix: a live pause after a finalize idle interposes `resumed` --------

test('a live departure after an unclosed finalize idle interposes a resumed row', async () => {
  const events = await driveFlush({
    tailEvent: 'idle',
    departureEvent: 'pause:question',
    activeMinutes: 8,
  });
  assert.deepEqual(
    events,
    ['resumed', 'pause:question'],
    'guard posts the canonical resumed closer, then the departure'
  );
});

test('switch-out after a finalize idle is also bracketed by resumed', async () => {
  const events = await driveFlush({
    tailEvent: 'idle',
    departureEvent: 'switch-out:#821',
    activeMinutes: 3,
  });
  assert.deepEqual(events, ['resumed', 'switch-out:#821']);
});

// --- Controls: the guard is narrowly scoped ----------------------------------

test('no resumed is interposed when there was no live active work (activeSec == 0)', async () => {
  // A zero-width window (entryStartTs == now) → activeSec rounds to 0. A genuine
  // re-departure with no intervening work is a REAL doubled step and must be left
  // for V3 to surface, not papered over with a fabricated reengagement.
  const events = await driveFlush({
    tailEvent: 'idle',
    departureEvent: 'pause:question',
    activeMinutes: 0,
  });
  assert.deepEqual(events, ['pause:question'], 'only the departure row, no interposed resumed');
});

test('no resumed is interposed when the tail is a reengagement, not a departure', async () => {
  const events = await driveFlush({
    tailEvent: 'resumed',
    departureEvent: 'pause:question',
    activeMinutes: 8,
  });
  assert.deepEqual(events, ['pause:question'], 'normal reengagement→departure flow is untouched');
});

test('no resumed is interposed when the flush event is itself not a departure', async () => {
  // A phase event opens an active span and itself closes the idle — no need to
  // interpose a reengagement.
  const events = await driveFlush({
    tailEvent: 'idle',
    departureEvent: 'develop:completed',
    activeMinutes: 8,
  });
  assert.deepEqual(events, ['develop:completed'], 'phase row closes the idle on its own');
});

test('no resumed is interposed when there is no readable tail row', async () => {
  const events = await driveFlush({
    tailEvent: null,
    departureEvent: 'pause:question',
    activeMinutes: 8,
  });
  assert.deepEqual(events, ['pause:question']);
});

// --- End-to-end: the post-fix sequence walks V3 cleanly ----------------------

const HEADER = '| Timestamp | Event | Active | Idle | Δ Words | Word Marker | Description |';
const SEP = '|---|---|---|---|---|---|---|';
const T = (n) => `2026-07-14 03:${String(n).padStart(2, '0')}:00 -05:00`;

function logCtx(rows) {
  const body = [
    '## ⏱ Timing Log',
    '',
    HEADER,
    SEP,
    ...rows.map(([ts, ev]) => `| ${ts} | ${ev} |  |  |  | 0 |  |`),
    '',
  ].join('\n');
  return { comments: [{ body }], markers: { enteredStages: [{ stage: 'develop' }] } };
}

test('pre-fix: finalize idle → pause is a doubled step (V3 baseline)', () => {
  const res = validate(
    logCtx([
      [T(0), 'start'],
      [T(1), 'develop:started'],
      [T(2), 'active-work'],
      [T(3), 'idle'],
      [T(4), 'pause:question'], // stacks on the open idle → doubled step
      [T(5), 'resumed'],
    ])
  );
  assert.ok(
    res.failures.some((f) => /doubled step/.test(f)),
    `expected a doubled-step baseline; got ${JSON.stringify(res.failures)}`
  );
});

test('post-fix: interposed resumed makes finalize idle → resumed → pause legal', () => {
  const res = validate(
    logCtx([
      [T(0), 'start'],
      [T(1), 'develop:started'],
      [T(2), 'active-work'],
      [T(3), 'idle'],
      [T(4), 'resumed'], // <- the row the guard interposes
      [T(5), 'pause:question'],
      [T(6), 'resumed'],
      [T(7), 'develop:completed'],
    ])
  );
  assert.equal(res.pass, true, JSON.stringify(res.failures));
  assert.ok(
    !res.failures.some((f) => /doubled step/.test(f)),
    `no doubled step expected; got ${JSON.stringify(res.failures)}`
  );
});
