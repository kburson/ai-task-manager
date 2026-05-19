// Stage-entry marker primitives. Stamps `<!-- aitm-entered-<stage>: <ts> -->`
// hidden markers on issue bodies as a tamper-evident audit trail of every
// successful /task promote transition. Append-only — first-stamp wins.

import { parseIssueFieldDb, stripIssueFieldDb, formatIssueFieldDb } from '../issue-field-db.mjs';

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
// Legacy unsuffixed markers parse as `visit: 1`.
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

  const illegalArcs = [];
  for (let i = 1; i < ordered.length; i++) {
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
