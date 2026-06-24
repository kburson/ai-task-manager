// @story #531
// #531 AC2 — the test runner never surfaces a bare `(exit null)` and never
// buffer-kills a passing file. A signal-killed child reports its signal +
// elapsed ms; an errored child reports its `error.code`; the per-file
// maxBuffer is raised well above the 1 MB default.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { describeSpawnResult, RUN_TESTS_MAX_BUFFER } from '../../../run-tests-report.mjs';

test('clean exit reports ok', () => {
  assert.equal(describeSpawnResult({ status: 0 }), 'ok');
});

test('numeric non-zero exit reports the code', () => {
  const msg = describeSpawnResult({ status: 3 });
  assert.match(msg, /exit 3/);
});

test('signal kill reports the signal and elapsed ms, never bare exit null', () => {
  const msg = describeSpawnResult({
    status: null,
    signal: 'SIGTERM',
    error: null,
    elapsedMs: 600000,
  });
  assert.match(msg, /SIGTERM/);
  assert.match(msg, /600000\s*ms/);
  assert.doesNotMatch(msg, /exit null/);
});

test('errored child reports error.code (e.g. ENOBUFS), never bare exit null', () => {
  const msg = describeSpawnResult({
    status: null,
    signal: null,
    error: { code: 'ENOBUFS' },
    elapsedMs: 42,
  });
  assert.match(msg, /ENOBUFS/);
  assert.doesNotMatch(msg, /exit null/);
});

test('a status-null kill with no signal/error still names a cause, not exit null', () => {
  const msg = describeSpawnResult({ status: null, signal: null, error: null });
  assert.doesNotMatch(msg, /exit null/);
  assert.match(msg, /kill|unknown/i);
});

test('per-file maxBuffer is raised well above the 1 MB default', () => {
  assert.ok(
    RUN_TESTS_MAX_BUFFER > 1048576,
    `expected maxBuffer > 1 MB, got ${RUN_TESTS_MAX_BUFFER}`
  );
});
