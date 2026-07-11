#!/usr/bin/env node
// @story #770
// Unit tests for bucketRowsByDay — per-local-calendar-day duration + distinct
// issue count with midnight proration.

import { strict as assert } from 'node:assert';
import { test } from 'node:test';

import { bucketRowsByDay } from '../lib/daily-activity.mjs';

// bucketRowsByDay buckets by the *runner's* local calendar. The fixtures below
// use -07:00 timestamps and assert Pacific-relative day keys, so pin the zone
// here (Node's process.env.TZ setter calls tzset()) to keep them self-consistent
// on any host. This runs before any test callback, so all new Date() calls see it.
process.env.TZ = 'America/Los_Angeles';

// Build a ⏱ Timing Log comment body from row tuples. Each row renders as a
// table line the parser accepts, with a `row-sec` marker carrying a/i seconds.
// `ts` is a wall-clock string with explicit offset so tsMs is deterministic
// regardless of the machine running the test.
function log(rows) {
  const header = [
    '### ⏱ Timing Log',
    '',
    '| Timestamp | Event | Active | Word Marker |',
    '| --- | --- | --- | --- |',
  ];
  const body = rows.map(
    (r) =>
      `| ${r.ts} | ${r.event ?? 'progress'} | ${r.activeMin ?? 0} | ${r.words ?? 0} | <!-- row-sec: a=${r.a ?? 0} i=${r.i ?? 0} -->`
  );
  return [...header, ...body].join('\n');
}

test('single-day window places the whole payload on one day', () => {
  // Two rows an hour apart, same local day. Window = [start, second row].
  // payload = a+i = 3000+600 = 3600s, all on 2026-03-10.
  const body = log([
    { ts: '2026-03-10 09:00:00 -07:00', event: 'start', a: 0, i: 0 },
    { ts: '2026-03-10 10:00:00 -07:00', event: 'progress', a: 3000, i: 600 },
  ]);
  const buckets = bucketRowsByDay([{ number: 1, body }], {});
  assert.equal(buckets.length, 1);
  assert.equal(buckets[0].date, '2026-03-10');
  assert.equal(buckets[0].durationSec, 3600);
  assert.equal(buckets[0].issueCount, 1);
});

test('midnight-crossing window prorates across two days in the right ratio', () => {
  // Window 23:00 -> 01:00 (-07:00), payload 3600s. 1h before local midnight,
  // 1h after → 1800s each on 03-10 and 03-11.
  const body = log([
    { ts: '2026-03-10 23:00:00 -07:00', event: 'start', a: 0, i: 0 },
    { ts: '2026-03-11 01:00:00 -07:00', event: 'progress', a: 3600, i: 0 },
  ]);
  const buckets = bucketRowsByDay([{ number: 7, body }], {});
  const byDate = Object.fromEntries(buckets.map((b) => [b.date, b]));
  assert.equal(byDate['2026-03-10'].durationSec, 1800);
  assert.equal(byDate['2026-03-11'].durationSec, 1800);
  assert.equal(byDate['2026-03-10'].issueCount, 1);
  assert.equal(byDate['2026-03-11'].issueCount, 1);
});

test('multi-midnight window splits across every crossed boundary', () => {
  // 48h window (2 midnights) → 3 days, middle full day gets the largest share.
  const body = log([
    { ts: '2026-03-10 12:00:00 -07:00', event: 'start', a: 0, i: 0 },
    { ts: '2026-03-12 12:00:00 -07:00', event: 'progress', a: 172800, i: 0 },
  ]);
  const buckets = bucketRowsByDay([{ number: 3, body }], {});
  const byDate = Object.fromEntries(buckets.map((b) => [b.date, b.durationSec]));
  // 12h + 24h + 12h of a 48h window carrying 172800s → 43200 / 86400 / 43200.
  assert.equal(byDate['2026-03-10'], 43200);
  assert.equal(byDate['2026-03-11'], 86400);
  assert.equal(byDate['2026-03-12'], 43200);
});

