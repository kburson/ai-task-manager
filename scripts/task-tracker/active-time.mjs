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

import { existsSync, readFileSync } from 'node:fs';

const ACTIVITY_TYPES = new Set(['user', 'assistant']);

export function collectEventTimestamps(filePath, startMs, endMs) {
  if (!existsSync(filePath)) return [];
  const lines = readFileSync(filePath, 'utf8').split('\n').filter(Boolean);
  const out = [];
  for (const l of lines) {
    let o;
    try {
      o = JSON.parse(l);
    } catch {
      continue;
    }
    if (!ACTIVITY_TYPES.has(o.type)) continue;
    if (o.isMeta || o.isSidechain) continue;
    if (!o.timestamp) continue;
    const t = Date.parse(o.timestamp);
    if (Number.isNaN(t)) continue;
    if (t < startMs || t > endMs) continue;
    out.push(t);
  }
  out.sort((a, b) => a - b);
  return out;
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
