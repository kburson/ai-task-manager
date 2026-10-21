// @story #2044
// Inputs are already native interval deltas. This merger never samples a clock,
// converts cumulative totals, grants actor authority, or acknowledges a cursor.
import { canonicalRecordJson } from '../github-records/canonical-json.mjs';
import { parseNativeContentTimestamp } from './native-observation.mjs';
const FIELDS = [
  'eventId',
  'actorId',
  'transitionId',
  'timestamp',
  'event',
  'activeSeconds',
  'idleSeconds',
  'sourceCursor',
];
const identifier = (value) =>
  typeof value === 'string' && value.length > 0 && !/[\s\p{Cc}]/u.test(value);
const duration = (value) =>
  value === null || (typeof value === 'number' && Number.isFinite(value) && value >= 0);
const compareId = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
function invalid(reason, cause) {
  throw Object.assign(new Error(`Story timing event invalid: ${reason}`, { cause }), {
    code: 'STORY_TIMING_EVENT_INVALID',
    reason,
  });
}
function conflict(reason, event, prior) {
  throw Object.assign(new Error(`Story timing event conflict: ${reason}`), {
    code: 'STORY_TIMING_EVENT_CONFLICT',
    reason,
    eventId: event.eventId,
    priorEventId: prior.eventId,
    actorId: event.actorId,
  });
}
/** Merge normalized native events without inventing IDs, bounds or durations. */
export function mergeTimingEvents(existing, incoming) {
  if (!Array.isArray(existing) || !Array.isArray(incoming)) invalid('collections');
  let streams;
  try {
    streams = JSON.parse(canonicalRecordJson([existing, incoming]));
  } catch (error) {
    invalid('json-data', error);
  }
  const events = new Map();
  const cursors = new Map();
  for (const event of streams.flat()) {
    if (
      !event ||
      typeof event !== 'object' ||
      Array.isArray(event) ||
      Object.keys(event).length !== FIELDS.length ||
      FIELDS.some((field) => !Object.hasOwn(event, field))
    )
      invalid('fields');
    if (
      ![event.eventId, event.actorId, event.sourceCursor].every(identifier) ||
      !(event.transitionId === null || identifier(event.transitionId))
    )
      invalid('identity');
    if (typeof event.event !== 'string' || !event.event.trim() || /\p{Cc}/u.test(event.event))
      invalid('event');
    const timestamp = parseNativeContentTimestamp(event.timestamp);
    if (timestamp === null) invalid('timestamp');
    if (!duration(event.activeSeconds) || !duration(event.idleSeconds)) invalid('duration');
    // This is only the minimum span implied by measured components. Unknown
    // stays null in the event and is never promoted to complete duration evidence.
    const seconds = [event.activeSeconds, event.idleSeconds]
      .filter((value) => value !== null)
      .reduce((sum, value) => sum + value, 0);
    const start = timestamp - seconds * 1000;
    if (!Number.isFinite(start) || Math.abs(start) > 8.64e15) invalid('interval-range');
    const fingerprint = canonicalRecordJson(event);
    const prior = events.get(event.eventId);
    if (prior) {
      if (prior.fingerprint !== fingerprint) conflict('duplicate-event-id', event, prior.event);
      continue;
    }
    let actorCursors = cursors.get(event.actorId);
    if (!actorCursors) {
      actorCursors = new Map();
      cursors.set(event.actorId, actorCursors);
    }
    if (actorCursors.has(event.sourceCursor))
      conflict('reused-source-cursor', event, actorCursors.get(event.sourceCursor));
    actorCursors.set(event.sourceCursor, event);
    events.set(event.eventId, { event, timestamp, start, seconds, fingerprint });
  }
  const byActor = new Map();
  for (const interval of events.values()) {
    if (interval.seconds === 0) continue;
    const actor = interval.event.actorId;
    if (!byActor.has(actor)) byActor.set(actor, []);
    byActor.get(actor).push(interval);
  }
  for (const intervals of byActor.values()) {
    intervals.sort(
      (a, b) =>
        a.start - b.start ||
        a.timestamp - b.timestamp ||
        compareId(a.event.eventId, b.event.eventId)
    );
    for (let i = 1; i < intervals.length; i++)
      if (intervals[i].start < intervals[i - 1].timestamp)
        conflict('overlapping-intervals', intervals[i].event, intervals[i - 1].event);
  }
  const ordered = [...events.values()].sort(
    (a, b) => a.timestamp - b.timestamp || compareId(a.event.eventId, b.event.eventId)
  );
  return Object.freeze(ordered.map(({ event }) => Object.freeze(event)));
}
