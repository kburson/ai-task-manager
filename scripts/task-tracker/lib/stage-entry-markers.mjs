// Stage-entry marker primitives. Stamps `<!-- aitm-entered-<stage>: <ts> -->`
// hidden markers on issue bodies as a tamper-evident audit trail of every
// successful /task promote transition. Append-only — first-stamp wins.

import { parseIssueFieldDb, stripIssueFieldDb, formatIssueFieldDb } from '../issue-field-db.mjs';

export const STAGES = ['backlog', 'refine', 'plan', 'develop', 'test', 'review', 'done'];
const STAGE_INDEX = Object.fromEntries(STAGES.map((s, i) => [s, i]));
const KNOWN_STAGES = new Set(STAGES);

const ENTRY_RE_GLOBAL = /<!--\s*aitm-entered-([a-z]+):\s*([^>\s]+)\s*-->/gi;

function entryMarker(stage, ts) {
  return `<!-- aitm-entered-${stage}: ${ts} -->`;
}

function backfillAuditMarker(stage, reason, ts) {
  const safeReason = String(reason || '').replace(/[:>]/g, '_');
  return `<!-- aitm-backfill: ${stage}:${safeReason}:${ts} -->`;
}

function stageMarkerRe(stage) {
  return new RegExp(`<!--\\s*aitm-entered-${stage}:\\s*([^>]*?)\\s*-->`, 'i');
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
  if (stageMarkerRe(stage).test(src)) return src;
  return insertBeforeFieldDb(src, entryMarker(stage, ts));
}

export function parseEntryMarkers(body) {
  const src = String(body || '');
  const out = {};
  ENTRY_RE_GLOBAL.lastIndex = 0;
  let m;
  while ((m = ENTRY_RE_GLOBAL.exec(src)) !== null) {
    const [, stage, ts] = m;
    if (!(stage in out)) out[stage] = ts;
  }
  return out;
}

export function verifyChainIntegrity(body, currentStage) {
  if (!KNOWN_STAGES.has(currentStage)) {
    throw new Error(`verifyChainIntegrity: unknown currentStage "${currentStage}"`);
  }
  const markers = parseEntryMarkers(body);
  const present = Object.keys(markers);
  if (present.length === 0) {
    return { ok: true, presentStages: [], holes: [], outOfOrder: false };
  }
  const presentIndices = present.map((s) => STAGE_INDEX[s]).sort((a, b) => a - b);
  const earliest = presentIndices[0];
  const currentIdx = STAGE_INDEX[currentStage];
  const rangeEnd = Math.max(earliest, currentIdx);

  const holes = [];
  const presentStages = [];
  for (let i = earliest; i <= rangeEnd; i++) {
    const s = STAGES[i];
    if (s in markers) presentStages.push(s);
    else holes.push(s);
  }

  let outOfOrder = false;
  let prevTs = null;
  for (const s of presentStages) {
    const ts = markers[s];
    if (prevTs !== null && ts < prevTs) {
      outOfOrder = true;
      break;
    }
    prevTs = ts;
  }

  return { ok: holes.length === 0 && !outOfOrder, presentStages, holes, outOfOrder };
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
