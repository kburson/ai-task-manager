// Stage-entry marker primitives. Stamps `<!-- aitm-entered-<stage>: <ts> -->`
// hidden markers on issue bodies as a tamper-evident audit trail of every
// successful /task promote transition. Append-only — first-stamp wins.

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

import { parseIssueFieldDb, stripIssueFieldDb, formatIssueFieldDb } from '../issue-field-db.mjs';
import { GH_API_TIMEOUT_MS } from './process-timeouts.mjs';

const pexec = promisify(execFile);

export const STAGES = ['backlog', 'refine', 'plan', 'develop', 'test', 'review', 'done'];
const STAGE_INDEX = Object.fromEntries(STAGES.map((s, i) => [s, i]));
const KNOWN_STAGES = new Set(STAGES);

// Legal transitions in the 7-state machine. Forward arcs follow the linear
// chain; rollback arcs cover legitimate rewinds (review/test → develop on
// rework, develop → plan/refine on re-plan, plan → refine/backlog on cancel,
// refine → backlog on demote). Used by verifyChainIntegrity to validate the
// timestamp-ordered sequence of visit-numbered entry markers.
function buildLegalTransitions() {
  const set = new Set();
  for (let i = 0; i < STAGES.length - 1; i++) set.add(`${STAGES[i]}->${STAGES[i + 1]}`);
  for (const arc of [
    'review->develop',
    'test->develop',
    'develop->plan',
    'develop->refine',
    'plan->refine',
    'plan->backlog',
    'refine->backlog',
  ]) {
    set.add(arc);
  }
  return set;
}
export const LEGAL_TRANSITIONS = buildLegalTransitions();

const ENTRY_RE_GLOBAL = /<!--\s*aitm-entered-([a-z]+)(?:-(\d+))?:\s*([^>\s]+)\s*-->/gi;

function entryMarker(stage, ts, visit = 1) {
  const suffix = visit > 1 ? `-${visit}` : '';
  return `<!-- aitm-entered-${stage}${suffix}: ${ts} -->`;
}

function backfillAuditMarker(stage, reason, ts) {
  const safeReason = String(reason || '').replace(/[:>]/g, '_');
  return `<!-- aitm-backfill: ${stage}:${safeReason}:${ts} -->`;
}

function stageMarkerRe(stage) {
  return new RegExp(`<!--\\s*aitm-entered-${stage}(?:-\\d+)?:\\s*([^>]*?)\\s*-->`, 'i');
}

function backfillMarkerRe(stage) {
  return new RegExp(`<!--\\s*aitm-backfill:\\s*${stage}:[^>]*?\\s*-->`, 'i');
}

function insertBeforeFieldDb(body, marker) {
  const src = String(body || '');
  const parsed = parseIssueFieldDb(src);
  if (parsed.ok) {
    const stripped = stripIssueFieldDb(src);
    return `${stripped}\n\n${marker}\n\n${formatIssueFieldDb(parsed.values)}\n`;
  }
  return `${src.replace(/\s+$/, '')}\n\n${marker}\n`;
}

export function stampEntryMarker(body, stage, ts) {
  if (!KNOWN_STAGES.has(stage)) {
    throw new Error(`stampEntryMarker: unknown stage "${stage}"`);
  }
  if (!ts) throw new Error('stampEntryMarker: ts is required');
  const src = String(body || '');
  const tuples = parseEntryMarkers(src);
  let maxVisit = 0;
  for (const t of tuples) {
    if (t.stage === stage && t.visit > maxVisit) maxVisit = t.visit;
  }
  // Idempotency: re-stamping the exact same (stage, ts) pair is a no-op.
  // Distinct ts always advances the visit count.
  if (tuples.some((t) => t.stage === stage && t.ts === ts)) return src;
  const nextVisit = maxVisit + 1;
  return insertBeforeFieldDb(src, entryMarker(stage, ts, nextVisit));
}

