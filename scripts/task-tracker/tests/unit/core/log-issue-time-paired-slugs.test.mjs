// @story #534
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseTimingRows, computeReviewMin, rollupTotals } from '../../../timing-rollup.mjs';

const HEADER = [
  '| Timestamp | Event | Active | Idle | ΔWords | Word Marker | Description |',
  '| --- | --- | --- | --- | --- | --- | --- |',
];
const body = (...rows) => [...HEADER, ...rows].join('\n');
// A row carrying explicit second precision via the row-sec marker.
const secRow = (event, ts, aSec, iSec) =>
  `| ${ts} | ${event} | | | 0 | 1,234 | ${event} | <!-- row-sec: a=${aSec} i=${iSec} -->`;
const plainRow = (event, ts) => `| ${ts} | ${event} | | | 0 | 1,234 | ${event} |`;

test('computeReviewMin pairs a pause:<slug> row like a legacy paused row', () => {
  const b = body(
    plainRow('start', '2026-06-25 09:00:00 +00:00'),
    plainRow('pause:question', '2026-06-25 10:00:00 +00:00'),
    plainRow('resume:question', '2026-06-25 10:05:00 +00:00')
  );
  const rows = parseTimingRows(b);
  // pause→resume gap is 5 min, within a 10-min review threshold.
  assert.equal(computeReviewMin(rows, 10), 5);
});

test('pause:break and legacy paused yield identical review minutes', () => {
  const mk = (slug) =>
    body(
      plainRow('start', '2026-06-25 09:00:00 +00:00'),
      plainRow(slug, '2026-06-25 10:00:00 +00:00'),
      plainRow('resume', '2026-06-25 10:03:00 +00:00')
    );
  const legacy = computeReviewMin(parseTimingRows(mk('paused')), 10);
  const renamed = computeReviewMin(parseTimingRows(mk('pause:break')), 10);
  assert.equal(renamed, legacy);
  assert.equal(renamed, 3);
});

test('engaged/idle totals are slug-invariant across the pause rename', () => {
  const mk = (slug) =>
    body(
      secRow('start', '2026-06-25 09:00:00 +00:00', 0, 0),
      secRow('flush', '2026-06-25 09:30:00 +00:00', 1800, 0),
      plainRow(slug, '2026-06-25 10:00:00 +00:00'),
      plainRow('resume', '2026-06-25 10:04:00 +00:00')
    );
  const legacy = rollupTotals(parseTimingRows(mk('paused')), 10);
  const renamed = rollupTotals(parseTimingRows(mk('pause:discuss')), 10);
  assert.equal(renamed.totalActiveSec, legacy.totalActiveSec);
  assert.equal(renamed.totalIdleSec, legacy.totalIdleSec);
  assert.equal(renamed.engagedSec, legacy.engagedSec);
  assert.equal(renamed.reviewMin, legacy.reviewMin);
});
