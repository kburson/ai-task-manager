// #531 AC2 — pure helpers for `run-tests.mjs` failure reporting.
//
// Extracted so the kill-cause formatting and the per-file buffer ceiling are
// unit-testable. The runner previously inspected only `res.status` and printed
// `FAIL (exit ${status})`; a signal-killed child has `status === null`, so every
// kill collapsed to an uninformative `FAIL (exit null)`. These helpers ensure a
// kill always names its real cause (signal / error.code / elapsed ms), and a
// passing-but-chatty file is never buffer-killed by the 1 MB spawnSync default.

// Per-file stdout+stderr ceiling. The default spawnSync maxBuffer is 1 MB; a
// verbose-but-passing file could exceed it and be killed (status null,
// error.code ENOBUFS) indistinguishably from a real hang. 64 MB is generous
// headroom over any real test file's output.
export const RUN_TESTS_MAX_BUFFER = 64 * 1024 * 1024;

// Describe a spawnSync result for the runner log. Returns `'ok'` for a clean
// exit; otherwise a `FAIL (...)` string that always names a concrete cause —
// never a bare `exit null`.
export function describeSpawnResult({ status, signal, error, elapsedMs } = {}) {
  if (status === 0) return 'ok';
  if (typeof status === 'number') return `FAIL (exit ${status})`;

  // status === null → the child was killed or never ran. Surface every signal
  // we have so the failure self-diagnoses.
  const parts = [];
  if (signal) parts.push(`signal ${signal}`);
  if (error && error.code) parts.push(`error ${error.code}`);
  if (parts.length === 0) parts.push('killed, cause unknown');
  if (Number.isFinite(elapsedMs)) parts.push(`${elapsedMs}ms`);
  return `FAIL (${parts.join(', ')})`;
}