// Returns an ordered list of `{stage, visit, ts}` tuples in document order.
// Legacy markers without a visit suffix parse as `visit: 1`.
export function parseEntryMarkers(body) {
  const src = String(body || '');
  const out = [];
  ENTRY_RE_GLOBAL.lastIndex = 0;
  let m;
  while ((m = ENTRY_RE_GLOBAL.exec(src)) !== null) {
    const [, stage, visitStr, ts] = m;
    const visit = visitStr ? Number(visitStr) : 1;
    out.push({ stage, visit, ts });
  }
  return out;
}

// First-visit-only view as a `{stage: ts}` map. For callers that only need
// the legacy "first time we entered this stage" semantics — preserves
// back-compat for heal-entry-markers and similar consumers that haven't been
// updated to the tuple form.
export function parseEntryMarkersFirstVisit(body) {
  const out = {};
  for (const { stage, visit, ts } of parseEntryMarkers(body)) {
    if (visit === 1 && !(stage in out)) out[stage] = ts;
  }
  return out;
}

export function verifyChainIntegrity(body, currentStage) {
  if (!KNOWN_STAGES.has(currentStage)) {
    throw new Error(`verifyChainIntegrity: unknown currentStage "${currentStage}"`);
  }
  const tuples = parseEntryMarkers(body);
  if (tuples.length === 0) {
    return { ok: true, presentStages: [], holes: [], illegalArcs: [] };
  }

  const ordered = [...tuples].sort((a, b) => (a.ts < b.ts ? -1 : a.ts > b.ts ? 1 : 0));
  const seenStages = new Set(ordered.map((t) => t.stage));
  const presentIndices = [...seenStages].map((s) => STAGE_INDEX[s]).sort((a, b) => a - b);
  const earliest = presentIndices[0];
  const currentIdx = STAGE_INDEX[currentStage];
  const rangeEnd = Math.max(earliest, currentIdx);

  const holes = [];
  const presentStages = [];
  for (let i = earliest; i <= rangeEnd; i++) {
    const s = STAGES[i];
    if (seenStages.has(s)) presentStages.push(s);
    else holes.push(s);
  }

  // Anchor the arc scan at the latest `develop` marker. Each
  // `aitm-entered-develop-N` marks a fresh implementation attempt; arcs from
  // earlier attempts have been superseded by the rework and should not block
  // close. The arc INTO the anchor is still checked (so an illegal arrival
  // like `done -> develop` is still flagged). If no develop marker exists,
  // scan from the start (legacy behavior).
  let anchorIdx = 0;
  for (let i = ordered.length - 1; i >= 0; i--) {
    if (ordered[i].stage === 'develop') {
      anchorIdx = i;
      break;
    }
  }

  const illegalArcs = [];
  for (let i = Math.max(1, anchorIdx); i < ordered.length; i++) {
    const from = ordered[i - 1].stage;
    const to = ordered[i].stage;
    if (from === to) continue;
    if (!LEGAL_TRANSITIONS.has(`${from}->${to}`)) {
      illegalArcs.push({ from, to, atTs: ordered[i].ts });
    }
  }

  return {
    ok: holes.length === 0 && illegalArcs.length === 0,
    presentStages,
    holes,
    illegalArcs,
  };
}

export function stripEntryMarkersAfter(body, stage) {
  if (!KNOWN_STAGES.has(stage)) {
    throw new Error(`stripEntryMarkersAfter: unknown stage "${stage}"`);
  }
  const src = String(body || '');
  const idx = STAGE_INDEX[stage];
  const stripped = [];
  let out = src;
  for (let i = idx + 1; i < STAGES.length; i++) {
    const future = STAGES[i];
    const re = new RegExp(`[ \\t]*<!--\\s*aitm-entered-${future}:[^>]*?-->[ \\t]*\\n?`, 'gi');
    if (re.test(out)) {
      out = out.replace(re, '');
      stripped.push(future);
    }
  }
  if (stripped.length > 0) {
    out = out.replace(/\n{3,}/g, '\n\n');
  }
  return { body: out, stripped };
}

