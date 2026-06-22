// Issue-kind classification + audit/research lane primitives (#494).
//
// Most issues are `code`: their deliverable is committed source, and the
// develop→test gate (`gateCodeComplete`) hard-requires a `### 🔗 Commits`
// trail plus per-AC `aitm-verified-by` evidence. Analysis / research / audit /
// spike issues produce a comment, document, or decision instead of source.
// They are marked audit-kind via `<!-- aitm-issue-kind kind="audit" -->` and
// travel a parallel lane: the commit-trail requirement is replaced by an
// `aitm-deliverable-posted` evidence marker, and an analytical AC may be
// audited-waived via an `aitm-ac-waived` marker in place of `aitm-verified-by`.
//
// This module is PURE (no I/O, no body surgery beyond string transforms) so the
// gate and guard layers can branch on kind without taking a dependency on gh.
//
// Non-goal: code-kind issues are NOT loosened — the audit branch only activates
// on an explicit `aitm-issue-kind` marker; absence means `code`.

import { serializeMarker } from './marker-grammar.mjs';

export const DEFAULT_KIND = 'code';
export const AUDIT_KINDS = Object.freeze(new Set(['audit', 'research', 'spike']));
export const VALID_KINDS = Object.freeze(new Set([DEFAULT_KIND, ...AUDIT_KINDS]));

// Quoted-attribute grammar, mirroring `aitm-commits` (#381). Case-insensitive
// on the comment delimiters; the kind value itself is normalized to lowercase.
const KIND_MARKER_RE = /<!--\s*aitm-issue-kind\s+kind="((?:[^"]|&quot;)*)"\s*-->/i;
// Global strip form: also swallows a single trailing newline + leading inline
// whitespace so upsert leaves no blank-line residue.
const KIND_MARKER_STRIP_RE = /[ \t]*<!--\s*aitm-issue-kind\s+kind="(?:[^"]|&quot;)*"\s*-->\n?/gi;
const DELIVERABLE_MARKER_RE = /<!--\s*aitm-deliverable-posted(?:\s+[^>]*?)?\s*-->/i;
const AC_WAIVED_RE = /<!--\s*aitm-ac-waived(?:\s+[^>]*?)?\s*-->/i;
const PROGRESS_MARKERS_RE = /(^##\s+AITM Progress Markers\s*\n)/im;

/** Normalize + validate a kind string. Throws on an unknown kind. */
export function normalizeKind(kind) {
  const k = String(kind || '')
    .trim()
    .toLowerCase();
  if (!VALID_KINDS.has(k)) {
    throw new Error(
      `invalid issue kind "${kind}" — expected one of ${[...VALID_KINDS].join(', ')}`
    );
  }
  return k;
}

/** Read the issue kind from a body. Returns `code` when no (valid) marker. */
export function parseIssueKind(body) {
  const m = String(body || '').match(KIND_MARKER_RE);
  if (!m) return DEFAULT_KIND;
  const kind = m[1].trim().toLowerCase();
  return VALID_KINDS.has(kind) ? kind : DEFAULT_KIND;
}

/** True when the body is marked one of the audit-lane kinds. */
export function isAuditKind(body) {
  return AUDIT_KINDS.has(parseIssueKind(body));
}

/** True when the body carries an `aitm-deliverable-posted` evidence marker. */
export function hasDeliverableMarker(body) {
  return DELIVERABLE_MARKER_RE.test(String(body || ''));
}

/** True when an AC label carries a sanctioned `aitm-ac-waived` marker. */
export function isAcWaived(label) {
  return AC_WAIVED_RE.test(String(label || ''));
}

/**
 * Idempotent upsert of the kind marker into a body.
 *
 * Setting kind to `code` (the default) REMOVES any existing marker — code needs
 * no marker. Any other kind replaces/inserts the marker under the
 * `## AITM Progress Markers` block when present, else appends it at the end.
 */
export function setIssueKindMarker(body, kind) {
  const k = normalizeKind(kind);
  const stripped = String(body || '').replace(KIND_MARKER_STRIP_RE, '');
  if (k === DEFAULT_KIND) return stripped;
  const marker = serializeMarker('issue-kind', { kind: k });
  if (PROGRESS_MARKERS_RE.test(stripped)) {
    return stripped.replace(PROGRESS_MARKERS_RE, `$1\n${marker}\n`);
  }
  return `${stripped.replace(/\s*$/, '')}\n\n${marker}\n`;
}
