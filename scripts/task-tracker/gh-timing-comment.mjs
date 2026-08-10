// GH timing comment — locate/create/append.
// GH I/O uses `gh` CLI via execFile with timeout.

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { PHASE_EVENTS, resolvePhaseEvent } from './phase-events.mjs';
import { withLock } from './locks.mjs';
import { getProjectDir, timingLockPath as resolveTimingLockPath } from './paths.mjs';
import { serializeMarker, unescapeValue } from './lib/marker-grammar.mjs';
import { hasReviewApprovedMarker, parseReviewApprovedMarker } from './lib/markers.mjs';
import {
  ensureTimingRowFullMarkerCell,
  isTableTimingTimestamp,
  parseTimingRow,
  replaceTimingRowCells,
  replaceTimingRowCell,
} from './lib/timing-row-reader.mjs';
import { formatDurationSeconds, lastRowTsFromBody, _tsToMs } from './lib/timing-rows.mjs';
import { classifyEvent, lastOpenInterruption, timingCommentHasRows } from './lib/bind-event.mjs';
import { shouldSuppressTimingAppend } from './lib/terminal-review-handoff.mjs';
import {
  EVENT_CLASS,
  classifyTimingEvent,
  isEmittableTimingEvent,
} from './lib/timing-events/index.mjs';
import { GH_TIMING_COMMENT_TIMEOUT_MS } from './lib/process-timeouts.mjs';
export { GH_TIMING_COMMENT_TIMEOUT_MS };
const pexec = promisify(execFile);

// #568 — raised by `appendRow` when a second `start` row is attempted over a
// timing log that already holds data rows and has NO open interruption to pair
// against. Duplicate-`start` is forbidden by construction; the refusal is loud
// (thrown), never a silent drop.
export class DuplicateStartError extends Error {
  constructor(message) {
    super(message);
    this.name = 'DuplicateStartError';
    this.code = 'DUPLICATE_START';
  }
}

const TIMING_HEADING = '⏱ Timing Log';

// #1142 — both transcript cursors are absolute, durable ledger snapshots. The
// visible primary delta is derived at the locked append boundary from adjacent
// Word Marker cells; callers cannot independently transport a divergent delta.
const COLUMN_LEGEND =
  '<sub>Δ Words = current Word Marker minus the adjacent previous Word Marker (`0` on the first or a flat row). Word Marker = cumulative stay-abreast words. Full Word Marker = cumulative full-expansion words including complete tool inputs and outputs. Both markers carry forward monotonically; `—` means the transcript was unavailable.</sub>';

const TABLE_HEADER = [
  '| Timestamp | Event | Active | Idle | Δ Words | Word Marker | Description | Full Word Marker |',
  '|---|---|---|---|---|---|---|---|',
].join('\n');

