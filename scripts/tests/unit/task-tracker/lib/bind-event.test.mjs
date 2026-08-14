// @story #482 #568 #981
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  resolveBindEvent,
  timingCommentHasRows,
  lastOpenInterruption,
  detectUnmarkedDepartureGap,
  SUSPICIOUS_GAP_SEC,
} from '../../../../task-tracker/lib/bind-event.mjs';

const NOW = new Date().toISOString().replace('T', ' ').replace(/\..*/, ' +00:00');
const dataRow = (event) => `| ${NOW} | ${event} | 0s | 0s | 0 | 1,234 | row |`;
const log = (...events) =>
  [
    '| Timestamp | Event | Active | Idle | ΔWords | Word Marker | Description |',
    '| --- | --- | --- | --- | --- | --- | --- |',
    ...events.map(dataRow),
  ].join('\n');

test('resolveBindEvent: fresh bind (no history, not paused) → start', () => {
  assert.equal(resolveBindEvent({ hasTimingHistory: false, paused: false }), 'start');
});

test('resolveBindEvent: rebind with existing timing history → resumed', () => {
  assert.equal(resolveBindEvent({ hasTimingHistory: true, paused: false }), 'resumed');
});

test('resolveBindEvent: no-arg resume after pause → resumed (even with no history)', () => {
  assert.equal(resolveBindEvent({ hasTimingHistory: false, paused: true }), 'resumed');
});

test('resolveBindEvent: paused dominates history flag → resumed', () => {
  assert.equal(resolveBindEvent({ hasTimingHistory: true, paused: true }), 'resumed');
});

test('resolveBindEvent: defaults (no args) → start', () => {
  assert.equal(resolveBindEvent(), 'start');
});

test('timingCommentHasRows: empty / missing body → false', () => {
  assert.equal(timingCommentHasRows(''), false);
  assert.equal(timingCommentHasRows(null), false);
  assert.equal(timingCommentHasRows(undefined), false);
});

test('timingCommentHasRows: header + separator only → false', () => {
  const body = [
    '## ⏱ Timing Log',
    '',
    '| Timestamp | Event | Active | Idle | ΔWords | Word Marker | Description |',
    '| --- | --- | --- | --- | --- | --- | --- |',
  ].join('\n');
  assert.equal(timingCommentHasRows(body), false);
});

test('timingCommentHasRows: a real data row → true', () => {
  const body = [
    '| Timestamp | Event | Active | Idle | ΔWords | Word Marker | Description |',
    '| --- | --- | --- | --- | --- | --- | --- |',
    '| 2026-06-21 13:23:36 +00:00 | start | 0s | 0s | 0 | 1,234 | Started:Solo |',
  ].join('\n');
  assert.equal(timingCommentHasRows(body), true);
});

test('timingCommentHasRows: tolerates a T-delimited ISO timestamp cell', () => {
  const body = '| 2026-06-21T13:23:36Z | resumed | 0s | 0s | 0 | 1,234 | task resumed |';
  assert.equal(timingCommentHasRows(body), true);
});

// ---- #568 AC5: `resumed` is the sole return verb ---------------------------

test('resolveBindEvent: re-engagement over an open switch-out:#7 → resumed (never switch-in)', () => {
  const body = log('start', 'switch-out:#7');
  assert.equal(resolveBindEvent({ timingBody: body }), 'resumed');
});

test('resolveBindEvent: re-engagement over an open pause:meeting → resumed (never resume:reason)', () => {
  const body = log('start', 'pause:meeting');
  assert.equal(resolveBindEvent({ timingBody: body }), 'resumed');
});

test('resolveBindEvent: history with no open interruption → resumed', () => {
  const body = log('start', 'pause', 'resumed');
  assert.equal(resolveBindEvent({ timingBody: body }), 'resumed');
});

test('resolveBindEvent: empty log (positive confirmation) still → start', () => {
  const body = log(); // header + separator only, no data rows
  assert.equal(resolveBindEvent({ timingBody: body }), 'start');
});

// #568 AC5 — `resumed` closes BOTH departure kinds (switch-out AND pause).
test('a resumed closer clears an open switch-out interruption', () => {
  assert.equal(lastOpenInterruption(log('start', 'switch-out:#7')).kind, 'switch-out');
  assert.equal(lastOpenInterruption(log('start', 'switch-out:#7', 'resumed')), null);
});

test('a resumed closer clears an open pause interruption', () => {
  assert.equal(lastOpenInterruption(log('start', 'pause:meeting')).kind, 'pause');
  assert.equal(lastOpenInterruption(log('start', 'pause:meeting', 'resumed')), null);
});

// ---- #568 AC2: bind fails CLOSED on an unreadable timing comment ------------

test('resolveBindEvent: read error mid-lifetime → resumed, NEVER a second start', () => {
  // tcBody collapsed to '' by a failed read, but readStatus carries the truth.
  const ev = resolveBindEvent({
    hasTimingHistory: false,
    paused: false,
    timingBody: '',
    readStatus: 'error',
  });
  assert.equal(ev, 'resumed');
  assert.notEqual(ev, 'start');
});