test('distinct issue count: same day two issues → 2; one issue over N days → 1 each', () => {
  const a = log([
    { ts: '2026-03-10 09:00:00 -07:00', event: 'start', a: 0, i: 0 },
    { ts: '2026-03-10 10:00:00 -07:00', event: 'progress', a: 3600, i: 0 },
  ]);
  const b = log([
    { ts: '2026-03-10 14:00:00 -07:00', event: 'start', a: 0, i: 0 },
    { ts: '2026-03-11 14:00:00 -07:00', event: 'progress', a: 86400, i: 0 },
  ]);
  const buckets = bucketRowsByDay([{ number: 1, body: a }, { number: 2, body: b }], {});
  const byDate = Object.fromEntries(buckets.map((x) => [x.date, x]));
  assert.equal(byDate['2026-03-10'].issueCount, 2); // issues 1 and 2
  assert.equal(byDate['2026-03-11'].issueCount, 1); // issue 2 only
});

test('window clamp drops out-of-range days', () => {
  const body = log([
    { ts: '2026-03-10 09:00:00 -07:00', event: 'start', a: 0, i: 0 },
    { ts: '2026-03-10 10:00:00 -07:00', event: 'progress', a: 3600, i: 0 },
    { ts: '2026-03-20 09:00:00 -07:00', event: 'progress', a: 3600, i: 0 },
  ]);
  // Clamp to 03-15..03-31 → only the 03-20 window's day survives.
  const fromMs = new Date(2026, 2, 15, 0, 0, 0, 0).getTime();
  const toMs = new Date(2026, 2, 31, 23, 59, 59, 999).getTime();
  const buckets = bucketRowsByDay([{ number: 5, body }], { fromMs, toMs });
  const dates = buckets.map((b) => b.date);
  assert.ok(!dates.includes('2026-03-10'), 'pre-window day dropped');
  assert.ok(dates.includes('2026-03-20'), 'in-window day kept');
});

test('contiguous fill: an empty interior day is a zero bucket', () => {
  const body = log([
    { ts: '2026-03-10 09:00:00 -07:00', event: 'start', a: 0, i: 0 },
    { ts: '2026-03-10 10:00:00 -07:00', event: 'progress', a: 3600, i: 0 },
    { ts: '2026-03-12 09:00:00 -07:00', event: 'start', a: 0, i: 0 },
    { ts: '2026-03-12 10:00:00 -07:00', event: 'progress', a: 3600, i: 0 },
  ]);
  const buckets = bucketRowsByDay([{ number: 8, body }], {});
  const byDate = Object.fromEntries(buckets.map((b) => [b.date, b]));
  assert.equal(buckets.length, 3, '03-10, 03-11 (empty), 03-12');
  assert.equal(byDate['2026-03-11'].durationSec, 0);
  assert.equal(byDate['2026-03-11'].issueCount, 0);
});

test('degenerate same-second rows: no divide-by-zero, whole payload placed', () => {
  const body = log([
    { ts: '2026-03-10 09:00:00 -07:00', event: 'start', a: 0, i: 0 },
    { ts: '2026-03-10 09:00:00 -07:00', event: 'progress', a: 120, i: 0 },
  ]);
  const buckets = bucketRowsByDay([{ number: 9, body }], {});
  assert.equal(buckets.length, 1);
  assert.equal(buckets[0].date, '2026-03-10');
  assert.equal(buckets[0].durationSec, 120);
});

test('legacy rows without a row-sec marker derive seconds from Active minutes', () => {
  // No `<!-- row-sec -->` marker → activeSec = activeMin*60, idleSec = 0.
  const header = [
    '### ⏱ Timing Log',
    '',
    '| Timestamp | Event | Active | Word Marker |',
    '| --- | --- | --- | --- |',
  ];
  const rows = [
    '| 2026-03-10 09:00:00 -07:00 | start | 0 | 0 |',
    '| 2026-03-10 10:00:00 -07:00 | progress | 60 | 0 |',
  ];
  const body = [...header, ...rows].join('\n');
  const buckets = bucketRowsByDay([{ number: 4, body }], {});
  assert.equal(buckets[0].durationSec, 3600, '60 Active min → 3600s');
});
