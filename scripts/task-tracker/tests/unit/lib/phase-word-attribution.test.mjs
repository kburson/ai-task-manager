// @story #832
// EPIC #823 timing model v2 (C8, #832) — phase-close WORD attribution.
//
// Defect D4: context-words accrued within a phase span that is interrupted by a
// `pause` / `switch-out` / (neutral) interruption row were being attributed to
// the interruption row instead of the phase's `<phase>:completed` row, and the
// Word-Marker column froze across the span.
//
// The fix teaches `computePhaseCloseDelta` to return `deltaWords`: the sum, over
// every ACTIVE (non-departure) sub-span of the phase visit, of the Word-Marker
// cell growth from that sub-span's opening row to the next row (`nowMarker` for
// the trailing sub-span). DEPARTURE sub-spans (`pause`, `switch-out → resumed`)
// are EXCLUDED, so a paused idle window contributes nothing and a switch-out
// bracket's marker growth — the PEER issue's away words, which rode the same
// per-project durable marker — never leaks onto this issue's completed row (AC2).
//
// These tests pin the attribution engine directly. The render-side contract
// (the interruption row's Δ Words cell renders 0 via `suppressRowWords` in
// pause.mjs / switch.mjs) is exercised by the verb integration + the Test-stage
// full suite; here we prove the `:completed` computation captures exactly the
// active-span growth and nothing else.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computePhaseCloseDelta } from '../../../lib/timing-rows.mjs';

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

// ---- AC1: words accrued in a pause-interrupted develop span land on
// `develop:completed`; the pause (departure) bracket's marker growth is excluded.

test('AC1 — a pause bracket inside the span is EXCLUDED from deltaWords', () => {
  // develop:started(100) → pause(150): active, +50 own words.
  // pause(150) → resumed(170): DEPARTURE — the contrived +20 growth is EXCLUDED.
  // resumed(170) → nowMarker(210): active, +40 own words.
  const body = bodyWith([
    row('13:00:00', 'develop:started', { marker: 100 }),
    row('13:02:00', 'pause:blocked', { marker: 150, desc: 'blocked on human' }),
    row('13:05:00', 'resumed', { marker: 170, desc: 'question answered' }),
  ]);
  const d = computePhaseCloseDelta(body, 'develop', ts('13:10:00'), 210);
  assert.equal(d.matched, true);
  // 50 + 40 = 90; the 20 bracketed by the pause is NOT credited (would be 110 if broken).
  assert.equal(d.deltaWords, 90);
  // The active/idle split is unperturbed by the new word logic.
  assert.equal(d.activeSec, 420); // 13:00→13:02 (120) + 13:05→13:10 (300)
  assert.equal(d.idleSec, 180); // 13:02→13:05
  assert.equal(d.startWordMarker, 100);
});

// ---- AC2: a switch-out → resumed bracket credits only the OWN-issue words; the
// peer's away words (which rode the shared durable marker) are excluded.

test('AC2 — a switch-out bracket excludes the peer away-words from deltaWords', () => {
  // develop:started(100) → switch-out(140): active, +40 own.
  // switch-out(140) → resumed(340): DEPARTURE — the +200 is the PEER's away words, EXCLUDED.
  // resumed(340) → nowMarker(360): active, +20 own.
  const body = bodyWith([
    row('13:00:00', 'develop:started', { marker: 100 }),
    row('13:03:00', 'switch-out:#999', { marker: 140, desc: 'switched to #999' }),
    row('13:07:00', 'resumed', { marker: 340, desc: 'switched back' }),
  ]);
  const d = computePhaseCloseDelta(body, 'develop', ts('13:10:00'), 360);
  // 40 + 20 = 60 own words; the peer's 200 is NOT credited (would be 260 if broken).
  assert.equal(d.deltaWords, 60);
  assert.equal(d.activeSec, 360); // 13:00→13:03 (180) + 13:07→13:10 (180)
  assert.equal(d.idleSec, 240); // 13:03→13:07
});

// ---- AC1: a NON-departure (neutral/phase) interruption row does NOT freeze the
// marker — its span growth flows to `<phase>:completed`, not to that row.

