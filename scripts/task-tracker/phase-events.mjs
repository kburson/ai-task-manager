// PHASE_EVENTS — canonical lifecycle event table.
//
// Defines the 11 lifecycle events emitted by the task-tracker as issues move
// through the kanban states. Each entry exposes a stable `event` slug (the
// string that lands in the `Event` column of the ⏱ Timing Log) and a
// human-readable `description`.
//
// Keyed by `{state}.{kind}` where:
//   state ∈ { backlog, refine, plan, develop, test, review, done }
//   kind  ∈ { enter, complete }
//
// Terminal states (backlog, review, done) only have an `enter` event.
//
// Downstream verbs (promote, demote, review, close, new, switch — landing in
// later sub-issues of epic #126) will use this table via `flushActiveToGH`'s
// optional phase descriptor. This issue (#127) is wiring only — no new rows
// are emitted yet.

export const PHASE_EVENTS = Object.freeze({
  backlog: Object.freeze({
    enter: Object.freeze({ event: 'created', description: 'task created in Backlog' }),
  }),
  refine: Object.freeze({
    enter: Object.freeze({ event: 'refine:start', description: 'start refinement' }),
    complete: Object.freeze({ event: 'refine:done', description: 'refinement completed' }),
  }),
  plan: Object.freeze({
    enter: Object.freeze({ event: 'plan:start', description: 'plan started' }),
    complete: Object.freeze({
      event: 'plan:done',
      description: 'plan completed — waiting approval',
    }),
  }),
  develop: Object.freeze({
    enter: Object.freeze({ event: 'develop:start', description: 'start development' }),
    complete: Object.freeze({ event: 'develop:done', description: 'development complete' }),
  }),
  test: Object.freeze({
    enter: Object.freeze({ event: 'test:start', description: 'start testing' }),
    complete: Object.freeze({ event: 'test:done', description: 'testing complete' }),
  }),
  review: Object.freeze({
    enter: Object.freeze({ event: 'review:waiting', description: 'waiting in review' }),
  }),
  done: Object.freeze({
    enter: Object.freeze({ event: 'approved', description: 'story approved' }),
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
