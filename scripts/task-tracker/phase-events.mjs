// PHASE_EVENTS — canonical lifecycle event table.
//
// Defines the lifecycle events emitted by the task-tracker as issues move
// through the kanban states. Each entry exposes a stable `event` slug (the
// string that lands in the `Event` column of the ⏱ Timing Log) and a
// human-readable `description`.
//
// Keyed by `{state}.{kind}` where:
//   state ∈ { backlog, on-deck, refine, plan, develop, test, review, done }
//   kind  ∈ { enter, complete }
//
// UNIFORM VOCABULARY (#516)
// -------------------------
// Every lifecycle slug follows `<state>:<past-tense-event>`:
//   backlog:created · on-deck:started ·
//   refine:started/refine:completed · plan:started/plan:completed ·
//   develop:started/develop:completed · test:started/test:passed ·
//   review:started/review:approved · issue:wrap/issue:closed
//
// Review is a TRUE entry/exit pair. Its completion (`review:approved`) lives in
// `review.complete`, NOT borrowed by `done.enter`. This dissolves the #475 AC4
// asymmetry that filed #516 (review was historically enter-only and its
// approval moment was carried by `done.enter = approved`).
//
// Done names its own two moments:
//   enter    `issue:wrap`   — wrap-up phase begins (DoD finalized, timing
//                             flushed, body/board updated). This is the SINGLE
//                             intentional bare-verb exception to the past-tense
//                             convention: it names the phase being entered, and
//                             `wrapped` would collide with `closed`. It is also
//                             deliberately distinct from heal/reconcile
//                             "cleanup" vocabulary (those are body markers now,
//                             see reconcile.mjs / promote.mjs / close.mjs).
//   complete `issue:closed` — `gh issue close` done; terminal.
// Cleanup elapsed = `issue:wrap → issue:closed` (the interval #475 AC4 measured
// as `approved → closed`, now correctly labelled).
//
// DEFERRED (#516, not forgotten): the ad-hoc `review` (review.mjs session-start)
// and `review-ready` (review.mjs state-move) rows are intentionally left in
// place pending the separate "extra timing-log rows" discussion. Do NOT fold
// them into this table without that decision.

export const PHASE_EVENTS = Object.freeze({
  backlog: Object.freeze({
    enter: Object.freeze({ event: 'backlog:created', description: 'task created in Backlog' }),
  }),
  'on-deck': Object.freeze({
    enter: Object.freeze({ event: 'on-deck:started', description: 'queued on deck' }),
  }),
  refine: Object.freeze({
    enter: Object.freeze({ event: 'refine:started', description: 'start refinement' }),
    complete: Object.freeze({ event: 'refine:completed', description: 'refinement completed' }),
  }),
  plan: Object.freeze({
    enter: Object.freeze({ event: 'plan:started', description: 'plan started' }),
    complete: Object.freeze({
      event: 'plan:completed',
      description: 'plan completed — waiting approval',
    }),
  }),
  develop: Object.freeze({
    enter: Object.freeze({ event: 'develop:started', description: 'start development' }),
    complete: Object.freeze({ event: 'develop:completed', description: 'development complete' }),
  }),
  test: Object.freeze({
    enter: Object.freeze({ event: 'test:started', description: 'start testing' }),
    complete: Object.freeze({ event: 'test:passed', description: 'testing complete' }),
  }),
  review: Object.freeze({
    enter: Object.freeze({ event: 'review:started', description: 'waiting in review' }),
    // #516 — review now carries its own completion (was borrowed by done.enter).
    complete: Object.freeze({ event: 'review:approved', description: 'story approved' }),
  }),
  done: Object.freeze({
    // #516 — done names its own two moments. `issue:wrap` opens the wrap-up
    // phase on the board move into Done; `issue:closed` closes it after
    // `gh issue close`. The `issue:wrap → issue:closed` interval is the cleanup
    // elapsed stamped on the `issue:closed` row (#475 AC4 measurement preserved).
    enter: Object.freeze({ event: 'issue:wrap', description: 'wrap-up — finalizing for close' }),
    complete: Object.freeze({
      event: 'issue:closed',
      description: 'issue closed — ready for next story',
    }),
  }),
});

// Resolve a `{state, phase}` descriptor to `{event, description}` from the
// canonical table, or return null if the descriptor is missing/invalid.
// `phase` is the kind: `enter` or `complete`. Returns null on any mismatch
// so callers can fall back to caller-supplied event/description.
export function resolvePhaseEvent(descriptor) {
  if (!descriptor || typeof descriptor !== 'object') return null;
  const { state, phase } = descriptor;
  if (typeof state !== 'string' || typeof phase !== 'string') return null;
  const stateEntry = PHASE_EVENTS[state];
  if (!stateEntry) return null;
  const kindEntry = stateEntry[phase];
  if (!kindEntry) return null;
  return { event: kindEntry.event, description: kindEntry.description };
}
