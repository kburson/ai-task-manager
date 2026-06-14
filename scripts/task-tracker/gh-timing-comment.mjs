// GH timing comment — locate/create/append.
// GH I/O uses `gh` CLI via execFile with timeout.

import { execFile } from 'node:child_process';
import path from 'node:path';
import { promisify } from 'node:util';
import { resolvePhaseEvent } from './phase-events.mjs';
import { withLock } from './locks.mjs';
import { getProjectDir } from './paths.mjs';
import { serializeMarker, unescapeValue } from './lib/marker-grammar.mjs';
import { formatDurationSeconds } from './lib/timing-rows.mjs';
const pexec = promisify(execFile);

const TIMING_HEADING = '⏱ Timing Log';

const TABLE_HEADER = [
  '| Timestamp | Event | Active | Idle | Δ Words | Word Marker | Description |',
  '|---|---|---|---|---|---|---|',
].join('\n');

export function fmtTs(iso) {
  const d = new Date(iso);
  const pad = (n) => String(n).padStart(2, '0');
  const offsetMin = -d.getTimezoneOffset();
  const sign = offsetMin >= 0 ? '+' : '-';
  const abs = Math.abs(offsetMin);
  const offset = `${sign}${pad(Math.floor(abs / 60))}:${pad(abs % 60)}`;
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())} ${offset}`;
}

// Match both legacy minute-precision (HH:MM) and current second-precision
// (HH:MM:SS) table timestamps so old rows still parse.
const TS_PATTERN = /\d{4}-\d{2}-\d{2} \d{2}:\d{2}(?::\d{2})? [+-]\d{2}:\d{2}/;

export function firstStartTimestamp(commentBody) {
  if (!commentBody) return null;
  const lines = commentBody.split('\n');
  for (const line of lines) {
    if (!line.startsWith('|')) continue;
    const cells = line.split('|').map((s) => s.trim());
    if (cells.length < 3) continue;
    const ts = cells[1];
    const event = cells[2];
    if (event?.toLowerCase() === 'start' && TS_PATTERN.test(ts)) {
      return ts.match(TS_PATTERN)[0];
    }
  }
  return null;
}
function fmtNum(n) {
  return n == null ? '—' : Number(n).toLocaleString('en-US');
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
    activeCell = formatDurationSeconds(aSec);
    idleCell = formatDurationSeconds(iSec);
    trailingMarker = ` <!-- row-sec: a=${aSec} i=${iSec} -->`;
  } else {
    activeCell = fmtNum(activeMin);
    idleCell = fmtNum(idleMin);
  }
  return `| ${fmtTs(ts)} | ${event} | ${activeCell} | ${idleCell} | ${fmtNum(deltaWords)} | ${fmtNum(wordMarker)} | ${description} |${trailingMarker}`;
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
  return [TIMING_HEADING, '', TABLE_HEADER].join('\n');
}

function appendRow(body, row) {
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
  lines.splice(lastTableIdx + 1, 0, row);
  return lines.join('\n').replace(/\n+$/, '') + '\n';
}

// ---- GH shell-out helpers ----

async function ghExec(args, { timeoutMs = 2000 } = {}) {
  const { stdout } = await pexec('gh', args, { timeout: timeoutMs });
  return stdout;
}

async function findTimingComment(issueNumber, repo, { timeoutMs } = {}) {
  const num = issueNumber.replace('#', '');
  const out = await ghExec(['issue', 'view', num, '-R', repo, '--json', 'comments'], { timeoutMs });
  const { comments } = JSON.parse(out);
  const hit = comments.find((c) => c.body.includes(TIMING_HEADING));
  return hit ? { id: hit.id, url: hit.url, body: hit.body } : null;
}

async function createTimingComment(issueNumber, repo, body, { timeoutMs } = {}) {
  const num = issueNumber.replace('#', '');
  const out = await ghExec(['issue', 'comment', num, '-R', repo, '--body', body], { timeoutMs });
  return out.trim(); // URL of new comment
}

async function updateTimingComment(commentId, repo, body, { timeoutMs } = {}) {
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
  return path.join(projDir, '.ai-task-manager', 'locks', `timing-${safe}.lock`);
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
  timeoutMs = 2000,
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
export async function readTimingCommentBody({
  issueNumber,
  repo,
  timeoutMs = 2000,
  deps = {},
} = {}) {
  const find = deps.findTimingComment || findTimingComment;
  try {
    const existing = await find(issueNumber, repo, { timeoutMs });
    return existing?.body ?? '';
  } catch {
    return '';
  }
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
