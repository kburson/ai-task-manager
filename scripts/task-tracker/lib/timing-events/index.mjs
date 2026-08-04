import {
  EVENT_CLASS,
  EXACT_TIMING_EVENT_DESCRIPTORS,
  LIFECYCLE_EVENT_DESCRIPTORS,
  describeExactTimingEvent,
} from './catalog.mjs';
import { describeParameterizedTimingEvent } from './parameterized.mjs';
import { describeLegacyTimingEvent, isRetiredTimingEventInput } from './legacy.mjs';

export { EVENT_CLASS, LIFECYCLE_EVENT_DESCRIPTORS };

function normalize(event) {
  if (event == null) return null;
  const normalized = String(event).trim().toLowerCase();
  return normalized || null;
}

export function exactTimingEventDescriptors() {
  return EXACT_TIMING_EVENT_DESCRIPTORS;
}

export function describeTimingEvent(event) {
  const normalized = normalize(event);
  if (!normalized) return null;
  return (
    describeExactTimingEvent(normalized) ||
    describeParameterizedTimingEvent(normalized) ||
    describeLegacyTimingEvent(normalized)
  );
}

export function isKnownTimingEvent(event) {
  return describeTimingEvent(event) != null;
}

export function classifyTimingEvent(event) {
  return describeTimingEvent(event)?.eventClass ?? null;
}

// Timing arithmetic preserves historical unknown rows as neutral active spans.
// Strict vocabulary readers must continue to use classifyTimingEvent(), which
// returns null for unknown input.
export function classifyTimingEventForAccounting(event) {
  if (event == null || String(event).trim() === '') return null;
  return classifyTimingEvent(event) ?? EVENT_CLASS.PHASE;
}

export function lifecycleTimingEventSlugs() {
  return Object.freeze(
    exactTimingEventDescriptors()
      .filter(({ kind }) => kind === 'lifecycle')
      .map(({ event }) => event)
  );
}

export function isDepartureEvent(event) {
  return classifyTimingEvent(event) === EVENT_CLASS.DEPARTURE;
}

export function isReengagementEvent(event) {
  return classifyTimingEvent(event) === EVENT_CLASS.REENGAGEMENT;
}

export function isPhaseEventForAccounting(event) {
  return classifyTimingEventForAccounting(event) === EVENT_CLASS.PHASE;
}

export function isCanonicalPhaseEvent(event) {
  return describeTimingEvent(event)?.canonicalPhase === true;
}

export function opensIdleSpan(event) {
  return isDepartureEvent(event);
}

export function stageOfTimingEvent(event) {
  return describeTimingEvent(event)?.stage ?? null;
}

export function isRetiredTimingEvent(event) {
  const normalized = normalize(event);
  return normalized != null && isRetiredTimingEventInput(normalized);
}

export function isEmittableTimingEvent(event) {
  return describeTimingEvent(event)?.emittable === true;
}

export function closesTerminalReviewHandoff(event) {
  return describeTimingEvent(event)?.terminalReviewHandoffCloser === true;
}
