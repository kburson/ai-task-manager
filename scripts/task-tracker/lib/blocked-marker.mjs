// BLOCKED-marker foundation (#246).
//
// A "blocked by" relationship between issues is recorded two ways:
//   1. A hidden HTML comment in the issue body — the source of truth for which
//      issues block this one:  `<!-- aitm-blocked-by: #247, #248 -->`
//   2. A `BLOCKED` label on the issue — the at-a-glance board signal.
//
// This module owns the body-marker format (parse / add / remove / inspect) and
// emits the CLI arg arrays for the label side. It is pure: no network, no gh
// invocation at import or call time. Consumers run the label-arg arrays through
// their own gh wrapper. The body-guard (lib/gh-edit-guard.mjs) protects the
// marker from accidental drops on `gh issue edit`.

export const BLOCKED_LABEL = 'BLOCKED';

// Literal prefix shared with the body guard's MARKER_PATTERNS entry. Keep these
// in lock-step: `/<!--\s*aitm-blocked-by:/i`.
const MARKER_PREFIX = 'aitm-blocked-by';

// Matches the whole marker line (and any trailing newline) so removal leaves no
// blank residue. The capture group holds the comma-separated ref list.
const MARKER_RE = /[ \t]*<!--\s*aitm-blocked-by:\s*([^>]*?)\s*-->[ \t]*\n?/i;

// Presence-only probe used by isBlocked — does not require a non-empty list.
const MARKER_PRESENT_RE = /<!--\s*aitm-blocked-by:/i;

// Normalizes a `refs` argument (number | number[]) into a sorted, deduped array
// of positive integers. Non-positive / non-integer / NaN values are dropped.
function normalizeRefs(refs) {
  const list = Array.isArray(refs) ? refs : [refs];
  const out = new Set();
  for (const r of list) {
    const n = typeof r === 'string' ? Number(r.trim().replace(/^#/, '')) : Number(r);
    if (Number.isInteger(n) && n > 0) out.add(n);
  }
  return [...out].sort((a, b) => a - b);
}

// Renders a list of issue numbers as the marker's `#N, #M` ref string.
function renderRefList(nums) {
  return nums.map((n) => `#${n}`).join(', ');
}

// Builds the full marker line for the given (already-normalized) numbers.
function renderMarker(nums) {
  return `<!-- ${MARKER_PREFIX}: ${renderRefList(nums)} -->`;
}

/**
 * Parse the blocker issue numbers out of a body's blocked-by marker.
 *
 * @param {string} body issue body text
 * @returns {number[]} sorted, unique, positive blocker issue numbers; `[]` when
 *   no marker is present or the marker's ref list is empty.
 */
export function parseBlockedBy(body) {
  const m = String(body ?? '').match(MARKER_RE);
  if (!m) return [];
  return normalizeRefs(m[1].split(','));
}

/**
 * Merge ref(s) into the body's blocked-by marker, creating it if absent.
 * Idempotent: adding refs already present is a no-op. The merged list is the
 * union of old and new, deduped and sorted. When created, it is appended at end
 * of the body.
 *
 * @param {string} body issue body text
 * @param {number|number[]} refs blocker issue number(s)
 * @returns {string} new body text
 */
export function addBlockedBy(body, refs) {
  const src = String(body ?? '');
  const add = normalizeRefs(refs);
  const existing = parseBlockedBy(src);
  const merged = normalizeRefs([...existing, ...add]);
  // Nothing to add and no existing marker → leave body untouched.
  if (merged.length === 0) return src;
  const marker = renderMarker(merged);

  if (MARKER_RE.test(src)) {
    return src.replace(MARKER_RE, `${marker}\n`);
  }
  const trimmed = src.replace(/\s+$/, '');
  return trimmed.length ? `${trimmed}\n\n${marker}\n` : `${marker}\n`;
}

/**
 * Remove ref(s) from the body's blocked-by marker. If the marker's list becomes
 * empty, the marker line is removed entirely. Idempotent: removing absent refs
 * (or operating on a body with no marker) is a no-op.
 *
 * @param {string} body issue body text
 * @param {number|number[]} refs blocker issue number(s) to remove
 * @returns {string} new body text
 */
export function removeBlockedBy(body, refs) {
  const src = String(body ?? '');
  if (!MARKER_RE.test(src)) return src;
  const drop = new Set(normalizeRefs(refs));
  const remaining = parseBlockedBy(src).filter((n) => !drop.has(n));
  if (remaining.length === 0) {
    return src.replace(MARKER_RE, '');
  }
  return src.replace(MARKER_RE, `${renderMarker(remaining)}\n`);
}

/**
 * @param {string} body issue body text
 * @returns {boolean} true iff a non-empty blocked-by marker is present.
 */
export function isBlocked(body) {
  const src = String(body ?? '');
  if (!MARKER_PRESENT_RE.test(src)) return false;
  return parseBlockedBy(src).length > 0;
}

/**
 * CLI args to add the BLOCKED label to an issue (run via the consumer's gh
 * wrapper).
 *
 * @param {number|string} issueNumber
 * @returns {string[]} `['issue','edit',<n>,'--add-label','BLOCKED']`
 */
export function blockedLabelAddArgs(issueNumber) {
  return ['issue', 'edit', String(issueNumber), '--add-label', BLOCKED_LABEL];
}

/**
 * CLI args to remove the BLOCKED label from an issue (run via the consumer's gh
 * wrapper).
 *
 * @param {number|string} issueNumber
 * @returns {string[]} `['issue','edit',<n>,'--remove-label','BLOCKED']`
 */
export function blockedLabelRemoveArgs(issueNumber) {
  return ['issue', 'edit', String(issueNumber), '--remove-label', BLOCKED_LABEL];
}
