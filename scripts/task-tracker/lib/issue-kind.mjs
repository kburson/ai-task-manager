// Issue-kind classification + no-commit deliverable-lane primitives (#494, #500).
//
// Most issues are `code`: their deliverable is committed source, and the
// develop→test gate (`gateCodeComplete`) hard-requires a `### 🔗 Commits`
// trail plus per-AC `aitm-verified-by` evidence. Some issues produce an
// artifact tracked in the issue itself rather than in source: analysis /
// research / audit / spike work yields a comment, document, or decision, and a
// coordination `epic` is delivered by its children's commits (its own
// acceptance is rollup-by-inspection, with no commits of its own). These are
// the NO-COMMIT kinds. They are marked via `<!-- aitm-issue-kind kind="…" -->`
// and travel a parallel lane: the commit-trail requirement is replaced by an
// `aitm-deliverable-posted` evidence marker, and an AC may be waived via an
// `aitm-ac-waived` marker in place of `aitm-verified-by`.
//
// This module is PURE (no I/O, no body surgery beyond string transforms) so the
// gate and guard layers can branch on kind without taking a dependency on gh.
//
// Non-goal: code-kind issues are NOT loosened — the no-commit branch only
// activates on an explicit `aitm-issue-kind` marker; absence means `code`.

import { serializeMarker } from './marker-grammar.mjs';

export const DEFAULT_KIND = 'code';
// #500 — the no-commit deliverable lane. `epic` joins the original #494 trio so
// a coordination epic clears develop→test on posted-deliverable evidence rather
// than a source commit trail it will never have.
export const NO_COMMIT_KINDS = Object.freeze(new Set(['audit', 'research', 'spike', 'epic']));
// Deprecated #494 alias retained for back-compat (tests, any external import).
// New code should read `NO_COMMIT_KINDS` / `isNoCommitKind`.
export const AUDIT_KINDS = NO_COMMIT_KINDS;
// #923 — `docs-only` is a third axis: commit-bearing (NOT a no-commit kind, so the
// commit-trail code-complete gate still applies) but testless. A documentation
// deliverable commits real files yet ships no `*.test.mjs`, so it cannot honestly
// satisfy `npm run test:all`, the `tests` DoD item, or the `## New Automated Tests`
// review comment. It is a member of `VALID_KINDS` but deliberately absent from
// `NO_COMMIT_KINDS`.
export const VALID_KINDS = Object.freeze(new Set([DEFAULT_KIND, 'docs-only', ...NO_COMMIT_KINDS]));
// #923 — the kinds for which the test machinery (`test:all`, the `tests` DoD item,
// the New-Automated-Tests review requirement) is NOT expected: the no-commit kinds
// (which ship a deliverable, not code) plus commit-bearing `docs-only`. Drives the
// `expectsAutomatedTests` predicate so "expects tests" is kind-derived rather than
// a hardcoded `isNoCommitKind` check.
export const TESTLESS_KINDS = Object.freeze(new Set(['docs-only', ...NO_COMMIT_KINDS]));

// Quoted-attribute grammar, mirroring `aitm-commits` (#381). Case-insensitive
// on the comment delimiters; the kind value itself is normalized to lowercase.
const KIND_MARKER_RE = /<!--\s*aitm-issue-kind\s+kind="((?:[^"]|&quot;)*)"\s*-->/i;
// Global strip form: also swallows a single trailing newline + leading inline
// whitespace so upsert leaves no blank-line residue.
const KIND_MARKER_STRIP_RE = /[ \t]*<!--\s*aitm-issue-kind\s+kind="(?:[^"]|&quot;)*"\s*-->\n?/gi;
const DELIVERABLE_MARKER_RE = /<!--\s*aitm-deliverable-posted(?:\s+[^>]*?)?\s*-->/i;
const AC_WAIVED_RE = /<!--\s*aitm-ac-waived(?:\s+[^>]*?)?\s*-->/i;
// #887 — epic AC reconciliation. Matches with or without a `ts` so a
// hand-written bare marker is still honored; `setEpicAcReconciled` always
// writes the timestamped form.
const EPIC_AC_RECONCILED_RE = /<!--\s*aitm-epic-ac-reconciled(?:\s+[^>]*?)?\s*-->/i;
const EPIC_AC_RECONCILED_STRIP_RE = /[ \t]*<!--\s*aitm-epic-ac-reconciled(?:\s+[^>]*?)?\s*-->\n?/gi;
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

/** True when the body is marked one of the no-commit deliverable-lane kinds. */
export function isNoCommitKind(body) {
  return NO_COMMIT_KINDS.has(parseIssueKind(body));
}

/**
 * Deprecated #494 alias for {@link isNoCommitKind}. Retained for back-compat;
 * the predicate is identical now that `epic` shares the lane. New code should
 * call `isNoCommitKind`.
 */
export function isAuditKind(body) {
  return isNoCommitKind(body);
}

/**
 * True when the body is marked one of the testless kinds — the no-commit kinds
 * plus commit-bearing `docs-only` (#923). Distinct from `isNoCommitKind`: a
 * `docs-only` body is testless but still commit-bearing.
 */
export function isTestlessKind(body) {
  return TESTLESS_KINDS.has(parseIssueKind(body));
}

/**
 * True when an issue of this kind is expected to produce automated tests — i.e.
 * `npm run test:all`, the `tests` DoD item, and the `## New Automated Tests`
 * review comment apply (#923). This is the kind-driven predicate the test
 * machinery branches on instead of a hardcoded `isNoCommitKind` check, so
 * commit-bearing-but-testless `docs-only` is handled correct-by-construction.
 */
export function expectsAutomatedTests(body) {
  return !isTestlessKind(body);
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
 * True when the body records that its ACs have been reconciled against what its
 * children actually delivered (#887).
 *
 * An epic's ACs are written at decomposition time, when the children are still
 * proposals. By the time the last child lands, what was delivered has usually
 * drifted from what was described — so the epic's own acceptance is stale
 * exactly when it is about to be relied on. Reconciliation is the act of
 * re-reading the epic's goals against the delivered children; this marker
 * records that the act happened, and when.
 */
export function hasEpicAcReconciledMarker(body) {
  return EPIC_AC_RECONCILED_RE.test(String(body || ''));
}

/**
 * Idempotent upsert of the reconciliation marker (#887).
 *
 * Placement mirrors `setIssueKindMarker`: under `## AITM Progress Markers` when
 * that block exists, else appended. `ts` is load-bearing — it lets a reader tell
 * whether reconciliation predates the last child landing.
 */
export function setEpicAcReconciled(body, ts = new Date().toISOString()) {
  const stripped = String(body || '').replace(EPIC_AC_RECONCILED_STRIP_RE, '');
  const marker = serializeMarker('epic-ac-reconciled', { ts });
  if (PROGRESS_MARKERS_RE.test(stripped)) {
    return stripped.replace(PROGRESS_MARKERS_RE, `$1\n${marker}\n`);
  }
  return `${stripped.replace(/\s*$/, '')}\n\n${marker}\n`;
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
