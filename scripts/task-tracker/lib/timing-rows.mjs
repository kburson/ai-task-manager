// Second-precision timing row helpers (#159 — D3).
//
// State-move verbs historically built timing rows with hardcoded
// `activeMin: 0, idleMin: 0`. Under AI/Full-Auto flows there is no
// heartbeat session, so every state move produces a zero row and the
// rollup loses all real elapsed time. This module derives elapsed time
// from row-to-row timestamp diffs at second precision so the audit
// trail reflects reality.
//
// Per-row second precision is carried via an invisible trailing HTML
// comment `<!-- row-sec: a=NNN i=NNN -->` appended by `buildRow`. The
// visible 7-column timing-log table schema is unchanged.

// Pause-span markers use `..` separator between from/until because raw
// ISO timestamps contain `:` and a colon separator would be ambiguous.
// Format: `<!-- aitm-pause: <fromIsoOrMs>..<untilIsoOrMs> -->`.
const PAUSE_MARKER_RE = /<!--\s*aitm-pause:\s*([^\s>]+?)\.\.([^\s>]+?)\s*-->/g;
const ROW_SEC_RE = /<!--\s*row-sec:\s*a=(-?\d+)\s+i=(-?\d+)\s*-->/;

// Timing-log timestamp pattern (supports both legacy HH:MM and new
// second-precision HH:MM:SS).
const TS_LINE_RE = /\|\s*(\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}(?::\d{2})?\s+[+-]\d{2}:\d{2})\s*\|/;

function tsToMs(ts) {
  if (ts == null) return NaN;
  if (ts instanceof Date) return ts.getTime();
  if (typeof ts === 'number') return Number.isFinite(ts) ? ts : NaN;
  if (typeof ts !== 'string') return NaN;
  // Accept both ISO ("2026-05-17T23:58:01.123Z") and table-format
  // ("2026-05-17 18:58:01 -05:00").
  const tableMatch = ts.match(
    /^(\d{4}-\d{2}-\d{2})\s+(\d{2}):(\d{2})(?::(\d{2}))?\s+([+-]\d{2}):(\d{2})$/
  );
  if (tableMatch) {
    const [, date, hh, mm, ss, offH, offM] = tableMatch;
    return Date.parse(`${date}T${hh}:${mm}:${ss ?? '00'}${offH}:${offM}`);
  }
  const parsed = Date.parse(ts);
  return Number.isFinite(parsed) ? parsed : NaN;
}

export function formatHMS(sec) {
  if (sec == null || !Number.isFinite(Number(sec))) return '—';
  const total = Math.max(0, Math.floor(Number(sec)));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

// Compute elapsed-time delta for a state-move row.
//
// Returns { activeSec, idleSec } where activeSec is wall-clock seconds
// between prev row and now, minus any pause-span seconds within the
// window. idleSec is the summed pause-span seconds (treated as idle
// rather than active).
//
// If prevRowTs is missing/invalid, returns { activeSec: 0, idleSec: 0 }
// (the row represents the boundary itself; no prior reference point).
export function computeStateMoveDelta({ prevRowTs, nowTs, pauseSpans = [] } = {}) {
  const nowMs = tsToMs(nowTs);
  const prevMs = tsToMs(prevRowTs);
  if (!Number.isFinite(nowMs) || !Number.isFinite(prevMs)) {
    return { activeSec: 0, idleSec: 0 };
  }
  if (nowMs <= prevMs) {
    return { activeSec: 0, idleSec: 0 };
  }
  const totalSec = Math.max(0, Math.floor((nowMs - prevMs) / 1000));
  let pauseSec = 0;
  for (const span of pauseSpans || []) {
    if (typeof span === 'number' && Number.isFinite(span)) {
      pauseSec += Math.max(0, Math.floor(span));
    } else if (span && typeof span === 'object') {
      const from = tsToMs(span.from);
      const until = tsToMs(span.until);
      if (Number.isFinite(from) && Number.isFinite(until) && until > from) {
        pauseSec += Math.max(0, Math.floor((until - from) / 1000));
      }
    }
  }
  pauseSec = Math.min(pauseSec, totalSec);
  return {
    activeSec: totalSec - pauseSec,
    idleSec: pauseSec,
  };
}

// Read the latest timing-row timestamp from an issue body. Returns the
// raw timestamp string (table format) or null if no rows are present.
export function lastRowTsFromBody(body) {
  if (!body || typeof body !== 'string') return null;
  const lines = body.split('\n');
  let last = null;
  for (const line of lines) {
    const m = line.match(TS_LINE_RE);
    if (m) last = m[1];
  }
  return last;
}

// Extract pause spans from `<!-- aitm-pause: <from>:<until> -->` markers
// inside the window [startMs, endMs]. Returns array of seconds.
export function pauseSpansBetween(body, startMs, endMs) {
  if (!body || typeof body !== 'string') return [];
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) return [];
  const spans = [];
  let m;
  PAUSE_MARKER_RE.lastIndex = 0;
  while ((m = PAUSE_MARKER_RE.exec(body)) !== null) {
    const from = tsToMs(m[1]);
    const until = tsToMs(m[2]);
    if (!Number.isFinite(from) || !Number.isFinite(until) || until <= from) continue;
    // Overlap with window.
    const lo = Math.max(from, startMs);
    const hi = Math.min(until, endMs);
    if (hi > lo) spans.push(Math.floor((hi - lo) / 1000));
  }
  return spans;
}

// Parse the trailing `<!-- row-sec: a=NNN i=NNN -->` marker on a timing
// row line. Returns { activeSec, idleSec } or null if not present.
export function parseRowSecMarker(line) {
  if (!line || typeof line !== 'string') return null;
  const m = line.match(ROW_SEC_RE);
  if (!m) return null;
  const activeSec = Number(m[1]);
  const idleSec = Number(m[2]);
  if (!Number.isFinite(activeSec) || !Number.isFinite(idleSec)) return null;
  return { activeSec, idleSec };
}

export function formatRowSecMarker({ activeSec, idleSec }) {
  const a = Math.max(0, Math.floor(Number(activeSec) || 0));
  const i = Math.max(0, Math.floor(Number(idleSec) || 0));
  return `<!-- row-sec: a=${a} i=${i} -->`;
}

// Convenience wrapper used by state-move verbs. Reads the most recent
// timing-row timestamp from `body`, sums any pause spans between then
// and `nowTs`, and returns `{ activeSec, idleSec }` suitable for passing
// straight to `buildRow`. Returns `{ activeSec: 0, idleSec: 0 }` when
// no prior row exists (first row of the issue's timing log) or when
// `body` is unavailable.
export function deriveStateMoveDelta(body, nowTs) {
  const prevTs = lastRowTsFromBody(body);
  if (!prevTs) return { activeSec: 0, idleSec: 0 };
  const startMs = tsToMs(prevTs);
  const endMs = tsToMs(nowTs);
  const pauseSpans = pauseSpansBetween(body, startMs, endMs);
  return computeStateMoveDelta({ prevRowTs: prevTs, nowTs, pauseSpans });
}

export { tsToMs as _tsToMs };
