// @story #1904
// Pure shared section selection for functional completion and AC body guards.
// Preserve original offsets/termination; literal headings cannot gain authority.
const HEADING_RE = /^(#{1,4})\s+Acceptance Criteria\b[^\n]*$/i;
const SECTION_END_RE = /^(#{1,4}\s|<!--\s*aitm-fields:)/m;

export function locateAcSection(body) {
  const src = String(body || '');
  const headings = [];
  let fence = null;
  let comment = false;
  let offset = 0;
  for (const raw of src.split('\n')) {
    const index = offset;
    offset += raw.length + 1;
    const marker = raw.match(/^ {0,3}(`{3,}|~{3,})(.*)$/);
    if (fence) {
      if (
        marker &&
        marker[1][0] === fence[0] &&
        marker[1].length >= fence.length &&
        !marker[2].trim()
      )
        fence = null;
      continue;
    }
    if (comment) {
      for (const token of raw.matchAll(/<!--|--!?>/g)) comment = token[0] === '<!--';
      continue;
    }
    if (marker) {
      fence = marker[1];
      continue;
    }
    const heading = raw.match(HEADING_RE);
    if (heading) headings.push({ index, length: raw.length, level: heading[1].length });
    for (const token of raw.matchAll(/<!--|--!?>/g)) comment = token[0] === '<!--';
  }
  const canonical = headings.filter((heading) => heading.level === 2);
  if (canonical.length > 1) throw new TypeError('ambiguous root Acceptance Criteria headings');
  const heading = canonical[0] || headings[0];
  if (!heading) return null;
  const start = heading.index + heading.length;
  const endMatch = src.slice(start).match(SECTION_END_RE);
  const end = endMatch ? start + endMatch.index : src.length;
  return { start, end, section: src.slice(start, end) };
}
