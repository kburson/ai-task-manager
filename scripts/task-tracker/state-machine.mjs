// INTERNAL — library module, imported, never executed as a CLI and not exposed
// through `aitm`. See bin/aitm-registry.mjs (INTERNAL map) for the rationale.
//
// Compatibility facade over the canonical lifecycle policy.
// Consumers: move-state.mjs hardening (W2.3), /task move verb (W3.1),
// parent-admission gate (W1.3), activity-policy lookup (W1.2).
//
// On Deck (#433) is an inert, gateless waiting room inserted between Backlog
// and Refine: a positional tranche filter, identical in issue content to
// Backlog. Every item passes through it (no backlog→refine shortcut); the
// long-standing Priority entry gate lives on the on-deck→refine boundary.

import {
  stateIds,
  forwardTarget,
  backwardTargets as executableBackwardTargets,
  validateExecutableTransition,
} from './lib/lifecycle-policy/index.mjs';

const CANONICAL_STATE_IDS = stateIds();

export const KANBAN_STATES = Object.freeze({
  BACKLOG: CANONICAL_STATE_IDS[0],
  ON_DECK: CANONICAL_STATE_IDS[1],
  REFINE: CANONICAL_STATE_IDS[2],
  PLAN: CANONICAL_STATE_IDS[3],
  DEVELOP: CANONICAL_STATE_IDS[4],
  TEST: CANONICAL_STATE_IDS[5],
  REVIEW: CANONICAL_STATE_IDS[6],
  DONE: CANONICAL_STATE_IDS[7],
});

// Preserve the legacy mutable-array export while deriving it from policy.
export const STATES = [...CANONICAL_STATE_IDS];

export const FORWARD = Object.fromEntries(
  CANONICAL_STATE_IDS.flatMap((state) => {
    const target = forwardTarget(state);
    return target == null ? [] : [[state, target]];
  })
);

// #999 — a BACKWARD value may be a single state or an array of states.
// `review` needs two legal backward targets: `develop` (full rework, #882)
// and `test` (drift re-verify — the board move #998's verb-home-state-guard
// fix opened the door for but never landed here). Every other entry stays a
// single string; existing single-target behavior is unchanged.
//
// #848 — `refine`/`plan` → `backlog` is the "park" transition: an issue whose
// premise was falsified after refinement has a sanctioned way back to Backlog
// (see verbs/park.mjs) instead of sitting in a ready-to-work column or being
// closed unresolved.
export const BACKWARD = Object.fromEntries(
  CANONICAL_STATE_IDS.flatMap((state) => {
    const targets = executableBackwardTargets(state);
    if (targets.length === 0) return [];
    return [[state, targets.length === 1 ? targets[0] : [...targets]]];
  })
);

export function backwardTargets(from) {
  return [...executableBackwardTargets(from)];
}

// Canonical state slugs only. Boards using retired vocabulary
// (Groom/Analyze/Development/Validate) are not supported by any migration
// tooling in this repo.
//
// #436 — collapse interior whitespace runs to a single hyphen (after trim +
// lowercase) so multi-word board display names map to their kebab slugs.
// Every state was a single word until #433 added "On Deck"; lowercasing alone
// yielded "on deck" (space) instead of the canonical "on-deck" (hyphen),
// which `stampEntryMarker` rejected as an unknown stage. Single-word states
// have no interior whitespace and are unaffected.
export function normalizeStateSlug(input) {
  if (input == null) return null;
  return String(input).trim().toLowerCase().replace(/\s+/g, '-');
}

export function validateTransition(from, to) {
  const result = validateExecutableTransition(from, to);
  // #882 — a move whose target IS the current state is a SATISFIED NO-OP, not an
  // illegal transition. The request is "be in state X"; the issue already is, so
  // there is nothing to transition and nothing to refuse. Callers must treat
  // `noop` as "short-circuit before any side-effect" rather than "perform the
  // move": re-entering a state would re-stamp `aitm-entered-<stage>` and open a
  // duplicate stage-timing row. Before this, each self-loop was patched one at a
  // time as it was encountered (#385 done→done, #444 test→test, #882
  // review→review); the enumeration was the defect, not its missing entries.
  if (result.kind === 'noop') return { ok: true, noop: true };
  if (result.ok) return { ok: true };
  return { ok: false, reason: result.reason };
}
