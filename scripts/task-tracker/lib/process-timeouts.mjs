// Centralized timeout constants for child-process calls under `scripts/`.
//
// A hung subprocess (network stall, `gh` auth hang, runaway test) blocks the
// parent indefinitely; every `execFile` / `execFileSync` / `spawn` /
// `spawnSync` site under `scripts/` should pass an explicit `timeout` option
// sourced from one of the named classes below.
//
// Child-process API convention (see #22):
//   - Sync calls in production code: use `execFileSync` (throws on non-zero,
//     consistent error shape, plays well with the `timeout:` contract here).
//   - Async calls in production code: use `promisify(execFile)`.
//   - `spawnSync` is reserved for the test runner (`scripts/run-tests.mjs`),
//     which needs non-throwing exit-code introspection and `stdio:'inherit'`
//     to accumulate per-file failures. No other production site should use it.
//
// Classes:
//   GH_API_TIMEOUT_MS      — `gh` CLI calls (issue view/edit, graphql, comments).
//   GIT_TIMEOUT_MS         — git read commands (`git rev-parse`, `git status`).
//   LOCAL_FAST_TIMEOUT_MS  — local-only commands expected to return instantly.
//   TEST_RUNNER_TIMEOUT_MS — node test runner / suite invocations.
//
// Conventions for callers:
//   - On ETIMEDOUT: propagate, OR log a stderr warning that names the command
//     and the timeout class. Never silently swallow.
//   - Prefer importing the constant rather than inlining magic numbers.

export const GH_API_TIMEOUT_MS = 15000;
export const GIT_TIMEOUT_MS = 10000;
export const LOCAL_FAST_TIMEOUT_MS = 5000;
// 10 minutes — the full `npm test` suite (200+ files) runs well past 60s
// under `dod-stamp tests`; 600_000 gives headroom for CI-equivalent wall-clock
// while still catching a truly runaway suite.
export const TEST_RUNNER_TIMEOUT_MS = 600000;

// Convenience: map a class label to its value (used by the helper below).
export const TIMEOUT_CLASSES = Object.freeze({
  gh: GH_API_TIMEOUT_MS,
  git: GIT_TIMEOUT_MS,
  local: LOCAL_FAST_TIMEOUT_MS,
  test: TEST_RUNNER_TIMEOUT_MS,
});

/**
 * Emit a structured warning to stderr describing an ETIMEDOUT event.
 * Callers that choose not to propagate the timeout MUST call this so the
 * stall is observable.
 *
 * @param {object} args
 * @param {string} args.command - argv[0] (e.g. 'gh', 'git', 'node').
 * @param {string} args.timeoutClass - 'gh' | 'git' | 'local' | 'test' (or another label).
 * @param {number} [args.timeoutMs] - the timeout that fired, if known.
 * @param {string[]} [args.argv] - the argv (excluding command), for context.
 */
export function warnTimeout({ command, timeoutClass, timeoutMs, argv }) {
  const ms = timeoutMs ?? TIMEOUT_CLASSES[timeoutClass];
  const tail = Array.isArray(argv) && argv.length ? ` ${argv.slice(0, 4).join(' ')}` : '';
  process.stderr.write(
    `[timeout] ETIMEDOUT after ${ms}ms (class=${timeoutClass}): ${command}${tail}\n`
  );
}
