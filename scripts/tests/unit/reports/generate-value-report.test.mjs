// @story #789
// #789 — unit coverage for the value report's board-field readers.
//
// The per-issue Product Backlog table repoints to the GitHub Project board's
// real custom fields (Engaged/Review/Plan/Started). These tests pin the pure
// reader helpers that back that repoint: Engaged-from-board, Accel =
// Estimate÷Engaged, Started-from-board with graceful absent fallback, and
// Review/Plan present-vs-absent.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  readEngagedMinutes,
  readDurationMinutes,
  readStartedAt,
  accelRatio,
  formatAcceleration,
} from '../../../reports/lib/board-fields.mjs';

test('readEngagedMinutes parses the board Engaged duration string to minutes', () => {
  // 00d 00h 40m 38s = 40 + 38/60 minutes
  const min = readEngagedMinutes({ Engaged: '00d 00h 40m 38s' });
  assert.ok(Math.abs(min - (40 + 38 / 60)) < 1e-9);
});

test('readEngagedMinutes returns null when the Engaged field is absent', () => {
  assert.equal(readEngagedMinutes({}), null);
  assert.equal(readEngagedMinutes({ Session: '00d 01h 00m 00s' }), null);
});

test('readEngagedMinutes distinguishes present-zero (0) from absent (null)', () => {
  assert.equal(readEngagedMinutes({ Engaged: '00d 00h 00m 00s' }), 0);
  assert.equal(readEngagedMinutes({}), null);
});

test('readDurationMinutes reads Review and Plan when present, null when absent', () => {
  const f = { Review: '00d 00h 04m 00s', Plan: '00d 00h 03m 00s' };
  assert.equal(readDurationMinutes(f, 'Review'), 4);
  assert.equal(readDurationMinutes(f, 'Plan'), 3);
  assert.equal(readDurationMinutes({ Review: '00d 00h 04m 00s' }, 'Plan'), null);
  assert.equal(readDurationMinutes({}, 'Review'), null);
});

test('readDurationMinutes present-zero Review/Plan yields 0, not null', () => {
  assert.equal(readDurationMinutes({ Review: '00d 00h 00m 00s' }, 'Review'), 0);
});

test('accelRatio computes Estimate ÷ Engaged(hours)', () => {
  // 4h estimate, 240 min (4h) engaged → 1.0×
  assert.equal(accelRatio(4, 240), 1);
  // 3h estimate, 90 min (1.5h) engaged → 2.0×
  assert.equal(accelRatio(3, 90), 2);
});

test('accelRatio is null when Engaged is absent or zero', () => {
  assert.equal(accelRatio(4, null), null);
  assert.equal(accelRatio(4, 0), null);
});

test('accelRatio is null when Estimate is absent', () => {
  assert.equal(accelRatio(null, 120), null);
});

test('formatAcceleration labels below-one outcomes plainly', () => {
  assert.equal(formatAcceleration(0.86), '0.86× (slower than Plan)');
  assert.equal(formatAcceleration(1.5), '1.50×');
  assert.equal(formatAcceleration(null), '—');
});

test('readStartedAt parses the board Started datetime to a Date', () => {
  const d = readStartedAt({ Started: '2026-07-06 19:11:03 -05:00' });
  assert.ok(d instanceof Date);
  assert.equal(Number.isNaN(d.getTime()), false);
  assert.equal(d.toISOString(), '2026-07-07T00:11:03.000Z');
});

test('readStartedAt degrades to null (no throw) when Started is absent', () => {
  assert.equal(readStartedAt({}), null);
  assert.equal(readStartedAt({ Session: '00d 01h 00m 00s' }), null);
});

test('readStartedAt returns null on an unparseable Started value', () => {
  assert.equal(readStartedAt({ Started: 'not-a-date' }), null);
  assert.equal(readStartedAt({ Started: '' }), null);
});
