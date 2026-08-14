#!/usr/bin/env node
// @story #786
// Unit coverage for the value-report session-time field resolver. The board
// field was renamed "Session Time" → "Session" (#786); `readSessionMinutes`
// must resolve the new name first, fall back to the two legacy names, and
// normalize duration strings / numeric minutes to MINUTES.

import { strict as assert } from 'node:assert';
import { test } from 'node:test';

import { readSessionMinutes, sessionToMinutes } from '../../../reports/lib/session-field.mjs';

test('resolves the renamed `Session` duration string to minutes', () => {
  // 5h 03m 14s = 18194s / 60 = 303.233… minutes
  const mins = readSessionMinutes({ Session: '00d 05h 03m 14s' });
  assert.ok(Math.abs(mins - 18194 / 60) < 1e-9, `got ${mins}`);
});

test('falls back to legacy `Session Time` duration string when `Session` absent', () => {
  const mins = readSessionMinutes({ 'Session Time': '00d 01h 00m 00s' });
  assert.equal(mins, 60);
});

test('falls back to numeric `Actual Session Time` minutes when both durations absent', () => {
  const mins = readSessionMinutes({ 'Actual Session Time': 42 });
  assert.equal(mins, 42);
});

test('prefers `Session` over the legacy fallbacks when several are present', () => {
  const mins = readSessionMinutes({
    Session: '00d 00h 30m 00s',
    'Session Time': '00d 05h 00m 00s',
    'Actual Session Time': 999,
  });
  assert.equal(mins, 30);
});

test('returns null when no session field is present', () => {
  assert.equal(readSessionMinutes({}), null);
  assert.equal(readSessionMinutes(), null);
});

test('sessionToMinutes: empty string and unparseable string → null', () => {
  assert.equal(sessionToMinutes('  '), null);
  assert.equal(sessionToMinutes('not a duration'), null);
});

test('sessionToMinutes: number passthrough (legacy minutes)', () => {
  assert.equal(sessionToMinutes(123), 123);
});
