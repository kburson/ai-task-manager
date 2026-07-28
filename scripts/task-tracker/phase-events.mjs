// Compatibility facade for lifecycle Timing Log descriptors.
//
// Canonical event vocabulary lives in lib/timing-events. This module preserves
// the long-standing PHASE_EVENTS and resolvePhaseEvent public API.
//
// UNIFORM VOCABULARY (#516)
// -------------------------
// Lifecycle events use the `<state>:<past-tense-event>` convention.
// Review is a TRUE entry/exit pair and carries its own `review:approved` completion.
// Done has two moments: `issue:wrap` and `issue:closed`; `issue:wrap` is the
// intentional bare-verb exception because it names the phase being entered.
//
// DEFERRED (#516, not forgotten): the former ad-hoc `review` and
// `review-ready` rows remain retired historical vocabulary. They are not
// reintroduced by this compatibility facade.

import { LIFECYCLE_EVENT_DESCRIPTORS } from './lib/timing-events/index.mjs';

const byState = {};
for (const descriptor of LIFECYCLE_EVENT_DESCRIPTORS) {
  const entries = byState[descriptor.state] || {};
  entries[descriptor.phase] = Object.freeze({
    event: descriptor.event,
    description: descriptor.description,
  });
  byState[descriptor.state] = entries;
}

export const PHASE_EVENTS = Object.freeze(
  Object.fromEntries(
    Object.entries(byState).map(([state, entries]) => [state, Object.freeze(entries)])
  )
);

export function resolvePhaseEvent(descriptor) {
  if (!descriptor || typeof descriptor !== 'object') return null;
  const { state, phase } = descriptor;
  if (typeof state !== 'string' || typeof phase !== 'string') return null;
  const entry = PHASE_EVENTS[state]?.[phase];
  return entry ? { event: entry.event, description: entry.description } : null;
}