// #1104 — `offsetMin` (minutes east of UTC) renders the wall-clock at an
// explicitly chosen offset instead of the emitting machine's local zone. It is
// strictly opt-in: omit it and the local-zone path below runs byte-for-byte as
// before, so `buildRow`/`buildFlushRow` and every live timing row are untouched.
// Display-only either way — the recorded instant is identical, and rollup
// arithmetic reads the trailing `row-sec` marker, not this cell.
export function fmtTs(iso, { offsetMin } = {}) {
  const pad = (n) => String(n).padStart(2, '0');
  const base = new Date(iso);
  // Strictly `number`: `null` (what `timingTimestampOffsetMin` returns for a
  // timestamp carrying no offset) must fall through to the local-zone default,
  // and `Number(null)` is a finite 0, so a coercing check would silently render
  // those rows at +00:00 instead.
  const explicit = typeof offsetMin === 'number' && Number.isFinite(offsetMin);
  const effectiveOffsetMin = explicit ? offsetMin : -base.getTimezoneOffset();
  const sign = effectiveOffsetMin >= 0 ? '+' : '-';
  const abs = Math.abs(effectiveOffsetMin);
  const offset = `${sign}${pad(Math.floor(abs / 60))}:${pad(abs % 60)}`;
  if (!explicit) {
    return `${base.getFullYear()}-${pad(base.getMonth() + 1)}-${pad(base.getDate())} ${pad(base.getHours())}:${pad(base.getMinutes())}:${pad(base.getSeconds())} ${offset}`;
  }
  // Shift the epoch by the requested offset and read the UTC field getters, so
  // the rendered wall-clock is the one an observer at that offset would see.
  const d = new Date(base.getTime() + offsetMin * 60_000);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())} ${offset}`;
}

export function firstStartTimestamp(commentBody) {
  if (!commentBody) return null;
  const lines = commentBody.split('\n');
  for (const line of lines) {
    const row = parseTimingRow(line);
    if (row?.event === 'start' && isTableTimingTimestamp(row.ts)) return row.ts;
  }
  return null;
}
function fmtNum(n) {
  return n == null ? '—' : Number(n).toLocaleString('en-US');
}

// #489 — render an effective-zero scalar as a blank cell so the timing-log
// table is not cluttered with zero-value formats. `null`/missing keeps the `—`
// "no data" sentinel (a distinct meaning from zero); a literal 0 collapses to
// an empty cell. Used for the ΔWords cell and the legacy minute-form Active/Idle
// cells. WordMarker deliberately keeps `fmtNum` — a 0 WordMarker marks a genuine
// session start and must retain its signal. This is display-only: the trailing
// `<!-- row-sec: a=N i=N -->` marker keeps the raw numeric seconds untouched.
function fmtNumBlankZero(n) {
  if (n == null) return '—';
  return Number(n) === 0 ? '' : Number(n).toLocaleString('en-US');
}

// Maximum allowed skew (ms) between a caller-supplied `ts` and `Date.now()`.
// Beyond this window in either direction, `buildRow` refuses to construct a
// row. This closes the data-fabrication hole where a caller backdates an
// event to claim work happened earlier than it did. No flag, no env var,
// no argument bypasses this check.
const RETROACTIVE_TS_WINDOW_MS = 60_000;

const RETROACTIVE_TS_ERROR =
  'retroactive timing entries are forbidden; recorded gaps must be reconciled, not fabricated';

function tsToMs(ts) {
  if (ts == null) return NaN;
  if (ts instanceof Date) return ts.getTime();
  if (typeof ts === 'number') return ts;
  if (typeof ts === 'string') return Date.parse(ts);
  return NaN;
}

export function buildRow({
  ts,
  event,
  activeMin,
  idleMin,
  activeSec,
  idleSec,
  deltaWords,
  deltaWordsFull,
  wordMarker,
  fullWordMarker,
  description = '',
  phase,
}) {
  const tsMs = tsToMs(ts);
  if (!Number.isFinite(tsMs)) {
    throw new Error(`${RETROACTIVE_TS_ERROR} (received non-parseable ts: ${String(ts)})`);
  }
  if (Math.abs(tsMs - Date.now()) > RETROACTIVE_TS_WINDOW_MS) {
    throw new Error(RETROACTIVE_TS_ERROR);
  }
  // Phase descriptor — when supplied as `{state, phase}` (or `{state, kind}`),
  // resolve event + description from PHASE_EVENTS. Caller-supplied `event` /
  // `description` win when the descriptor is missing or unresolved; this keeps
  // legacy callers (still passing raw event strings) byte-identical.
  if (phase && typeof phase === 'object') {
    const resolved = resolvePhaseEvent(phase);
    if (resolved) {
      if (event == null) event = resolved.event;
      if (!description) description = resolved.description;
    }
  }
  if (!isEmittableTimingEvent(event)) {
    throw new Error(`refusing non-emittable Timing Log event: ${String(event)}`);
  }
  // When second precision is supplied, render the Active and Idle cells with
  // the fixed-width `Xh Ym Zs` duration form so sub-minute moves are no longer
  // rounded away to 0. A trailing `<!-- row-sec: a=N i=N -->` comment carries
  // the raw second values as the canonical numeric source for downstream
  // rollup; the visible duration strings are presentation only. When only
  // minute values are supplied (legacy heartbeat callers), the cells fall back
  // to the integer-minute form.
  let activeCell;
  let idleCell;
  let trailingMarker = '';
  if (Number.isFinite(Number(activeSec)) || Number.isFinite(Number(idleSec))) {
    const aSec = Number.isFinite(Number(activeSec))
      ? Math.max(0, Math.floor(Number(activeSec)))
      : 0;
    const iSec = Number.isFinite(Number(idleSec)) ? Math.max(0, Math.floor(Number(idleSec))) : 0;
    // #489 — blank an effective-zero duration cell; the row-sec marker below
    // still carries the raw seconds, so rollup/aggregation is unaffected.
    activeCell = aSec === 0 ? '' : formatDurationSeconds(aSec);
    idleCell = iSec === 0 ? '' : formatDurationSeconds(iSec);
    trailingMarker = ` <!-- row-sec: a=${aSec} i=${iSec} -->`;
  } else {
    activeCell = fmtNumBlankZero(activeMin);
    idleCell = fmtNumBlankZero(idleMin);
  }
  // #1142 — `fullWordMarker` is the absolute full-expansion cursor. Keep the
  // legacy delta option byte-compatible for non-posting fixtures while live
  // producers migrate; appendRow normalizes every posted row to the absolute
  // schema and treats an omitted value as explicitly unavailable.
  const fullCell =
    fullWordMarker !== undefined
      ? ` ${fmtNum(fullWordMarker)} |`
      : deltaWordsFull === undefined
        ? ''
        : ` ${fmtNumBlankZero(deltaWordsFull)} |`;
  return `| ${fmtTs(ts)} | ${event} | ${activeCell} | ${idleCell} | ${fmtNumBlankZero(deltaWords)} | ${fmtNum(wordMarker)} | ${description} |${fullCell}${trailingMarker}`;
}

// #981 — narrow, explicit exemption from buildRow's retroactive-timestamp
// guard (RETROACTIVE_TS_WINDOW_MS, above). That guard exists to stop a caller
// from BACKDATING a claim of active work. This builder can only ever produce
// a zero-delta marker row — activeSec/idleSec/deltaWords are hard-zeroed, not
// caller-settable — so inserting it at an earlier, already-elapsed instant
// can only ever RECLASSIFY an already-elapsed gap from active to idle on the
// next phase close recompute (`computePhaseCloseDelta`), never fabricate a
// new active-time claim. Do not add activeSec/idleSec/deltaWords parameters
// to this function; that would reopen the exact hole the guard on `buildRow`
// closes. Used by `verbResume` (via `lib/bind-event.mjs`'s
// `detectUnmarkedDepartureGap`) to insert a synthetic `pause:<reason>` row
// before writing `resumed` over a gap with no departure row.
//
// #1104 — `offsetMin` (minutes east of UTC) chooses the offset the timestamp
// cell renders at. The synthetic row sits one second after the row it follows
// and is read continuously with it, so the caller supplies the offset of THAT
// neighboring row (`verbResume` parses it off `gap.lastRowTs`); rendering in
// the emitting machine's zone instead would show a reader an offset jump that
// is not real. Omitted, the local-zone default is unchanged.
export function buildBackdatedDepartureRow({ ts, event, description = '', wordMarker, offsetMin }) {
  const tsMs = tsToMs(ts);
  if (!Number.isFinite(tsMs)) {
    throw new Error(`buildBackdatedDepartureRow: non-parseable ts: ${String(ts)}`);
  }
  if (!isEmittableTimingEvent(event) || classifyTimingEvent(event) !== EVENT_CLASS.DEPARTURE) {
    throw new Error(`refusing non-emittable departure Timing Log event: ${String(event)}`);
  }
  const wm = wordMarker == null ? null : Number(String(wordMarker).replace(/,/g, ''));
  return `| ${fmtTs(ts, { offsetMin })} | ${event} |  |  |  | ${fmtNum(Number.isFinite(wm) ? wm : null)} | ${description} | <!-- row-sec: a=0 i=0 -->`;
}

// #1133 — the Review approval marker is a durable authority record, so a
// missing Timing Log projection may be repaired from its immutable timestamp.
// This is deliberately a separate, capability-narrow constructor rather than
// an escape hatch on buildRow: callers cannot provide an arbitrary timestamp or
// event, and the generic 60-second freshness invariant remains unconditional.
export function buildMarkerAuthorizedReviewApprovedRow({
  issueBody,
  activeSec,
  idleSec,
  wordMarker,
}) {
  if (!hasReviewApprovedMarker(issueBody)) {
    throw new Error('review approval timing requires an authoritative approval marker');
  }
  const approval = parseReviewApprovedMarker(issueBody);
  const tsMs = tsToMs(approval?.ts);
  if (!Number.isFinite(tsMs)) {
    throw new Error('review approval timing marker has a non-parseable timestamp');
  }
  const aSec = Number.isFinite(Number(activeSec)) ? Math.max(0, Math.floor(Number(activeSec))) : 0;
  const iSec = Number.isFinite(Number(idleSec)) ? Math.max(0, Math.floor(Number(idleSec))) : 0;
  const marker = Number(String(wordMarker ?? '').replace(/,/g, ''));
  return `| ${fmtTs(approval.ts)} | review:approved | ${aSec === 0 ? '' : formatDurationSeconds(aSec)} | ${iSec === 0 ? '' : formatDurationSeconds(iSec)} |  | ${fmtNum(Number.isFinite(marker) ? marker : null)} | story approved | <!-- row-sec: a=${aSec} i=${iSec} -->`;
}

// #484 — shared flush-path row builder. `flushActiveToGH` (the path behind every
// timing-emitting verb, `pause` included) previously passed minute scalars to
// `buildRow`, so its rows rendered the bare-integer Active/Idle form while the
// `resume` verb — which passes `activeSec` directly — rendered the `Xh Ym Zs`
// duration form. That asymmetry is the #484 defect (pause rows showed a lone
// minute number). Routing every flushed row through this helper converts the
// minute values to whole seconds (`min * 60`) and delegates to `buildRow` with
// `activeSec`/`idleSec`, so all flushed rows render the duration form AND carry
// the canonical `row-sec` marker. The seconds are the minute value times sixty,
// so the numeric content rollup consumes is unchanged — no total regression.
export function buildFlushRow({
  ts,
  event,
  activeMin,
  idleMin,
  deltaWords,
  deltaWordsFull,
  wordMarker,
  fullWordMarker,
  description = '',
  phase,
}) {
  const toSec = (min) => Math.max(0, Math.round(Number(min) || 0) * 60);
  return buildRow({
    ts,
    event,
    activeSec: toSec(activeMin),
    idleSec: toSec(idleMin),
    deltaWords,
    deltaWordsFull,
    wordMarker,
    fullWordMarker,
    description,
    phase,
  });
}

// #540 — build the review→done close lifecycle pair in canonical order.
//
// The close verb emits these two rows (sharing one `ts`) immediately before
// the terminal board move. Order and delta placement are the contract this
// fixes: `review:approved` leads and carries the real review→close active/idle
// delta; `issue:wrap` follows as the zero-delta paired half. Returned as a
// `[approvedRow, wrapRow]` tuple so the caller emits them in array order.
//
// Why close.mjs owns `review:approved` (not move-state.mjs): the wrap-up row
// (`issue:wrap`) is posted before `gh issue close` + the board move, and
// move-state.mjs emits `issue:closed` last. If move-state also emitted
// `review:approved` on the done transition it would land AFTER `issue:wrap`
// (the #535 inversion) and duplicate the row. move-state.mjs suppresses its
// `<prev>:complete` emission when `stateArg === 'done'` for exactly this reason.
export function buildReviewToDoneClosePair({ ts, activeSec, idleSec, wordMarker }) {
  const approvedRow = buildRow({
    ts,
    phase: { state: 'review', phase: 'complete' },
    activeSec,
    idleSec,
    deltaWords: 0,
    wordMarker,
  });
  const wrapRow = buildRow({
    ts,
    phase: { state: 'done', phase: 'enter' },
    activeSec: 0,
    idleSec: 0,
    deltaWords: 0,
    wordMarker,
  });
  return [approvedRow, wrapRow];
}

// ---- lastKnownState metadata helpers ---------------------------------------
//
// Stored as HTML-comment metadata at the top of the issue body (cross-worktree
// authoritative — local state files don't sync, the issue body does).
//
// New canonical single-marker property grammar (#378):
//
//   <!-- aitm-last-known-state state="development" ts="2026-05-10T14:32:11Z" -->
//
// Legacy two-marker pair (still READ until #369's corpus sweep reports zero
// residuals):
//
//   <!-- aitm-last-known-state: development -->
//   <!-- aitm-last-known-state-ts: 2026-05-10T14:32:11Z -->
//
// `writeLastKnownState` stamps its own ISO timestamp; callers cannot inject
// a retroactive ts here either.

// New single-marker reader (#378). serializeMarker emits keys in insertion
// order (state → ts), so the value-bearing form is `state="..." ts="..."`.
const LAST_KNOWN_STATE_NEW_RE =
  /<!--\s*aitm-last-known-state\s+state="([^"]*)"\s+ts="([^"]*)"\s*-->/;
// Legacy two-marker pair readers. Anchored on the literal `:` immediately
// after the marker name, which the new grammar (space + `state=`) never has —
// so legacy and new forms are mutually exclusive under their respective REs.
const LAST_KNOWN_STATE_RE = /<!--\s*aitm-last-known-state:\s*([A-Za-z0-9_-]+)\s*-->/;
const LAST_KNOWN_STATE_TS_RE = /<!--\s*aitm-last-known-state-ts:\s*([^\s>][^>]*?)\s*-->/;

export function readLastKnownState(body) {
  if (!body || typeof body !== 'string') return { state: null, ts: null };
  // New single-marker grammar takes precedence over the legacy pair.
  const neu = body.match(LAST_KNOWN_STATE_NEW_RE);
  if (neu) {
    return { state: unescapeValue(neu[1]), ts: unescapeValue(neu[2]).trim() };
  }
  const stateMatch = body.match(LAST_KNOWN_STATE_RE);
  const tsMatch = body.match(LAST_KNOWN_STATE_TS_RE);
  return {
    state: stateMatch ? stateMatch[1] : null,
    ts: tsMatch ? tsMatch[1].trim() : null,
  };
}

export function writeLastKnownState(body, state) {
  if (typeof state !== 'string' || !state.trim()) {
    throw new Error('writeLastKnownState: state must be a non-empty string');
  }
  const normalized = state.trim();
  const ts = new Date().toISOString();
  const block = `${serializeMarker('last-known-state', { state: normalized, ts })}\n`;
  const src = typeof body === 'string' ? body : '';

  // Strip every prior form (new single marker, legacy state marker, legacy ts
  // marker) before prepending the fresh single marker — guarantees exactly one
  // marker, no duplicates, last-write-wins, across mixed-grammar bodies.
  const stripped = src
    .replace(new RegExp(LAST_KNOWN_STATE_NEW_RE.source + '\\s*\\n?', 'g'), '')
    .replace(new RegExp(LAST_KNOWN_STATE_RE.source + '\\s*\\n?', 'g'), '')
    .replace(new RegExp(LAST_KNOWN_STATE_TS_RE.source + '\\s*\\n?', 'g'), '');
  return `${block}${stripped}`;
}

function buildInitialComment() {
  return [TIMING_HEADING, '', COLUMN_LEGEND, '', TABLE_HEADER].join('\n');
}

// #568 — extract the lower-cased Event-cell slug from a freshly-built row
// string. cells[0] is the empty pre-pipe cell, cells[1] the Timestamp, cells[2]
// the Event. A trailing `<!-- row-sec -->` marker lives after the last pipe and
// never reaches cells[2], so it does not perturb the read.
function rowEventSlug(row) {
  return parseTimingRow(String(row))?.event ?? '';
}

// #568 — rewrite ONLY the Event cell (the 2nd pipe-delimited field) of a row,
// preserving every other cell and the trailing marker byte-for-byte.
function rewriteEventCell(row, nextEvent) {
  return replaceTimingRowCell(row, 2, ` ${nextEvent} `);
}

// #821 — read the Timestamp cell (1st pipe-delimited field) of a row string.
// cells[0] is the empty pre-pipe cell, cells[1] the Timestamp.
function rowTs(row) {
  return parseTimingRow(String(row))?.ts ?? '';
}

// #821 — rewrite ONLY the Timestamp cell (the 1st pipe-delimited field),
// preserving every other cell and the trailing marker byte-for-byte.
function rewriteTsCell(row, nextTs) {
  return replaceTimingRowCell(row, 1, ` ${nextTs} `);
}

function numericWordMarker(value) {
  const normalized = String(value ?? '')
    .replace(/,/g, '')
    .trim();
  if (!normalized) return null;
  const marker = Number(normalized);
  return Number.isFinite(marker) && marker >= 0 ? marker : null;
}

function normalizeTimingSchema(body) {
  const source = String(body ?? '');
  const legacyFullDelta = source.includes('| Δ Words (full) |');
  let sawHeader = false;
  return source
    .split('\n')
    .map((line) => {
      if (line.startsWith('<sub>Δ Words =')) return COLUMN_LEGEND;
      if (line.startsWith('| Timestamp |')) {
        sawHeader = true;
        return TABLE_HEADER.split('\n')[0];
      }
      if (sawHeader && line.startsWith('|---')) {
        sawHeader = false;
        return TABLE_HEADER.split('\n')[1];
      }
      const parsed = parseTimingRow(line);
      if (!parsed || !isTableTimingTimestamp(parsed.ts)) return line;
      let next = ensureTimingRowFullMarkerCell(line);
      if (legacyFullDelta) next = replaceTimingRowCell(next, 8, ' — ');
      return next;
    })
    .join('\n');
}

function lastDurableFullWordMarker(body) {
  let marker = null;
  for (const line of String(body ?? '').split('\n')) {
    const candidate = numericWordMarker(parseTimingRow(line)?.fullWordMarker);
    if (candidate !== null) marker = candidate;
  }
  return marker;
}

function carryForwardFullWordMarker(body, row) {
  const durable = lastDurableFullWordMarker(body);
  const normalized = ensureTimingRowFullMarkerCell(row);
  const incoming = numericWordMarker(parseTimingRow(normalized)?.fullWordMarker);
  if (durable === null || (incoming !== null && incoming >= durable)) return normalized;
  return replaceTimingRowCell(normalized, 8, ` ${durable.toLocaleString('en-US')} `);
}

function deriveAdjacentWordDelta(body, row) {
  const previous = lastDurableWordMarker(body);
  const current = numericWordMarker(parseTimingRow(row)?.wordMarker);
  const delta = previous === null || current === null ? 0 : Math.max(0, current - previous);
  return replaceTimingRowCell(row, 5, ` ${delta.toLocaleString('en-US')} `);
}

const LIFECYCLE_OPENERS = new Set(
  Object.values(PHASE_EVENTS)
    .map((phase) => phase?.enter?.event)
    .filter(Boolean)
);

function resumedBoundaryFrom(row) {
  let resumed = replaceTimingRowCells(ensureTimingRowFullMarkerCell(row), {
    2: ' resumed ',
    3: ' ',
    4: ' ',
    5: ' 0 ',
    7: ' resumed ',
  });
  resumed = resumed.replace(
    /<!--\s*row-sec:\s*a=-?\d+\s+i=-?\d+\s*-->/,
    '<!-- row-sec: a=0 i=0 -->'
  );
  return resumed;
}

function lastDurableWordMarker(body) {
  let marker = null;
  for (const line of String(body ?? '').split('\n')) {
    const candidate = numericWordMarker(parseTimingRow(line)?.wordMarker);
    if (candidate !== null) marker = candidate;
  }
  return marker;
}

function carryForwardWordMarker(body, row) {
  const durable = lastDurableWordMarker(body);
  if (durable === null) return row;
  const incoming = numericWordMarker(parseTimingRow(String(row))?.wordMarker);
  if (incoming !== null && incoming >= durable) return row;
  return replaceTimingRowCell(row, 6, ` ${durable.toLocaleString('en-US')} `);
}

// #568 keystone — the structural duplicate-`start` guard. A `start` row may only
// land on a log that has no data rows yet (the genuine first-ever bind). Over a
// non-empty log:
//   • an OPEN interruption (switch-out / pause / idle) → corrective rewrite to
//     the canonical closer `resumed` (AC4) — never a silent drop;
//   • no open interruption → loud refusal via DuplicateStartError (AC3).
// This makes a duplicate `start` impossible by construction, independent of any
// upstream read/resolve state.
function appendRow(body, row) {
  body = normalizeTimingSchema(body);
  if (shouldSuppressTimingAppend(body, rowEventSlug(row))) {
    return body;
  }

  let effectiveRow = ensureTimingRowFullMarkerCell(row);
  const incomingEvent = rowEventSlug(effectiveRow);
  if (incomingEvent === 'review:approved') {
    const incomingApprovalMs = _tsToMs(rowTs(effectiveRow));
    let seenAfterLastClose = false;
    for (const line of String(body ?? '').split('\n')) {
      const parsed = parseTimingRow(line);
      const event = parsed?.event;
      if (
        event === 'review:approved' &&
        Number.isFinite(incomingApprovalMs) &&
        _tsToMs(parsed.ts) === incomingApprovalMs
      ) {
        return body;
      }
      if (event === 'issue:closed') seenAfterLastClose = false;
      else if (event === 'review:approved') seenAfterLastClose = true;
    }
    if (seenAfterLastClose) return body;
  }
  if (rowEventSlug(row) === 'start' && timingCommentHasRows(body)) {
    if (lastOpenInterruption(body)) {
      effectiveRow = rewriteEventCell(row, 'resumed');
    } else {
      throw new DuplicateStartError(
        'refusing to append a second `start` row: the timing log already has data ' +
          'rows with no open interruption to pair against (duplicate-start is forbidden)'
      );
    }
  }

  // #1142 — a phase/activity opener cannot leap over an open interruption.
  // Interpose the sole canonical closer at the same recording instant. Its
  // adjacent marker growth remains visible on `resumed`; the lifecycle opener
  // then sees a flat marker and renders zero.
  if (lastOpenInterruption(body) && LIFECYCLE_OPENERS.has(rowEventSlug(effectiveRow))) {
    const withResume = appendRow(body, resumedBoundaryFrom(effectiveRow));
    return appendRow(withResume, effectiveRow);
  }

  // #972 — redundant-departure guard. A second departure event (`switch-out:*`
  // / `pause:*` / `idle`) landing while a prior departure is still open (no
  // `resumed` row between them) would otherwise stack a doubled interruption
  // row, corrupting the active/idle ladder (`lib/timing-ladder.mjs`) and
  // failing the `timing-log-sequence` Agent Review validator. Matches the
  // existing self-bind-to-already-active no-op precedent (#833): skip the
  // append entirely rather than write the redundant row.
  if (lastOpenInterruption(body) && classifyEvent(rowEventSlug(effectiveRow))?.role === 'open') {
    return body;
  }

  // #821 — monotonic-timestamp guard. A late/deferred finalize row drained from
  // the durable queue (postRowOrEnqueue → enqueue → flush) carries the timestamp
  // of the window it credits, which may precede rows that have since landed.
  // Appending it as-is corrupts the monotonic sequence that V3
  // (timing-log-sequence) and every time-series consumer depend on. Clamp its
  // Timestamp cell forward to the current log tail so the row can never sort
  // before an already-posted row. This only ever moves a timestamp forward — a
  // live in-order row (ts >= tail) is a no-op — and the credited seconds carried
  // in the trailing `row-sec` marker are left untouched.
  const tailTs = lastRowTsFromBody(body);
  let insertByTimestamp = false;
  if (tailTs) {
    const rowMs = _tsToMs(rowTs(effectiveRow));
    const tailMs = _tsToMs(tailTs);
    if (Number.isFinite(rowMs) && Number.isFinite(tailMs) && rowMs < tailMs) {
      if (incomingEvent === 'review:approved') insertByTimestamp = true;
      else effectiveRow = rewriteTsCell(effectiveRow, tailTs);
    }
  }
  if (!insertByTimestamp) {
    effectiveRow = carryForwardWordMarker(body, effectiveRow);
    effectiveRow = carryForwardFullWordMarker(body, effectiveRow);
    effectiveRow = deriveAdjacentWordDelta(body, effectiveRow);
  }

  const lines = body.split('\n');
  let lastTableIdx = -1;
  for (let i = 0; i < lines.length; i++) {
    if (
      lines[i].startsWith('| ') &&
      !lines[i].startsWith('| Timestamp') &&
      !lines[i].startsWith('|---')
    ) {
      lastTableIdx = i;
    }
  }
  if (lastTableIdx === -1) {
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].startsWith('|---')) {
        lastTableIdx = i;
        break;
      }
    }
  }
  if (insertByTimestamp) {
    const incomingMs = _tsToMs(rowTs(effectiveRow));
    const laterIdx = lines.findIndex((line) => {
      const parsed = parseTimingRow(line);
      if (!parsed || !isTableTimingTimestamp(parsed.ts)) return false;
      const candidateMs = _tsToMs(parsed.ts);
      return Number.isFinite(candidateMs) && candidateMs > incomingMs;
    });
    lines.splice(laterIdx === -1 ? lastTableIdx + 1 : laterIdx, 0, effectiveRow);
  } else {
    lines.splice(lastTableIdx + 1, 0, effectiveRow);
  }
  return lines.join('\n').replace(/\n+$/, '') + '\n';
}

// ---- GH shell-out helpers ----

async function ghExec(args, { timeoutMs = GH_TIMING_COMMENT_TIMEOUT_MS } = {}) {
  const { stdout } = await pexec('gh', args, { timeout: timeoutMs });
  return stdout;
}

export async function findTimingComment(issueNumber, repo, { timeoutMs } = {}) {
  const num = String(issueNumber).replace('#', '');
  const out = await ghExec(['issue', 'view', num, '-R', repo, '--json', 'comments'], { timeoutMs });
  const { comments } = JSON.parse(out);
  const hit = comments.find((c) => c.body.includes(TIMING_HEADING));
  return hit ? { id: hit.id, url: hit.url, body: hit.body, comments } : null;
}

async function createTimingComment(issueNumber, repo, body, { timeoutMs } = {}) {
  const num = String(issueNumber).replace('#', '');
  const out = await ghExec(['issue', 'comment', num, '-R', repo, '--body', body], { timeoutMs });
  return out.trim(); // URL of new comment
}

export async function updateTimingComment(commentId, repo, body, { timeoutMs } = {}) {
  // gh doesn't have edit-comment by id for issues directly;
  // use GraphQL mutation.
  const mutation = `
    mutation($id: ID!, $body: String!) {
      updateIssueComment(input: { id: $id, body: $body }) { issueComment { id } }
    }`;
  await ghExec(
    ['api', 'graphql', '-f', `query=${mutation}`, '-f', `id=${commentId}`, '-f', `body=${body}`],
    { timeoutMs }
  );
}

function timingLockPath(issueNumber, projDir = getProjectDir()) {
  const safe = String(issueNumber).replace(/[^A-Za-z0-9_-]/g, '_');
  return resolveTimingLockPath(safe, projDir);
}

// Locked + retrying timing append. Concurrent appenders to the same issue
// serialize on the per-issue lock dir; transient GitHub conflicts (returned
// by `updateIssueComment` when the comment changed under us) trigger a
// re-read + re-merge + re-post for up to `retries` attempts.
//
// The lock+retry path is the default. Tests can disable both by passing
// `{ lock: false, retries: 0 }` to keep call counts deterministic.
export async function postTimingEvent({
  issueNumber,
  repo,
  row,
  timeoutMs = GH_TIMING_COMMENT_TIMEOUT_MS,
  retries = 2,
  lock = true,
  projDir,
} = {}) {
  const work = async () => {
    const existing = await findTimingComment(issueNumber, repo, { timeoutMs });
    if (existing) {
      const updated = appendRow(existing.body, row);
      await updateTimingComment(existing.id, repo, updated, { timeoutMs });
    } else {
      const initial = appendRow(buildInitialComment(), row);
      await createTimingComment(issueNumber, repo, initial, { timeoutMs });
    }
  };
  if (!lock) {
    return work();
  }
  const lockPath = timingLockPath(issueNumber, projDir || getProjectDir());
  return withLock(lockPath, work, { timeoutMs: Math.max(timeoutMs * 3, 5_000), retries });
}

// Fetch the timing-comment body (where rows actually live). State-move
// rollups MUST derive their delta from this — not from the issue body,
// which never contains timing rows.
//
// #568 — fail-closed contract. The result is a DISCRIMINATED record so a
// genuine read failure is never mistaken for "no timing comment exists":
//   { status: 'found',  body: <string>, error: null }
//   { status: 'absent', body: '',       error: null }   ← positively no comment
//   { status: 'error',  body: '',       error: <Error> } ← read threw; UNKNOWN
// The bind path keys off `status` to refuse manufacturing a `start` on an
// unreadable log. String-only callers (word-delta rollups) read `.body` via the
// `bodyOf` shim, which also tolerates the legacy bare-string return.
export async function readTimingCommentBody({
  issueNumber,
  repo,
  timeoutMs = GH_TIMING_COMMENT_TIMEOUT_MS,
  deps = {},
} = {}) {
  const find = deps.findTimingComment || findTimingComment;
  try {
    // Lifecycle verbs carry issue numbers as integers, while the GitHub reader
    // accepts issue references and strips an optional `#` with String methods.
    // Normalize at this boundary so close-time outcome capture uses the same
    // production path as string-based timing callers.
    const existing = await find(String(issueNumber), repo, { timeoutMs });
    if (existing == null) return { status: 'absent', body: '', error: null, comments: [] };
    return {
      status: 'found',
      body: existing.body ?? '',
      error: null,
      comments: Array.isArray(existing.comments) ? existing.comments : [],
    };
  } catch (error) {
    return { status: 'error', body: '', error, comments: [] };
  }
}

