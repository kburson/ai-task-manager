import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  backfillTimingBody,
  DEFAULT_SANITY_CAP_SEC,
  UNRECOVERABLE_MARKER,
} from '../backfill-timing-logs.mjs';

// Fixture: a ⏱ Timing Log comment with three legacy `0 | 0` candidate rows —
//   1. clean recoverable (5-min gap, no pause)
//   2. recoverable with a pause window inside the bracket (pause is idle)
//   3. unrecoverable — previous row is 14 days earlier (cross-session gap),
//      so the recovered active span blows past the sanity cap.
// A leading `start` row already carries a row-second marker (post-#159 shape)
// and must be left untouched while still serving as the bracket for row 1.
function fixture() {
  return [
    '⏱ Timing Log',
    '',
    '| Timestamp | Event | Active | Idle | Δ Words | Word Marker | Description |',
    '|---|---|---|---|---|---|---|',
    '| 2026-01-01 09:00:00 -05:00 | start | 0h 00m 00s | 0h 00m 00s | 0 | 100 | solo | <!-- row-sec: a=0 i=0 -->',
    '| 2026-01-01 09:05:00 -05:00 | refine:done | 0 | 0 | 0 | 0 | refinement completed |',
    '<!-- aitm-pause: from=2026-01-01T09:10:00-05:00 until=2026-01-01T09:20:00-05:00 reason=lunch -->',
    '| 2026-01-01 09:30:00 -05:00 | plan:done | 0 | 0 | 0 | 0 | plan completed |',
    '| 2026-01-15 09:00:00 -05:00 | develop:done | 0 | 0 | 0 | 0 | development complete |',
  ].join('\n');
}

test('backfills recoverable rows and tags the cross-session row unrecoverable', () => {
  const { newBody, stats } = backfillTimingBody(fixture());
  assert.equal(stats.candidates, 3);
  assert.equal(stats.backfilled, 2);
  assert.equal(stats.unrecoverable, 1);

  const lines = newBody.split('\n');
  const refine = lines.find((l) => l.includes('refine:done'));
  const plan = lines.find((l) => l.includes('plan:done'));
  const dev = lines.find((l) => l.includes('development complete'));

  // Row 1: clean 5-min active span.
  assert.match(refine, /\| 0h 05m 00s \| 0h 00m 00s \|/);
  assert.match(refine, /<!-- row-sec: a=300 i=0 -->/);

  // Row 2: 25-min bracket minus a 10-min pause → 15m active, 10m idle.
  assert.match(plan, /\| 0h 15m 00s \| 0h 10m 00s \|/);
  assert.match(plan, /<!-- row-sec: a=900 i=600 -->/);

  // Row 3: cross-session gap → tagged, cells untouched.
  assert.ok(dev.includes(UNRECOVERABLE_MARKER));
  assert.match(dev, /\| develop:done \| 0 \| 0 \|/);
});

test('preserves all other comment content', () => {
  const { newBody } = backfillTimingBody(fixture());
  assert.ok(newBody.startsWith('⏱ Timing Log\n'));
  assert.ok(
    newBody.includes('| Timestamp | Event | Active | Idle | Δ Words | Word Marker | Description |')
  );
  // The post-#159 start row (already has a marker) is untouched.
  assert.ok(
    newBody.includes(
      '| 2026-01-01 09:00:00 -05:00 | start | 0h 00m 00s | 0h 00m 00s | 0 | 100 | solo | <!-- row-sec: a=0 i=0 -->'
    )
  );
  // The pause marker line survives verbatim.
  assert.ok(
    newBody.includes(
      '<!-- aitm-pause: from=2026-01-01T09:10:00-05:00 until=2026-01-01T09:20:00-05:00 reason=lunch -->'
    )
  );
});

test('idempotent: a second pass makes no further changes', () => {
  const first = backfillTimingBody(fixture());
  const second = backfillTimingBody(first.newBody);
  assert.equal(second.newBody, first.newBody);
  assert.equal(second.stats.backfilled, 0);
  assert.equal(second.stats.unrecoverable, 0);
});

test('a row with no prior bracket is unrecoverable', () => {
  const body = [
    '⏱ Timing Log',
    '',
    '| Timestamp | Event | Active | Idle | Δ Words | Word Marker | Description |',
    '|---|---|---|---|---|---|---|',
    '| 2026-02-01 10:00:00 -05:00 | start | 0 | 0 | 0 | 0 | solo |',
  ].join('\n');
  const { newBody, stats } = backfillTimingBody(body);
  assert.equal(stats.candidates, 1);
  assert.equal(stats.unrecoverable, 1);
  assert.ok(newBody.split('\n').pop().includes(UNRECOVERABLE_MARKER));
});

test('--cap-hours override widens what counts as recoverable', () => {
  // A 14-hour gap is unrecoverable under the 12h default but recoverable
  // when the cap is raised to 24h.
  const body = [
    '⏱ Timing Log',
    '',
    '| Timestamp | Event | Active | Idle | Δ Words | Word Marker | Description |',
    '|---|---|---|---|---|---|---|',
    '| 2026-03-01 08:00:00 -05:00 | start | 0h 00m 00s | 0h 00m 00s | 0 | 0 | solo | <!-- row-sec: a=0 i=0 -->',
    '| 2026-03-01 22:00:00 -05:00 | develop:done | 0 | 0 | 0 | 0 | development complete |',
  ].join('\n');
  const def = backfillTimingBody(body);
  assert.equal(def.stats.unrecoverable, 1);
  assert.equal(def.stats.backfilled, 0);
  assert.ok(DEFAULT_SANITY_CAP_SEC < 14 * 3600);

  const wide = backfillTimingBody(body, { sanityCapSec: 24 * 3600 });
  assert.equal(wide.stats.backfilled, 1);
  assert.equal(wide.stats.unrecoverable, 0);
  assert.match(wide.newBody, /\| 14h 00m 00s \| 0h 00m 00s \|/);
});
