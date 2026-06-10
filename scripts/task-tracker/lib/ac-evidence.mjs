// #345 — Acceptance Criteria evidence markers. Parallel to #303's Functional
// DoD evidence path (`functional-dod-evidence.mjs`), but for AC checkbox lines
// that carry an `aitm-verified-by: <cmd>` marker and no human-assigned key.
//
// An AC line is gated like a stampable Functional DoD item: `/task check`
// refuses to tick it unless a matching `aitm-ac-evidence:<key>` marker exists,
// produced by `/task ac-stamp "<label>"` re-running the declared verifier(s)
// in the sandbox and capturing exit + head sha + timestamp.
//
// The key is a stable 8-hex-char SHA-256 digest of the trimmed, marker-stripped
// label text — ACs have no `tests`/`lint`-style human key. Stamping appends the
// evidence marker (it does not change the visible label), so the key is stable
// across the stamp.

import { createHash } from 'node:crypto';

const AC_HEADING_RE = /^#{1,4}\s+Acceptance Criteria\b[^\n]*$/im;
const SECTION_END_RE = /^(#{1,4}\s|<!--\s*aitm-fields:)/m;
const BOX_RE = /^(\s*- \[)([ x])(\]\s+)(.+)$/;
const VERIFIED_BY_RE = /<!--\s*aitm-verified-by:\s*([\s\S]*?)\s*-->/gi;
const AC_EVIDENCE_MARKER_RE =
  /<!--\s*aitm-ac-evidence:([0-9a-f]+)\s+cmd="([^"]*)"\s+exit=(-?\d+)\s+sha=([^\s]+)\s+ts=([^\s]+)\s*-->/i;

// Strip every hidden marker from a checkbox label so the visible text is what
// remains. Used both for display and as the hash input for the key.
function stripMarkers(text) {
  return String(text || '')
    .replace(VERIFIED_BY_RE, '')
    .replace(AC_EVIDENCE_MARKER_RE, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// Stable per-label key: first 8 hex chars of SHA-256 of the marker-stripped,
// whitespace-collapsed label. Exported so the gate, the verb, and tests all
// derive the same key.
export function acKeyForLabel(label) {
  const norm = stripMarkers(label);
  return createHash('sha256').update(norm, 'utf8').digest('hex').slice(0, 8);
}

function extractCommands(text) {
  const out = [];
  const haystack = String(text || '');
  for (const m of haystack.matchAll(VERIFIED_BY_RE)) {
    for (const c of String(m[1]).matchAll(/`([^`]+)`/g)) out.push(c[1]);
  }
  return out;
}

export function parseAcEvidence(text) {
  const m = String(text || '').match(AC_EVIDENCE_MARKER_RE);
  if (!m) return null;
  return {
    key: m[1].toLowerCase(),
    cmd: m[2],
    exit: Number(m[3]),
    sha: m[4],
    ts: m[5],
  };
}

function locateAcSection(body) {
  const src = String(body || '');
  const m = src.match(AC_HEADING_RE);
  if (!m) return null;
  const start = m.index + m[0].length;
  const rest = src.slice(start);
  const end = rest.match(SECTION_END_RE);
  const endIdx = end ? start + end.index : src.length;
  return { start, end: endIdx };
}

// Parse every checkbox line inside the `## Acceptance Criteria` section that
// carries an `aitm-verified-by` marker. Lines without that marker (plain ACs
// the operator never declared a verifier for) are skipped — they are not
// evidence-gated. Returns objects:
//   { label, lineIndex, checked, evidenceCommands, evidenceMarker, key }
export function parseEvidenceAcs(body) {
  const src = String(body || '');
  const loc = locateAcSection(src);
  if (!loc) return [];
  const lines = src.split('\n');
  const startLine = src.slice(0, loc.start).split('\n').length - 1;
  const endLine = src.slice(0, loc.end).split('\n').length;
  const out = [];
  for (let i = startLine; i < endLine && i < lines.length; i += 1) {
    const box = lines[i].match(BOX_RE);
    if (!box) continue;
    const rest = box[4];
    const commands = extractCommands(rest);
    if (!commands.length) continue; // no aitm-verified-by → not gated
    out.push({
      label: stripMarkers(rest),
      lineIndex: i,
      checked: box[2] === 'x',
      evidenceCommands: commands,
      evidenceMarker: parseAcEvidence(rest),
      key: acKeyForLabel(rest),
    });
  }
  return out;
}

// Find the parsed AC item whose stripped label equals the requested label.
// The requested label is itself stripped first, so callers can pass either the
// raw body line or the visible text.
export function findEvidenceAc(body, requestedLabel) {
  const wanted = stripMarkers(requestedLabel);
  return parseEvidenceAcs(body).find((it) => it.label === wanted) || null;
}

// Idempotently stamp (or replace) the `aitm-ac-evidence:<key>` marker on the AC
// line matching `label`. Appends to the line text; replaces an existing marker
// in place. Returns the (possibly-unchanged) body. Throws when no matching
// evidence-bearing AC line exists or when evidence fields are malformed.
export function stampAcEvidenceMarker(body, label, evidence) {
  const { cmd, sha, ts, exit } = evidence || {};
  if (typeof cmd !== 'string' || typeof sha !== 'string' || typeof ts !== 'string') {
    throw new Error('stampAcEvidenceMarker: evidence requires { cmd, sha, ts, exit }');
  }
  const src = String(body || '');
  const target = findEvidenceAc(src, label);
  if (!target) {
    throw new Error(
      `stampAcEvidenceMarker: no evidence-bearing AC line matching "${stripMarkers(label)}" found`
    );
  }
  const key = target.key;
  const exitN = Number.isFinite(exit) ? Number(exit) : 0;
  const safeCmd = String(cmd).replace(/"/g, '\\"');
  const marker = `<!-- aitm-ac-evidence:${key} cmd="${safeCmd}" exit=${exitN} sha=${sha} ts=${ts} -->`;

  const lines = src.split('\n');
  const line = lines[target.lineIndex];
  let next;
  if (AC_EVIDENCE_MARKER_RE.test(line)) {
    next = line.replace(AC_EVIDENCE_MARKER_RE, marker);
  } else {
    next = `${line.replace(/\s+$/, '')} ${marker}`;
  }
  if (next === line) return src;
  lines[target.lineIndex] = next;
  return lines.join('\n');
}
