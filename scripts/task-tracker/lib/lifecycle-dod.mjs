// Lifecycle DoD parser and ticker (#138).
//
// The Functional vs Lifecycle DoD split (#139 will template this) defines a
// `#### Lifecycle (auto-ticked at Review/Close)` subsection under
// `## ... Definition of Done` whose checkbox items are NOT user-verified —
// they are side effects of the close verb itself. This module:
//
//   1. Locates the Lifecycle subsection by heading.
//   2. Maps canonical keys → human-readable labels.
//   3. Provides idempotent `[ ] → [x]` ticking by key.
//   4. Exposes the set of label strings so `uncheckedPreCloseCheckboxes`
//      can exclude them from its blockers list.

export const LIFECYCLE_LABELS = {
  'passed-final-review': 'Passed final human review',
  'story-closed': 'Story closed and moved to Done',
  'timing-flushed': 'Timing data flushed to issue',
};

export const LIFECYCLE_LABEL_SET = new Set(Object.values(LIFECYCLE_LABELS));

const LIFECYCLE_HEADING_RE = /^####\s+Lifecycle\b[^\n]*$/im;
// Section ends at the next heading of equal-or-shallower depth, the field-DB
// block, or end-of-body — whichever comes first.
const SECTION_END_RE = /^(#{1,4}\s|<!--\s*aitm-fields:)/m;

export function locateLifecycleSection(body) {
  const src = String(body || '');
  const m = src.match(LIFECYCLE_HEADING_RE);
  if (!m) return null;
  const start = m.index + m[0].length;
  const rest = src.slice(start);
  const endMatch = rest.match(SECTION_END_RE);
  const end = endMatch ? start + endMatch.index : src.length;
  return {
    start,
    end,
    section: src.slice(start, end),
    before: src.slice(0, start),
    after: src.slice(end),
  };
}

export function parseLifecycleItems(body) {
  const loc = locateLifecycleSection(body);
  if (!loc) return [];
  const items = [];
  const re = /^- \[([ x])\]\s+(.+)$/gm;
  let m;
  while ((m = re.exec(loc.section)) !== null) {
    const checked = m[1] === 'x';
    const label = m[2].trim();
    const key = Object.entries(LIFECYCLE_LABELS).find(([, l]) => l === label)?.[0] || null;
    items.push({ key, label, checked });
  }
  return items;
}

// Tick the lifecycle item identified by `key`. Idempotent. Returns the
// (possibly-unchanged) body.
export function tickLifecycleItem(body, key) {
  if (!(key in LIFECYCLE_LABELS)) {
    throw new Error(`tickLifecycleItem: unknown lifecycle key "${key}"`);
  }
  const label = LIFECYCLE_LABELS[key];
  const loc = locateLifecycleSection(body);
  if (!loc) return String(body || '');
  // Escape label for use in regex
  const labelRe = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const tickRe = new RegExp(`(^- )\\[ \\](\\s+${labelRe}\\s*$)`, 'm');
  const tickedSection = loc.section.replace(tickRe, '$1[x]$2');
  if (tickedSection === loc.section) return String(body || '');
  return loc.before + tickedSection + loc.after;
}
