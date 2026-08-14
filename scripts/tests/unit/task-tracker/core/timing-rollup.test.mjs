// @story #38
import assert from 'node:assert/strict';
import {
  parseTimingRows,
  computeReviewMin,
  computePlanMin,
  rollupTotals,
  pendingClosePairState,
} from '../../../../task-tracker/timing-rollup.mjs';

function buildLog(rows) {
  const header = '| Timestamp | Event | Active | Idle | Δ Words | Word Marker | Description |';
  const sep = '|---|---|---|---|---|---|---|';
  const body = rows
    .map(
      (r) =>
        `| ${r.ts} | ${r.event} | ${r.active ?? '—'} | ${r.idle ?? '—'} | ${r.dw ?? '—'} | ${r.wm ?? '—'} | ${r.desc ?? ''} |`
    )
    .join('\n');
  return ['⏱ Timing Log', '', header, sep, body, ''].join('\n');
}

// 4-min pause counted as review
let body = buildLog([
  { ts: '2026-05-09 10:00 -07:00', event: 'start', active: 5, wm: 100 },
  { ts: '2026-05-09 10:05 -07:00', event: 'pause', active: '—', desc: 'pause for question' },
  { ts: '2026-05-09 10:09 -07:00', event: 'start', active: 0, desc: 'question answered' },
]);
let rows = parseTimingRows(body);
assert.equal(computeReviewMin(rows, 5), 4, '4-min pause is review');

// #516 — the renamed `paused` slug is counted identically to legacy `pause`.
body = buildLog([
  { ts: '2026-05-09 10:00 -07:00', event: 'start', active: 5, wm: 100 },
  { ts: '2026-05-09 10:05 -07:00', event: 'paused', active: '—', desc: 'pause for question' },
  { ts: '2026-05-09 10:09 -07:00', event: 'start', active: 0, desc: 'question answered' },
]);
rows = parseTimingRows(body);
assert.equal(computeReviewMin(rows, 5), 4, 'new `paused` slug counts as review');

// 5-min pause counted (inclusive)
body = buildLog([
  { ts: '2026-05-09 10:00 -07:00', event: 'start', active: 5 },
  { ts: '2026-05-09 10:05 -07:00', event: 'pause', active: '—' },
  { ts: '2026-05-09 10:10 -07:00', event: 'start', active: 0 },
]);
rows = parseTimingRows(body);
assert.equal(computeReviewMin(rows, 5), 5, '5-min pause counted at threshold');

// 6-min pause excluded
body = buildLog([
  { ts: '2026-05-09 10:00 -07:00', event: 'start', active: 5 },
  { ts: '2026-05-09 10:05 -07:00', event: 'pause', active: '—' },
  { ts: '2026-05-09 10:11 -07:00', event: 'start', active: 0 },
]);
rows = parseTimingRows(body);
assert.equal(computeReviewMin(rows, 5), 0, '6-min pause is idle');

// pause with no resume
body = buildLog([
  { ts: '2026-05-09 10:00 -07:00', event: 'start', active: 5 },
  { ts: '2026-05-09 10:05 -07:00', event: 'pause', active: '—' },
]);
rows = parseTimingRows(body);
assert.equal(computeReviewMin(rows, 5), 0, 'no resume = no review');

// back-to-back pauses use the next non-pause row
body = buildLog([
  { ts: '2026-05-09 10:00 -07:00', event: 'start', active: 5 },
  { ts: '2026-05-09 10:05 -07:00', event: 'pause' },
  { ts: '2026-05-09 10:06 -07:00', event: 'pause' },
  { ts: '2026-05-09 10:08 -07:00', event: 'start', active: 0 },
]);
rows = parseTimingRows(body);
// pause@10:05 -> next non-pause @10:08 = 3 min; pause@10:06 -> next @10:08 = 2 min; total 5
assert.equal(computeReviewMin(rows, 5), 5, 'back-to-back pauses both count');

// rollupTotals: engaged = active + review
body = buildLog([
  { ts: '2026-05-09 10:00 -07:00', event: 'start', active: 10, wm: 500 },
  { ts: '2026-05-09 10:10 -07:00', event: 'pause' },
  { ts: '2026-05-09 10:13 -07:00', event: 'start', active: 5, wm: 800 },
]);
rows = parseTimingRows(body);
const totals = rollupTotals(rows, 5);
assert.equal(totals.totalActiveMin, 15);
assert.equal(totals.reviewMin, 3);
assert.equal(totals.engagedMin, 18);
assert.equal(totals.lastWordMarker, 800);

// #692 — computePlanMin reads the current `<state>:<event>` vocabulary (#516),
// NOT the retired `move:plan`. A plan window opens on `plan:started` and closes
// on the next phase-boundary row (`plan:completed` forward, `demoted` rollback).

// computePlanMin: single Plan window — 25 min between plan:started/plan:completed.
body = buildLog([
  { ts: '2026-05-09 09:00 -07:00', event: 'refine:completed' },
  { ts: '2026-05-09 09:30 -07:00', event: 'plan:started' },
  { ts: '2026-05-09 09:55 -07:00', event: 'plan:completed' },
]);
rows = parseTimingRows(body);
assert.equal(computePlanMin(rows), 25, 'single plan window = 25 min');

