import { normalizeTranscriptRecord } from '../providers/transcript-normalizer.mjs';
// Active-time computation: derive engaged-minutes from JSONL event timestamps.
//
// Wall-clock elapsed (end - start) overstates effort when the operator walks
// away. We approximate "active" time by looking at gaps between consecutive
// user/assistant events. Any gap > idleThreshold is treated as idle for its
// *excess* portion only — the first `idleThreshold` seconds of a gap still
// count as active (you're likely reading / thinking during that window).
//
// This is a heuristic, not truth. The threshold is tunable via config
// (idleThresholdMinutes, default 5).

import { existsSync } from 'node:fs';

import { scanJsonlRecordsWithSource } from './lib/jsonl-line-scanner.mjs';

// EPIC #823 timing model v2 (C3, AC1): a phase's active time is computed as its
// span − Σ(pause/switch-out→resume brackets), reading no `idle`/`active-work`
// row. The JSONL heuristics below are the WRITE-side per-turn producer; the
// canonical phase-span reader lives in `lib/timing-rows.mjs` and is re-exported
// here so `active-time.mjs` is the single import surface for active-time
// computation. Neither path reads a legacy `idle`/`active-work` row.
export { computeActiveByPhaseSpans } from './lib/timing-rows.mjs';

const ACTIVITY_TYPES = new Set(['user', 'assistant']);
const activitySources = new WeakMap();

// Exact original-result diagnostic data only, never a current timing authority.
export function readActivitySourceData(result) {
  return activitySources.get(result) ?? null;
}

export function readActivityEvidence(
  filePath,
  startMs,
  endMs,
  { provider, sid, idleThresholdMs = 300000 } = {}
) {
  const result = {
    status: 'unavailable',
    reason: 'window-unconfirmed',
    events: [],
    activeEstimateSec: null,
    idleEstimateSec: null,
    knownEngagementMs: null,
  };
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs < startMs)
    return { ...result, reason: 'invalid-window' };
  if (!existsSync(filePath)) return { ...result, reason: 'transcript-missing' };
  const starts = new Map();
  const coverage = [];
  let sessionId = null;
  let invalid = false;
  let supported = false;
  let source = null;
  try {
    source = scanJsonlRecordsWithSource(filePath, {
      onMalformed() {
        invalid = true;
      },
      onRecord(record) {
        if (!record || typeof record !== 'object') {
          invalid = true;
          return;
        }
        const normalized = normalizeTranscriptRecord(record);
        const legacyActivity =
          ACTIVITY_TYPES.has(record.type) && !record.isMeta && !record.isSidechain;
        const active = legacyActivity || normalized.events.length > 0;
        supported ||= normalized.recognized || legacyActivity;
        const timestamp = Date.parse(record.timestamp);
        if (active && Number.isFinite(timestamp) && timestamp >= startMs && timestamp <= endMs)
          result.events.push(timestamp);
        if (record.type === 'session_meta') {
          if (sessionId !== null || typeof record.payload?.id !== 'string') invalid = true;
          sessionId = record.payload?.id;
        }
        if (record.type !== 'event_msg') return;
        const payload = record.payload;
        if (payload?.type === 'task_started') {
          if (
            typeof payload.turn_id !== 'string' ||
            !Number.isSafeInteger(payload.started_at) ||
            starts.has(payload.turn_id)
          ) {
            invalid = true;
            return;
          }
          starts.set(payload.turn_id, payload.started_at);
        } else if (payload?.type === 'task_complete') {
          if (
            typeof payload.turn_id !== 'string' ||
            starts.get(payload.turn_id) !== payload.started_at ||
            !Number.isSafeInteger(payload.completed_at) ||
            payload.completed_at < payload.started_at ||
            !Number.isFinite(payload.duration_ms) ||
            payload.duration_ms < 0 ||
            Math.abs(payload.duration_ms - (payload.completed_at - payload.started_at) * 1000) >
              1000
          ) {
            invalid = true;
            return;
          }
          // Native second-resolution boundaries do not establish their unknown subsecond edges.
          coverage.push([(payload.started_at + 1) * 1000, payload.completed_at * 1000]);
          starts.delete(payload.turn_id);
          supported = true;
        }
      },
    });
  } catch {
    return { ...result, reason: 'transcript-unreadable' };
  }
  const finish = value => {
    // Ordinary callers retain their original mutable result. Only completed
    // native scans with scalar inputs get detached frozen diagnostic facts.
    if (typeof filePath === 'string' && (provider == null || typeof provider === 'string') &&
        (sid == null || typeof sid === 'string') && Number.isFinite(idleThresholdMs) &&
        value.events.every(Number.isFinite) &&
        [value.activeEstimateSec, value.idleEstimateSec, value.knownEngagementMs].every(n => n === null || Number.isFinite(n))) {
      activitySources.set(value, Object.freeze({ path: filePath, provider: provider ?? null, sid: sid ?? null,
        startMs, endMs, idleThresholdMs, byteLength: source.byteLength, sha256: source.sha256,
        status: value.status, reason: value.reason, events: Object.freeze([...value.events]),
        activeEstimateSec: value.activeEstimateSec, idleEstimateSec: value.idleEstimateSec,
        knownEngagementMs: value.knownEngagementMs }));
    }
    return value;
  };
  result.events = [...new Set(result.events)].sort((a, b) => a - b);
  if (invalid) return finish({ ...result, reason: 'transcript-malformed' });
  if (!supported) return finish({ ...result, reason: 'transcript-unsupported' });
  if (provider !== 'codex' || typeof sid !== 'string' || sessionId !== sid)
    return finish({ ...result, reason: 'window-identity-unconfirmed' });
  coverage.sort((a, b) => a[0] - b[0]);
  let cursor = startMs;
  for (const [start, end] of coverage) {
    if (start > cursor) break;
    if (end >= cursor) cursor = end;
  }
  if (cursor < endMs || !coverage.some(([start, end]) => start <= startMs && end >= startMs))
    return finish(result);
  const estimate = computeActiveAndIdleSeconds({
    startMs,
    endMs,
    events: result.events,
    idleThresholdMs,
  });
  return finish({
    ...result,
    status: 'observed',
    reason: null,
    activeEstimateSec: estimate.activeSec,
    idleEstimateSec: estimate.idleSec,
    knownEngagementMs: endMs - startMs,
  });
}

