// @story #1038

import assert from 'node:assert/strict';
import test from 'node:test';

import {
  isTableTimingTimestamp,
  isTimingRowTimestamp,
  parseTimingRow,
  replaceTimingRowCell,
  replaceTimingRowCells,
  splitTimingRowMarker,
  timingTimestampToMs,
} from '../../../lib/timing-row-reader.mjs';

const CURRENT_ROW =
  '| 2026-07-28 17:02:14 -05:00 | develop:started | 0h 00m 04s |  | 125 | 1,234 | start development | 9 | <!-- row-sec: a=4 i=0 -->';

test('parseTimingRow decodes the current row without interpreting timing policy', () => {
  const row = parseTimingRow(CURRENT_ROW);
  assert.ok(row);
  assert.equal(row.ts, '2026-07-28 17:02:14 -05:00');
  assert.equal(row.event, 'develop:started');
  assert.equal(row.wordMarker, '1,234');
  assert.equal(row.description, 'start development');
  assert.equal(row.cells[8], '9');
  assert.equal(row.marker, ' <!-- row-sec: a=4 i=0 -->');
});

test('parseTimingRow retains minute-precision legacy and T-delimited ISO shapes', () => {
  const legacy = parseTimingRow('| 2026-05-08 12:00 +00:00 | START | 0 | 0 | 0 | 100 | |');
  assert.equal(legacy.ts, '2026-05-08 12:00 +00:00');
  assert.equal(legacy.event, 'start');
  assert.equal(legacy.wordMarker, '100');
  assert.equal(isTableTimingTimestamp(legacy.ts), true);

  const iso = parseTimingRow(
    '| 2026-06-21T13:23:36Z | Resumed | 0s | 0s | 0 | 1,234 | task resumed |'
  );
  assert.equal(iso.ts, '2026-06-21T13:23:36Z');
  assert.equal(iso.event, 'resumed');
  assert.equal(isTableTimingTimestamp(iso.ts), false);
  assert.equal(isTimingRowTimestamp(iso.ts), true);
});

test('parseTimingRow is lexical: headers parse, non-table text does not', () => {
  const header = parseTimingRow('| Timestamp | Event | Active |');
  assert.equal(header.ts, 'Timestamp');
  assert.equal(header.event, 'event');
  assert.equal(isTimingRowTimestamp(header.ts), false);
  const truncated = parseTimingRow('| 2026-07-28 10:00:00 +00:00 | bogus');
  assert.equal(truncated.ts, '2026-07-28 10:00:00 +00:00');
  assert.equal(truncated.event, 'bogus');
  assert.equal(parseTimingRow('|---|---|'), null);
  assert.equal(parseTimingRow('not a row'), null);
});

test('timestamp conversion preserves table and ISO behavior', () => {
  assert.equal(
    timingTimestampToMs('2026-07-28 17:02:14 -05:00'),
    Date.parse('2026-07-28T17:02:14-05:00')
  );
  assert.equal(
    timingTimestampToMs('2026-05-08 12:00 +00:00'),
    Date.parse('2026-05-08T12:00:00+00:00')
  );
  assert.equal(timingTimestampToMs('2026-06-21T13:23:36Z'), Date.parse('2026-06-21T13:23:36Z'));
  assert.equal(Number.isNaN(timingTimestampToMs('Timestamp')), true);
});

test('marker separation and cell replacement preserve untouched bytes', () => {
  assert.deepEqual(splitTimingRowMarker(CURRENT_ROW), {
    core: '| 2026-07-28 17:02:14 -05:00 | develop:started | 0h 00m 04s |  | 125 | 1,234 | start development | 9 |',
    marker: ' <!-- row-sec: a=4 i=0 -->',
  });

  const eventRewritten = replaceTimingRowCell(CURRENT_ROW, 2, ' resumed ');
  assert.equal(eventRewritten, CURRENT_ROW.replace('| develop:started |', '| resumed |'));

  const several = replaceTimingRowCells(CURRENT_ROW, {
    3: ' 0h 00m 09s ',
    4: ' 0h 00m 01s ',
    5: ' 130 ',
  });
  assert.match(several, /\| 0h 00m 09s \| 0h 00m 01s \| 130 \|/);
  assert.ok(several.endsWith(' <!-- row-sec: a=4 i=0 -->'));

  const withSuffix = `${CURRENT_ROW}   `;
  assert.equal(
    replaceTimingRowCell(withSuffix, 2, ' resumed '),
    `${CURRENT_ROW.replace('| develop:started |', '| resumed |')}   `
  );
});
