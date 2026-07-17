// #856 — honest rendering of a sandbox command's failure cause.
//
// `defaultExecInSandbox` (verbs/test.mjs) runs each Test-stage command through
// promisified `execFile`. On rejection it previously flattened every outcome to
// `exit: err.code ?? err.exitCode ?? 1`, so a command SIGTERM'd at the
// `AITM_SANDBOX_TIMEOUT_MS` ceiling — where Node leaves `err.code === null` and
// sets `err.killed`/`err.signal` — rendered as a bare `exit 1`, indistinguishable
// from a genuine assertion failure. That misread cost a full diagnosis cycle on
// #852.
//
// `describeSandboxFailure` turns the rejection into an operator-facing *cause*
// string that names the real reason: a timeout kill names the ceiling and the
// elapsed time; any other kill names its signal (or error code); a genuine
// non-zero exit keeps its real exit code. This is the same defect class #531
// fixed in the test runner via `describeSpawnResult` — which this reuses for the
// signal/exit wording, wrapping it only with the sandbox-specific timeout ceiling
// it cannot know about.

import { describeSpawnResult } from '../../run-tests-report.mjs';
import { SANDBOX_TIMEOUT_ENV } from './process-timeouts.mjs';

// Given an execFile rejection, the configured ceiling, and the elapsed wall
// time, return a cause string — or `null` for a genuine non-zero exit, whose
// existing `exit N` rendering the caller keeps by falling back to the numeric
// `exit` field.
//
// @param {object}  opts.err        the execFile rejection (`code`/`signal`/`killed`)
// @param {number} [opts.timeoutMs] the live ceiling from `sandboxTimeoutMs()`
// @param {number} [opts.elapsedMs] wall time from spawn to rejection
// @returns {string|null}
export function describeSandboxFailure({ err, timeoutMs, elapsedMs } = {}) {
  const e = err || {};
  const code = e.code;
  const signal = e.signal ?? null;
  const numericExit = typeof code === 'number' ? code : null;
  const elapsed = Number.isFinite(elapsedMs) ? elapsedMs : undefined;

  // A genuine non-zero exit — the process ran to completion and returned a
  // numeric code. Keep the pre-existing `exit N` rendering (caller falls back
  // to the numeric `exit` field); no special cause.
  if (numericExit !== null) return null;

  // Timeout kill: execFile itself killed the child (`killed: true`) with a
  // terminating signal, leaving no numeric exit and no *string* error code
  // (a string code such as `ENOBUFS`/`ENOENT` is a buffer/spawn failure, not a
  // wall-clock timeout). Name the ceiling that fired and how long it ran.
  const isStringErrCode = typeof code === 'string';
  if (e.killed === true && signal != null && !isStringErrCode) {
    const secs = Number.isFinite(elapsedMs) ? Math.round(elapsedMs / 1000) : null;
    const elapsedPart = secs != null ? ` after ${secs}s` : '';
    const ceilingPart = Number.isFinite(timeoutMs)
      ? ` (ceiling ${SANDBOX_TIMEOUT_ENV}=${timeoutMs}ms)`
      : '';
    return `timed out${elapsedPart}${ceilingPart}`;
  }

  // Any other kill — an external signal, a `maxBuffer` overflow (`ENOBUFS`), a
  // spawn failure (`ENOENT`) — defers to the #531 helper so the signal or error
  // code is named the same way the test runner names it.
  return describeSpawnResult({ status: null, signal, error: e, elapsedMs: elapsed });
}
