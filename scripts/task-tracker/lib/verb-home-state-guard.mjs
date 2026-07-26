// #931 — bare state-bound action verbs had no check that the issue was
// actually in a state each verb operates on before doing expensive or
// side-effecting work (sandbox spin-up, gh mutations). A stale local bind, or
// a hand-run verb invoked from the wrong stage, could burn a full `test` run
// or mutate a body that was never meant to be touched yet.
//
// Each entry is the verb's real entry state(s), confirmed from its own
// move-state call, not a guess:
//   - `test` runs from `develop` (first entry — sandbox proof, board moves
//     develop→test) OR from `test` itself (test.mjs #444/#882: an in-place
//     re-verify self-loop where VCs re-run and the board stays at `test`).
//   - `review` runs from `test` only (test→review is the one authoritative
//     move; review.mjs #408 confirms there is no review-side self-loop — a
//     re-run always starts from `test`, never from `review` itself).
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
//   - refine.mjs's `runRefine` allows entry from `{backlog, on-deck, refine}`
//     (`PRE_REFINE_STATES`), not a single home state.
//   - plan.mjs's `runPlan` requires the *predecessor* state `refine` (via a
//     live board query), not its own state `plan`.
// There is no `develop` verb file — `develop` is a state worked in via direct
// source edits, gated by `source-edit-gate.mjs`, not a CLI verb.
export const VERB_HOME_STATE = {
  test: ['develop', 'test'],
  review: 'test',
  close: 'review',
};

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
  const homeState = VERB_HOME_STATE[verb];
  if (!homeState) return;
  if (currentState == null) return;
  const allowed = Array.isArray(homeState) ? homeState : [homeState];
  if (!allowed.includes(currentState)) {
    throw new VerbHomeStateError({ verb, currentState, homeState: allowed, issueNumber });
  }
}