// computePlanMin: the retired `move:plan` vocabulary no longer registers.
body = buildLog([
  { ts: '2026-05-09 09:30 -07:00', event: 'move:plan' },
  { ts: '2026-05-09 09:55 -07:00', event: 'move:develop' },
]);
rows = parseTimingRows(body);
assert.equal(computePlanMin(rows), 0, 'retired move:plan vocabulary ignored');

// computePlanMin: no plan window — 0.
body = buildLog([
  { ts: '2026-05-09 09:00 -07:00', event: 'refine:started' },
  { ts: '2026-05-09 09:30 -07:00', event: 'refine:completed' },
]);
rows = parseTimingRows(body);
assert.equal(computePlanMin(rows), 0, 'no plan window = 0');

// computePlanMin: a mid-plan pause does NOT close the window.
body = buildLog([
  { ts: '2026-05-09 09:30 -07:00', event: 'plan:started' },
  { ts: '2026-05-09 09:40 -07:00', event: 'paused' },
  { ts: '2026-05-09 09:45 -07:00', event: 'resumed' },
  { ts: '2026-05-09 09:55 -07:00', event: 'plan:completed' },
]);
rows = parseTimingRows(body);
assert.equal(computePlanMin(rows), 25, 'pause/resume does not truncate plan window');

// computePlanMin: open plan window (still in plan, no closing boundary) = 0.
body = buildLog([
  { ts: '2026-05-09 09:30 -07:00', event: 'plan:started' },
  { ts: '2026-05-09 09:45 -07:00', event: 'resumed' },
]);
rows = parseTimingRows(body);
assert.equal(computePlanMin(rows), 0, 'unclosed plan window contributes 0');

// computePlanMin: rollback path — plan → refine (demoted) still aggregated.
body = buildLog([
  { ts: '2026-05-09 09:30 -07:00', event: 'plan:started' },
  { ts: '2026-05-09 09:40 -07:00', event: 'demoted' },
]);
rows = parseTimingRows(body);
assert.equal(computePlanMin(rows), 10, 'plan → refine rollback still counted');

// computePlanMin: multi-visit aggregation (forward-compat with #181).
body = buildLog([
  { ts: '2026-05-09 09:00 -07:00', event: 'plan:started' },
  { ts: '2026-05-09 09:10 -07:00', event: 'plan:completed' },
  { ts: '2026-05-09 10:00 -07:00', event: 'plan:started' },
  { ts: '2026-05-09 10:15 -07:00', event: 'plan:completed' },
]);
rows = parseTimingRows(body);
assert.equal(computePlanMin(rows), 25, 'multi-visit plan windows aggregated');

// #692 regression — a realistic #687-shaped end-to-end log (paired
// prev:complete + next:enter emissions) yields a NON-ZERO planMin, proving the
// board "Plan Time" field populates. Under the old `move:plan` reader this was 0.
body = buildLog([
  { ts: '2026-07-02 12:45:00 -07:00', event: 'refine:started', active: 3 },
  { ts: '2026-07-02 12:58:07 -07:00', event: 'refine:completed', active: 13 },
  { ts: '2026-07-02 12:58:07 -07:00', event: 'plan:started', active: 0 },
  { ts: '2026-07-02 13:11:12 -07:00', event: 'plan:completed', active: 13 },
  { ts: '2026-07-02 13:11:12 -07:00', event: 'develop:started', active: 0 },
  { ts: '2026-07-02 13:40:00 -07:00', event: 'develop:completed', active: 29 },
]);
rows = parseTimingRows(body);
assert.equal(computePlanMin(rows), 13, '#687-shaped log yields 13-min plan window');

// rollupTotals exposes planMin.
body = buildLog([
  { ts: '2026-05-09 09:30 -07:00', event: 'plan:started' },
  { ts: '2026-05-09 09:55 -07:00', event: 'plan:completed' },
  { ts: '2026-05-09 10:00 -07:00', event: 'develop:completed', active: 10 },
]);
rows = parseTimingRows(body);
const totalsP = rollupTotals(rows, 5);
assert.equal(totalsP.planMin, 25, 'rollupTotals exposes planMin');

// #475 AC1/AC2 — rollupTotals aggregates idle seconds across rows.
// Idle seconds come from the trailing `<!-- row-sec: a=N i=N -->` marker, which
// ROW_SEC_RE matches anywhere in the row line — so we smuggle markers in via the
// Description column.
body = buildLog([
  {
    ts: '2026-05-09 10:00 -07:00',
    event: 'start',
    active: 5,
    wm: 100,
    desc: 'start <!-- row-sec: a=300 i=0 -->',
  },
  {
    ts: '2026-05-09 10:30 -07:00',
    event: 'resumed',
    active: 5,
    wm: 200,
    desc: 'question answered <!-- row-sec: a=300 i=120 -->',
  },
  {
    ts: '2026-05-09 11:00 -07:00',
    event: 'develop:completed',
    active: 5,
    wm: 300,
    desc: 'development complete <!-- row-sec: a=300 i=45 -->',
  },
]);
rows = parseTimingRows(body);
const totalsIdle = rollupTotals(rows, 5);
assert.equal(totalsIdle.totalIdleSec, 165, 'idle seconds summed across all rows (0+120+45)');
assert.equal(totalsIdle.totalIdleMin, Math.round(165 / 60), 'totalIdleMin derived from seconds');
assert.equal(totalsIdle.lastWordMarker, 300, 'lastWordMarker is the monotonic max');