test('resolveBindEvent: read error dominates even the empty-history defaults', () => {
  assert.equal(resolveBindEvent({ readStatus: 'error' }), 'resumed');
  assert.equal(resolveBindEvent({ hasTimingHistory: false, readStatus: 'error' }), 'resumed');
});

test('resolveBindEvent: positive-empty read (absent) → start', () => {
  assert.equal(
    resolveBindEvent({ hasTimingHistory: false, timingBody: '', readStatus: 'absent' }),
    'start'
  );
});

// ---- #981: detectUnmarkedDepartureGap ---------------------------------------
// Reproduces the #880/#879 shape: a phase's `:started` row sits unclosed while
// the session dies without emitting a departure event, and the gap to the next
// bind exceeds SUSPICIOUS_GAP_SEC with no pause/switch-out row bracketing it.

const rowAt = (ts, event, fullWordMarker = '2,468') =>
  `| ${ts} | ${event} | 0s | 0s | 0 | 1,234 | row | ${fullWordMarker} |`;
const logAt = (...rows) =>
  [
    '| Timestamp | Event | Active | Idle | ΔWords | Word Marker | Description | Full Word Marker |',
    '| --- | --- | --- | --- | --- | --- | --- | --- |',
    ...rows,
  ].join('\n');

test('detectUnmarkedDepartureGap: long gap with no departure row → detected', () => {
  const started = '2026-07-24 04:17:40 +00:00';
  const nowTs = '2026-07-27 07:18:22 +00:00'; // ~75h later, no departure row in between
  const body = logAt(rowAt(started, 'plan:started'));
  const gap = detectUnmarkedDepartureGap(body, nowTs);
  assert.ok(gap, 'expected an unmarked-departure gap to be detected');
  assert.equal(gap.lastRowTs, started);
  assert.equal(gap.lastRowEvent, 'plan:started');
  assert.equal(gap.fullWordMarker, '2,468');
  assert.ok(gap.gapSec > SUSPICIOUS_GAP_SEC);
  assert.equal(gap.syntheticTs, new Date(Date.parse('2026-07-24T04:17:41+00:00')).toISOString());
});

test('detectUnmarkedDepartureGap: same-issue activity inside the gap suppresses idle synthesis', () => {
  const started = '2026-08-03 19:29:13 -05:00';
  const nowTs = '2026-08-04 06:43:29 -05:00';
  const body = logAt(rowAt(started, 'develop:started'));

  assert.equal(
    detectUnmarkedDepartureGap(body, nowTs, SUSPICIOUS_GAP_SEC, {
      activityTimestamps: ['2026-08-04T06:35:57-05:00'],
    }),
    null
  );
});

test('detectUnmarkedDepartureGap: boundary, outside, and malformed activity do not suppress recovery', () => {
  const started = '2026-08-03 19:29:13 -05:00';
  const nowTs = '2026-08-04 06:43:29 -05:00';
  const body = logAt(rowAt(started, 'develop:started'));

  assert.ok(
    detectUnmarkedDepartureGap(body, nowTs, SUSPICIOUS_GAP_SEC, {
      activityTimestamps: [
        started,
        '2026-08-03T18:00:00-05:00',
        '2026-08-04T06:43:30-05:00',
        'not-a-date',
      ],
    })
  );
});

test('detectUnmarkedDepartureGap: gap below threshold → null', () => {
  const started = '2026-07-24 04:17:40 +00:00';
  const nowTs = '2026-07-24 05:17:40 +00:00'; // 1h later
  const body = logAt(rowAt(started, 'plan:started'));
  assert.equal(detectUnmarkedDepartureGap(body, nowTs), null);
});

test('detectUnmarkedDepartureGap: already bracketed by an open departure → null', () => {
  const body = logAt(
    rowAt('2026-07-24 04:17:40 +00:00', 'plan:started'),
    rowAt('2026-07-24 04:20:00 +00:00', 'pause:meeting')
  );
  const nowTs = '2026-07-27 07:18:22 +00:00';
  assert.equal(detectUnmarkedDepartureGap(body, nowTs), null);
});

test('detectUnmarkedDepartureGap: last row itself a departure event → null', () => {
  const body = logAt(rowAt('2026-07-24 04:17:40 +00:00', 'switch-out:#7'));
  const nowTs = '2026-07-27 07:18:22 +00:00';
  assert.equal(detectUnmarkedDepartureGap(body, nowTs), null);
});

test('detectUnmarkedDepartureGap: empty/missing body → null', () => {
  assert.equal(detectUnmarkedDepartureGap('', '2026-07-27 07:18:22 +00:00'), null);
  assert.equal(detectUnmarkedDepartureGap(null, '2026-07-27 07:18:22 +00:00'), null);
});

test('detectUnmarkedDepartureGap: no data rows (header only) → null', () => {
  const body = logAt();
  assert.equal(detectUnmarkedDepartureGap(body, '2026-07-27 07:18:22 +00:00'), null);
});
