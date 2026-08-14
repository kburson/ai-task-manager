// @story #825
// EPIC #823 timing model v2 (C2) — phase-close writer.
//
// `computePhaseCloseDelta(body, phase, nowTs)` computes a `<phase>:completed`
// row's `activeSec`/`idleSec` from the WHOLE phase span (its last matching
// `<phase>:started` row → nowTs) minus every pause/switch-out→resume bracket
// inside that span, and returns the enter row's Word Marker for Δwords. The
// writer branch of `emitPhasePairRows` wires it in. These tests pin all five
// #825 ACs, including "no idle/active-work row is ever written."

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computePhaseCloseDelta } from '../../../../task-tracker/lib/timing-rows.mjs';
import { emitPhasePairRows } from '../../../../task-tracker/lib/move-state/audit-timing.mjs';
import * as timingRows from '../../../../task-tracker/lib/timing-rows.mjs';
import * as phaseEvents from '../../../../task-tracker/phase-events.mjs';

const HEADER = '| Timestamp | Event | Active | Idle | Δ Words | Word Marker | Description |';
const SEP = '|---|---|---|---|---|---|---|';
const TZ = '-05:00';
const ts = (hms) => `2026-07-14 ${hms} ${TZ}`;

function row(hms, event, { marker = 0, desc = '' } = {}) {
  return `| ${ts(hms)} | ${event} |  |  |  | ${marker} | ${desc} |`;
}
function bodyWith(rows) {
  return ['## ⏱ Timing Log', '', HEADER, SEP, ...rows, ''].join('\n') + '\n';
}

// ---- AC1: activeSec == span − Σ brackets; no-bracket phase → activeSec == span

test('AC1 — a bracket-free phase reports activeSec == span, idleSec == 0', () => {
  const body = bodyWith([row('13:00:00', 'develop:started', { marker: 100 })]);
  const d = computePhaseCloseDelta(body, 'develop', ts('13:10:00'));
  assert.equal(d.matched, true);
  assert.equal(d.activeSec, 600); // 10 min span, no brackets
  assert.equal(d.idleSec, 0);
  assert.equal(d.startWordMarker, 100);
});

test('AC1 — a pause→resume bracket inside the span is subtracted from activeSec', () => {
  const body = bodyWith([
    row('13:00:00', 'develop:started', { marker: 100 }),
    row('13:02:00', 'pause', { marker: 100, desc: 'blocked on human' }),
    row('13:05:00', 'resumed', { marker: 100, desc: 'question answered' }),
  ]);
  const d = computePhaseCloseDelta(body, 'develop', ts('13:10:00'));
  // span 600s; the 13:02→13:05 (180s) sub-span opens on a DEPARTURE (pause).
  assert.equal(d.activeSec, 420);
  assert.equal(d.idleSec, 180);
});

test('AC1 — a switch-out:#N → resumed bracket is subtracted the same way', () => {
  const body = bodyWith([
    row('13:00:00', 'develop:started', { marker: 100 }),
    row('13:03:00', 'switch-out:#999', { marker: 100, desc: 'switched to #999' }),
    row('13:07:00', 'resumed', { marker: 100, desc: 'switched back' }),
  ]);
  const d = computePhaseCloseDelta(body, 'develop', ts('13:10:00'));
  // The 13:03→13:07 (240s) sub-span opens on a switch-out departure.
  assert.equal(d.activeSec, 360);
  assert.equal(d.idleSec, 240);
});

// ---- AC2: Δwords source = startWordMarker (enter row's Word Marker cell)

test('AC2 — startWordMarker is read from the enter row Word-Marker cell (Δwords source)', () => {
  const body = bodyWith([row('13:00:00', 'develop:started', { marker: 250 })]);
  const d = computePhaseCloseDelta(body, 'develop', ts('13:10:00'));
  assert.equal(d.startWordMarker, 250);
  // The writer stamps Δwords = currentMarker − startWordMarker; e.g. 900 − 250.
  assert.equal(Math.max(0, 900 - d.startWordMarker), 650);
});

// ---- AC4: resume re-enters the last action-verb phase (bracket closes correctly)

