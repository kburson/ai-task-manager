// @story #159
// Tests for scripts/task-tracker/lib/timing-rows.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  computeStateMoveDelta,
  formatHMS,
  lastRowTsFromBody,
  pauseSpansBetween,
  parseRowSecMarker,
  formatRowSecMarker,
} from '../../lib/timing-rows.mjs';

test('computeStateMoveDelta returns zero when prev missing', () => {
  assert.deepEqual(computeStateMoveDelta({ prevRowTs: null, nowTs: Date.now() }), {
    activeSec: 0,
    idleSec: 0,
  });
});

test('computeStateMoveDelta returns wall-clock delta in seconds', () => {
  const prev = '2026-05-17T18:00:00.000Z';
  const now = '2026-05-17T18:00:45.000Z';
  assert.deepEqual(computeStateMoveDelta({ prevRowTs: prev, nowTs: now }), {
    activeSec: 45,
    idleSec: 0,
  });
});

test('computeStateMoveDelta returns zero when now <= prev', () => {
  const prev = '2026-05-17T18:00:45.000Z';
  const now = '2026-05-17T18:00:00.000Z';
  assert.deepEqual(computeStateMoveDelta({ prevRowTs: prev, nowTs: now }), {
    activeSec: 0,
    idleSec: 0,
  });
});

test('computeStateMoveDelta subtracts pause spans', () => {
  const prev = '2026-05-17T18:00:00.000Z';
  const now = '2026-05-17T18:01:00.000Z';
  const pauseSpans = [20];
  assert.deepEqual(computeStateMoveDelta({ prevRowTs: prev, nowTs: now, pauseSpans }), {
    activeSec: 40,
    idleSec: 20,
  });
});

test('computeStateMoveDelta clamps pause overflow to total', () => {
  const prev = '2026-05-17T18:00:00.000Z';
  const now = '2026-05-17T18:00:10.000Z';
  const pauseSpans = [100];
  assert.deepEqual(computeStateMoveDelta({ prevRowTs: prev, nowTs: now, pauseSpans }), {
    activeSec: 0,
    idleSec: 10,
  });
});

test('computeStateMoveDelta accepts {from,until} pause spans', () => {
  const prev = '2026-05-17T18:00:00.000Z';
  const now = '2026-05-17T18:01:00.000Z';
  const pauseSpans = [{ from: '2026-05-17T18:00:10.000Z', until: '2026-05-17T18:00:25.000Z' }];
  assert.deepEqual(computeStateMoveDelta({ prevRowTs: prev, nowTs: now, pauseSpans }), {
    activeSec: 45,
    idleSec: 15,
  });
});

test('formatHMS boundary cases', () => {
  assert.equal(formatHMS(0), '0:00:00');
  assert.equal(formatHMS(59), '0:00:59');
  assert.equal(formatHMS(60), '0:01:00');
  assert.equal(formatHMS(3599), '0:59:59');
  assert.equal(formatHMS(3600), '1:00:00');
  assert.equal(formatHMS(3661), '1:01:01');
  assert.equal(formatHMS(null), '—');
  assert.equal(formatHMS(undefined), '—');
  assert.equal(formatHMS(NaN), '—');
});

test('lastRowTsFromBody picks the most recent table row timestamp', () => {
  const body = [
    '## ⏱ Timing Log',
    '',
    '| Timestamp | Event | Active | Idle | Δ Words | Word Marker | Description |',
    '|---|---|---|---|---|---|---|',
    '| 2026-05-17 18:00:00 -05:00 | start | 0 | 0 | 0 | 0 |  |',
    '| 2026-05-17 18:01:30 -05:00 | move | 1 | 0 | 0 | 0 |  |',
  ].join('\n');
  assert.equal(lastRowTsFromBody(body), '2026-05-17 18:01:30 -05:00');
});

test('lastRowTsFromBody returns null when no rows', () => {
  assert.equal(lastRowTsFromBody('## ⏱ Timing Log'), null);
  assert.equal(lastRowTsFromBody(''), null);
  assert.equal(lastRowTsFromBody(null), null);
});

test('pauseSpansBetween extracts seconds within window', () => {
  const body = [
    'Some text',
    '<!-- aitm-pause: 2026-05-17T18:00:10Z..2026-05-17T18:00:25Z -->',
    '<!-- aitm-pause: 2026-05-17T19:00:00Z..2026-05-17T19:00:10Z -->',
  ].join('\n');
  const start = Date.parse('2026-05-17T18:00:00Z');
  const end = Date.parse('2026-05-17T18:01:00Z');
  assert.deepEqual(pauseSpansBetween(body, start, end), [15]);
});

test('parseRowSecMarker / formatRowSecMarker roundtrip', () => {
  const line =
    '| 2026-05-17 18:00:00 -05:00 | move | 1 | 0 | 0 | 0 |  | <!-- row-sec: a=45 i=15 -->';
  assert.deepEqual(parseRowSecMarker(line), { activeSec: 45, idleSec: 15 });
  assert.equal(formatRowSecMarker({ activeSec: 45, idleSec: 15 }), '<!-- row-sec: a=45 i=15 -->');
});

test('parseRowSecMarker returns null without marker', () => {
  assert.equal(parseRowSecMarker('| 2026-05-17 18:00:00 -05:00 | move | 1 | 0 | 0 | 0 |  |'), null);
});
