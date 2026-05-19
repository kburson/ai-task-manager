// GH timing comment — locate/create/append.
// GH I/O uses `gh` CLI via execFile with timeout.

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { resolvePhaseEvent } from './phase-events.mjs';
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
  // When second precision is supplied, derive minute display values from
  // it so the visible cells match the hidden marker. The visible 7-col
  // schema is preserved; a trailing `<!-- row-sec: a=N i=N -->` comment
  // carries the second-precision values for downstream rollup.
  let activeMinOut = activeMin;
  let idleMinOut = idleMin;
  let trailingMarker = '';
  if (Number.isFinite(Number(activeSec)) || Number.isFinite(Number(idleSec))) {
    const aSec = Number.isFinite(Number(activeSec))
      ? Math.max(0, Math.floor(Number(activeSec)))
      : 0;
    const iSec = Number.isFinite(Number(idleSec)) ? Math.max(0, Math.floor(Number(idleSec))) : 0;
    activeMinOut = Math.round(aSec / 60);
    idleMinOut = Math.round(iSec / 60);
    trailingMarker = ` <!-- row-sec: a=${aSec} i=${iSec} -->`;
  }
  return `| ${fmtTs(ts)} | ${event} | ${fmtNum(activeMinOut)} | ${fmtNum(idleMinOut)} | ${fmtNum(deltaWords)} | ${fmtNum(wordMarker)} | ${description} |${trailingMarker}`;
}

// ---- lastKnownState metadata helpers ---------------------------------------
//
// Stored as HTML-comment metadata at the top of the issue body (cross-worktree
// authoritative — local state files don't sync, the issue body does).
//
//   <!-- aitm-last-known-state: development -->
//   <!-- aitm-last-known-state-ts: 2026-05-10T14:32:11Z -->
//
// `writeLastKnownState` stamps its own ISO timestamp; callers cannot inject
// a retroactive ts here either.

const LAST_KNOWN_STATE_RE = /<!--\s*aitm-last-known-state:\s*([A-Za-z0-9_-]+)\s*-->/;
const LAST_KNOWN_STATE_TS_RE = /<!--\s*aitm-last-known-state-ts:\s*([^\s>][^>]*?)\s*-->/;
const LAST_KNOWN_STATE_PAIR_RE =
  /<!--\s*aitm-last-known-state:\s*[A-Za-z0-9_-]+\s*-->\s*\n?<!--\s*aitm-last-known-state-ts:\s*[^>]+?\s*-->\s*\n?/;

export function readLastKnownState(body) {
  if (!body || typeof body !== 'string') return { state: null, ts: null };
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
  const block = `<!-- aitm-last-known-state: ${normalized} -->\n<!-- aitm-last-known-state-ts: ${ts} -->\n`;
  const src = typeof body === 'string' ? body : '';

  if (LAST_KNOWN_STATE_PAIR_RE.test(src)) {
    return src.replace(LAST_KNOWN_STATE_PAIR_RE, block);
  }
  // Fallback for half-written bodies (state without ts or vice versa) — strip
  // any stragglers before prepending the fresh pair to avoid duplicates.
  const stripped = src
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

export async function postTimingEvent({ issueNumber, repo, row, timeoutMs = 2000 }) {
  const existing = await findTimingComment(issueNumber, repo, { timeoutMs });
  if (existing) {
    const updated = appendRow(existing.body, row);
    await updateTimingComment(existing.id, repo, updated, { timeoutMs });
  } else {
    const initial = appendRow(buildInitialComment(), row);
    await createTimingComment(issueNumber, repo, initial, { timeoutMs });
  }
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
