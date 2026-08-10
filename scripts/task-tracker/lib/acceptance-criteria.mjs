import { resolveVerifiedBy } from './proof-marker.mjs';

const AC_HEADING_RE = /^##\s+Acceptance Criteria\s*$/im;
const NEXT_HEADING_RE = /^##\s+/m;
const CHECKBOX_RE = /^- \[([ x])\] (.+)$/gm;

export function parseAcceptanceCriteria(body) {
  const src = String(body || '');
  const m = src.match(AC_HEADING_RE);
  if (!m) return null;
  const after = src.slice(m.index + m[0].length);
  const nextMatch = after.match(NEXT_HEADING_RE);
  const section = nextMatch ? after.slice(0, nextMatch.index) : after;
  const items = [];
  for (const cm of section.matchAll(CHECKBOX_RE)) {
    const checked = cm[1] === 'x';
    const label = cm[2];
    const verifiedBy = resolveVerifiedBy(label);
    items.push({ label, checked, verifiedBy: verifiedBy ? verifiedBy.trim() : null });
  }
  return items;
}
