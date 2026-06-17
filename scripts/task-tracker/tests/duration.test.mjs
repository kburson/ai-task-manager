#!/usr/bin/env node
// @story #230
// #230 (child c of #238) — unit tests for `secondsToFloatHours`.
//
// Board "actuals" fields are written in float-hours at 5-digit precision so
// `Estimate − Actual` is a one-line subtraction in the field's native unit.

import { strict as assert } from 'node:assert';
import test from 'node:test';
import {
  secondsToFloatHours,
  formatDuration,
  parseDuration,
  MAX_DURATION_SECONDS,
} from '../lib/duration.mjs';

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

// #397 — fixed-width duration codec (DDd HHh MMm SSs).

test('formatDuration: canonical and boundary cases', () => {
  assert.equal(formatDuration(0), '00d 00h 00m 00s');
  assert.equal(formatDuration(45), '00d 00h 00m 45s');
  assert.equal(formatDuration(7425), '00d 02h 03m 45s'); // 2h 3m 45s
  assert.equal(formatDuration(86400), '01d 00h 00m 00s');
  assert.equal(formatDuration(MAX_DURATION_SECONDS), '99d 23h 59m 59s');
});

test('formatDuration: rejects negative, fractional, NaN, over-ceiling', () => {
  assert.throws(() => formatDuration(-1), RangeError);
  assert.throws(() => formatDuration(1.5), RangeError);
  assert.throws(() => formatDuration(NaN), RangeError);
  assert.throws(() => formatDuration(MAX_DURATION_SECONDS + 1), RangeError);
});

test('parseDuration: canonical and boundary cases', () => {
  assert.equal(parseDuration('00d 00h 00m 00s'), 0);
  assert.equal(parseDuration('00d 02h 03m 45s'), 7425);
  assert.equal(parseDuration('01d 00h 00m 00s'), 86400);
  assert.equal(parseDuration('99d 23h 59m 59s'), MAX_DURATION_SECONDS);
});

test('parseDuration: rejects malformed and out-of-range strings', () => {
  assert.throws(() => parseDuration(''), RangeError);
  assert.throws(() => parseDuration('0d 0h 0m 0s'), RangeError); // single-digit fields
  assert.throws(() => parseDuration('00d 25h 00m 00s'), RangeError); // hours > 23
  assert.throws(() => parseDuration('00d 00h 60m 00s'), RangeError); // minutes > 59
  assert.throws(() => parseDuration('00d 00h 00m 60s'), RangeError); // seconds > 59
  assert.throws(() => parseDuration('00d 00h 00m 00'), RangeError); // missing suffix
  assert.throws(() => parseDuration(' 00d 00h 00m 00s'), RangeError); // leading space
  assert.throws(() => parseDuration(42), RangeError); // non-string
});

test('round-trip: parseDuration(formatDuration(n)) === n across the domain', () => {
  const samples = [0, 1, 59, 60, 3599, 3600, 86399, 86400, 7425, 1234567, MAX_DURATION_SECONDS];
  for (const n of samples) {
    assert.equal(parseDuration(formatDuration(n)), n, `round-trip failed for ${n}`);
  }
  // stepped sweep across the full range
  for (let n = 0; n <= MAX_DURATION_SECONDS; n += 97777) {
    assert.equal(parseDuration(formatDuration(n)), n, `round-trip failed for ${n}`);
  }
});

test('formatDuration: lexical order equals numeric order', () => {
  const seconds = [0, 1, 59, 60, 3600, 86400, 90061, 1234567, MAX_DURATION_SECONDS];
  // shuffle deterministically then sort the formatted strings as text
  const shuffled = [...seconds].reverse();
  const byText = [...shuffled].map(formatDuration).sort();
  const byNumeric = [...seconds].sort((a, b) => a - b).map(formatDuration);
  assert.deepEqual(byText, byNumeric);
});
