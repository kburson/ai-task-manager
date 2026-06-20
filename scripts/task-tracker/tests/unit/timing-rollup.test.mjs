// @story #38
import assert from 'node:assert/strict';
import {
  parseTimingRows,
  computeReviewMin,
  computePlanMin,
  rollupTotals,
} from '../../timing-rollup.mjs';

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

// computePlanMin: single Plan window — 25 min between move:plan and move:develop.
body = buildLog([
  { ts: '2026-05-09 09:00 -07:00', event: 'move:refine' },
  { ts: '2026-05-09 09:30 -07:00', event: 'move:plan' },
  { ts: '2026-05-09 09:55 -07:00', event: 'move:develop' },
]);
rows = parseTimingRows(body);
assert.equal(computePlanMin(rows), 25, 'single plan window = 25 min');

// computePlanMin: no plan window — 0.
body = buildLog([
  { ts: '2026-05-09 09:00 -07:00', event: 'move:refine' },
  { ts: '2026-05-09 09:30 -07:00', event: 'move:develop' },
]);
rows = parseTimingRows(body);
assert.equal(computePlanMin(rows), 0, 'no plan window = 0');

// computePlanMin: open plan window (still in plan, no closing transition) = 0.
body = buildLog([
  { ts: '2026-05-09 09:30 -07:00', event: 'move:plan' },
  { ts: '2026-05-09 09:45 -07:00', event: 'start' },
]);
rows = parseTimingRows(body);
assert.equal(computePlanMin(rows), 0, 'unclosed plan window contributes 0');

// computePlanMin: rollback path — plan → refine still aggregated.
body = buildLog([
  { ts: '2026-05-09 09:30 -07:00', event: 'move:plan' },
  { ts: '2026-05-09 09:40 -07:00', event: 'move:refine' },
]);
rows = parseTimingRows(body);
assert.equal(computePlanMin(rows), 10, 'plan → refine rollback still counted');

// computePlanMin: multi-visit aggregation (forward-compat with #181).
body = buildLog([
  { ts: '2026-05-09 09:00 -07:00', event: 'move:plan' },
  { ts: '2026-05-09 09:10 -07:00', event: 'move:develop' },
  { ts: '2026-05-09 10:00 -07:00', event: 'move:plan' },
  { ts: '2026-05-09 10:15 -07:00', event: 'move:develop' },
]);
rows = parseTimingRows(body);
assert.equal(computePlanMin(rows), 25, 'multi-visit plan windows aggregated');

// rollupTotals exposes planMin.
body = buildLog([
  { ts: '2026-05-09 09:30 -07:00', event: 'move:plan' },
  { ts: '2026-05-09 09:55 -07:00', event: 'move:develop' },
  { ts: '2026-05-09 10:00 -07:00', event: 'start', active: 10 },
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
    event: 'develop:done',
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
  { ts: '2026-05-09 10:10 -07:00', event: 'approved', active: 0, wm: 0 },
  { ts: '2026-05-09 10:11 -07:00', event: 'closed', active: 1, wm: 0 },
]);
rows = parseTimingRows(body);
const totalsMono = rollupTotals(rows, 5);
assert.equal(
  totalsMono.lastWordMarker,
  900,
  'lastWordMarker holds the max despite later wm=0 rows'
);

console.log('timing-rollup.test.mjs: all passed');
