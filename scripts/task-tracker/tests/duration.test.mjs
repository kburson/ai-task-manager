#!/usr/bin/env node
// #230 (child c of #238) — unit tests for `secondsToFloatHours`.
//
// Board "actuals" fields are written in float-hours at 5-digit precision so
// `Estimate − Actual` is a one-line subtraction in the field's native unit.

import { strict as assert } from 'node:assert';
import test from 'node:test';
import { secondsToFloatHours } from '../lib/duration.mjs';

test('secondsToFloatHours: AC5 canonical cases', () => {
  // 0s → 0.00000h, 3600s → 1.00000h, 1415s → 0.39306h (1415/3600 = 0.39305…).
  assert.equal(secondsToFloatHours(0), 0);
  assert.equal(secondsToFloatHours(3600), 1);
  assert.equal(secondsToFloatHours(1415), 0.39306);
});

test('secondsToFloatHours: default precision is 5 decimals', () => {
  // toFixed(5) rounds half-up at the 5th decimal: 1/3 h = 0.083333… → 0.08333.
  assert.equal(secondsToFloatHours(300), 0.08333);
  // A value requiring round-up at the 5th place: 7199s = 1.99972…h.
  assert.equal(secondsToFloatHours(7199), 1.99972);
});

test('secondsToFloatHours: digits override', () => {
  assert.equal(secondsToFloatHours(1415, 2), 0.39);
  assert.equal(secondsToFloatHours(1415, 0), 0);
  assert.equal(secondsToFloatHours(5400, 1), 1.5);
  // Out-of-range / non-integer digits fall back to the 5-decimal default.
  assert.equal(secondsToFloatHours(1415, -1), 0.39306);
  assert.equal(secondsToFloatHours(1415, 2.5), 0.39306);
});

test('secondsToFloatHours: non-finite input → null (skip the write)', () => {
  assert.equal(secondsToFloatHours(null), null);
  assert.equal(secondsToFloatHours(undefined), null);
  assert.equal(secondsToFloatHours(NaN), null);
  assert.equal(secondsToFloatHours('not-a-number'), null);
});

test('secondsToFloatHours: numeric strings are coerced', () => {
  assert.equal(secondsToFloatHours('3600'), 1);
});
