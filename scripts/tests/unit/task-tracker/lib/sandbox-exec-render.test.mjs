// @story #856
// #856 — a sandbox command killed at the `AITM_SANDBOX_TIMEOUT_MS` ceiling left
// `err.code === null`, so `verbs/test.mjs` rendered it as a bare `exit 1`,
// indistinguishable from a genuine assertion failure and misdirecting a full
// diagnosis cycle on #852. `describeSandboxFailure` turns the execFile rejection
// into an honest cause string.
//
// Pure assertions against the renderer — no child process is spawned; each case
// injects a hand-built error object shaped like Node's execFile rejection.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { describeSandboxFailure } from '../../../../task-tracker/lib/sandbox-exit-render.mjs';
import { SANDBOX_TIMEOUT_ENV } from '../../../../task-tracker/lib/process-timeouts.mjs';

const CEILING = 2_700_000; // 45 min

// AC1 — a timeout kill (execFile killed the child; code null, signal SIGTERM) is
// reported as a timeout naming the ceiling and the elapsed time, not `exit 1`.
test('timeout kill → names timeout, ceiling, and elapsed (not exit 1)', () => {
  const err = { killed: true, signal: 'SIGTERM', code: null, message: 'Command failed: npm test' };
  const cause = describeSandboxFailure({ err, timeoutMs: CEILING, elapsedMs: 2_701_500 });

  assert.ok(cause, 'a timeout kill must produce a cause string');
  assert.match(cause, /timed out/i, 'names the timeout');
  assert.match(cause, /after 2702s/, 'names the elapsed time in seconds');
  assert.ok(cause.includes(SANDBOX_TIMEOUT_ENV), 'names the ceiling env var');
  assert.ok(cause.includes(String(CEILING)), 'names the ceiling value');
  assert.doesNotMatch(cause, /exit 1\b/, 'does not render as a bare exit 1');
});

// AC2 — a kill by any other signal names that signal.
test('other-signal kill → names the signal', () => {
  const err = { killed: false, signal: 'SIGKILL', code: null };
  const cause = describeSandboxFailure({ err, timeoutMs: CEILING, elapsedMs: 1234 });

  assert.ok(cause, 'a signal kill must produce a cause string');
  assert.match(cause, /SIGKILL/, 'names the signal');
  assert.doesNotMatch(cause, /timed out/i, 'a non-timeout signal is not reported as a timeout');
});

// AC3 — a genuine non-zero exit keeps its real exit code (renderer returns null
// so the caller falls back to its numeric `exit N` rendering).
test('genuine non-zero exit → null cause, real exit code preserved by caller', () => {
  const err = { killed: false, signal: null, code: 2, stderr: 'AssertionError' };
  const cause = describeSandboxFailure({ err, timeoutMs: CEILING, elapsedMs: 900 });

  assert.equal(cause, null, 'a real exit yields no special cause — caller renders `exit 2`');
});

// A maxBuffer overflow is a kill but NOT a wall-clock timeout — it must name the
// error code, not claim a timeout.
test('maxBuffer overflow (string error code) → not reported as a timeout', () => {
  const err = { killed: true, signal: null, code: 'ENOBUFS' };
  const cause = describeSandboxFailure({ err, timeoutMs: CEILING, elapsedMs: 500 });

  assert.ok(cause, 'a maxBuffer kill must produce a cause string');
  assert.doesNotMatch(cause, /timed out/i, 'a buffer overflow is not a timeout');
  assert.match(cause, /ENOBUFS/, 'names the error code');
});

// The ceiling clause degrades gracefully when the elapsed/ceiling are unknown.
test('timeout kill with unknown ceiling/elapsed → still names a timeout', () => {
  const err = { killed: true, signal: 'SIGTERM', code: null };
  const cause = describeSandboxFailure({ err });

  assert.match(cause, /timed out/i, 'still names the timeout');
  assert.doesNotMatch(cause, /after/, 'omits the elapsed clause when unknown');
  assert.doesNotMatch(cause, /ceiling/, 'omits the ceiling clause when unknown');
});
