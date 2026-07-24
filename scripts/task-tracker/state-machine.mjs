// INTERNAL — library module, imported, never executed as a CLI and not exposed
// through `aitm`. See bin/aitm-registry.mjs (INTERNAL map) for the rationale.
//
// Canonical 8-state kanban transition matrix. Pure data + a validator.
// Consumers: move-state.mjs hardening (W2.3), /task move verb (W3.1),
// parent-admission gate (W1.3), activity-policy lookup (W1.2).
//
// On Deck (#433) is an inert, gateless waiting room inserted between Backlog
// and Refine: a positional tranche filter, identical in issue content to
// Backlog. Every item passes through it (no backlog→refine shortcut); the
// long-standing Priority entry gate lives on the on-deck→refine boundary.

export const KANBAN_STATES = Object.freeze({
  BACKLOG: 'backlog',
  ON_DECK: 'on-deck',
  REFINE: 'refine',
  PLAN: 'plan',
  DEVELOP: 'develop',
  TEST: 'test',
  REVIEW: 'review',
  DONE: 'done',
});

export const STATES = ['backlog', 'on-deck', 'refine', 'plan', 'develop', 'test', 'review', 'done'];

export const FORWARD = {
  backlog: 'on-deck',
  'on-deck': 'refine',
  refine: 'plan',
  plan: 'develop',
  develop: 'test',
  test: 'review',
  review: 'done',
};

export const BACKWARD = {
  'on-deck': 'backlog',
  test: 'develop',
  review: 'develop',
};

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
  if (!STATES.includes(from)) {
    return { ok: false, reason: `unknown state: ${from}` };
  }
  if (!STATES.includes(to)) {
    return { ok: false, reason: `unknown state: ${to}` };
  }
  // #882 — a move whose target IS the current state is a SATISFIED NO-OP, not an
  // illegal transition. The request is "be in state X"; the issue already is, so
  // there is nothing to transition and nothing to refuse. Callers must treat
  // `noop` as "short-circuit before any side-effect" rather than "perform the
  // move": re-entering a state would re-stamp `aitm-entered-<stage>` and open a
  // duplicate stage-timing row. Before this, each self-loop was patched one at a
  // time as it was encountered (#385 done→done, #444 test→test, #882
  // review→review); the enumeration was the defect, not its missing entries.
  if (from === to) return { ok: true, noop: true };
  if (FORWARD[from] === to) return { ok: true };
  if (BACKWARD[from] === to) return { ok: true };
  const allowed = [FORWARD[from], BACKWARD[from]].filter(Boolean).join(', ') || 'none';
  return { ok: false, reason: `illegal transition: ${from} → ${to}. Allowed: ${allowed}.` };
}
