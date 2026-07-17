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
//   MOVE_STATE_TIMEOUT_MS  — the move-state.mjs child, which runs a verified
//                            Status write PLUS a multi-step best-effort tail
//                            (many sequential `gh` calls); needs a wall-clock
//                            budget matched to the whole saga, NOT one API call.
//   GIT_TIMEOUT_MS         — git read commands (`git rev-parse`, `git status`).
//   LOCAL_FAST_TIMEOUT_MS  — local-only commands expected to return instantly.
//   TEST_RUNNER_TIMEOUT_MS — node test runner / suite invocations.
//   SANDBOX_TIMEOUT_MS     — one command inside the Test-stage sandbox worktree
//                            (`verbs/test.mjs`), i.e. a full `npm run test:all`
//                            against a fresh checkout. Overridable per-machine;
//                            see `sandboxTimeoutMs()`.
//
// Conventions for callers:
//   - On ETIMEDOUT: propagate, OR log a stderr warning that names the command
//     and the timeout class. Never silently swallow.
//   - Prefer importing the constant rather than inlining magic numbers.

export const GH_API_TIMEOUT_MS = 15000;
// 120s — #752. `runMoveState` used to bound the ENTIRE move-state child with
// GH_API_TIMEOUT_MS (sized for ONE `gh` call). On a terminal review→done move
// the best-effort post-commit tail (audit comment + body edit + unpark + event
// syncs + timing flush) runs many sequential `gh` calls, so the aggregate
// exceeded 15s and execFile SIGTERM-killed the child AFTER the board committed —
// which `close` then mis-read as a failed move. This dedicated budget (8× a
// single call) matches what the child actually runs; each inner `gh` call keeps
// its own GH_API_TIMEOUT_MS, so a genuinely hung single call is still caught.
export const MOVE_STATE_TIMEOUT_MS = 120000;
export const GIT_TIMEOUT_MS = 10000;
export const LOCAL_FAST_TIMEOUT_MS = 5000;
// 10 minutes — the full `npm test` suite (200+ files) runs well past 60s
// under `dod-stamp tests`; 600_000 gives headroom for CI-equivalent wall-clock
// while still catching a truly runaway suite.
export const TEST_RUNNER_TIMEOUT_MS = 600000;

// #858 — the Test-stage sandbox's per-command budget. This lived as a private
// 900_000 constant in `verbs/test.mjs`, whose comment sized it for a fresh
// worktree running roughly a hundred files. The suite hit 615 / ~18 min, so the cap
// SIGTERM-killed a passing suite and nothing could clear Test. Nobody revisited
// the number as the suite grew because nothing made them: it was invisible from
// outside the verb and required a code change to move.
//
// 45 min ≈ 2.5× the observed ~17.8 min. A cap exists to catch a *runaway* run
// (infinite loop, hung `gh`), not to police growth — so the multiple is
// deliberate slack for a slower machine and for the ~28 files #860 will add.
// #859 is what makes this number stop mattering.
export const SANDBOX_TIMEOUT_MS = 2_700_000;
export const SANDBOX_TIMEOUT_ENV = 'AITM_SANDBOX_TIMEOUT_MS';
export const SANDBOX_TIMEOUT_DEFAULT_MS = SANDBOX_TIMEOUT_MS;

// Convenience: map a class label to its value (used by the helper below).
export const TIMEOUT_CLASSES = Object.freeze({
  gh: GH_API_TIMEOUT_MS,
  move: MOVE_STATE_TIMEOUT_MS,
  git: GIT_TIMEOUT_MS,
  local: LOCAL_FAST_TIMEOUT_MS,
  test: TEST_RUNNER_TIMEOUT_MS,
  sandbox: SANDBOX_TIMEOUT_MS,
});

/**
 * Resolve a timeout from an env override, falling back to `defaultMs`.
 *
 * Only a positive integer is accepted. This is not fussiness: Node's
 * `timeout` option treats `0` as *no timeout*, and a `NaN` timeout never arms
 * the timer either — so the obvious `Number(process.env.X)` one-liner turns a
 * typo into an unbounded hang, which is strictly worse than the over-run it was
 * meant to bound. Anything unusable is rejected loudly and the default stands.
 *
 * @param {string} envName - the variable to read (e.g. 'AITM_SANDBOX_TIMEOUT_MS').
 * @param {number} defaultMs - used when unset or unusable.
 * @param {Record<string,string|undefined>} [env] - env source; injectable for tests.
 * @param {object} [opts]
 * @param {(msg: string) => void} [opts.warn] - warning sink; defaults to stderr.
 * @returns {number} a positive integer, always.
 */
export function resolveTimeoutMs(envName, defaultMs, env = process.env, opts = {}) {
  const raw = env[envName];
  // Unset or blank is the normal case, not a misconfiguration — stay silent.
  if (raw === undefined || raw === null || String(raw).trim() === '') return defaultMs;

  const parsed = Number(raw);
  if (Number.isFinite(parsed) && Number.isInteger(parsed) && parsed > 0) return parsed;

  const warn = opts.warn ?? ((msg) => process.stderr.write(`${msg}\n`));
  warn(
    `[timeout] ignoring ${envName}="${raw}" — expected a positive integer (milliseconds); ` +
      `using the default ${defaultMs}ms`
  );
  return defaultMs;
}

/**
 * The per-command timeout for the Test-stage sandbox, honoring
 * `AITM_SANDBOX_TIMEOUT_MS`.
 *
 * @param {Record<string,string|undefined>} [env]
 * @param {{ warn?: (msg: string) => void }} [opts]
 * @returns {number}
 */
export function sandboxTimeoutMs(env = process.env, opts = {}) {
  return resolveTimeoutMs(SANDBOX_TIMEOUT_ENV, SANDBOX_TIMEOUT_DEFAULT_MS, env, opts);
}

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