// #568 — extract the string body from a readTimingCommentBody result. Tolerates
// the new discriminated record AND a legacy bare-string return (defensive, so a
// mixed call site never crashes). Absent/error both surface as ''.
export function bodyOf(result) {
  if (result == null) return '';
  if (typeof result === 'string') return result;
  return result.body ?? '';
}

// #1085 — directory-governed timing uses the same human table as the legacy
// timing comment. The existing body is retained byte-for-byte as the prefix;
// only a deterministic normalized summary is appended for projection readers.
// This function is render-only and cannot grant lifecycle or timing authority.
export function renderTimingSingletonMarkdown({ timingBody, timingProjection } = {}) {
  if (
    typeof timingBody !== 'string' ||
    timingBody.length === 0 ||
    timingProjection?.schema !== 'aitm.timing-projection/v1' ||
    !Number.isSafeInteger(timingProjection?.revision) ||
    timingProjection.revision <= 0
  ) {
    throw new TypeError('timing-singleton-projection:input');
  }
  const body = timingBody.endsWith('\n') ? timingBody : `${timingBody}\n`;
  return (
    `${body}\n### Normalized timing projection\n\n` +
    `- Total active: ${formatDurationSeconds(timingProjection.totals.totalActiveSec)}\n` +
    `- Total idle: ${formatDurationSeconds(timingProjection.totals.totalIdleSec)}\n` +
    `- Engaged: ${formatDurationSeconds(timingProjection.totals.engagedSec)}\n` +
    `- Plan: ${timingProjection.totals.planMin} min\n`
  );
}

// Internal symbols — exported under a dedicated namespace strictly so the
// sibling `gh-timing-comment.internals.mjs` module can re-export them for
// tests. Production code MUST NOT import `__internals` directly; it is not
// part of the public API and the names inside may change without notice.
export const __internals = {
  TIMING_HEADING,
  RETROACTIVE_TS_ERROR,
  buildInitialComment,
  appendRow,
  normalizeTimingSchema,
  findTimingComment,
  createTimingComment,
  updateTimingComment,
};
