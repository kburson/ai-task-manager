// @story #159
// Legacy timing-row parsing — rows without the trailing `<!-- row-sec: -->`
// marker must still parse, deriving second-precision values from the
// minute-precision visible columns.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseTimingRows, rollupTotals } from '../../../timing-rollup.mjs';

test('parseTimingRows derives activeSec from activeMin when row-sec marker absent', () => {
  const body = [
    '## ⏱ Timing Log',
    '',
    '| Timestamp | Event | Active | Idle | Δ Words | Word Marker | Description |',
    '|---|---|---|---|---|---|---|',
    '| 2026-05-08 12:00 +00:00 | start | 0 | 0 | 0 | 100 |  |',
    '| 2026-05-08 12:05 +00:00 | update | 5 | 0 | 0 | 200 |  |',
    '| 2026-05-08 12:10 +00:00 | pause | 0 | 0 | 0 | 0 |  |',
  ].join('\n');
  const rows = parseTimingRows(body);
  assert.equal(rows.length, 3);
  assert.equal(rows[1].activeMin, 5);
  assert.equal(rows[1].activeSec, 300);
  assert.equal(rows[1].idleSec, 0);
});

test('parseTimingRows reads row-sec marker when present', () => {
  const body = [
    '## ⏱ Timing Log',
    '',
    '| Timestamp | Event | Active | Idle | Δ Words | Word Marker | Description |',
    '|---|---|---|---|---|---|---|',
    '| 2026-05-08 12:00:00 +00:00 | start | 0 | 0 | 0 | 100 |  | <!-- row-sec: a=0 i=0 -->',
    '| 2026-05-08 12:00:45 +00:00 | move | 1 | 0 | 0 | 200 |  | <!-- row-sec: a=45 i=0 -->',
  ].join('\n');
  const rows = parseTimingRows(body);
  assert.equal(rows[1].activeSec, 45);
  assert.equal(rows[1].activeMin, 1);
});

test('rollupTotals returns *Sec and *Min shapes', () => {
  const body = [
    '## ⏱ Timing Log',
    '',
    '| Timestamp | Event | Active | Idle | Δ Words | Word Marker | Description |',
    '|---|---|---|---|---|---|---|',
    '| 2026-05-08 12:00:00 +00:00 | start | 0 | 0 | 0 | 100 |  | <!-- row-sec: a=0 i=0 -->',
    '| 2026-05-08 12:00:45 +00:00 | move | 1 | 0 | 0 | 200 |  | <!-- row-sec: a=45 i=0 -->',
    '| 2026-05-08 12:01:30 +00:00 | move | 1 | 0 | 0 | 300 |  | <!-- row-sec: a=45 i=0 -->',
  ].join('\n');
  const rows = parseTimingRows(body);
  const t = rollupTotals(rows, 60);
  assert.equal(t.totalActiveSec, 90);
  assert.equal(t.engagedSec, 90);
  assert.equal(t.engagedMin, Math.round(90 / 60));
});

test('parseTimingRows legacy rows feed rollupTotals without crash', () => {
  const body = [
    '## ⏱ Timing Log',
    '',
    '| Timestamp | Event | Active | Idle | Δ Words | Word Marker | Description |',
    '|---|---|---|---|---|---|---|',
    '| 2026-05-08 12:00 +00:00 | start | 0 | 0 | 0 | 100 |  |',
    '| 2026-05-08 12:05 +00:00 | move | 5 | 0 | 0 | 200 |  |',
  ].join('\n');
  const rows = parseTimingRows(body);
  const t = rollupTotals(rows, 60);
  assert.equal(t.totalActiveSec, 300);
  assert.equal(t.totalActiveMin, 5);
  assert.equal(t.engagedMin, 5);
});
