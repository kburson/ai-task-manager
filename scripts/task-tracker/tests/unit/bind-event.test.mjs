import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveBindEvent, timingCommentHasRows } from '../../lib/bind-event.mjs';

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
