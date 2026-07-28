// INTERNAL — library module for the state-movement boundary (#559).
//
// Transition-plan concern extracted from `scripts/gh/move-state.mjs`. This is
// the keystone of the split: instead of the from/to decision being buried in
// control flow across the monolith, `computeTransitionPlan` turns
// (fromState, toState, flags) into a VALUE describing which gates and
// side-effects apply. The host then iterates the plan rather than re-deriving
// each branch inline, and guards/mutation/audit each become independently
// testable against a plan object.
//
// PURE: no I/O, no env, no process.exit. The only dependency is the canonical
// transition matrix validator.

import { validateTransition } from '../lifecycle-policy/index.mjs';

// Compute the ordered gate/side-effect plan for a single move.
//
//   fromState — resolved source state ('' when unknown, e.g. SKIP_NETWORK with
//               no --from; matrix gate is then skipped, mirroring the host).
//   toState   — target state slug (already validated to be a known state).
//   flags     — { supersede, force, demote } booleans.
//
// Returns:
//   {
//     from, to,
//     bypass,              // supersede || force — skips matrix + guard pipeline
//     demote,
//     matrix: {            // forward/backward matrix gate
//       applies,           //   runs only when `from` is known and not bypassing
//       ok,                //   validateTransition result (true when skipped)
//       reason,            //   refusal reason string when !ok, else null
//     },
//     noop,                // #882 target === current state: satisfied no-op,
//                          //   host must short-circuit before any side-effect
//     runGuardPipeline,    // entry/exit guard pipeline applies (skipped on bypass)
//     dirtyCheckOnReview,  // non-blocking dirty-workspace warn on move to review
//     backlogWarn,         // sized-issue→backlog warning applies
//     isDoneMove,          // target is `done` (terminal side-effects fire)
//     doneSideEffects,     // null unless isDoneMove; flags the done-only effects
//   }
export function computeTransitionPlan({ fromState = '', toState, flags = {} } = {}) {
  const { supersede = false, force = false, demote = false } = flags;
  const bypass = Boolean(supersede || force);
  const from = fromState ? String(fromState).toLowerCase() : '';

  // Matrix gate applies only when a from-state is known AND we are not
  // bypassing (supersede/force jump straight to done from any source).
  const matrix = { applies: Boolean(from) && !bypass, ok: true, reason: null };
  // #882 — a self-transition is a satisfied no-op. Surfaced as a top-level plan
  // flag so the host can short-circuit BEFORE the guard pipeline and every
  // mutation/timing side-effect. False whenever the matrix gate does not apply
  // (unknown `from`, or a supersede/force bypass) — there is nothing to compare.
  let noop = false;
  if (matrix.applies) {
    const v = validateTransition(from, toState);
    matrix.ok = v.ok;
    matrix.reason = v.ok ? null : v.reason;
    noop = Boolean(v.noop);
  }

  const isDoneMove = toState === 'done';

  return {
    from,
    to: toState,
    bypass,
    demote: Boolean(demote),
    matrix,
    noop,
    // The guard pipeline (entry + exit guards) is skipped on supersede/force
    // exactly as the matrix gate is — an abandoned or operator-forced move is
    // not subject to the forward-progress / close gates.
    runGuardPipeline: !bypass,
    dirtyCheckOnReview: toState === 'review',
    backlogWarn: toState === 'backlog',
    isDoneMove,
    // Done-path side-effects. `demote` to done is not a thing in the matrix,
    // but the host historically guards the full-auto audit + end-tracking on
    // `!demoteFlag`, so the plan mirrors that precisely.
    doneSideEffects: isDoneMove
      ? {
          fullAutoAudit: !demote,
          unparkDependents: true,
          endTaskTracking: !demote,
        }
      : null,
  };
}
