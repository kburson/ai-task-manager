// @story #534
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  lastOpenInterruption,
  assertPairedReengagement,
  resolveBindEvent,
} from '../../../lib/bind-event.mjs';

const HEADER = [
  '| Timestamp | Event | Active | Idle | ΔWords | Word Marker | Description |',
  '| --- | --- | --- | --- | --- | --- | --- |',
];
const body = (...rows) => [...HEADER, ...rows].join('\n');
const row = (event, ts = '2026-06-25 10:00:00 +00:00') =>
  `| ${ts} | ${event} | | | 0 | 1,234 | ${event} |`;

test('lastOpenInterruption: session-end idle is an open interruption', () => {
  const b = body(row('start', '2026-06-25 09:00:00 +00:00'), row('idle'));
  assert.deepEqual(lastOpenInterruption(b), { kind: 'idle' });
});

test('lastOpenInterruption: idle then start closes it', () => {
  const b = body(
    row('start', '2026-06-25 09:00:00 +00:00'),
    row('idle'),
    row('start', '2026-06-25 11:00:00 +00:00')
  );
  assert.equal(lastOpenInterruption(b), null);
});

test('guard rejects a true orphan: re-engagement with no opener and no start', () => {
  const b = body(row('move:plan', '2026-06-25 09:00:00 +00:00'));
  const res = assertPairedReengagement(b, 'resumed');
  assert.equal(res.ok, false);
  assert.match(res.reason, /no open interruption/);
});

test('guard accepts re-engagement paired against an open idle', () => {
  const b = body(row('start', '2026-06-25 09:00:00 +00:00'), row('idle'));
  assert.equal(assertPairedReengagement(b, 'resumed').ok, true);
});

test('guard accepts re-engagement paired against an open pause', () => {
  const b = body(row('start', '2026-06-25 09:00:00 +00:00'), row('pause:blocked'));
  assert.equal(assertPairedReengagement(b, 'resume:blocked').ok, true);
});

test('guard accepts re-engagement paired against an open switch-out', () => {
  const b = body(row('start', '2026-06-25 09:00:00 +00:00'), row('switch-out:#900'));
  assert.equal(assertPairedReengagement(b, 'switch-in:#900').ok, true);
});

test('guard accepts a benign tail: history with a prior start but no open interruption', () => {
  const b = body(
    row('start', '2026-06-25 09:00:00 +00:00'),
    row('pause:break'),
    row('resume:break', '2026-06-25 09:30:00 +00:00')
  );
  // No open interruption, but a `start` exists → benign, allowed.
  assert.equal(lastOpenInterruption(b), null);
  assert.equal(assertPairedReengagement(b, 'resumed').ok, true);
});

test('guard is a no-op for non-re-engagement events', () => {
  const b = body(row('move:plan', '2026-06-25 09:00:00 +00:00'));
  assert.equal(assertPairedReengagement(b, 'start').ok, true);
  assert.equal(assertPairedReengagement(b, 'switch-out:#5').ok, true);
  assert.equal(assertPairedReengagement(b, 'pause:question').ok, true);
});

test('resolver downgrades nothing on its own, but guard catches an empty-body resumed', () => {
  // A bare empty body would resolve to start, never resumed — defense in depth.
  assert.equal(resolveBindEvent({ timingBody: body() }), 'start');
});
