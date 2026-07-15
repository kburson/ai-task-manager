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

import { classifyTimingEvent, EVENT_CLASS } from './timing-event-map.mjs';
import { PHASE_EVENTS } from '../phase-events.mjs';

// Pause-span markers use `..` separator between from/until because raw
// ISO timestamps contain `:` and a colon separator would be ambiguous.
// Format: `<!-- aitm-pause: <fromIsoOrMs>..<untilIsoOrMs> -->`.
const PAUSE_MARKER_RE = /<!--\s*aitm-pause:\s*([^\s>]+?)\.\.([^\s>]+?)\s*-->/g;
// D3 design-doc form: `<!-- aitm-pause: from=<ISO> until=<ISO> [reason=<slug>] -->`.
// Keys may appear in any order; reason is optional. Values are non-whitespace runs.
const PAUSE_MARKER_KV_RE =
  /<!--\s*aitm-pause:\s+(?=[^>]*\bfrom=)(?=[^>]*\buntil=)((?:\s*[a-z]+=\S+)+)\s*-->/g;
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

// Render a non-negative integer second count as the human-readable
// `Xh Ym Zs` duration form used in timing-log rows: hours are not
// zero-padded, minutes and seconds are zero-padded to two digits.
// Examples: 0 -> "0h 00m 00s", 47 -> "0h 00m 47s",
// 3852 -> "1h 04m 12s", 43380 -> "12h 03m 00s".
//
// The companion `parseDurationSeconds` is its exact inverse, so
// `parseDurationSeconds(formatDurationSeconds(n)) === n` for every
// non-negative integer n. Throws on non-integer or negative input —
// this is a storage-format helper and silent coercion would corrupt
// the round-trip guarantee.
export function formatDurationSeconds(n) {
  if (typeof n !== 'number' || !Number.isInteger(n) || n < 0) {
    throw new RangeError(`formatDurationSeconds expects a non-negative integer, got: ${n}`);
  }
  const h = Math.floor(n / 3600);
  const m = Math.floor((n % 3600) / 60);
  const s = n % 60;
  return `${h}h ${String(m).padStart(2, '0')}m ${String(s).padStart(2, '0')}s`;
}

const DURATION_SECONDS_RE = /^(\d+)h (\d{2})m (\d{2})s$/;

