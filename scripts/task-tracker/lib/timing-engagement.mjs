// @story #1857
// Pure engagement interval algebra. Issue stages are shared context, never actor starts.
import { PHASE_EVENTS } from '../phase-events.mjs';
import { classifyTimingEvent, EVENT_CLASS } from './timing-events/index.mjs';
import { timingTimestampToMs } from './timing-row-reader.mjs';
import { assertTimingActorKey, validateTimingEngagement } from './timing-actor.mjs';
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
export function isUnknownActorRecovery(row) {
  return Boolean(
    row?.actorKey &&
    row.event === 'session-end-recovery' &&
    !row.engagement &&
    row.cells?.[3] === 'Unknown' &&
    row.cells?.[4] === 'Unknown'
  );
}

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
  let observedEndMs = endMs;
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
  let lastLifecycleMs = -Infinity;
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
      if (row.ms < lastLifecycleMs) {
        result.failures.push('lifecycle-out-of-order');
        continue;
      }
      lastLifecycleMs = row.ms;
      if (phase !== null) phases.push({ phase, startMs: phaseStart, endMs: row.ms });
      phase = phaseEntries.get(row.event) ?? null;
      phaseStart = phase === null ? null : row.ms;
    }
    if (!row.actorKey) {
      const historicalSeconds = Number(
        row.marker?.match(new RegExp('row-sec:\\s*a=(-?[0-9]+)'))?.[1]
      );
      const historicalCell = String(row.cells?.[3] ?? '')
        .replaceAll(',', '')
        .trim();
      const hasHistoricalWork =
        historicalSeconds > 0 ||
        row.activeSec > 0 ||
        (historicalCell !== '' &&
          historicalCell !== '0' &&
          historicalCell !== '—' &&
          historicalCell !== '0h 0m 0s');
      if (
        hasHistoricalWork ||
        (!phaseEntries.has(row.event) &&
          !phaseEnds.has(row.event) &&
          !row.event.startsWith('demoted:'))
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
    if (isUnknownActorRecovery(row)) {
      // The prior end was not observed. Retain unknown contribution rather
      // than inventing an end, and allow a genuinely current later interval.
      open.delete(row.actorKey);
      result.unknownRows++;
      continue;
    }
    if (row.engagement) {
      validateTimingEngagement(row.engagement);
      if (row.engagement.endMs < row.ms || row.engagement.endMs >= row.ms + 1000) {
        result.failures.push('actor-evidence-window');
        continue;
      }
      const opened = open.get(row.actorKey);
      if (
        opened !== undefined &&
        (row.engagement.startMs < opened || row.engagement.startMs >= opened + 1000)
      ) {
        result.failures.push('actor-evidence-start-conflict');
        continue;
      }
      observedEndMs = Math.max(observedEndMs, row.engagement.endMs);
      result.intervals.push({ actorKey: row.actorKey, ...row.engagement });
      open.delete(row.actorKey);
    } else if (opener(row.event)) {
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
  if (phase !== null && Number.isFinite(endMs))
    phases.push({ phase, startMs: phaseStart, endMs: observedEndMs });
  result.incompleteActors = [...open.keys()];
  const rawIntervals = result.intervals;
  result.intervals = [];
  for (const actorKey of new Set(rawIntervals.map((interval) => interval.actorKey))) {
    const sorted = rawIntervals
      .filter((interval) => interval.actorKey === actorKey)
      .sort((a, b) => a.startMs - b.startMs || a.endMs - b.endMs);
    let prior = null;
    for (const interval of sorted) {
      if (prior && interval.startMs === prior.startMs && interval.endMs === prior.endMs) {
        const fields = [
          'wordStart',
          'wordEnd',
          'fullWordStart',
          'fullWordEnd',
          'activeEstimateSec',
        ];
        if (fields.every((field) => interval[field] === prior[field])) continue;
        result.failures.push('actor-evidence-conflict');
      }
      if (prior && interval.startMs < prior.endMs) {
        prior.endMs = Math.max(prior.endMs, interval.endMs);
        // Overlapping scalar word estimates have no defensible subtraction.
        prior.wordStart = prior.wordEnd = null;
        prior.fullWordStart = prior.fullWordEnd = null;
        prior.activeEstimateSec = null;
      } else {
        prior = { ...interval };
        result.intervals.push(prior);
      }
    }
  }
  for (const interval of result.intervals) {
    if (!validSpan(interval)) {
      result.failures.push('invalid-actor-interval');
      continue;
    }
    const duration = interval.endMs - interval.startMs;
    result.engagedMs += duration;
    const actor = (result.byActor[interval.actorKey] ||= { engagedMs: 0, words: 0 });
    actor.engagedMs += duration;
    actor.words =
      actor.words === null || interval.wordStart == null
        ? null
        : actor.words + interval.wordEnd - interval.wordStart;
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
