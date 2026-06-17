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
import { serializeMarker, unescapeValue } from './marker-grammar.mjs';
import { parseProofMarker, hasExecutionProof } from './proof-marker.mjs';
import { auditEvidenceMarkers, insertVerificationCommands } from './evidence-markers.mjs';

const AC_HEADING_RE = /^#{1,4}\s+Acceptance Criteria\b[^\n]*$/im;
const SECTION_END_RE = /^(#{1,4}\s|<!--\s*aitm-fields:)/m;
const BOX_RE = /^(\s*- \[)([ x])(\]\s+)(.+)$/;
const VERIFIED_BY_RE = /<!--\s*aitm-verified-by:\s*([\s\S]*?)\s*-->/gi;
// Legacy half-quoted colon form (read-only back-compat until the #369 corpus
// sweep): key folded into the marker NAME via `:<key>`, exit/sha/ts bare.
const AC_EVIDENCE_LEGACY_RE =
  /<!--\s*aitm-ac-evidence:([0-9a-f]+)\s+cmd="([^"]*)"\s+exit=(-?\d+)\s+sha=([^\s]+)\s+ts=([^\s]+)\s*-->/i;
// New consolidated property form (#379, parent epic #367): every value
// double-quoted, the key folded into a `key="..."` property, one comment.
const AC_EVIDENCE_NEW_RE =
  /<!--\s*aitm-ac-evidence\s+((?:[a-zA-Z0-9_-]+="(?:[^"]|&quot;)*"\s*)+)-->/i;
// "Any form" matcher — detect / strip / replace-in-place EITHER shape. After
// `aitm-ac-evidence` the legacy form has `:<hex>` then whitespace and the new
// form has whitespace, so the two stay disjoint.
const AC_EVIDENCE_ANY_RE = /<!--\s*aitm-ac-evidence(?::[0-9a-f]+)?\s[\s\S]*?-->/i;
const NEW_ATTR_RE = /([a-zA-Z0-9_-]+)="((?:[^"]|&quot;)*)"/g;

// Strip every hidden marker from a checkbox label so the visible text is what
// remains. Used both for display and as the hash input for the key.
// #411 — exported as the canonical label-cleaner so `check`'s toggle can match
// a bare visible label against marker-bearing checkbox lines without re-deriving
// the strip logic.
export function stripMarkers(text) {
  return String(text || '')
    .replace(VERIFIED_BY_RE, '')
    .replace(AC_EVIDENCE_ANY_RE, '')
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
  // #391 — after the #369 corpus migration a verifier DECLARATION is the
  // consolidated `aitm-verified cmd="..."` form, not the legacy `aitm-verified-by`
  // name. Fall back to it only when no legacy declaration was found (legacy-first
  // avoids double-counting a dual-marker line) and only when the consolidated
  // marker is a declaration — `hasExecutionProof` rejects a marker carrying a
  // record-of-run key (ts/sha/evidence), which is a proof stamp, not a verifier
  // declaration, and must not re-gate the AC.
  if (!out.length && !hasExecutionProof(haystack)) {
    const props = parseProofMarker(haystack);
    if (props && typeof props.cmd === 'string') {
      for (const c of props.cmd.matchAll(/`([^`]+)`/g)) out.push(c[1]);
    }
  }
  return out;
}

export function parseAcEvidence(text) {
  const src = String(text || '');
  // New fully-quoted property form first.
  const nm = src.match(AC_EVIDENCE_NEW_RE);
  if (nm) {
    const props = {};
    for (const a of String(nm[1]).matchAll(NEW_ATTR_RE)) {
      props[a[1]] = unescapeValue(a[2]);
    }
    // Strict canonical form only: all of key/cmd/exit/sha/ts must be present
    // and exit numeric — a partial fragment does not count as evidence.
    if (props.key == null || props.cmd == null || props.sha == null || props.ts == null) {
      return null;
    }
    const exit = Number(props.exit);
    if (!Number.isFinite(exit)) return null;
    return {
      key: String(props.key).toLowerCase(),
      cmd: props.cmd,
      exit,
      sha: props.sha,
      ts: props.ts,
    };
  }
  // Legacy half-quoted colon form.
  const m = src.match(AC_EVIDENCE_LEGACY_RE);
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
  // New consolidated grammar: serializeMarker owns quoting + `&quot;` escaping
  // of an embedded double-quote in cmd. exit is emitted as a quoted string.
  const marker = serializeMarker('ac-evidence', {
    key,
    cmd: String(cmd),
    exit: String(exitN),
    sha: String(sha),
    ts: String(ts),
  });

  const lines = src.split('\n');
  const line = lines[target.lineIndex];
  let next;
  if (AC_EVIDENCE_ANY_RE.test(line)) {
    next = line.replace(AC_EVIDENCE_ANY_RE, marker);
  } else {
    next = `${line.replace(/\s+$/, '')} ${marker}`;
  }
  if (next === line) return src;
  lines[target.lineIndex] = next;
  return lines.join('\n');
}

// #443 — stamp the AC evidence marker AND reconcile that AC's declared verifier
// command(s) into `## Verification Commands` in one body transform. `ac-stamp`
// historically stamped only the inline `aitm-ac-evidence` proof marker and left
// the command unlisted in the VC section, so `review-preflight`'s
// `auditEvidenceMarkers().missingVerificationCommands` refused `test → review`
// for any AC carrying a non-standard verifier (e.g. a spike's `grep -qF …`
// probe). #429 had to be unblocked by hand with `buildEvidenceBackfill`; this
// closes the gap at the moment evidence is recorded.
//
// Scope: only the just-stamped AC's own declared commands are reconciled, so an
// unrelated AC's gap is not silently dragged into this transaction. Idempotent:
// on a re-run the command is already in the VC set, so the intersection is empty
// and the body returns unchanged (no duplicate VC entry). Reuses the shared
// `insertVerificationCommands` primitive — no logic copy — which carries the
// #296 heading-level-aware section-end detection.
export function stampAcEvidenceAndReconcile(body, label, evidence) {
  const stamped = stampAcEvidenceMarker(body, label, evidence);
  const target = findEvidenceAc(stamped, label);
  if (!target) return stamped;
  const declared = new Set(target.evidenceCommands);
  const audit = auditEvidenceMarkers(stamped);
  const toInsert = audit.missingVerificationCommands.filter((cmd) => declared.has(cmd));
  if (!toInsert.length) return stamped;
  return insertVerificationCommands(stamped.split('\n'), toInsert).join('\n');
}
