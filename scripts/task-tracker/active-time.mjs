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
    try { o = JSON.parse(l); } catch { continue; }
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

// Excess-only idle subtraction.
// Marks = [start, ...events, end]; for each gap between marks:
//   if gap > threshold: idle += gap - threshold
// active = (end - start) - idle.
// Empty events in a non-empty window → return { activeMin: 0, idleMin: 0 } (no evidence of activity).
export function computeActiveAndIdleMinutes({ startMs, endMs, events, idleThresholdMs }) {
  if (endMs <= startMs) return { activeMin: 0, idleMin: 0 };
  if (!events || events.length === 0) return { activeMin: 0, idleMin: 0 };
  const marks = [startMs, ...events, endMs];
  let idleMs = 0;
  for (let i = 1; i < marks.length; i++) {
    const gap = marks[i] - marks[i - 1];
    if (gap > idleThresholdMs) idleMs += gap - idleThresholdMs;
  }
  const activeMs = (endMs - startMs) - idleMs;
  return {
    activeMin: Math.max(0, Math.round(activeMs / 60000)),
    idleMin: Math.max(0, Math.round(idleMs / 60000)),
  };
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
    startMs, endMs, events,
    idleThresholdMs: idleThresholdMinutes * 60_000,
  }).activeMin;
}