// Returns the highest visit number observed for `stage` in `body` (0 if none).
// Used by callers that need to detect re-entry (visit >= 2) after stamping.
export function getStageVisitCount(body, stage) {
  if (!KNOWN_STAGES.has(stage)) {
    throw new Error(`getStageVisitCount: unknown stage "${stage}"`);
  }
  let max = 0;
  for (const t of parseEntryMarkers(body)) {
    if (t.stage === stage && t.visit > max) max = t.visit;
  }
  return max;
}

// Forward-transition contiguity decision (#252). Pure — no network, no IO —
// so the single state-mutator can call it and the test suite can exercise
// every branch without spawning the CLI.
//
// On a FORWARD move (`toIdx > fromIdx` over the canonical STAGES order), every
// canonical prior forward stage (`STAGES[0..toIdx-1]`) must already carry an
// `aitm-entered-*` marker in the body. Checking the full prefix — not just the
// immediately-prior stage — is deliberate: the #251 hole was at `refine`
// (index 1) and only surfaced during a `plan→develop` move (2→3); an
// immediately-prior-only check would have inspected `plan` and missed it.
//
// Returns one of:
//   { action: 'skip',  missing: [] }            — not a forward move / offline / unknown stage
//   { action: 'allow', missing: [] }            — forward move, full prefix present
//   { action: 'refuse', missing, message }      — forward move, prefix hole, no override
//   { action: 'bypass', missing, message }      — same hole, but `force` set (audited override)
//
// Backward/rework arcs and re-entry all have `toIdx <= fromIdx` and resolve to
// 'skip', so they are never blocked. An empty/unknown `fromState` (offline,
// no live board Status) also resolves to 'skip'.
export function evaluateContiguity({ fromState, toState, body, force = false }) {
  const fromIdx = STAGE_INDEX[fromState] ?? -1;
  const toIdx = STAGE_INDEX[toState] ?? -1;
  if (fromIdx === -1 || toIdx === -1 || toIdx <= fromIdx) {
    return { action: 'skip', missing: [] };
  }
  const missing = [];
  for (let i = 0; i < toIdx; i++) {
    if (getStageVisitCount(body || '', STAGES[i]) === 0) missing.push(STAGES[i]);
  }
  if (missing.length === 0) return { action: 'allow', missing: [] };
  const markerList = missing.map((s) => `aitm-entered-${s}`).join(', ');
  if (force) {
    return {
      action: 'bypass',
      missing,
      message: `forward move ${fromState} → ${toState} proceeded with missing prior-stage marker(s): ${markerList}`,
    };
  }
  return {
    action: 'refuse',
    missing,
    message: `contiguity-hole — missing prior-stage entry marker(s): ${markerList}. The board shows ${fromState} but the body never recorded entry into: ${missing.join(', ')}`,
  };
}

// Hidden marker for re-entry audit comments. One per (stage, visit) pair.
export const REENTRY_AUDIT_MARKER_RE = /<!--\s*aitm-reentry-audit:\s*([a-z]+)-(\d+)\s*-->/i;

export function buildReentryAuditMarker(stage, visit) {
  return `<!-- aitm-reentry-audit: ${stage}-${visit} -->`;
}

export function buildReentryAuditCommentBody({ stage, visit, ts }) {
  if (!stage) throw new Error('buildReentryAuditCommentBody: stage is required');
  if (!visit || visit < 2) throw new Error('buildReentryAuditCommentBody: visit must be >= 2');
  if (!ts) throw new Error('buildReentryAuditCommentBody: ts is required');
  return [
    `### Re-entry recorded — \`${stage}\` (visit ${visit})`,
    '',
    `Stage \`${stage}\` was re-entered at ${ts} (visit ${visit}).`,
    '',
    'A visit-numbered entry marker was appended to the issue body. The previous markers for this stage are preserved as audit history. This comment makes the body change observable in the issue timeline.',
    '',
    buildReentryAuditMarker(stage, visit),
  ].join('\n');
}

async function defaultPostComment({ repo, issueNumber, body }) {
  await pexec('gh', ['issue', 'comment', String(issueNumber), '-R', repo, '--body', body], {
    timeout: GH_API_TIMEOUT_MS,
  });
}

