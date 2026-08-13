// #673 — board-state gate on Pickup Directive applicability.
//
// `rules/bind.md` unconditionally directs the agent to
// `.ai-task-manager/templates/pickup-directive.md` after every successful
// bind, regardless of the issue's kanban state. The directive's own
// applicability check only looks for an absent `aitm-deep-dive-complete`
// marker, so binding to a `backlog`/`assigned`/`refine` issue (which has not
// yet been through Refine/Plan) fires the same deep-dive/implementation
// instructions as binding to a `develop`+ issue. This predicate gives the
// bind verbs a board-state-aware check to route on instead.
//
// Eligible states are `plan` and everything after it in the verb chain
// (`plan`, `develop`, `test`, `review`, `done`) — Pickup Directive's deep-dive
// step is meaningful once Plan-stage scoping exists. `backlog`/`refine`/
// `ready-for-plan` are not eligible for implementation: they have not
// entered the short-lived JIT Plan stage yet, so
// jumping to deep-dive/implementation instructions skips Refine/Plan.

import { STAGES } from './stage-entry-markers.mjs';

const ELIGIBLE_FROM = 'plan';
const eligibleIdx = STAGES.indexOf(ELIGIBLE_FROM);

// True iff `kanbanState` is at or past the `plan` stage. Unknown/missing
// states are treated as NOT eligible (fail closed — never fire pickup
// instructions on an unrecognized state).
export function isPickupDirectiveEligible(kanbanState) {
  const idx = STAGES.indexOf(String(kanbanState || ''));
  if (idx === -1) return false;
  return idx >= eligibleIdx;
}

// Routing banner shown in place of Pickup Directive instructions when the
// bound issue hasn't reached `plan` yet. Names the correct next state-walk
// verb so the agent doesn't need to guess.
export function formatPickupDirectiveDeferredBanner(ref, kanbanState) {
  const nextVerb =
    kanbanState === 'ready-for-plan'
      ? '/task plan'
      : kanbanState === 'refine'
        ? '/task promote'
        : '/task refine';
  return (
    `\n🚧 PICKUP DIRECTIVE DEFERRED — ${ref} (state: ${kanbanState})\n` +
    `   This issue hasn't reached Plan yet — deep-dive/implementation\n` +
    `   instructions do not apply. Continue the state walk: \`${nextVerb} ${ref}\`.`
  );
}