export function collectEventTimestamps(filePath, startMs, endMs) {
  return readActivityEvidence(filePath, startMs, endMs).events;
}

// Excess-only idle subtraction, at second precision.
// Marks = [start, ...events, end]; for each gap between marks:
//   if gap > threshold: idle += gap - threshold
// active = (end - start) - idle.
// Empty events in a non-empty window → return { activeSec: 0, idleSec: 0 } (no evidence of activity).
//
// #720 — the second-precision sibling of `computeActiveAndIdleMinutes`. The
// flush path (`flushActiveToGH`) renders pause rows at second granularity so
// they no longer coarsen sub-minute moves to a whole number; it needs the raw
// seconds, not the minute-rounded values. `computeActiveAndIdleMinutes` is now
// a thin `/60` derivation of this so the two can never disagree about the idle
// model.
export function computeActiveAndIdleSeconds({ startMs, endMs, events, idleThresholdMs }) {
  if (endMs <= startMs) return { activeSec: 0, idleSec: 0 };
  if (!events || events.length === 0) return { activeSec: 0, idleSec: 0 };
  const marks = [startMs, ...events, endMs];
  let idleMs = 0;
  for (let i = 1; i < marks.length; i++) {
    const gap = marks[i] - marks[i - 1];
    if (gap > idleThresholdMs) idleMs += gap - idleThresholdMs;
  }
  const activeMs = endMs - startMs - idleMs;
  return {
    activeSec: Math.max(0, Math.round(activeMs / 1000)),
    idleSec: Math.max(0, Math.round(idleMs / 1000)),
  };
}

// Excess-only idle subtraction. Derives minute values from the second-precision
// computation so both functions share one idle model. `{ activeMin: 0, idleMin: 0 }`
// for an empty/degenerate window (no evidence of activity).
export function computeActiveAndIdleMinutes(args) {
  const { activeSec, idleSec } = computeActiveAndIdleSeconds(args);
  return {
    activeMin: Math.max(0, Math.round(activeSec / 60)),
    idleMin: Math.max(0, Math.round(idleSec / 60)),
  };
}

// #720 — resolve the flush-row Active-duration start anchor. The flush path
// used `state.entryStartTs` unconditionally, but forward move-state promotions
// do NOT advance `entryStartTs`, so a `pause` after intervening move-state rows
// re-counted wall time those rows already logged. Anchoring on the LATER of
// `entryStartMs` and the last existing timing-row ts (`lastRowMs`) guarantees a
// flush never claims a window a prior row already owns. NaN/absent `lastRowMs`
// (unreadable timing body) falls back to `entryStartMs`; a NaN `entryStartMs`
// falls back to `lastRowMs`. Pure and total — never throws.
export function resolveFlushStartMs(entryStartMs, lastRowMs) {
  const entry = Number(entryStartMs);
  const last = Number(lastRowMs);
  const entryOk = Number.isFinite(entry);
  const lastOk = Number.isFinite(last);
  if (!lastOk) return entry;
  if (!entryOk) return last;
  return Math.max(entry, last);
}

// Backward-compat wrapper — returns only activeMin.
export function computeActiveMinutes(args) {
  return computeActiveAndIdleMinutes(args).activeMin;
}

// Convenience wrapper for callers that have ISO strings + a config.
export function activeMinutesForWindow({ filePath, startIso, endIso, idleThresholdMinutes }) {
  const startMs = new Date(startIso).getTime();
  const endMs = new Date(endIso).getTime();
  const events = collectEventTimestamps(filePath, startMs, endMs);
  return computeActiveAndIdleMinutes({
    startMs,
    endMs,
    events,
    idleThresholdMs: idleThresholdMinutes * 60_000,
  }).activeMin;
}