async function defaultListComments({ repo, issueNumber }) {
  const { stdout } = await pexec(
    'gh',
    ['issue', 'view', String(issueNumber), '-R', repo, '--json', 'comments'],
    { timeout: GH_API_TIMEOUT_MS }
  );
  const parsed = JSON.parse(stdout || '{}');
  return Array.isArray(parsed.comments) ? parsed.comments : [];
}

function hasReentryAuditCommentFor(comments, stage, visit) {
  if (!Array.isArray(comments)) return false;
  const expect = `aitm-reentry-audit: ${stage}-${visit}`;
  return comments.some((c) => String(c?.body ?? '').includes(expect));
}

// Idempotent re-entry audit-comment poster. Call AFTER stampEntryMarker when
// visit >= 2 to make the body re-stamp observable in the issue timeline.
// First-visit calls (visit === 1) are a no-op so callers can invoke
// unconditionally.
//
// Returns one of:
//   { mode: 'first-visit' }                                  visit < 2 — no-op
//   { mode: 'already-present' }                              prior comment found
//   { mode: 'posted' }                                       comment posted
//   { mode: 'error', error: string }                         post failed (degraded)
//
// Never throws — failure to post degrades gracefully with a stderr warning so
// the caller's body-stamp success is not undone by a comment-API hiccup.
export async function postReentryAuditComment({
  issueNumber,
  repo,
  stage,
  visit,
  ts,
  postComment,
  listComments,
  warn = (msg) => process.stderr.write(`${msg}\n`),
} = {}) {
  if (!issueNumber) throw new Error('postReentryAuditComment: issueNumber is required');
  if (!repo) throw new Error('postReentryAuditComment: repo is required');
  if (!stage || !KNOWN_STAGES.has(stage)) {
    throw new Error(`postReentryAuditComment: unknown stage "${stage}"`);
  }
  const v = Number(visit);
  if (!Number.isFinite(v) || v < 1) {
    throw new Error('postReentryAuditComment: visit must be a positive integer');
  }
  if (!ts) throw new Error('postReentryAuditComment: ts is required');

  if (v < 2) return { mode: 'first-visit' };

  const list = listComments || defaultListComments;
  const post = postComment || defaultPostComment;

  // Pre-check: scan comments for the (stage, visit) marker before posting.
  try {
    const comments = await list({ repo, issueNumber });
    if (hasReentryAuditCommentFor(comments, stage, v)) {
      return { mode: 'already-present' };
    }
  } catch (err) {
    // best-effort — if list fails, fall through and post (a duplicate is
    // preferable to a silently omitted audit row, mirroring the
    // full-auto-approval policy).
    warn(
      `[reentry-audit] issue #${issueNumber}: comment list failed (${err.message}) — posting anyway`
    );
  }

  const body = buildReentryAuditCommentBody({ stage, visit: v, ts });
  try {
    await post({ repo, issueNumber, body });
    return { mode: 'posted' };
  } catch (err) {
    warn(
      `[reentry-audit] issue #${issueNumber}: comment post FAILED for ${stage}-${v}: ${err.message}`
    );
    return { mode: 'error', error: err.message };
  }
}

export function backfillEntryMarker(body, stage, ts, reason) {
  if (!KNOWN_STAGES.has(stage)) {
    throw new Error(`backfillEntryMarker: unknown stage "${stage}"`);
  }
  if (!ts) throw new Error('backfillEntryMarker: ts is required');
  if (!reason) throw new Error('backfillEntryMarker: reason is required');
  const src = String(body || '');
  const hasEntry = stageMarkerRe(stage).test(src);
  const hasAudit = backfillMarkerRe(stage).test(src);
  if (hasEntry && hasAudit) return src;

  let out = src;
  if (!hasEntry) out = insertBeforeFieldDb(out, entryMarker(stage, ts));
  if (!hasAudit) out = insertBeforeFieldDb(out, backfillAuditMarker(stage, reason, ts));
  return out;
}
