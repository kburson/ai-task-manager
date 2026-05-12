import assert from 'node:assert/strict';
import { parseTimingRows, computeReviewMin, rollupTotals } from '../timing-rollup.mjs';

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

console.log('timing-rollup.test.mjs: all passed');