test('AC4 — an unclosed departure at nowTs leaves its whole tail idle', () => {
  // No resume before close: the departure sub-span runs to nowTs and is idle.
  const body = bodyWith([
    row('13:00:00', 'develop:started', { marker: 100 }),
    row('13:06:00', 'pause', { marker: 100, desc: 'still blocked' }),
  ]);
  const d = computePhaseCloseDelta(body, 'develop', ts('13:10:00'));
  assert.equal(d.activeSec, 360); // 13:00→13:06
  assert.equal(d.idleSec, 240); // 13:06→now, still paused
});

// ---- AC3: demote re-entry scopes to the LAST enter row (per-entry totals)

test('AC3 — demote re-entry scopes to the last `<phase>:started`, giving per-entry totals', () => {
  const body = bodyWith([
    row('13:00:00', 'develop:started', { marker: 100 }),
    row('13:05:00', 'demoted', { marker: 300, desc: 'demoted from test' }),
    row('13:06:00', 'develop:started', { marker: 500, desc: 're-entry' }),
  ]);
  const d = computePhaseCloseDelta(body, 'develop', ts('13:10:00'));
  // Scoped to the 13:06 re-entry, not the whole history.
  assert.equal(d.matched, true);
  assert.equal(d.activeSec, 240); // 13:06→13:10
  assert.equal(d.idleSec, 0);
  assert.equal(d.startWordMarker, 500);
});

// ---- Fallback: no enter row → matched:false (caller uses deriveStateMoveDelta)

test('a body with no matching enter row returns matched:false', () => {
  const body = bodyWith([row('13:00:00', 'plan:started', { marker: 100 })]);
  const d = computePhaseCloseDelta(body, 'develop', ts('13:10:00'));
  assert.equal(d.matched, false);
  assert.equal(d.activeSec, 0);
});

// ---- AC5: the writer only ever emits canonical row types — no idle/active-work

test('AC5 — emitPhasePairRows writes no `idle`/`active-work` row on a phase completion', async () => {
  const emitted = [];
  const enterBody = bodyWith([row('13:00:00', 'develop:started', { marker: 100 })]);
  const ctx = {
    issueArg: 825,
    stateArg: 'test',
    resolvedFromState: 'develop',
    demoteFlag: false,
    cfg: { repo: 'kburson/ai-task-manager' },
    SKIP_NETWORK: false,
    deps: {
      timingRows,
      phaseEvents,
      ghTimingComment: {
        buildRow: (args) => {
          // Capture the event slug the writer chose (resolved from PHASE_EVENTS
          // when passed as a {state, phase} descriptor).
          const slug =
            args.event ??
            phaseEvents.resolvePhaseEvent(args.phase)?.event ??
            JSON.stringify(args.phase);
          const rendered = { slug: String(slug).toLowerCase(), args };
          return rendered;
        },
        postTimingEvent: async ({ row }) => {
          emitted.push(row);
        },
        readTimingCommentBody: async () => ({ body: enterBody }),
        bodyOf: (r) => (r && typeof r === 'object' ? r.body : r),
      },
    },
  };
  await emitPhasePairRows(ctx);
  const slugs = emitted.map((r) => r.slug);
  assert.ok(slugs.length >= 2, `expected paired rows, got ${JSON.stringify(slugs)}`);
  assert.ok(
    !slugs.some((s) => s === 'idle' || s === 'active-work'),
    `writer must never emit idle/active-work; got ${JSON.stringify(slugs)}`
  );
  // The completion + entry pair are the canonical develop→test slugs.
  assert.deepEqual(slugs, ['develop:completed', 'test:started']);
  // The completion row carries the phase-span active delta (enter → real now),
  // not the 0/0 of the paired entry row — proving the v2 span path ran.
  const completion = emitted.find((r) => r.slug === 'develop:completed');
  assert.ok(
    Number.isFinite(completion.args.activeSec) && completion.args.activeSec > 0,
    `completion activeSec should be a positive span delta, got ${completion.args.activeSec}`
  );
  const entry = emitted.find((r) => r.slug === 'test:started');
  assert.equal(entry.args.activeSec, 0);
});
