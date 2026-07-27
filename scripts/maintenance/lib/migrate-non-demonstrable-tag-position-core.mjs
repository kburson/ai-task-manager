// #891 — core (pure, no I/O) logic for migrating legacy prose-position
// non-demonstrable tags to the canonical `<!-- aitm-non-demonstrable -->`
// marker. Split from the CLI so it can be unit-tested without gh/network.
//
// Legacy bodies satisfied the old `NON_DEMONSTRABLE_TAG_RE` with a plain
// prose substring inside the AC's visible label (e.g. "... — invalid —
// non-demonstrable"), because the pre-#891 regex tested the label text
// itself. #891 anchors the regex to a trailing HTML-comment marker instead,
// so those legacy lines no longer opt out. Migration is additive only: the
// marker is appended to any AC line that carries the legacy prose but not
// yet the marker. The legacy prose text is left in place — it is now inert,
// human-readable history — so the rewrite can never lose information and is
// trivially idempotent (a second run finds nothing left to change).

const AC_HEADING_RE = /^#{1,4}\s+Acceptance Criteria\b[^\n]*$/im;
const AC_SECTION_END_RE = /^(#{1,4}\s|<!--\s*aitm-fields:)/m;
const AC_BOX_RE = /^(\s*- \[)([ x])(\]\s+)(.+)$/;

// The pre-#891 form of NON_DEMONSTRABLE_TAG_RE (body-invariants.mjs), kept
// here only to detect legacy candidates — never reintroduced as a gate.
export const LEGACY_NON_DEMONSTRABLE_PROSE_RE = /invalid\s+[—-]+\s+non-demonstrable/i;

export const CANONICAL_MARKER = '<!-- aitm-non-demonstrable -->';
const CANONICAL_MARKER_RE = /<!--\s*aitm-non-demonstrable\s*-->/i;

/**
 * Find every AC-section checkbox line carrying the legacy prose tag but
 * missing the canonical marker.
 * @param {string} body
 * @returns {{lineIndex: number, label: string}[]}
 */
export function findLegacyNonDemonstrableAcs(body) {
  const src = String(body || '');
  const heading = src.match(AC_HEADING_RE);
  if (!heading) return [];
  const start = heading.index + heading[0].length;
  const rest = src.slice(start);
  const endMatch = rest.match(AC_SECTION_END_RE);
  const endIdx = endMatch ? start + endMatch.index : src.length;

  const lines = src.split('\n');
  const startLine = src.slice(0, start).split('\n').length - 1;
  const endLine = src.slice(0, endIdx).split('\n').length;

  const offenders = [];
  for (let i = startLine; i < endLine && i < lines.length; i += 1) {
    const box = lines[i].match(AC_BOX_RE);
    if (!box) continue;
    const label = box[4];
    if (!LEGACY_NON_DEMONSTRABLE_PROSE_RE.test(label)) continue;
    if (CANONICAL_MARKER_RE.test(label)) continue; // already migrated
    offenders.push({ lineIndex: i, label });
  }
  return offenders;
}

/**
 * Append the canonical marker to every legacy-tagged AC line. Pure
 * string transform; returns the same body unchanged (`changed: false`)
 * when there is nothing to migrate.
 * @param {string} body
 * @returns {{changed: boolean, next: string, migrated: string[]}}
 */
export function migrateBody(body) {
  const src = String(body || '');
  const offenders = findLegacyNonDemonstrableAcs(src);
  if (offenders.length === 0) {
    return { changed: false, next: src, migrated: [] };
  }
  const lines = src.split('\n');
  const migrated = [];
  for (const { lineIndex, label } of offenders) {
    lines[lineIndex] = `${lines[lineIndex].replace(/\s+$/, '')} ${CANONICAL_MARKER}`;
    migrated.push(label);
  }
  return { changed: true, next: lines.join('\n'), migrated };
}
