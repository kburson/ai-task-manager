// Body-fetch-failure fail-closed decision (#511).
//
// `scripts/gh/move-state.mjs` fetches the issue body to feed the entry/exit
// guard pipeline. The fetch used to be wrapped in a `try { … } catch { /* empty
// body means no marker means guard passes */ }` that swallowed any failure and
// left `guardBody = ''`. The three body-gated entry guards
// (`bodyGatesEntryGuardTest/Review/Done` in `lib/body-gates-entry-guard.mjs`)
// each short-circuit to `{ ok: true }` on an empty body, so a FAILED fetch was
// indistinguishable from a genuinely-empty body: the Test/Review/Done structural
// gates were silently skipped and the board move proceeded without verifying any
// required marker, section, or checkbox. That is fail-OPEN — the move-state
// sibling of the #510 close-gate fail-open.
//
// The body-gated target states are exactly the ones whose entry guards read the
// body. For every OTHER target (backlog, refine, ready-for-plan, plan, develop, and
// backward demotes) a missing/empty body is legitimately tolerated, so a fetch
// failure there must NOT block the move — preserving the pre-#511 behavior.
export const BODY_GATED_STATES = Object.freeze(new Set(['test', 'review', 'done']));

// Map (toState, fetchFailed, force) to a fail-closed decision so move-state.mjs
// refuses a gated move whose body could not be fetched instead of passing an
// empty body to the guard pipeline.
//
//   toState     — the target board state slug.
//   fetchFailed — whether the `gh issue view … body` fetch threw.
//   force       — whether `--force` (or an equivalent deliberate bypass) is set.
//
//   → { failClosed: true,  exitCode: 3, message }  fetch failed for a body-gated
//                                                   target and no --force: refuse
//                                                   the move, exit non-zero BEFORE
//                                                   any board mutation, leave state
//                                                   intact for a re-run.
//   → { failClosed: false }                         fetch succeeded, the target is
//                                                   not body-gated, or --force was
//                                                   passed — continue.
//
// Pure + total over its inputs (a missing/unknown `toState` is treated as
// non-gated → `failClosed:false`) so the decision can be exercised without
// spawning a process or hitting the network.
export function decideBodyFetchFailure({ toState, fetchFailed, force } = {}) {
  if (!fetchFailed) return { failClosed: false };
  if (force) return { failClosed: false };
  if (!BODY_GATED_STATES.has(toState)) return { failClosed: false };
  return {
    failClosed: true,
    exitCode: 3,
    message:
      `cannot fetch issue body for the ${toState} body-gate — refusing to move fail-closed. ` +
      `A failed body fetch must not be treated as an empty body (which would skip the ` +
      `Test/Review/Done structural gates). Board left unchanged; re-run once GitHub is ` +
      `reachable, or pass \`--force\` to bypass.`,
  };
}
