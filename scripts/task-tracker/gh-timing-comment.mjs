// GH timing comment — locate/create/append.
// GH I/O uses `gh` CLI via execFile with timeout.

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { resolvePhaseEvent } from './phase-events.mjs';
import { withLock } from './locks.mjs';
import { getProjectDir, timingLockPath as resolveTimingLockPath } from './paths.mjs';
import { parseMarker, serializeMarker, unescapeValue } from './lib/marker-grammar.mjs';
import {
  isTableTimingTimestamp,
  parseTimingRow,
  replaceTimingRowCell,
  splitTimingRowMarker,
} from './lib/timing-row-reader.mjs';
import { formatDurationSeconds, lastRowTsFromBody, _tsToMs } from './lib/timing-rows.mjs';
import { classifyEvent, lastOpenInterruption, timingCommentHasRows } from './lib/bind-event.mjs';
import {
  EVENT_CLASS,
  classifyTimingEvent,
  isEmittableTimingEvent,
} from './lib/timing-events/index.mjs';
import { loadConfig } from './config.mjs';
import {
  createRuntimeGovernedEffectAdapter,
  isGovernedAuthorityError,
} from './lib/work-lease/governed-effect.mjs';
import {
  assertTransitionProjectionAuthority,
  assertTransitionTimingQueueAliasAuthority,
  assertTransitionTimingQueueAliasCollisionGroupAuthority,
} from './lib/work-lease/transition-projection-authority.mjs';
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
const TIMING_PROJECTION_NAME = 'timing';

// #475 AC3 — column legend. Documents that a `0` in the Δ Words column on a
// lifecycle/audit row is CORRECT, not a defect: Δ Words is the per-segment word
// delta for that row, not a running total. Lifecycle/audit rows (state moves,
// gate refusals, recovery, close) have no live transcript segment, so their
// delta is legitimately 0 while the cumulative Word Marker still carries forward.
const COLUMN_LEGEND =
  '<sub>Δ Words = stay-abreast words added during this row’s segment (monologue + prose + tool-summary chips; per-row delta, `0` on lifecycle/audit rows is expected). Word Marker = cumulative stay-abreast word count, carried forward monotonically. Δ Words (full) = full-expansion per-row delta (stay-abreast + full tool inputs + full tool outputs); blank on lifecycle/audit rows.</sub>';

const TABLE_HEADER = [
  '| Timestamp | Event | Active | Idle | Δ Words | Word Marker | Description | Δ Words (full) |',
  '|---|---|---|---|---|---|---|---|',
].join('\n');
const [TABLE_HEADER_ROW] = TABLE_HEADER.split('\n');
const TIMING_TABLE_COLUMN_COUNT_BY_HEADER = new Map([
  [TABLE_HEADER_ROW, 8],
  ['| Timestamp | Event | Active | Idle | Δ Words | Word Marker | Description |', 7],
  ['| Timestamp | Event | Active | Idle | ΔWords | Word Marker | Description |', 7],
]);

