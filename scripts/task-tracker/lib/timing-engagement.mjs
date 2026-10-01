// @story #1857
// Pure engagement interval algebra. Issue stages are shared context, never actor starts.
import { PHASE_EVENTS } from '../phase-events.mjs';
import { classifyTimingEvent, EVENT_CLASS } from './timing-events/index.mjs';
import { timingTimestampToMs } from './timing-row-reader.mjs';
import { assertTimingActorKey } from './timing-actor.mjs';
const departure = (event) => classifyTimingEvent(event) === EVENT_CLASS.DEPARTURE;
const opener = (event) => classifyTimingEvent(event) === EVENT_CLASS.REENGAGEMENT;
const phaseEntries = new Map(
  Object.entries(PHASE_EVENTS)
    .filter(([, value]) => value.enter)
    .map(([phase, value]) => [value.enter.event, phase])
);
const phaseEnds = new Set(
  Object.values(PHASE_EVENTS)
    .filter((value) => value.complete)
    .map((value) => value.complete.event)
);
const instant = timingTimestampToMs;
const validSpan = (value) =>
  value &&
  typeof value.actorKey === 'string' &&
  value.actorKey &&
  value.startMs !== null &&
  value.endMs !== null &&
  Number.isFinite(value.startMs) &&
  Number.isFinite(value.endMs) &&
  value.endMs >= value.startMs;
export function reconcileActorCoverage(intervals, candidate) {
  if (candidate?.actorKey) assertTimingActorKey(candidate.actorKey);
  if (!validSpan(candidate)) return { status: 'unknown', coveredMs: null, uncoveredMs: null };
  const spans = [];
  for (const interval of intervals || []) {
    assertTimingActorKey(interval?.actorKey);
    if (interval.actorKey !== candidate.actorKey) continue;
    if (!validSpan(interval)) return { status: 'unknown', coveredMs: null, uncoveredMs: null };
    const start = Math.max(candidate.startMs, interval.startMs);
    const end = Math.min(candidate.endMs, interval.endMs);
    if (end > start) spans.push([start, end]);
  }
  spans.sort((a, b) => a[0] - b[0]);
  let coveredMs = 0;
  let end = candidate.startMs;
  for (const [start, stop] of spans) {
    coveredMs += Math.max(0, stop - Math.max(start, end));
    end = Math.max(end, stop);
  }
  return {
    status: 'known',
    coveredMs,
    uncoveredMs: candidate.endMs - candidate.startMs - coveredMs,
  };
}
export function deriveActorEngagement(rows, nowTs) {
  const endMs = instant(nowTs);
  const list = (rows || []).map((row) => ({ ...row, ms: instant(row.ts) }));
  const result = {
    engagedMs: 0,
    byActor: {},
    byPhase: {},
    intervals: [],
    incompleteActors: [],
    unknownRows: 0,
    failures: [],
    complete: true,
  };
  const open = new Map();
  const previous = new Map();
  const phases = [];
  let phase = null;
  let phaseStart = null;
  for (const row of list) {
    if (!Number.isFinite(row.ms) || !Number.isFinite(endMs) || row.ms > endMs) {
      result.failures.push('invalid-timing-window');
      continue;
    }
    if (
      phaseEntries.has(row.event) ||
      phaseEnds.has(row.event) ||
      row.event.startsWith('demoted:')
    ) {
      if (phase !== null) phases.push({ phase, startMs: phaseStart, endMs: row.ms });
      phase = phaseEntries.get(row.event) ?? null;
      phaseStart = phase === null ? null : row.ms;
    }
    if (!row.actorKey) {
      if (
        !phaseEntries.has(row.event) &&
        !phaseEnds.has(row.event) &&
        !row.event.startsWith('demoted:')
      )
        result.unknownRows++;
      continue;
    }
    assertTimingActorKey(row.actorKey);
    if (previous.has(row.actorKey) && row.ms < previous.get(row.actorKey)) {
      result.failures.push('actor-out-of-order:' + row.actorKey);
      continue;
    }
    previous.set(row.actorKey, row.ms);
    if (opener(row.event)) {
      if (open.has(row.actorKey)) result.failures.push('duplicate-actor-start:' + row.actorKey);
      else open.set(row.actorKey, row.ms);
    } else if (departure(row.event)) {
      if (!open.has(row.actorKey)) result.failures.push('actor-end-without-start:' + row.actorKey);
      else {
        result.intervals.push({
          actorKey: row.actorKey,
          startMs: open.get(row.actorKey),
          endMs: row.ms,
        });
        open.delete(row.actorKey);
      }
    }
  }
  if (phase !== null && Number.isFinite(endMs)) phases.push({ phase, startMs: phaseStart, endMs });
  result.incompleteActors = [...open.keys()];
  for (const interval of result.intervals) {
    if (!validSpan(interval)) {
      result.failures.push('invalid-actor-interval');
      continue;
    }
    const duration = interval.endMs - interval.startMs;
    result.engagedMs += duration;
    (result.byActor[interval.actorKey] ||= { engagedMs: 0 }).engagedMs += duration;
    for (const span of phases) {
      const overlap = Math.max(
        0,
        Math.min(span.endMs, interval.endMs) - Math.max(span.startMs, interval.startMs)
      );
      if (overlap) (result.byPhase[span.phase] ||= { engagedMs: 0 }).engagedMs += overlap;
    }
  }
  result.complete =
    result.incompleteActors.length === 0 &&
    result.unknownRows === 0 &&
    result.failures.length === 0;
  return result;
}
