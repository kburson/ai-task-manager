// #683 — the closed event vocabulary for the ⏱ Timing Log.
//
// Every Event-cell slug the timing log emits falls into exactly one of three
// classes, which is what the active/idle ladder (`lib/timing-ladder.mjs`) keys
// on to decide whether a row opens an ACTIVE or an IDLE span:
//
//   • 'departure'    — work STOPPED. Opens an IDLE span. Openers per #534:
//                      `pause`/`paused`/`pause:<reason>`, `switch-out`/
//                      `switch-out:#N`. (`idle` was a departure opener until
//                      EPIC #823 timing model v2 retired the `idle` row; the
//                      READ side now treats a legacy `idle` slug as neutral —
//                      see RETIRED_SLUGS below.)
//   • 'reengagement' — work RESUMED. Opens an ACTIVE span and closes the open
//                      departure. `resumed` is the sole canonical return verb
//                      (#568); `start`, `resume`/`resume:<slug>`, and the
//                      retired `switch-in`/`switch-in:*` are tolerated aliases
//                      so legacy #590-era logs classify without a migration.
//   • 'phase'        — a kanban lifecycle moment (`<state>:started/completed`,
//                      `test:passed`, `review:approved`, `backlog:created`,
//                      `on-deck:started`, `issue:wrap`, `issue:closed`). Opens
//                      an ACTIVE span.
//
// This module is the single READ-side source of truth for that classification.
// It reuses `classifyEvent` from `bind-event.mjs` (the WRITE-side opener/closer
// taxonomy) so the two never drift, and folds every non-interruption slug —
// including the frozen `PHASE_EVENTS` set and audit rows (`demoted`,
// `out-of-band-move`) — into 'phase'.

import { classifyEvent } from './bind-event.mjs';
import { PHASE_EVENTS } from '../phase-events.mjs';

export const EVENT_CLASS = Object.freeze({
  DEPARTURE: 'departure',
  REENGAGEMENT: 'reengagement',
  PHASE: 'phase',
});

// The frozen set of canonical phase-event slugs, derived from PHASE_EVENTS so
// this list can never fall out of step with the emitter table.
export const PHASE_EVENT_SLUGS = Object.freeze(
  Array.from(
    new Set(
      Object.values(PHASE_EVENTS).flatMap((state) => Object.values(state).map((kind) => kind.event))
    )
  )
);

// Non-phase audit rows that still open ACTIVE spans (they record real
// orchestration work, not a departure or a re-engagement).
//
// EPIC #823 timing model v2 (C1): `active-work` is REMOVED from this set. It was
// the #802/#821 finalize credit that orphan/pause-finalize emitted before the
// paired `idle` row; both the emitter and the row type are retired, so the
// READ-side no longer needs to recognize `active-work` as a legal slug. A healed
// v2 log never contains it.
//
// `review` / `review-ready` (#812): the two ad-hoc bare-verb rows the `review`
// verb emits on every review entry — `review` ("starting review", the deferred
// verb-level session-start row, review.mjs) and `review-ready` ("task is now in
// Review", the state-move row, review.mjs). phase-events.mjs deliberately keeps
// them OUT of the canonical PHASE_EVENTS table pending the separate "extra
// timing-log rows" discussion; recognizing them HERE as neutral phase slugs is
// orthogonal to that deferral (it does not canonicalize them — it just stops V3
// from flagging legitimate emitter rows as `malformed — unknown event slug`).
// Without this, every timing log fails V3 the moment it enters Review.
const AUDIT_PHASE_SLUGS = Object.freeze(['demoted', 'out-of-band-move', 'review', 'review-ready']);

// Retired vocabulary — slugs that legacy (pre-v2) logs may still carry but that
// timing model v2 (EPIC #823) no longer treats as interruption events. A legacy
// `idle` row is classified as neutral PHASE at the READ side so it opens no idle
// span; the historical heal (C4) strips these rows entirely.
const RETIRED_SLUGS = Object.freeze(['idle', 'active-work']);

// Classify a single Event-cell slug into one of EVENT_CLASS. Case-insensitive.
// Interruption openers/closers defer to `classifyEvent` (the canonical #534
// taxonomy); everything else is 'phase'. Returns null only for an empty slug.
export function classifyTimingEvent(slug) {
  if (slug == null) return null;
  const s = String(slug).trim().toLowerCase();
  if (s === '') return null;
  // v2 (#823): a retired `idle`/`active-work` slug is neutral — it never opens
  // an idle span. Short-circuit before delegating to the #534 taxonomy, which
  // still classifies bare `idle` as a departure on the WRITE side.
  if (RETIRED_SLUGS.includes(s)) return EVENT_CLASS.PHASE;
  const c = classifyEvent(s);
  if (c && c.role === 'open') return EVENT_CLASS.DEPARTURE;
  if (c && c.role === 'close') return EVENT_CLASS.REENGAGEMENT;
  return EVENT_CLASS.PHASE;
}

export function isDepartureEvent(slug) {
  return classifyTimingEvent(slug) === EVENT_CLASS.DEPARTURE;
}

export function isReengagementEvent(slug) {
  return classifyTimingEvent(slug) === EVENT_CLASS.REENGAGEMENT;
}

export function isPhaseEvent(slug) {
  return classifyTimingEvent(slug) === EVENT_CLASS.PHASE;
}

// True when a slug is one of the canonical frozen phase-event slugs (or an
// audit-phase slug) — a stricter check than `isPhaseEvent`, which also returns
// true for any unrecognized neutral slug.
export function isCanonicalPhaseSlug(slug) {
  const s = String(slug ?? '')
    .trim()
    .toLowerCase();
  return PHASE_EVENT_SLUGS.includes(s) || AUDIT_PHASE_SLUGS.includes(s);
}

// The ladder rule in one predicate: a span is IDLE iff opened by a departure
// event; every other event opens an ACTIVE span.
export function opensIdleSpan(slug) {
  return classifyTimingEvent(slug) === EVENT_CLASS.DEPARTURE;
}
