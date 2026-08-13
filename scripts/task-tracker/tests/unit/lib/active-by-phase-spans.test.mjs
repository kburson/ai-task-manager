// @story #826
// EPIC #823 timing model v2 (C3) — consumers recompute active time from spans.
//
// `computeActiveByPhaseSpans(body, nowTs?)` is the single whole-log phase-span
// calculator: for every phase ENTER row it sums span − Σ(pause/switch-out→resume
// brackets), keyed per phase, summed across re-entries. `rollupTotals(rows,
// thresholdMin, body)` derives its active/idle totals from it (no per-row sum),
// and `active-time.mjs` re-exports it. These tests pin all five #826 ACs.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { computeActiveByPhaseSpans } from '../../../lib/timing-rows.mjs';
import { computeActiveByPhaseSpans as reexported } from '../../../active-time.mjs';
import { rollupTotals, parseTimingRows } from '../../../timing-rollup.mjs';

const HEADER = '| Timestamp | Event | Active | Idle | Δ Words | Word Marker | Description |';
const SEP = '|---|---|---|---|---|---|---|';
const TZ = '-05:00';
const ts = (hms) => `2026-07-14 ${hms} ${TZ}`;

// `active`/`idle` cells are intentionally left blank: v2 read-side ignores per-row
// activeSec/idleSec and recomputes from spans, so the fixtures carry no row-sec.
function row(hms, event, { marker = 0, desc = '' } = {}) {
  return `| ${ts(hms)} | ${event} |  |  |  | ${marker} | ${desc} |`;
}
function bodyWith(rows) {
  return ['## ⏱ Timing Log', '', HEADER, SEP, ...rows, ''].join('\n') + '\n';
}

// ---- AC1: active time == span − Σ brackets, reading no idle/active-work row ----

test('AC1 — a bracket-free phase reports activeSec == span, idleSec == 0', () => {
  const body = bodyWith([
    row('13:00:00', 'develop:started', { marker: 100 }),
    row('13:10:00', 'develop:completed', { marker: 150 }),
  ]);
  const r = computeActiveByPhaseSpans(body);
  assert.equal(r.totalActiveSec, 600); // 10-min span, no brackets
  assert.equal(r.totalIdleSec, 0);
});

test('AC1 — a pause→resume bracket inside a span is idle, not active', () => {
  const body = bodyWith([
    row('13:00:00', 'develop:started', { marker: 100 }),
    row('13:02:00', 'pause', { marker: 100, desc: 'blocked on human' }),
    row('13:05:00', 'resumed', { marker: 100, desc: 'question answered' }),
    row('13:10:00', 'develop:completed', { marker: 150 }),
  ]);
  const r = computeActiveByPhaseSpans(body);
  // 600s span; the 13:02→13:05 (180s) sub-span opens on a DEPARTURE (pause).
  assert.equal(r.totalActiveSec, 420);
  assert.equal(r.totalIdleSec, 180);
});

test('AC1 — active-time.mjs re-exports the same calculator', () => {
  assert.equal(reexported, computeActiveByPhaseSpans);
});

// ---- AC2: rollup total == Σ per-phase activeSec across re-entries, spans only --

test('AC2 — multi-phase totals sum per phase; between-phase gap excluded', () => {
  const body = bodyWith([
    row('13:00:00', 'refine:started', { marker: 0 }),
    row('13:05:00', 'refine:completed', { marker: 10 }),
    // 13:05 → 13:20: awaiting plan approval — MUST be excluded (no enter open).
    row('13:20:00', 'plan:started', { marker: 10 }),
    row('13:30:00', 'plan:completed', { marker: 20 }),
  ]);
  const r = computeActiveByPhaseSpans(body);
  // refine 300s + plan 600s; the 15-min gap is not inside any span.
  assert.equal(r.totalActiveSec, 900);
  const refine = r.perPhase.find((p) => p.event === 'refine:started');
  const plan = r.perPhase.find((p) => p.event === 'plan:started');
  assert.equal(refine.activeSec, 300);
  assert.equal(plan.activeSec, 600);
});

test('AC2 — a demote re-entry accumulates under the same phase key', () => {
  const body = bodyWith([
    row('13:00:00', 'develop:started', { marker: 100 }),
    row('13:04:00', 'demoted', { marker: 120, desc: 'back to develop' }),
    // 13:04 → 13:06 demote→re-enter gap: excluded.
    row('13:06:00', 'develop:started', { marker: 120 }),
    row('13:12:00', 'develop:completed', { marker: 160 }),
  ]);
  const r = computeActiveByPhaseSpans(body);
  // first develop span 240s + second develop span 360s = 600s, one key.
  const dev = r.perPhase.filter((p) => p.event === 'develop:started');
  assert.equal(dev.length, 1);
  assert.equal(dev[0].activeSec, 600);
  assert.equal(r.totalActiveSec, 600);
});

