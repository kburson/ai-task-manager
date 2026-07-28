// Compatibility facade for Timing Log classification.
//
// Canonical exact, parameterized, legacy, and retired vocabulary lives in the
// timing-events package. Unknown non-empty input remains a neutral phase here
// for timing-arithmetic compatibility; strict readers use isKnownTimingEvent.

import {
  EVENT_CLASS,
  exactTimingEventDescriptors,
  describeTimingEvent,
  classifyTimingEvent as classifyCanonicalTimingEvent,
} from './timing-events/index.mjs';

export { EVENT_CLASS };

export const PHASE_EVENT_SLUGS = Object.freeze(
  exactTimingEventDescriptors()
    .filter(({ kind }) => kind === 'lifecycle')
    .map(({ event }) => event)
);

export function classifyTimingEvent(slug) {
  if (slug == null || String(slug).trim() === '') return null;
  return classifyCanonicalTimingEvent(slug) ?? EVENT_CLASS.PHASE;
}

export function isDepartureEvent(slug) {
  return classifyCanonicalTimingEvent(slug) === EVENT_CLASS.DEPARTURE;
}

export function isReengagementEvent(slug) {
  return classifyCanonicalTimingEvent(slug) === EVENT_CLASS.REENGAGEMENT;
}

export function isPhaseEvent(slug) {
  return classifyTimingEvent(slug) === EVENT_CLASS.PHASE;
}

export function isCanonicalPhaseSlug(slug) {
  return describeTimingEvent(slug)?.canonicalPhase === true;
}

export function opensIdleSpan(slug) {
  return isDepartureEvent(slug);
}
