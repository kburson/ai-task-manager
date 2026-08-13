// @story #1249
import assert from 'node:assert/strict';
import test from 'node:test';

import { proposeTimingIntervalRepair } from '../../../lib/heal-timing-interval.mjs';

const header = `⏱ Timing Log

| Timestamp | Event | Active | Idle | Δ Words | Word Marker | Description | Full Word Marker |
|---|---|---|---|---|---|---|---|`;

function row(ts, event, { active = '', idle = '', marker = 100, full = 200, sec } = {}) {
  const rowSec = sec ? ` <!-- row-sec: a=${sec.active} i=${sec.idle} -->` : '';
  return `| ${ts} | ${event} | ${active} | ${idle} |  | ${marker} | fixture | ${full} |${rowSec}`;
}

function developLog({ middle = [], complete = true } = {}) {
  const rows = [
    row('2026-08-13 10:00:00 -05:00', 'develop:started'),
    ...middle,
    ...(complete
      ? [
          row('2026-08-13 10:10:00 -05:00', 'develop:completed', {
            active: '0h 10m 00s',
            marker: 120,
            full: 240,
            sec: { active: 600, idle: 0 },
          }),
        ]
      : []),
  ];
  return `${header}\n${rows.join('\n')}\n`;
}

const interval = {
  start: '2026-08-13T10:02:00-05:00',
  end: '2026-08-13T10:06:00-05:00',
};

test('retroactive AFK repair inserts one authoritative pair and reclassifies exact seconds', () => {
  const result = proposeTimingIntervalRepair(developLog(), interval);

  assert.equal(result.status, 'repair');
  assert.equal(result.phaseEvent, 'develop:started');
  assert.equal(result.intervalSec, 240);
  assert.equal(result.before.totalActiveSec, 600);
  assert.equal(result.before.totalIdleSec, 0);
  assert.equal(result.after.totalActiveSec, 360);
  assert.equal(result.after.totalIdleSec, 240);
  assert.equal(result.body.match(/\| pause:retroactive \|/g)?.length, 1);
  assert.equal(result.body.match(/\| resumed \|/g)?.length, 1);
  assert.ok(
    result.body.indexOf('10:02:00 -05:00') < result.body.indexOf('10:06:00 -05:00'),
    'the pair is chronological'
  );
  assert.match(
    result.body,
    /10:02:00 -05:00 \| pause:retroactive \| {2}\| {2}\| {2}\| 100 \| retroactive AFK started \| 200 \| <!-- row-sec: a=0 i=0 -->/
  );
  assert.match(
    result.body,
    /10:06:00 -05:00 \| resumed \| {2}\| {2}\| {2}\| 100 \| retroactive AFK ended \| 200 \| <!-- row-sec: a=0 i=0 -->/
  );
  assert.match(result.body, /develop:completed \| 0h 06m 00s \| 0h 04m 00s .*row-sec: a=360 i=240/);
});

test('an open phase can be repaired without manufacturing a completed row', () => {
  const result = proposeTimingIntervalRepair(developLog({ complete: false }), interval);
  assert.equal(result.status, 'repair');
  assert.equal(result.after.totalActiveSec, 120);
  assert.equal(result.after.totalIdleSec, 240);
  assert.doesNotMatch(result.body, /develop:completed/);
});

test('an exact existing pair is idempotent and a partial pair is refused', () => {
  const applied = proposeTimingIntervalRepair(developLog(), interval);
  const repeated = proposeTimingIntervalRepair(applied.body, interval);
  assert.equal(repeated.status, 'already-applied');
  assert.equal(repeated.body, applied.body);

  const conflicted = applied.body.replace(
    /(?=\| 2026-08-13 10:06:00 -05:00 \| resumed)/,
    `${row('2026-08-13 10:04:00 -05:00', 'update')}\n`
  );
  assert.throws(
    () => proposeTimingIntervalRepair(conflicted, interval),
    /timing row.*inside|conflicting/i,
    'an exact pair is not idempotent when another row breaks its bracket'
  );

  const partial = developLog({
    middle: [row('2026-08-13 10:02:00 -05:00', 'pause:retroactive')],
  });
  assert.throws(() => proposeTimingIntervalRepair(partial, interval), /partial|conflicting/i);
});

test('invalid, reversed, boundary-crossing, and out-of-phase intervals refuse', () => {
  const body = developLog();
  assert.throws(
    () => proposeTimingIntervalRepair(body, { start: 'not-a-time', end: interval.end }),
    /start timestamp.*readable/i
  );
  assert.throws(
    () => proposeTimingIntervalRepair(body, { start: interval.end, end: interval.start }),
    /end timestamp.*after start/i
  );
  assert.throws(
    () =>
      proposeTimingIntervalRepair(body, {
        start: '2026-08-13T09:59:00-05:00',
        end: interval.end,
      }),
    /same lifecycle phase visit/i
  );

  const withPlan = `${developLog().trim()}\n${row('2026-08-13 10:11:00 -05:00', 'test:started')}\n`;
  assert.throws(
    () =>
      proposeTimingIntervalRepair(withPlan, {
        start: interval.start,
        end: '2026-08-13T10:12:00-05:00',
      }),
    /same lifecycle phase visit/i
  );
});

test('existing interruption overlap and rows inside the proposed bracket refuse before repair', () => {
  const paused = developLog({
    middle: [
      row('2026-08-13 10:03:00 -05:00', 'pause:question'),
      row('2026-08-13 10:05:00 -05:00', 'resumed'),
    ],
  });
  assert.throws(() => proposeTimingIntervalRepair(paused, interval), /overlaps.*interruption/i);

  const auditInside = developLog({
    middle: [row('2026-08-13 10:04:00 -05:00', 'update')],
  });
  assert.throws(() => proposeTimingIntervalRepair(auditInside, interval), /timing row.*inside/i);

  const unpaired = developLog({
    middle: [row('2026-08-13 10:01:00 -05:00', 'pause:question')],
  });
  assert.throws(() => proposeTimingIntervalRepair(unpaired, interval), /unpaired interruption/i);
});

test('malformed or out-of-order timing evidence refuses instead of being reordered', () => {
  const malformed = developLog().replace(
    '| 2026-08-13 10:10:00 -05:00 | develop:completed',
    '| unreadable | develop:completed'
  );
  assert.throws(() => proposeTimingIntervalRepair(malformed, interval), /malformed timing row/i);

  const missingCompletionCache = developLog().replace(/ <!-- row-sec: a=600 i=0 -->/, '');
  assert.throws(
    () => proposeTimingIntervalRepair(missingCompletionCache, interval),
    /completed row.*cache/i
  );

  const outOfOrder = developLog({
    middle: [row('2026-08-13 10:09:00 -05:00', 'update')],
  }).replace('2026-08-13 10:10:00 -05:00', '2026-08-13 10:08:00 -05:00');
  assert.throws(() => proposeTimingIntervalRepair(outOfOrder, interval), /chronological/i);
});
