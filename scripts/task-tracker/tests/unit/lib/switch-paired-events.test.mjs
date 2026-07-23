// @story #534
// @story #568
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveBindEvent, lastOpenInterruption } from '../../../lib/bind-event.mjs';

const HEADER = [
  '| Timestamp | Event | Active | Idle | ΔWords | Word Marker | Description |',
  '| --- | --- | --- | --- | --- | --- | --- |',
];

function body(...rows) {
  return [...HEADER, ...rows].join('\n');
}

function row(event, ts = '2026-06-25 10:00:00 +00:00') {
  return `| ${ts} | ${event} | | | 0 | 1,234 | ${event} desc |`;
}

test('outgoing switch records a switch-out:#N opener that reads back as open', () => {
  const b = body(row('start', '2026-06-25 09:00:00 +00:00'), row('switch-out:#600'));
  assert.deepEqual(lastOpenInterruption(b), { kind: 'switch-out', peer: '#600' });
});

test('returning into an issue with an open switch-out:#N resolves to resumed', () => {
  // #568 — `resumed` is the sole return verb; it closes the open switch-out
  // regardless of which peer the departure named.
  const b = body(row('start', '2026-06-25 09:00:00 +00:00'), row('switch-out:#600'));
  assert.equal(resolveBindEvent({ hasTimingHistory: true, timingBody: b }), 'resumed');
});

test('a genuine first-ever bind (empty log) still resolves to start', () => {
  assert.equal(resolveBindEvent({ hasTimingHistory: false, timingBody: body() }), 'start');
});

test('switch into an issue with history but no open interruption → benign resumed', () => {
  const b = body(
    row('start', '2026-06-25 09:00:00 +00:00'),
    row('switch-out:#600'),
    row('resumed', '2026-06-25 10:30:00 +00:00')
  );
  // switch-out already closed by the resumed → no open interruption.
  assert.equal(lastOpenInterruption(b), null);
  assert.equal(resolveBindEvent({ hasTimingHistory: true, timingBody: b }), 'resumed');
});

test('a later switch-out re-opens after a prior closed round-trip', () => {
  const b = body(
    row('start', '2026-06-25 09:00:00 +00:00'),
    row('switch-out:#600'),
    row('resumed', '2026-06-25 10:30:00 +00:00'),
    row('switch-out:#700', '2026-06-25 11:00:00 +00:00')
  );
  assert.deepEqual(lastOpenInterruption(b), { kind: 'switch-out', peer: '#700' });
  // #568 — returning again resolves to `resumed`, not `switch-in:#700`.
  assert.equal(resolveBindEvent({ hasTimingHistory: true, timingBody: b }), 'resumed');
});
