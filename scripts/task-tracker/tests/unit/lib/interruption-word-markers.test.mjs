// @story #1142
import assert from 'node:assert/strict';
import test from 'node:test';

import { buildRow, __internals as timingInternals } from '../../../gh-timing-comment.mjs';
import { computePhaseCloseDelta } from '../../../lib/timing-rows.mjs';
import { parseTimingRow } from '../../../lib/timing-row-reader.mjs';

const { appendRow, buildInitialComment } = timingInternals;

function row(event, wordMarker, fullWordMarker, ts = new Date().toISOString()) {
  return buildRow({
    ts,
    event,
    activeSec: 0,
    idleSec: 0,
    deltaWords: 0,
    wordMarker,
    fullWordMarker,
    description: event,
  });
}

test('departure rows flush both absolute markers', () => {
  let body = buildInitialComment();
  body = appendRow(body, row('start', 100, 150));
  body = appendRow(body, row('pause:question', 125, 190));
  const departure = body
    .split('\n')
    .map(parseTimingRow)
    .find((candidate) => candidate?.event === 'pause:question');
  assert.equal(departure.wordMarker, '125');
  assert.equal(departure.fullWordMarker, '190');
});

test('a lifecycle opener after departure is preceded by canonical resumed', () => {
  let body = buildInitialComment();
  body = appendRow(body, row('start', 100, 150));
  body = appendRow(body, row('switch-out:#99', 125, 190));
  body = appendRow(body, row('develop:started', 200, 300));
  const events = body
    .split('\n')
    .map(parseTimingRow)
    .filter((candidate) => candidate?.ts?.startsWith('20'))
    .map((candidate) => candidate.event);
  assert.deepEqual(events, ['start', 'switch-out:#99', 'resumed', 'develop:started']);
});

test('departure-to-resume marker growth is excluded from own-issue phase words', () => {
  const body = [
    '| Timestamp | Event | Active | Idle | Δ Words | Word Marker | Description | Full Word Marker |',
    '|---|---|---|---|---|---|---|---|',
    '| 2026-08-07 10:00:00 -05:00 | develop:started |  |  | 0 | 59,800 | start | 70,000 |',
    '| 2026-08-07 10:01:00 -05:00 | switch-out:#99 |  |  | 50 | 59,850 | away | 70,100 |',
    '| 2026-08-07 10:02:00 -05:00 | resumed |  |  | 150 | 60,000 | back | 70,400 |',
  ].join('\n');
  const result = computePhaseCloseDelta(body, 'develop', '2026-08-07T15:03:00Z', 60_025);
  assert.equal(result.matched, true);
  assert.equal(result.deltaWords, 75);
});