// #475 AC1 — lastWordMarker never decreases even when a later row carries a
// smaller marker (defensive: monotonic max, not last-write-wins).
body = buildLog([
  { ts: '2026-05-09 10:00 -07:00', event: 'start', active: 5, wm: 900 },
  { ts: '2026-05-09 10:10 -07:00', event: 'review:approved', active: 0, wm: 0 },
  { ts: '2026-05-09 10:11 -07:00', event: 'issue:closed', active: 1, wm: 0 },
]);
rows = parseTimingRows(body);
const totalsMono = rollupTotals(rows, 5);
assert.equal(
  totalsMono.lastWordMarker,
  900,
  'lastWordMarker holds the max despite later wm=0 rows'
);

// #817 AC1 — idempotent terminal seal. When `issue:closed` is the terminal
// (last) row, the close-pair for that terminal precedes it, so
// `pendingClosePairState` must report BOTH halves present — otherwise the close
// verb re-appends `review:approved`/`issue:wrap` AFTER the seal (the observed
// doubling / illegal-after-terminal defect). The after-window is empty here; the
// terminal-seal branch inspects the pre-terminal window instead.
const sealedBody = buildLog([
  { ts: '2026-05-09 10:00 -07:00', event: 'start', active: 5, wm: 100 },
  { ts: '2026-05-09 10:09 -07:00', event: 'develop:complete', active: 4, wm: 200 },
  { ts: '2026-05-09 10:10 -07:00', event: 'review:approved', active: 0, wm: 210 },
  { ts: '2026-05-09 10:11 -07:00', event: 'issue:wrap', active: 0, wm: 210 },
  { ts: '2026-05-09 10:12 -07:00', event: 'issue:closed', active: 1, wm: 210 },
]);
const sealed = pendingClosePairState(sealedBody);
assert.equal(sealed.reviewApproved, true, 'terminal seal: review:approved reported present');
assert.equal(sealed.issueWrap, true, 'terminal seal: issue:wrap reported present');

// #817 AC2 — a well-formed close sequence records exactly one `review:approved`
// and exactly one `issue:wrap` before a single terminal `issue:closed`.
const sealedRows = parseTimingRows(sealedBody);
assert.equal(
  sealedRows.filter((r) => r.event === 'review:approved').length,
  1,
  'exactly one review:approved before terminal'
);
assert.equal(
  sealedRows.filter((r) => r.event === 'issue:wrap').length,
  1,
  'exactly one issue:wrap before terminal'
);
assert.equal(
  sealedRows.filter((r) => r.event === 'issue:closed').length,
  1,
  'exactly one issue:closed'
);
assert.equal(
  sealedRows[sealedRows.length - 1].event,
  'issue:closed',
  'issue:closed is the terminal row'
);

// #817 AC3 — re-running the close/flush tail after close is a no-op. The gate
// (`pendingClosePairState`) reports both halves already handled, so the caller
// emits nothing and the row set is unchanged (regression guard vs the #809
// double-write). Idempotent on repeat evaluation.
const rerun = pendingClosePairState(sealedBody);
assert.deepEqual(
  rerun,
  { reviewApproved: true, issueWrap: true },
  're-evaluation of a sealed log is a stable no-op signal'
);

// #1134 — the first valid `issue:closed` is irreversible even when malformed
// activity already follows it. The production #1127 suffix must not reopen the
// close-pair writer and permit a duplicate approval/wrap pair.
const malformedTerminalBody = buildLog([
  { ts: '2026-05-09 10:00 -07:00', event: 'start', active: 5, wm: 100 },
  { ts: '2026-05-09 10:09 -07:00', event: 'review:approved', active: 0, wm: 210 },
  { ts: '2026-05-09 10:10 -07:00', event: 'issue:wrap', active: 0, wm: 210 },
  { ts: '2026-05-09 10:11 -07:00', event: 'issue:closed', active: 1, wm: 210 },
  { ts: '2026-05-09 10:12 -07:00', event: 'resumed', active: 0, wm: 220 },
  { ts: '2026-05-09 10:20 -07:00', event: 'review:approved', active: 0, wm: 220 },
  { ts: '2026-05-09 10:21 -07:00', event: 'switch-out:#1129', active: 0, wm: 220 },
]);
assert.deepEqual(
  pendingClosePairState(malformedTerminalBody),
  { reviewApproved: true, issueWrap: true },
  'a malformed post-terminal tail cannot reopen close-pair emission'
);

console.log('timing-rollup.test.mjs: all passed');
