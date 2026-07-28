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
