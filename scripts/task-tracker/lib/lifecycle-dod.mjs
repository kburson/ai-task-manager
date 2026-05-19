// cspell:ignore optout optouts Optouts
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

// Per-key opt-out marker. A user who has intentionally removed a Lifecycle
// checkbox from their customized DoD template can stamp this marker in the
// body to acknowledge the gate skip — e.g.
//   <!-- aitm-lifecycle-optout: passed-final-review -->
// The marker is protected by gh-edit-guard's MARKER_PATTERNS so once stamped
// it cannot be silently dropped.
export const LIFECYCLE_OPTOUT_RE = /<!--\s*aitm-lifecycle-optout:\s*([a-z0-9-]+)\s*-->/gi;

export function parseLifecycleOptouts(body) {
  const src = String(body || '');
  const out = new Set();
  for (const m of src.matchAll(LIFECYCLE_OPTOUT_RE)) {
    out.add(String(m[1] || '').toLowerCase());
  }
  return out;
}

// Determine satisfaction status of each lifecycle key for the close-gate.
// `fullAutoApproved` is the truth-bearing audit marker for the
// `passed-final-review` key (parity with the visible footnote / audit comment).
//
// Per-key status:
//   'ticked'  — visible checkbox is `- [x]`
//   'audited' — `passed-final-review` only, when audit marker is present
//   'optout'  — `<!-- aitm-lifecycle-optout: <key> -->` marker present
//   'missing' — none of the above; close-gate must block when required
//
// Returns one entry per LIFECYCLE_LABELS key (stable order).
export function lifecycleSatisfaction(body, { fullAutoApproved = false } = {}) {
  const items = parseLifecycleItems(body);
  const byKey = new Map(items.filter((it) => it.key).map((it) => [it.key, it]));
  const optouts = parseLifecycleOptouts(body);
  const out = [];
  for (const key of Object.keys(LIFECYCLE_LABELS)) {
    const label = LIFECYCLE_LABELS[key];
    const it = byKey.get(key);
    let status;
    if (it && it.checked) status = 'ticked';
    else if (key === 'passed-final-review' && fullAutoApproved) status = 'audited';
    else if (optouts.has(key)) status = 'optout';
    else status = 'missing';
    out.push({ key, label, status });
  }
  return out;
}

const LIFECYCLE_HEADING_RE = /^####\s+Lifecycle\b[^\n]*$/im;
const FUNCTIONAL_HEADING_RE = /^####\s+Functional\b[^\n]*$/im;
// Section ends at the next heading of equal-or-shallower depth, the field-DB
// block, or end-of-body — whichever comes first.
const SECTION_END_RE = /^(#{1,4}\s|<!--\s*aitm-fields:)/m;

function locateBy(headingRe, body) {
  const src = String(body || '');
  const m = src.match(headingRe);
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

export function locateLifecycleSection(body) {
  return locateBy(LIFECYCLE_HEADING_RE, body);
}

export function locateFunctionalSection(body) {
  return locateBy(FUNCTIONAL_HEADING_RE, body);
}

export function parseFunctionalItems(body) {
  const loc = locateFunctionalSection(body);
  if (!loc) return [];
  const items = [];
  const re = /^- \[([ x])\]\s+(.+)$/gm;
  let m;
  while ((m = re.exec(loc.section)) !== null) {
    items.push({ label: m[2].trim(), checked: m[1] === 'x' });
  }
  return items;
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
  return _toggleLifecycleItem(body, key, /* tick */ true);
}

// Un-tick the lifecycle item identified by `key`. Idempotent.
export function untickLifecycleItem(body, key) {
  return _toggleLifecycleItem(body, key, /* tick */ false);
}

function _toggleLifecycleItem(body, key, tick) {
  if (!(key in LIFECYCLE_LABELS)) {
    throw new Error(`${tick ? 'tick' : 'untick'}LifecycleItem: unknown lifecycle key "${key}"`);
  }
  const label = LIFECYCLE_LABELS[key];
  const loc = locateLifecycleSection(body);
  if (!loc) return String(body || '');
  const labelRe = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const fromChar = tick ? ' ' : 'x';
  const toChar = tick ? 'x' : ' ';
  const re = new RegExp(`(^- )\\[${fromChar}\\](\\s+${labelRe}\\s*$)`, 'm');
  const next = loc.section.replace(re, `$1[${toChar}]$2`);
  if (next === loc.section) return String(body || '');
  return loc.before + next + loc.after;
}

// Detect any lifecycle items that are ticked AND un-tick them. Used by /task
// test to catch pre-ticks done by agents before the responsible verb fired.
// Returns { body, regressions: [{ key, label }] }.
export function detectLifecyclePretick(body) {
  const items = parseLifecycleItems(body);
  const regressions = [];
  let next = String(body || '');
  for (const it of items) {
    if (it.checked && it.key) {
      regressions.push({ key: it.key, label: it.label });
      next = untickLifecycleItem(next, it.key);
    }
  }
  return { body: next, regressions };
}