// Parse the `Xh Ym Zs` form produced by `formatDurationSeconds` back to
// an integer second count. Inverse of `formatDurationSeconds`. Throws on
// any string that does not match the canonical zero-padded form, or whose
// minutes/seconds fields are out of range (>= 60).
export function parseDurationSeconds(s) {
  if (typeof s !== 'string') {
    throw new TypeError(`parseDurationSeconds expects a string, got: ${typeof s}`);
  }
  const match = s.match(DURATION_SECONDS_RE);
  if (!match) {
    throw new RangeError(`parseDurationSeconds: malformed duration string: ${JSON.stringify(s)}`);
  }
  const h = Number(match[1]);
  const m = Number(match[2]);
  const sec = Number(match[3]);
  if (m >= 60 || sec >= 60) {
    throw new RangeError(
      `parseDurationSeconds: minutes/seconds out of range: ${JSON.stringify(s)}`
    );
  }
  return h * 3600 + m * 60 + sec;
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

// #822 — read the last timing-log row's timestamp AND Event-cell slug from an
// issue body. Returns `{ ts, event }` (event lower-cased, trimmed) or null when
// no rows are present. The departure choke point (`ctx.flushActiveToGH`) uses
// this to detect an unclosed finalize/orphan `idle` tail before it appends a
// second departure row — the Fault Z doubled-step. The Event cell is the 2nd
// pipe-delimited field (`| ts | event | active | ... |`); a trailing
// `<!-- row-sec -->` marker lives after the last pipe and never perturbs it.
export function lastRowFromBody(body) {
  if (!body || typeof body !== 'string') return null;
  const lines = body.split('\n');
  let last = null;
  for (const line of lines) {
    const m = line.match(TS_LINE_RE);
    if (!m) continue;
    const cells = line.split('|').map((s) => s.trim());
    last = { ts: m[1], event: (cells[2] ?? '').toLowerCase() };
  }
  return last;
}

// Parse every `aitm-pause` marker in the body and return
// `Array<{from: Date, until: Date, reason: string}>`. Accepts both forms:
//   `<!-- aitm-pause: <from>..<until> -->`                (back-compat)
//   `<!-- aitm-pause: from=<ISO> until=<ISO> [reason=<slug>] -->` (D3 spec)
// Markers with an unparseable timestamp, or `until <= from`, are dropped.
// `reason` is empty string when absent.
export function parsePauseMarkers(body) {
  if (!body || typeof body !== 'string') return [];
  const out = [];
  let m;
  PAUSE_MARKER_RE.lastIndex = 0;
  while ((m = PAUSE_MARKER_RE.exec(body)) !== null) {
    const fromMs = tsToMs(m[1]);
    const untilMs = tsToMs(m[2]);
    if (!Number.isFinite(fromMs) || !Number.isFinite(untilMs) || untilMs <= fromMs) continue;
    out.push({ from: new Date(fromMs), until: new Date(untilMs), reason: '' });
  }
  PAUSE_MARKER_KV_RE.lastIndex = 0;
  while ((m = PAUSE_MARKER_KV_RE.exec(body)) !== null) {
    const kvs = {};
    for (const pair of m[1].trim().split(/\s+/)) {
      const eq = pair.indexOf('=');
      if (eq < 1) continue;
      kvs[pair.slice(0, eq)] = pair.slice(eq + 1);
    }
    if (!kvs.from || !kvs.until) continue;
    const fromMs = tsToMs(kvs.from);
    const untilMs = tsToMs(kvs.until);
    if (!Number.isFinite(fromMs) || !Number.isFinite(untilMs) || untilMs <= fromMs) continue;
    out.push({
      from: new Date(fromMs),
      until: new Date(untilMs),
      reason: kvs.reason || '',
    });
  }
  return out;
}

// Extract pause spans inside the window [startMs, endMs]. Partial-overlap
// spans are pro-rated to the intersection. Returns array of seconds.
export function pauseSpansBetween(body, startMs, endMs) {
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) return [];
  const markers = parsePauseMarkers(body);
  const spans = [];
  for (const { from, until } of markers) {
    const lo = Math.max(from.getTime(), startMs);
    const hi = Math.min(until.getTime(), endMs);
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

// EPIC #823 timing model v2 (C2) — phase-span close delta.
//
// Replaces the v1 row-to-row inference (`deriveStateMoveDelta`) on the
// `<phase>:complete` writer branch. Where v1 measured "last row → now minus
// aitm-pause marker spans", v2 measures the whole phase span from its opening
// `<phase>:started` row to `nowTs`, and derives idle strictly by pairing
// departure → re-engagement ROWS inside that span:
//
//   activeSec = (nowTs − started.ts) − Σ(resume.ts − departure.ts)
//
// Brackets are found by walking the rows from the phase's last `:started` row
// forward and classifying each sub-span by its OPENING row: a sub-span opened
// by a DEPARTURE row (`pause` / `switch-out`) is idle, every other sub-span is
// active. This is deliberately row-paired rather than idle-cell-summed — a
// `switch-out:#N` bracket is recorded on the *outgoing* issue's log and the
// return `resumed` row carries `idleSec: 0`, so idle cells never capture a
// switch-out window. The classifier (`classifyTimingEvent`) already treats
// retired `idle`/`active-work` slugs as neutral PHASE, so a legacy row inside
// the span opens an active sub-span, never idle.
//
// `phase` is the kanban STATE name (e.g. `develop`); the opening slug is read
// from `PHASE_EVENTS[phase].enter.event`. The MATCH scopes to the LAST such
// enter row at/before `nowTs`, so a demote re-entry (a second `<phase>:started`
// after a `demoted` audit row) yields the per-entry span, not the whole history.
//
// `startWordMarker` is the Word-Marker cell (`cells[6]`) of that enter row, so
// the caller can stamp `Δwords = currentMarker − startWordMarker`.
//
// Returns `{ activeSec, idleSec, startWordMarker, matched }`. `matched:false`
// (no enter row found, or unusable input) signals the caller to fall back to
// `deriveStateMoveDelta` rather than emit a 0-active row.
export function computePhaseCloseDelta(body, phase, nowTs) {
  const enterEvent = PHASE_EVENTS?.[phase]?.enter?.event;
  const nowMs = tsToMs(nowTs);
  if (!enterEvent || !Number.isFinite(nowMs) || !body || typeof body !== 'string') {
    return { activeSec: 0, idleSec: 0, startWordMarker: NaN, matched: false };
  }
  const parsed = [];
  for (const line of body.split('\n')) {
    const m = line.match(TS_LINE_RE);
    if (!m) continue;
    const ms = tsToMs(m[1]);
    if (!Number.isFinite(ms) || ms > nowMs) continue;
    const cells = line.split('|').map((s) => s.trim());
    const markerNum = Number(cells[6]);
    parsed.push({
      ms,
      event: (cells[2] ?? '').toLowerCase(),
      marker: Number.isFinite(markerNum) ? markerNum : NaN,
    });
  }
  let enterIdx = -1;
  for (let i = parsed.length - 1; i >= 0; i--) {
    if (parsed[i].event === enterEvent) {
      enterIdx = i;
      break;
    }
  }
  if (enterIdx === -1) {
    return { activeSec: 0, idleSec: 0, startWordMarker: NaN, matched: false };
  }
  let activeSec = 0;
  let idleSec = 0;
  for (let i = enterIdx; i < parsed.length; i++) {
    const thisMs = parsed[i].ms;
    const nextMs = i + 1 < parsed.length ? parsed[i + 1].ms : nowMs;
    const spanSec = Math.max(0, Math.floor((nextMs - thisMs) / 1000));
    if (classifyTimingEvent(parsed[i].event) === EVENT_CLASS.DEPARTURE) idleSec += spanSec;
    else activeSec += spanSec;
  }
  return { activeSec, idleSec, startWordMarker: parsed[enterIdx].marker, matched: true };
}

// EPIC #823 timing model v2 (C3) — whole-log phase-span active-time calculator.
//
// Generalizes `computePhaseCloseDelta` across the ENTIRE timing log: every phase
// ENTER row (`PHASE_EVENTS[*].enter.event`) opens a span that runs to the next
// phase boundary — any enter/complete slug, or a `demoted` audit row — or to
// `nowTs` (default: the last row's timestamp) for the trailing open phase. Within
// each span, adjacent sub-spans are classified by their OPENING row via
// `classifyTimingEvent`: a DEPARTURE (`paused`/`switch-out`) opens an IDLE
// bracket, everything else is ACTIVE. Idle is NEVER stored — it is exactly the
// bracket delta.
//
// Because enters tile the worked timeline contiguously and non-overlapping,
// summing per-enter spans sums per-phase active time with no double-count;
// between-phase gaps (e.g. `plan:completed → develop:started`, awaiting approval)
// fall outside every span and are excluded. Re-entries (a repeated enter slug
// after a `demoted`) accumulate under the same phase key.
//
// v2 invariants: a legacy `idle`/`active-work` row classifies as neutral PHASE
// (active), so a span's active/idle split is invariant to whether such a row is
// present (a healed log with it stripped yields identical totals) — and the walk
// keys on a whitelist of phase/departure events, never on `idle`/`active-work`.
//
// Returns `{ totalActiveSec, totalIdleSec, perPhase: [{ event, activeSec, idleSec }] }`.
export function computeActiveByPhaseSpans(body, nowTs) {
  const empty = { totalActiveSec: 0, totalIdleSec: 0, perPhase: [] };
  if (!body || typeof body !== 'string') return empty;

  const nowMsArg = nowTs == null ? null : tsToMs(nowTs);
  const parsed = [];
  for (const line of body.split('\n')) {
    const m = line.match(TS_LINE_RE);
    if (!m) continue;
    const ms = tsToMs(m[1]);
    if (!Number.isFinite(ms)) continue;
    const cells = line.split('|').map((s) => s.trim());
    parsed.push({ ms, event: (cells[2] ?? '').toLowerCase() });
  }
  if (parsed.length === 0) return empty;

  const nowMs =
    nowMsArg != null && Number.isFinite(nowMsArg) ? nowMsArg : parsed[parsed.length - 1].ms;
  const rows = parsed.filter((r) => r.ms <= nowMs);
  if (rows.length === 0) return empty;

  // Boundary set = every enter slug ∪ every complete slug ∪ a demote row. An
  // enter row's span ends at the FIRST boundary strictly after it — its own
  // complete, a demote, or the next phase's enter — so the awaiting-approval gap
  // between a complete and the next enter is never counted. The demote row is
  // matched via `isBoundary` below, which accepts both the legacy bare `demoted`
  // slug and the v2 (#823 C7 / D3) target-suffixed `demoted:<target>` form.
  const enterSlugs = new Set();
  const boundarySlugs = new Set(['demoted']);
  for (const state of Object.values(PHASE_EVENTS)) {
    if (state.enter?.event) {
      enterSlugs.add(state.enter.event);
      boundarySlugs.add(state.enter.event);
    }
    if (state.complete?.event) boundarySlugs.add(state.complete.event);
  }
  const isBoundary = (event) => boundarySlugs.has(event) || event.startsWith('demoted:');

  const perPhaseMap = new Map();
  for (let ei = 0; ei < rows.length; ei++) {
    if (!enterSlugs.has(rows[ei].event)) continue;
    let endIdx = rows.length;
    for (let j = ei + 1; j < rows.length; j++) {
      if (isBoundary(rows[j].event)) {
        endIdx = j;
        break;
      }
    }
    const endMs = endIdx < rows.length ? rows[endIdx].ms : nowMs;
    let activeSec = 0;
    let idleSec = 0;
    for (let j = ei; j < endIdx; j++) {
      const thisMs = rows[j].ms;
      const nextMs = j + 1 < endIdx ? rows[j + 1].ms : endMs;
      const spanSec = Math.max(0, Math.floor((nextMs - thisMs) / 1000));
      if (classifyTimingEvent(rows[j].event) === EVENT_CLASS.DEPARTURE) idleSec += spanSec;
      else activeSec += spanSec;
    }
    const key = rows[ei].event;
    const acc = perPhaseMap.get(key) || { event: key, activeSec: 0, idleSec: 0 };
    acc.activeSec += activeSec;
    acc.idleSec += idleSec;
    perPhaseMap.set(key, acc);
  }

  let totalActiveSec = 0;
  let totalIdleSec = 0;
  const perPhase = [];
  for (const acc of perPhaseMap.values()) {
    totalActiveSec += acc.activeSec;
    totalIdleSec += acc.idleSec;
    perPhase.push(acc);
  }
  return { totalActiveSec, totalIdleSec, perPhase };
}

export { tsToMs as _tsToMs };