test('AC1 — a neutral interruption row credits its span growth to completed', () => {
  // develop:started(100) → review:started(160): active, +60 (review:started is a
  // PHASE opener, not a departure — the words are NOT withheld on that row).
  // review:started(160) → nowMarker(200): active, +40.
  const body = bodyWith([
    row('13:00:00', 'develop:started', { marker: 100 }),
    row('13:04:00', 'review:started', { marker: 160, desc: 'neutral interruption' }),
  ]);
  const d = computePhaseCloseDelta(body, 'develop', ts('13:10:00'), 200);
  // Full 100 span words land on develop:completed; nothing excluded (no departure).
  assert.equal(d.deltaWords, 100);
  assert.equal(d.idleSec, 0);
});

// ---- AC2: an uninterrupted span credits its full Δwords — the banked trailing
// tail arrives via `nowMarker` on the sole active sub-span.

test('AC2 — an uninterrupted span credits the full banked tail via nowMarker', () => {
  const body = bodyWith([row('13:00:00', 'develop:started', { marker: 100 })]);
  const d = computePhaseCloseDelta(body, 'develop', ts('13:10:00'), 175);
  assert.equal(d.deltaWords, 75); // 175 − 100, the whole uninterrupted tail
  assert.equal(d.activeSec, 600);
  assert.equal(d.idleSec, 0);
});

// ---- Multiple interruptions in one span: only the active sub-spans accumulate.

test('deltaWords sums every active sub-span across multiple interruptions', () => {
  // started(100)→pause(120): +20 active
  // pause(120)→resumed(120): departure, excluded
  // resumed(120)→switch-out(150): +30 active
  // switch-out(150)→resumed(250): departure (peer +100), excluded
  // resumed(250)→now(300): +50 active
  const body = bodyWith([
    row('13:00:00', 'develop:started', { marker: 100 }),
    row('13:01:00', 'pause:break', { marker: 120 }),
    row('13:02:00', 'resumed', { marker: 120 }),
    row('13:03:00', 'switch-out:#42', { marker: 150 }),
    row('13:05:00', 'resumed', { marker: 250 }),
  ]);
  const d = computePhaseCloseDelta(body, 'develop', ts('13:10:00'), 300);
  assert.equal(d.deltaWords, 100); // 20 + 30 + 50; the two departure brackets excluded
});

// ---- demote re-entry scopes deltaWords to the LAST `<phase>:started`.

test('deltaWords scopes to the last enter row on a demote re-entry', () => {
  const body = bodyWith([
    row('13:00:00', 'develop:started', { marker: 100 }),
    row('13:05:00', 'demoted:develop', { marker: 300, desc: 'demoted from test' }),
    row('13:06:00', 'develop:started', { marker: 300, desc: 're-entry' }),
  ]);
  const d = computePhaseCloseDelta(body, 'develop', ts('13:10:00'), 380);
  // Scoped to the 13:06 re-entry: 380 − 300 = 80, not the whole history.
  assert.equal(d.deltaWords, 80);
  assert.equal(d.startWordMarker, 300);
});

// ---- Fallback contract: no enter row → matched:false with deltaWords:0.

test('no matching enter row returns matched:false and deltaWords:0', () => {
  const body = bodyWith([row('13:00:00', 'plan:started', { marker: 100 })]);
  const d = computePhaseCloseDelta(body, 'develop', ts('13:10:00'), 500);
  assert.equal(d.matched, false);
  assert.equal(d.deltaWords, 0);
});

// ---- A NaN nowMarker (no bank ran) never poisons the trailing sub-span.

test('a non-finite nowMarker leaves the trailing sub-span uncredited, not NaN', () => {
  const body = bodyWith([
    row('13:00:00', 'develop:started', { marker: 100 }),
    row('13:04:00', 'review:started', { marker: 160 }),
  ]);
  const d = computePhaseCloseDelta(body, 'develop', ts('13:10:00')); // nowMarker defaults to NaN
  // started(100)→review(160): +60 credited; review(160)→now(NaN): skipped (not finite).
  assert.equal(d.deltaWords, 60);
});