export function fmtTs(iso) {
  const d = new Date(iso);
  const pad = (n) => String(n).padStart(2, '0');
  const offsetMin = -d.getTimezoneOffset();
  const sign = offsetMin >= 0 ? '+' : '-';
  const abs = Math.abs(offsetMin);
  const offset = `${sign}${pad(Math.floor(abs / 60))}:${pad(abs % 60)}`;
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())} ${offset}`;
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
  // Full-expansion column is trailing (after Description) and rendered ONLY when
  // the caller opts in by passing `deltaWordsFull`. Legacy callers that omit it
  // produce the exact pre-#795 row string byte-for-byte, so pre-existing rows
  // and every exact-match test stay unchanged; opted-in rows gain the extra cell
  // before the `<!-- row-sec -->` marker.
  const fullCell = deltaWordsFull === undefined ? '' : ` ${fmtNumBlankZero(deltaWordsFull)} |`;
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
export function buildBackdatedDepartureRow({ ts, event, description = '', wordMarker }) {
  const tsMs = tsToMs(ts);
  if (!Number.isFinite(tsMs)) {
    throw new Error(`buildBackdatedDepartureRow: non-parseable ts: ${String(ts)}`);
  }
  if (!isEmittableTimingEvent(event) || classifyTimingEvent(event) !== EVENT_CLASS.DEPARTURE) {
    throw new Error(`refusing non-emittable departure Timing Log event: ${String(event)}`);
  }
  const wm = wordMarker == null ? null : Number(String(wordMarker).replace(/,/g, ''));
  return `| ${fmtTs(ts)} | ${event} |  |  |  | ${fmtNum(Number.isFinite(wm) ? wm : null)} | ${description} | <!-- row-sec: a=0 i=0 -->`;
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

function requiredProjectionString(value, label) {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new TypeError(`${label} must be a non-empty string`);
  }
  return value;
}

function normalizeTimingProjection(projectionId, subOperationId) {
  if (projectionId === undefined && subOperationId === undefined) return null;
  return {
    projectionId: requiredProjectionString(projectionId, 'timing projectionId'),
    subOperationId: requiredProjectionString(subOperationId, 'timing subOperationId'),
  };
}

export function timingProjectionMarker({ projectionId, subOperationId } = {}) {
  const projection = normalizeTimingProjection(projectionId, subOperationId);
  if (!projection) {
    throw new TypeError('timing projection identity is required');
  }
  // Identities can contain provider/session text. Encode the UTF-8 bytes into
  // the HTML-comment-safe base64url alphabet so a caller cannot inject quotes,
  // newlines, or a `-->` terminator into the durable marker.
  return serializeMarker('work-lease-projection', {
    'projection-id-b64': Buffer.from(projection.projectionId, 'utf8').toString('base64url'),
    'sub-operation-id-b64': Buffer.from(projection.subOperationId, 'utf8').toString('base64url'),
  });
}

function rowWithProjectionMarker(row, projection) {
  if (!projection) return row;
  const source = String(row).replace(/\s+$/, '');
  const parsedRow = parseTimingRow(source);
  if (
    source.includes('\n') ||
    source.includes('\r') ||
    !source.startsWith('|') ||
    !parsedRow ||
    !isTableTimingTimestamp(parsedRow.ts)
  ) {
    throw new TypeError('projected timing row must be a canonical unindented timing data row');
  }
  const { core, marker } = splitTimingRowMarker(source);
  if (!marker) {
    throw new TypeError('projected timing row must include a trailing row-sec marker');
  }
  if (!core.trimEnd().endsWith('|')) {
    throw new TypeError('projected timing row must end its table cells before the row-sec marker');
  }
  const receipt = timingProjectionMarker(projection);
  return `${core} ${receipt}${marker}`;
}

function decodeProjectionIdentity(value) {
  if (typeof value !== 'string' || !/^[A-Za-z0-9_-]+$/.test(value)) return null;
  const decoded = Buffer.from(value, 'base64url').toString('utf8');
  if (!decoded || Buffer.from(decoded, 'utf8').toString('base64url') !== value) return null;
  return decoded;
}

function projectionReceiptFromTimingRow(line, rowIndex) {
  const parsedRow = parseTimingRow(line);
  if (!parsedRow || !isTableTimingTimestamp(parsedRow.ts)) return null;
  const { core, marker: rowSecMarker } = splitTimingRowMarker(line);
  if (!rowSecMarker) return null;
  const lastPipe = core.lastIndexOf('|');
  if (lastPipe < 0) return null;
  const receiptText = core.slice(lastPipe + 1).trim();
  const receipt = parseMarker(receiptText);
  if (!receipt || receipt.name !== 'work-lease-projection') return null;
  const keys = Object.keys(receipt.props).sort();
  if (keys.join(',') !== 'projection-id-b64,sub-operation-id-b64') return null;
  const projectionId = decodeProjectionIdentity(receipt.props['projection-id-b64']);
  const subOperationId = decodeProjectionIdentity(receipt.props['sub-operation-id-b64']);
  if (!projectionId || !subOperationId) return null;
  if (timingProjectionMarker({ projectionId, subOperationId }) !== receiptText) return null;
  return { projectionId, subOperationId, rowIndex };
}

function isCanonicalTableSeparator(line, columnCount) {
  if (typeof line !== 'string' || !line.startsWith('|')) return false;
  const separatorCell = String.raw`\s*:?-{3,}:?\s*\|`;
  return new RegExp(`^\\|(?:${separatorCell}){${columnCount}}$`).test(line);
}

function locateCanonicalTimingTableRegion(body) {
  const lines = String(body ?? '').split('\n');
  let fence = null;
  let sawTimingHeading = false;
  let tableRowStart = -1;
  for (const [lineIndex, line] of lines.entries()) {
    const openingFence = line.match(/^\s{0,3}(`{3,}|~{3,})/);
    if (!fence && openingFence) {
      const delimiter = openingFence[1];
      fence = { char: delimiter[0], length: delimiter.length };
      continue;
    }
    if (fence) {
      const closingFence = line.match(/^\s{0,3}(`{3,}|~{3,})\s*$/);
      if (
        closingFence &&
        closingFence[1][0] === fence.char &&
        closingFence[1].length >= fence.length
      ) {
        fence = null;
      }
      continue;
    }
    if (/^(?:#{1,6}\s+)?⏱ Timing Log\s*$/.test(line)) {
      sawTimingHeading = true;
      continue;
    }
    const columnCount = TIMING_TABLE_COLUMN_COUNT_BY_HEADER.get(line);
    if (
      sawTimingHeading &&
      columnCount &&
      isCanonicalTableSeparator(lines[lineIndex + 1], columnCount)
    ) {
      tableRowStart = lineIndex + 2;
      break;
    }
  }
  if (tableRowStart < 0) return null;

  let tableRowEnd = tableRowStart;
  while (tableRowEnd < lines.length) {
    const line = lines[tableRowEnd];
    if (!line.startsWith('|')) break;
    const parsedRow = parseTimingRow(line);
    if (!parsedRow || !isTableTimingTimestamp(parsedRow.ts)) break;
    tableRowEnd += 1;
  }
  return { lines, tableRowStart, tableRowEnd };
}

export function hasCanonicalTimingTable(body) {
  return locateCanonicalTimingTableRegion(body) !== null;
}

// Only a structurally valid Timing Log data row can prove a projection. A
// receipt quoted in prose, a Markdown code fence, a Description cell, after the
// row-sec marker, or beside another receipt is deliberately ignored.
export function parseTimingProjectionReceipts(body) {
  const region = locateCanonicalTimingTableRegion(body);
  if (!region) return [];

  const receipts = [];
  for (let lineIndex = region.tableRowStart; lineIndex < region.tableRowEnd; lineIndex += 1) {
    const line = region.lines[lineIndex];
    const receipt = projectionReceiptFromTimingRow(line, lineIndex);
    if (receipt) receipts.push(receipt);
  }
  return receipts;
}

function matchingTimingProjectionReceipts(body, projection) {
  return parseTimingProjectionReceipts(body).filter(
    (receipt) =>
      receipt.projectionId === projection.projectionId &&
      receipt.subOperationId === projection.subOperationId
  );
}

// #821 — rewrite ONLY the Timestamp cell (the 1st pipe-delimited field),
// preserving every other cell and the trailing marker byte-for-byte.
function rewriteTsCell(row, nextTs) {
  return replaceTimingRowCell(row, 1, ` ${nextTs} `);
}

// #568 keystone — the structural duplicate-`start` guard. A `start` row may only
// land on a log that has no data rows yet (the genuine first-ever bind). Over a
// non-empty log:
//   • an OPEN interruption (switch-out / pause / idle) → corrective rewrite to
//     the canonical closer `resumed` (AC4) — never a silent drop;
//   • no open interruption → loud refusal via DuplicateStartError (AC3).
// This makes a duplicate `start` impossible by construction, independent of any
// upstream read/resolve state.
function appendRow(body, row, { projection } = {}) {
  const canonicalRegion = locateCanonicalTimingTableRegion(body);

  // #1049 — an exact projection receipt is stronger than event-shape policy.
  // Check it before duplicate-start and redundant-departure handling so a retry
  // after remote success is a byte-preserving no-op for every event kind.
  if (projection) {
    if (!canonicalRegion) {
      throw new Error(
        'projected timing append requires a supported canonical Timing Log table region'
      );
    }
    const matches = matchingTimingProjectionReceipts(body, projection);
    if (matches.length === 1) return body;
    if (matches.length > 1) {
      throw new Error(
        `duplicate timing projection receipt: ${projection.projectionId} ${projection.subOperationId}`
      );
    }
  }

  let effectiveRow = row;
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
  if (tailTs) {
    const rowMs = _tsToMs(rowTs(effectiveRow));
    const tailMs = _tsToMs(tailTs);
    if (Number.isFinite(rowMs) && Number.isFinite(tailMs) && rowMs < tailMs) {
      effectiveRow = rewriteTsCell(effectiveRow, tailTs);
    }
  }

  const lines = canonicalRegion?.lines ?? body.split('\n');
  let lastTableIdx = -1;
  if (canonicalRegion) {
    lastTableIdx = canonicalRegion.tableRowEnd - 1;
  } else {
    // Legacy comments without the canonical Timing Log header retain the
    // legacy global-table fallback rather than changing their append
    // placement as part of projection receipt hardening.
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
  }
  lines.splice(lastTableIdx + 1, 0, effectiveRow);
  return lines.join('\n').replace(/\n+$/, '') + '\n';
}

function appendedProjectionEffect(body, durableRow, projection) {
  const updatedBody = appendRow(body, durableRow, { projection });
  const region = locateCanonicalTimingTableRegion(updatedBody);
  const matches = matchingTimingProjectionReceipts(updatedBody, projection);
  if (!region || matches.length !== 1) {
    throw new Error(
      `timing projection did not produce one exact receipt: ${projection.projectionId} ${projection.subOperationId}`
    );
  }
  return {
    body: updatedBody,
    row: region.lines[matches[0].rowIndex],
  };
}

// Resolve one requested row against the exact durable receipt embedded in the
// canonical Timing Log. Existing receipts are replayed through the row policy
// using only their preceding rows, so timestamp/event normalization is
// validated rather than trusted from an editable sibling marker.
export function reconcileTimingProjectionRowEffect(
  body,
  { projectionId, subOperationId, row } = {}
) {
  const projection = normalizeTimingProjection(projectionId, subOperationId);
  if (typeof row !== 'string' || row === '') {
    throw new TypeError('timing projection row must be a non-empty string');
  }
  const sourceBody = String(body ?? '');
  const durableRow = rowWithProjectionMarker(row, projection);
  const region = locateCanonicalTimingTableRegion(sourceBody);
  const matches = matchingTimingProjectionReceipts(sourceBody, projection);
  if (matches.length > 1) {
    throw new Error(
      `duplicate timing projection receipt: ${projection.projectionId} ${projection.subOperationId}`
    );
  }
  if (matches.length === 0) {
    const effect = appendedProjectionEffect(sourceBody, durableRow, projection);
    return { status: 'missing', ...effect };
  }
  if (!region) {
    throw new Error('timing projection receipt is outside a canonical Timing Log table');
  }
  const receipt = matches[0];
  const prefixBody = `${region.lines.slice(0, receipt.rowIndex).join('\n')}\n`;
  const expected = appendedProjectionEffect(prefixBody, durableRow, projection);
  const actualRow = region.lines[receipt.rowIndex];
  if (actualRow !== expected.row) {
    throw new Error(
      `timing projection receipt row does not match: ${projection.projectionId} ${projection.subOperationId}`
    );
  }
  return { status: 'present', body: sourceBody, row: actualRow };
}

// ---- GH shell-out helpers ----

async function ghExec(args, { timeoutMs = 2000 } = {}) {
  const { stdout } = await pexec('gh', args, { timeout: timeoutMs });
  return stdout;
}

export function normalizeTimingIssueNumber(issueNumber) {
  return String(issueNumber ?? '').replace(/^#/, '');
}

export async function findTimingComment(issueNumber, repo, { timeoutMs } = {}) {
  const num = normalizeTimingIssueNumber(issueNumber);
  const out = await ghExec(['issue', 'view', num, '-R', repo, '--json', 'comments'], { timeoutMs });
  const { comments } = JSON.parse(out);
  const hit = comments.find((c) => c.body.includes(TIMING_HEADING));
  return hit ? { id: hit.id, url: hit.url, body: hit.body } : null;
}

async function createTimingComment(issueNumber, repo, body, { timeoutMs } = {}) {
  const num = normalizeTimingIssueNumber(issueNumber);
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
  projectionId,
  subOperationId,
  timeoutMs = 2000,
  retries = 2,
  lock = true,
  projDir,
  withGovernedEffect,
  deps = {},
} = {}) {
  const projection = normalizeTimingProjection(projectionId, subOperationId);
  const durableRow = rowWithProjectionMarker(row, projection);
  const stableProjectDir = projDir || getProjectDir();
  const govern =
    withGovernedEffect ??
    createRuntimeGovernedEffectAdapter({
      projectDir: stableProjectDir,
      config: deps.config || loadConfig(),
    });
  const find = deps.findTimingComment || findTimingComment;
  const create = deps.createTimingComment || createTimingComment;
  const update = deps.updateTimingComment || updateTimingComment;
  const work = async () =>
    govern(
      {
        issueId: normalizeTimingIssueNumber(issueNumber),
        operation: 'evidence-mutation',
        heartbeat: true,
      },
      async (authority) => {
        const existing = await find(issueNumber, repo, { timeoutMs });
        if (existing) {
          if (projection) {
            const effect = reconcileTimingProjectionRowEffect(existing.body, {
              ...projection,
              row,
            });
            if (effect.status === 'present') {
              return {
                status: 'already-reconciled',
                projectionId: projection.projectionId,
                subOperationId: projection.subOperationId,
              };
            }
            await authority.reverify();
            await update(existing.id, repo, effect.body, { timeoutMs });
          } else {
            const updated = appendRow(existing.body, durableRow, { projection });
            await authority.reverify();
            await update(existing.id, repo, updated, { timeoutMs });
          }
        } else {
          const initial = projection
            ? reconcileTimingProjectionRowEffect(buildInitialComment(), {
                ...projection,
                row,
              }).body
            : appendRow(buildInitialComment(), durableRow, { projection });
          await authority.reverify();
          await create(issueNumber, repo, initial, { timeoutMs });
        }
        if (!projection) return undefined;
        return {
          status: 'posted',
          projectionId: projection.projectionId,
          subOperationId: projection.subOperationId,
        };
      }
    );
  if (!lock) {
    return work();
  }
  const lockPath = timingLockPath(issueNumber, stableProjectDir);
  return withLock(lockPath, work, {
    timeoutMs: Math.max(timeoutMs * 3, 5_000),
    retries,
    shouldRetry: (error) => !isGovernedAuthorityError(error),
  });
}

export async function postTransitionTimingProjection({
  authority,
  transitionId,
  projectionName,
  projectionId,
  subOperationId,
  issueNumber,
  ...options
} = {}) {
  const expected = {
    transitionId,
    projectionName,
    projectionId,
    subOperationId,
    issueId: normalizeTimingIssueNumber(issueNumber),
    operation: 'evidence-mutation',
  };
  assertTransitionProjectionAuthority(authority, expected);
  const verifyProjection = async () => assertTransitionProjectionAuthority(authority, expected);
  return postTimingEvent({
    ...options,
    issueNumber,
    projectionId,
    subOperationId,
    withGovernedEffect: async (governedOptions, callback) => {
      if (
        governedOptions.issueId !== expected.issueId ||
        governedOptions.operation !== expected.operation
      ) {
        throw new TypeError('transition timing authority route does not match');
      }
      await verifyProjection();
      return callback({ reverify: verifyProjection });
    },
  });
}

function inspectTimingQueueAliasReceipts(
  body,
  { journalProjectionId, journalSubOperationId, projectionId, subOperationId, row } = {}
) {
  try {
    const receipts = parseTimingProjectionReceipts(body);
    const journalReceipts = receipts.filter(
      (receipt) =>
        receipt.projectionId === journalProjectionId &&
        receipt.subOperationId === journalSubOperationId
    );
    const canonicalReceipts = receipts.filter(
      (receipt) =>
        receipt.projectionId === projectionId && receipt.subOperationId === subOperationId
    );
    if (journalReceipts.length > 1 || canonicalReceipts.length > 1) {
      throw new Error('one receipt family is duplicated');
    }
    if (journalReceipts.length === 1 && canonicalReceipts.length === 1) {
      throw new Error('both journal and canonical receipts are present');
    }
    if (journalReceipts.length === 1) {
      reconcileTimingProjectionRowEffect(body, {
        projectionId: journalProjectionId,
        subOperationId: journalSubOperationId,
        row,
      });
      return {
        status: 'adopted',
        adoptedProjectionId: journalProjectionId,
        adoptedSubOperationId: journalSubOperationId,
        body,
      };
    }
    if (canonicalReceipts.length === 1) {
      reconcileTimingProjectionRowEffect(body, {
        projectionId,
        subOperationId,
        row,
      });
      return {
        status: 'adopted',
        adoptedProjectionId: projectionId,
        adoptedSubOperationId: subOperationId,
        body,
      };
    }
    const canonical = reconcileTimingProjectionRowEffect(body, {
      projectionId,
      subOperationId,
      row,
    });
    return {
      status: 'missing',
      adoptedProjectionId: projectionId,
      adoptedSubOperationId: subOperationId,
      body: canonical.body,
    };
  } catch (error) {
    throw new Error(`timing queue alias reconciliation refused: ${error.message}`);
  }
}

function timingQueueAliasExpected({
  transitionId,
  journalProjectionId,
  journalSubOperationId,
  projectionId,
  subOperationId,
  issueNumber,
  row,
} = {}) {
  return {
    transitionId,
    journalProjectionId,
    journalSubOperationId,
    deliveryProjectionId: projectionId,
    deliverySubOperationId: subOperationId,
    issueId: normalizeTimingIssueNumber(issueNumber),
    operation: 'evidence-mutation',
    row,
  };
}

export async function postTransitionTimingQueueAliasProjection({
  aliasAuthority,
  transitionId,
  projectionName,
  journalProjectionId,
  journalSubOperationId,
  projectionId,
  subOperationId,
  issueNumber,
  repo,
  row,
  timeoutMs = 2000,
  retries = 2,
  lock = true,
  projDir,
  deps = {},
} = {}) {
  if (projectionName !== 'timing') {
    throw new TypeError('timing queue alias projectionName must be timing');
  }
  const expected = timingQueueAliasExpected({
    transitionId,
    journalProjectionId,
    journalSubOperationId,
    projectionId,
    subOperationId,
    issueNumber,
    row,
  });
  const verifyAlias = async () =>
    assertTransitionTimingQueueAliasAuthority(aliasAuthority, expected);
  await verifyAlias();
  const find = deps.findTimingComment || findTimingComment;
  const create = deps.createTimingComment || createTimingComment;
  const update = deps.updateTimingComment || updateTimingComment;
  const work = async () => {
    await verifyAlias();
    const existing = await find(issueNumber, repo, { timeoutMs });
    const state = inspectTimingQueueAliasReceipts(existing?.body ?? buildInitialComment(), {
      journalProjectionId,
      journalSubOperationId,
      projectionId,
      subOperationId,
      row,
    });
    if (state.status === 'adopted') return state;
    await verifyAlias();
    if (existing) await update(existing.id, repo, state.body, { timeoutMs });
    else await create(issueNumber, repo, state.body, { timeoutMs });
    return { ...state, status: 'posted' };
  };
  if (!lock) return work();
  return withLock(timingLockPath(issueNumber, projDir || getProjectDir()), work, {
    timeoutMs: Math.max(timeoutMs * 3, 5_000),
    retries,
  });
}

export async function readTransitionTimingQueueAliasProjection({
  aliasAuthority,
  transitionId,
  projectionName,
  journalProjectionId,
  journalSubOperationId,
  projectionId,
  subOperationId,
  issueNumber,
  repo,
  row,
  timeoutMs = 2000,
  lock = true,
  projDir,
  deps = {},
} = {}) {
  if (projectionName !== 'timing') {
    throw new TypeError('timing queue alias projectionName must be timing');
  }
  const expected = timingQueueAliasExpected({
    transitionId,
    journalProjectionId,
    journalSubOperationId,
    projectionId,
    subOperationId,
    issueNumber,
    row,
  });
  const verifyAlias = async () =>
    assertTransitionTimingQueueAliasAuthority(aliasAuthority, expected);
  await verifyAlias();
  const read = deps.readTimingCommentBody || readTimingCommentBody;
  const work = async () => {
    await verifyAlias();
    const result = await read({ issueNumber, repo, timeoutMs, deps });
    if (result?.status === 'error') {
      throw new Error('timing queue alias read-back is unavailable');
    }
    if (result?.status === 'absent') {
      return {
        reconciled: false,
        projectionName: TIMING_PROJECTION_NAME,
        projectionId: journalProjectionId,
      };
    }
    const state = inspectTimingQueueAliasReceipts(bodyOf(result), {
      journalProjectionId,
      journalSubOperationId,
      projectionId,
      subOperationId,
      row,
    });
    return {
      reconciled: state.status === 'adopted',
      projectionName: TIMING_PROJECTION_NAME,
      projectionId: journalProjectionId,
      ...(state.status === 'adopted'
        ? {
            adoptedProjectionId: state.adoptedProjectionId,
            adoptedSubOperationId: state.adoptedSubOperationId,
          }
        : {}),
    };
  };
  if (!lock) return work();
  return withLock(timingLockPath(issueNumber, projDir || getProjectDir()), work, {
    timeoutMs: Math.max(timeoutMs * 3, 5_000),
  });
}

function inspectTimingQueueAliasCollisionGroupReceipts(
  body,
  { members, projectionId, subOperationId, row } = {}
) {
  try {
    const receipts = parseTimingProjectionReceipts(body);
    const canonicalReceipts = receipts.filter(
      (receipt) =>
        receipt.projectionId === projectionId && receipt.subOperationId === subOperationId
    );
    const legacyReceipts = members.map((member) =>
      receipts.filter(
        (receipt) =>
          receipt.projectionId === member.journalProjectionId &&
          receipt.subOperationId === member.journalSubOperationId
      )
    );
    if (canonicalReceipts.length > 1 || legacyReceipts.some((matches) => matches.length > 1)) {
      throw new Error('one collision receipt family is duplicated');
    }
    if (canonicalReceipts.length === 1) {
      if (legacyReceipts.some((matches) => matches.length !== 0)) {
        throw new Error('canonical and legacy collision receipts are mixed');
      }
      reconcileTimingProjectionRowEffect(body, { projectionId, subOperationId, row });
      return {
        status: 'adopted',
        receiptMode: 'canonical',
        projectionId,
        subOperationId,
        body,
      };
    }
    const legacyReceiptCount = legacyReceipts.filter((matches) => matches.length === 1).length;
    if (legacyReceiptCount === members.length) {
      for (const member of members) {
        reconcileTimingProjectionRowEffect(body, {
          projectionId: member.journalProjectionId,
          subOperationId: member.journalSubOperationId,
          row,
        });
      }
      return {
        status: 'adopted',
        receiptMode: 'legacy',
        projectionId,
        subOperationId,
        body,
      };
    }
    if (legacyReceiptCount !== 0) {
      throw new Error('legacy collision receipt set is incomplete');
    }
    const canonical = reconcileTimingProjectionRowEffect(body, {
      projectionId,
      subOperationId,
      row,
    });
    return {
      status: 'missing',
      receiptMode: 'canonical',
      projectionId,
      subOperationId,
      body: canonical.body,
    };
  } catch (error) {
    throw new Error(`timing queue alias collision reconciliation refused: ${error.message}`);
  }
}

function timingQueueAliasCollisionExpected({
  transitionId,
  members,
  issueNumber,
  row,
  projectionId,
  subOperationId,
} = {}) {
  return {
    transitionId,
    members,
    issueId: normalizeTimingIssueNumber(issueNumber),
    row,
    deliveryProjectionId: projectionId,
    deliverySubOperationId: subOperationId,
  };
}

export async function reconcileTransitionTimingQueueAliasCollisionGroupProjection({
  collisionAuthority,
  transitionId,
  projectionName,
  members,
  projectionId,
  subOperationId,
  issueNumber,
  repo,
  row,
  timeoutMs = 2000,
  retries = 2,
  lock = true,
  projDir,
  deps = {},
} = {}) {
  if (projectionName !== 'timing') {
    throw new TypeError('timing queue alias collision projectionName must be timing');
  }
  const expected = timingQueueAliasCollisionExpected({
    transitionId,
    members,
    issueNumber,
    row,
    projectionId,
    subOperationId,
  });
  const verifyCollision = async () =>
    assertTransitionTimingQueueAliasCollisionGroupAuthority(collisionAuthority, expected);
  await verifyCollision();
  const find = deps.findTimingComment || findTimingComment;
  const create = deps.createTimingComment || createTimingComment;
  const update = deps.updateTimingComment || updateTimingComment;
  const read = deps.readTimingCommentBody || readTimingCommentBody;
  const work = async () => {
    await verifyCollision();
    const existing = await find(issueNumber, repo, { timeoutMs });
    const state = inspectTimingQueueAliasCollisionGroupReceipts(
      existing?.body ?? buildInitialComment(),
      { members, projectionId, subOperationId, row }
    );
    if (state.status === 'missing') {
      await verifyCollision();
      if (existing) await update(existing.id, repo, state.body, { timeoutMs });
      else await create(issueNumber, repo, state.body, { timeoutMs });
    }
    await verifyCollision();
    const result = await read({ issueNumber, repo, timeoutMs, deps });
    if (result?.status === 'error') {
      throw new Error('timing queue alias collision read-back is unavailable');
    }
    if (result?.status === 'absent') {
      return {
        reconciled: false,
        projectionName: TIMING_PROJECTION_NAME,
        projectionId,
      };
    }
    const readBack = inspectTimingQueueAliasCollisionGroupReceipts(bodyOf(result), {
      members,
      projectionId,
      subOperationId,
      row,
    });
    return {
      reconciled: readBack.status === 'adopted',
      projectionName: TIMING_PROJECTION_NAME,
      projectionId,
      receiptMode: readBack.receiptMode,
      memberCount: members.length,
    };
  };
  if (!lock) return work();
  return withLock(timingLockPath(issueNumber, projDir || getProjectDir()), work, {
    timeoutMs: Math.max(timeoutMs * 3, 5_000),
    retries,
  });
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
  timeoutMs = 2000,
  deps = {},
} = {}) {
  const find = deps.findTimingComment || findTimingComment;
  try {
    const existing = await find(issueNumber, repo, { timeoutMs });
    if (existing == null) return { status: 'absent', body: '', error: null };
    return { status: 'found', body: existing.body ?? '', error: null };
  } catch (error) {
    return { status: 'error', body: '', error };
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

export async function readTimingProjection({
  issueNumber,
  repo,
  projectionId,
  subOperationIds,
  expectedRows,
  timeoutMs = 2000,
  deps = {},
} = {}) {
  const stableProjectionId = requiredProjectionString(projectionId, 'timing projectionId');
  if (!Array.isArray(subOperationIds) || subOperationIds.length === 0) {
    throw new TypeError('timing subOperationIds must be a non-empty array');
  }
  const stableSubOperationIds = subOperationIds.map((id) =>
    requiredProjectionString(id, 'timing subOperationId')
  );
  if (new Set(stableSubOperationIds).size !== stableSubOperationIds.length) {
    throw new TypeError('timing subOperationIds must be unique');
  }
  if (
    expectedRows !== undefined &&
    (!expectedRows ||
      typeof expectedRows !== 'object' ||
      Array.isArray(expectedRows) ||
      stableSubOperationIds.some(
        (subOperationId) =>
          typeof expectedRows[subOperationId] !== 'string' || expectedRows[subOperationId] === ''
      ))
  ) {
    throw new TypeError('timing expectedRows must map every sub-operation to its exact row');
  }
  const read = deps.readTimingCommentBody || readTimingCommentBody;
  const result = await read({ issueNumber, repo, timeoutMs, deps });
  const body = bodyOf(result);
  const receipts = parseTimingProjectionReceipts(body);
  const matchesBySubOperation = new Map(
    stableSubOperationIds.map((subOperationId) => [
      subOperationId,
      receipts.filter(
        (receipt) =>
          receipt.projectionId === stableProjectionId && receipt.subOperationId === subOperationId
      ),
    ])
  );
  const missingSubOperationIds = stableSubOperationIds.filter(
    (subOperationId) => matchesBySubOperation.get(subOperationId).length === 0
  );
  if (missingSubOperationIds.length > 0) {
    return {
      reconciled: false,
      projectionName: TIMING_PROJECTION_NAME,
      projectionId: stableProjectionId,
      missingSubOperationIds,
    };
  }
  const duplicateSubOperationIds = stableSubOperationIds.filter(
    (subOperationId) => matchesBySubOperation.get(subOperationId).length > 1
  );
  if (duplicateSubOperationIds.length > 0) {
    return {
      reconciled: false,
      projectionName: TIMING_PROJECTION_NAME,
      projectionId: stableProjectionId,
      missingSubOperationIds: [],
      duplicateSubOperationIds,
    };
  }
  if (expectedRows !== undefined) {
    const mismatchedSubOperationIds = stableSubOperationIds.filter((subOperationId) => {
      try {
        return (
          reconcileTimingProjectionRowEffect(body, {
            projectionId: stableProjectionId,
            subOperationId,
            row: expectedRows[subOperationId],
          }).status !== 'present'
        );
      } catch {
        return true;
      }
    });
    if (mismatchedSubOperationIds.length > 0) {
      return {
        reconciled: false,
        projectionName: TIMING_PROJECTION_NAME,
        projectionId: stableProjectionId,
        missingSubOperationIds: [],
        mismatchedSubOperationIds,
      };
    }
  }
  let priorRowIndex = -1;
  for (const subOperationId of stableSubOperationIds) {
    const rowIndex = matchesBySubOperation.get(subOperationId)[0].rowIndex;
    if (rowIndex <= priorRowIndex) {
      return {
        reconciled: false,
        projectionName: TIMING_PROJECTION_NAME,
        projectionId: stableProjectionId,
        missingSubOperationIds: [],
        outOfOrder: true,
      };
    }
    priorRowIndex = rowIndex;
  }
  return {
    reconciled: true,
    projectionName: TIMING_PROJECTION_NAME,
    projectionId: stableProjectionId,
  };
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
  findTimingComment,
  createTimingComment,
  updateTimingComment,
};
