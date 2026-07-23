// @story #756
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  writeMoveCompleteMarker,
  readMoveCompleteState,
  isMoveComplete,
} from '../../../../lib/move-state/sentinel.mjs';

test('writeMoveCompleteMarker upserts a single sentinel', () => {
  const b0 = 'Body text';
  const b1 = writeMoveCompleteMarker(b0, 'test', '2026-07-08T00:00:00.000Z');
  assert.match(b1, /<!-- aitm-move-complete state=test ts=2026-07-08T00:00:00\.000Z -->/);
  const b2 = writeMoveCompleteMarker(b1, 'review', '2026-07-08T01:00:00.000Z');
  assert.equal((b2.match(/aitm-move-complete/g) || []).length, 1, 'exactly one sentinel');
  assert.equal(readMoveCompleteState(b2), 'review');
});

test('readMoveCompleteState returns empty when absent', () => {
  assert.equal(readMoveCompleteState('no marker here'), '');
});

test('isMoveComplete requires sentinel AND status AND markers AND both rows', () => {
  const all = {
    sentinelState: 'test',
    statusState: 'test',
    entryMarkerPresent: true,
    exitRowPresent: true,
    entryRowPresent: true,
    target: 'test',
  };
  assert.equal(isMoveComplete(all), true);
  assert.equal(isMoveComplete({ ...all, sentinelState: '' }), false);
  assert.equal(isMoveComplete({ ...all, statusState: 'develop' }), false);
  assert.equal(isMoveComplete({ ...all, entryMarkerPresent: false }), false);
  assert.equal(isMoveComplete({ ...all, entryRowPresent: false }), false);
  assert.equal(isMoveComplete({ ...all, exitRowPresent: false }), false);
});