test('#1211 — historical second-stage timing rows retain canonical phase totals', () => {
  const canonical = bodyWith([
    row('12:55:00', 'backlog:created'),
    row('13:00:00', 'ready-for-plan:started'),
    row('13:05:00', 'refine:started'),
    row('13:10:00', 'refine:completed'),
  ]);
  const historical = canonical.replace('ready-for-plan:started', 'on-deck:started');
  const expected = computeActiveByPhaseSpans(canonical);
  const actual = computeActiveByPhaseSpans(historical);
  assert.deepEqual(actual, expected);
  assert.equal(
    actual.perPhase.find(({ event }) => event === 'ready-for-plan:started').activeSec,
    300
  );
});

test('AC2 — rollupTotals derives totals from spans, not per-row sums', () => {
  const body = bodyWith([
    row('13:00:00', 'develop:started', { marker: 100 }),
    row('13:02:00', 'pause', { marker: 100 }),
    row('13:05:00', 'resumed', { marker: 100 }),
    row('13:10:00', 'develop:completed', { marker: 150 }),
  ]);
  const rows = parseTimingRows(body);
  const roll = rollupTotals(rows, 5, body);
  assert.equal(roll.totalActiveSec, 420);
  assert.equal(roll.totalIdleSec, 180);
  assert.equal(roll.totalActiveMin, 7);
});

// ---- AC3: ai-value "Actual Session Time" derives from the same calculation ----

test('AC3 — the board-fed rollup total equals the span calculator output', () => {
  const body = bodyWith([
    row('13:00:00', 'develop:started', { marker: 100 }),
    row('13:03:00', 'switch-out:#999', { marker: 110 }),
    row('13:08:00', 'resumed', { marker: 110 }),
    row('13:12:00', 'develop:completed', { marker: 150 }),
  ]);
  const rows = parseTimingRows(body);
  const roll = rollupTotals(rows, 5, body);
  const spans = computeActiveByPhaseSpans(body);
  // The value log-issue-time writes to the board field IS rollupTotals'
  // totalActiveSec, which must equal the phase-span calculator exactly.
  assert.equal(roll.totalActiveSec, spans.totalActiveSec);
  assert.equal(spans.totalActiveSec, 420); // 720s span − 300s switch-out bracket
  assert.equal(spans.totalIdleSec, 300);
});

// ---- AC4: legacy idle/active-work log totals == healed-equivalent totals ------

test('AC4 — a log with legacy idle/active-work rows totals the same as healed', () => {
  const legacy = bodyWith([
    row('13:00:00', 'develop:started', { marker: 100 }),
    row('13:04:00', 'active-work', { marker: 130, desc: 'finalize credit' }),
    row('13:07:00', 'idle', { marker: 130, desc: 'legacy idle row' }),
    row('13:10:00', 'develop:completed', { marker: 150 }),
  ]);
  const healed = bodyWith([
    row('13:00:00', 'develop:started', { marker: 100 }),
    row('13:10:00', 'develop:completed', { marker: 150 }),
  ]);
  const lr = computeActiveByPhaseSpans(legacy);
  const hr = computeActiveByPhaseSpans(healed);
  // Legacy idle/active-work rows classify as neutral PHASE (active), so the
  // whole 600s span is active in both — removal is total-preserving.
  assert.equal(lr.totalActiveSec, 600);
  assert.equal(lr.totalIdleSec, 0);
  assert.equal(lr.totalActiveSec, hr.totalActiveSec);
  assert.equal(lr.totalIdleSec, hr.totalIdleSec);
});

// ---- AC5: no consumer branch keys on `idle` or `active-work` ------------------

// A code branch keyed on a slug is an equality/switch/membership test against the
// string literal. Comments (which legitimately mention the retired slugs) are
// stripped first so only executable code is scanned.
function stripComments(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
}
const BRANCH_ON = (slug) =>
  new RegExp(`(===|==|!==|!=|case|includes\\s*\\(|indexOf\\s*\\()\\s*['"\`]${slug}['"\`]`);

test('AC5 — the read-side calculator has no branch keyed on idle/active-work', () => {
  const src = stripComments(
    readFileSync(fileURLToPath(new URL('../../../lib/timing-rows.mjs', import.meta.url)), 'utf8')
  );
  assert.equal(BRANCH_ON('idle').test(src), false, 'timing-rows must not branch on "idle"');
  assert.equal(
    BRANCH_ON('active-work').test(src),
    false,
    'timing-rows must not branch on "active-work"'
  );
});

test('AC5 — rollupTotals has no branch keyed on idle/active-work either', () => {
  const src = stripComments(
    readFileSync(fileURLToPath(new URL('../../../timing-rollup.mjs', import.meta.url)), 'utf8')
  );
  assert.equal(BRANCH_ON('idle').test(src), false);
  assert.equal(BRANCH_ON('active-work').test(src), false);
});
