// #931 — bare state-bound action verbs had no check that the issue was
// actually in a state each verb operates on before doing expensive or
// side-effecting work (sandbox spin-up, gh mutations). A stale local bind, or
// a hand-run verb invoked from the wrong stage, could burn a full `test` run
// or mutate a body that was never meant to be touched yet.
//
// Each entry is the verb's real entry state(s), confirmed from its own
// move-state call, not a guess:
//   - `test` runs from `develop` (first entry — sandbox proof, board moves
//     develop→test), from `test` itself (test.mjs #444/#882: an in-place
//     re-verify self-loop where VCs re-run and the board stays at `test`), OR
//     from `review` (#998: `review.mjs`'s SHA-drift gate — #154 — refuses and
//     tells the operator to re-run `/task test` when trunk HEAD has moved
//     since the recorded `aitm-test-started` SHA; #931/#997 had tightened
//     `test`'s home states to exactly `develop`/`test`, silently closing off
//     that prescribed remediation for anything already in `review` and
//     deadlocking a story with a drifted HEAD and a failed prior Agent
//     Review. Entering from `review` re-runs the sandbox against current
//     HEAD, refreshes the `aitm-test-started` marker, and moves the board
//     back to `test` — a real board move, not a same-state self-loop — so a
//     normal `/task promote`/`/task review` afterward re-enters `review` with
//     a matching SHA).
//   - `review` runs from `test` (test→review, the one authoritative move) OR
//     from `review` itself (#881 commit 3819132 made Agent Review the Review
//     state's own action: a re-run in place, after fixing a gate objection,
//     is the sanctioned way to clear a stale `aitm-review-failed` marker and
//     tick "Agent Review Passed" — #997 restored this self-loop after #931
//     regressed it to `test`-only).
//   - `close` is review's exit action — it runs FROM `review`, not `close`
//     (close.mjs runs `runGuards('review', 'done', …)`).
//
// `promote.mjs`'s alias-delegation (`ALIAS_VERB`) spawns these same verbs as
// a subprocess at exactly the recorded state above, so no promote-context
// exemption is needed here — the corrected home states already match every
// legitimate delegate call.
//
// `refine` and `plan` are intentionally NOT in this map — each already
// enforces its own, differently-shaped predecessor-state guard inline:
//   - refine.mjs's `runRefine` allows entry from `{backlog, assigned, refine}`
//     (`PRE_REFINE_STATES`), not a single home state.
//   - plan.mjs's `runPlan` requires the *predecessor* state `refine` (via a
//     live board query), not its own state `plan`.
// There is no `develop` verb file — `develop` is a state worked in via direct
// source edits, gated by `source-edit-gate.mjs`, not a CLI verb.
import { actionPolicyFor } from './lifecycle-policy/index.mjs';

export const VERB_HOME_STATE = Object.fromEntries(
  ['test', 'review', 'close'].map((verb) => {
    const allowed = [...actionPolicyFor(verb).allowedStates];
    return [verb, allowed.length === 1 ? allowed[0] : allowed];
  })
);

export class VerbHomeStateError extends Error {
  constructor({ verb, currentState, homeState, issueNumber }) {
    const allowed = Array.isArray(homeState) ? homeState : [homeState];
    const expected = allowed.map((s) => `\`${s}\``).join(' or ');
    super(
      `${verb}: refuses to run on #${issueNumber} — current state is \`${currentState}\`, ` +
        `expected ${expected}. /task ${verb} only runs from ${expected}. ` +
        `Use \`/task promote #${issueNumber}\` to advance forward through the pipeline.`
    );
    this.name = 'VerbHomeStateError';
    this.verb = verb;
    this.currentState = currentState;
    this.homeState = allowed;
    this.issueNumber = issueNumber;
  }
}

// Pure guard. Throws `VerbHomeStateError` on a home-state mismatch; a no-op
// otherwise. A verb absent from `VERB_HOME_STATE`, or a `currentState` of
// `null` (no recorded marker yet — first-touch/bootstrap), is also a no-op:
// this guard only refuses a *known* wrong state, it does not invent one.
export function assertVerbHomeState({ verb, currentState, issueNumber }) {
  const result = actionPolicyFor(verb, currentState);
  if (result.kind === 'unknown-action' || result.kind === 'bootstrap' || result.ok) return;
  const homeState = VERB_HOME_STATE[verb];
  const allowed = Array.isArray(homeState) ? homeState : [homeState];
  if (result.kind === 'refused' || result.kind === 'unknown-state') {
    throw new VerbHomeStateError({ verb, currentState, homeState: allowed, issueNumber });
  }
}
