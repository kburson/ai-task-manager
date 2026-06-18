#!/usr/bin/env node
// @story #237
// Unit tests for formatDurationSeconds / parseDurationSeconds in
// scripts/task-tracker/lib/timing-rows.mjs (#237 — child a of #238).

import { strict as assert } from 'node:assert';
import { test } from 'node:test';

import { formatDurationSeconds, parseDurationSeconds } from '../../lib/timing-rows.mjs';

// AC1 — exact rendered form, hours not zero-padded, minutes/seconds zero-padded.
test('formatDurationSeconds renders the Xh Ym Zs form', () => {
  assert.equal(formatDurationSeconds(0), '0h 00m 00s');
  assert.equal(formatDurationSeconds(47), '0h 00m 47s');
  assert.equal(formatDurationSeconds(3852), '1h 04m 12s');
  assert.equal(formatDurationSeconds(43380), '12h 03m 00s');
});

// AC5 — boundary cases.
const BOUNDARIES = [0, 59, 60, 3599, 3600, 3661, 86399];
const EXPECTED = {
  0: '0h 00m 00s',
  59: '0h 00m 59s',
  60: '0h 01m 00s',
  3599: '0h 59m 59s',
  3600: '1h 00m 00s',
  3661: '1h 01m 01s',
  86399: '23h 59m 59s',
};

test('formatDurationSeconds handles boundary cases', () => {
  for (const n of BOUNDARIES) {
    assert.equal(formatDurationSeconds(n), EXPECTED[n], `format(${n})`);
  }
});

// AC2 — round-trip on the boundary cases plus the 24h endpoint.
test('parseDurationSeconds inverts formatDurationSeconds on boundaries', () => {
  for (const n of [...BOUNDARIES, 86400]) {
    assert.equal(parseDurationSeconds(formatDurationSeconds(n)), n, `round-trip(${n})`);
  }
});

// AC2 — round-trip property across the whole 0..86400 domain (stepped to
// keep the test fast while still covering every minute/second boundary).
test('parseDurationSeconds(format(n)) === n for 0 <= n <= 86400', () => {
  for (let n = 0; n <= 86400; n += 7) {
    assert.equal(parseDurationSeconds(formatDurationSeconds(n)), n, `round-trip(${n})`);
  }
  // Explicitly include the endpoints the stride may skip.
  for (const n of [86400, 86399, 86398, 1, 2, 3]) {
    assert.equal(parseDurationSeconds(formatDurationSeconds(n)), n, `round-trip(${n})`);
  }
});

test('formatDurationSeconds rejects invalid input', () => {
  assert.throws(() => formatDurationSeconds(-1), RangeError);
  assert.throws(() => formatDurationSeconds(1.5), RangeError);
  assert.throws(() => formatDurationSeconds(NaN), RangeError);
  assert.throws(() => formatDurationSeconds('60'), RangeError);
});

test('parseDurationSeconds rejects malformed strings', () => {
  assert.throws(() => parseDurationSeconds('1h 4m 12s'), RangeError); // minutes not zero-padded
  assert.throws(() => parseDurationSeconds('0h 60m 00s'), RangeError); // minutes out of range
  assert.throws(() => parseDurationSeconds('0h 00m 60s'), RangeError); // seconds out of range
  assert.throws(() => parseDurationSeconds('garbage'), RangeError);
  assert.throws(() => parseDurationSeconds(3661), TypeError);
});
