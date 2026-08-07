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

// #1156 — distinguish a test-sandbox fleet leak from a legitimate task that a
// different agent registers while this runner is active. New entries remain
// fail-closed unless their recorded path exactly matches a Git worktree that is
// currently registered to this repository.
export function findFleetLeaks({
  keysBefore = new Set(),
  fleetAfter = {},
  registeredWorktreePaths = new Set(),
} = {}) {
  const before = keysBefore instanceof Set ? keysBefore : new Set();
  const fleet = fleetAfter && typeof fleetAfter === 'object' ? fleetAfter : {};
  const registered = registeredWorktreePaths instanceof Set ? registeredWorktreePaths : new Set();
  return Object.keys(fleet).filter((key) => {
    if (before.has(key)) return false;
    const worktreePath = fleet[key]?.worktreePath;
    return typeof worktreePath !== 'string' || !registered.has(worktreePath);
  });
}

// #746 — format the AC2 (#442) fleet-registry leak failure. The bare reporter
// printed only the leaked KEYS (e.g. `#99`), which names the injected issue but
// not the sandbox that escaped — useless for finding the culprit test, and the
// leak reproduces only on the CI runner. Given the leaked keys and the live
// fleet object, dump each leaked entry's full record (worktreePath / sessionId /
// kind / branch) so the CI log names the exact escaping sandbox. `fleet` may be
// missing an entry (a key present in the after-set but already evicted by the
// time we re-read) — such keys are reported as `<entry absent>` rather than
// crashing the reporter.
export function formatFleetLeak(leaked = [], fleet = {}) {
  const n = leaked.length;
  const lines = [
    `\nAC2 (#442) FAIL — the test suite leaked ${n} ` +
      `${n === 1 ? 'entry' : 'entries'} into the live fleet registry.`,
    '',
    'A test created a non-git sandbox and reached registerTask. The leaked',
    'entries below name the sandbox that escaped (worktreePath) — find the test',
    'that writes there and move it to a git-isolated sandbox via',
    'mkdtempProjectIsolated(...) from scripts/task-tracker/lib/scratch-dir.mjs.',
    'Run "npm run lint:fleet-sandbox" to locate it statically.',
    '',
  ];
  for (const key of leaked) {
    const entry =
      fleet && Object.prototype.hasOwnProperty.call(fleet, key) ? fleet[key] : undefined;
    if (!entry || typeof entry !== 'object') {
      lines.push(`  ${key}: <entry absent>`);
      continue;
    }
    const fields = ['worktreePath', 'sessionId', 'kind', 'branch']
      .map((f) => `${f}=${entry[f] === undefined ? '<unset>' : JSON.stringify(entry[f])}`)
      .join('  ');
    lines.push(`  ${key}: ${fields}`);
  }
  lines.push('');
  return lines.join('\n');
}

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
