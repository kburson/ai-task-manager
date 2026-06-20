// cspell:ignore optout optouts Optouts
import { hasVerifiedDeclaration } from './proof-marker.mjs';

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

const LIFECYCLE_HEADING_RE = /^#{3,4}\s+Lifecycle\b[^\n]*$/im;
const FUNCTIONAL_HEADING_RE = /^#{3,4}\s+Functional\b[^\n]*$/im;
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

// Inspect the structural state of a lifecycle item without mutating the body.
// Lets callers distinguish "label not findable" from "box already ticked" —
// `tickLifecycleItem` returns the body unchanged in both cases, so its return
// value alone is ambiguous (see #302).
//
// Returns { sectionPresent, labelFound, alreadyTicked }:
//   - sectionPresent: `#### Lifecycle` heading exists
//   - labelFound: the human-readable label for `key` exists inside the section
//     (regardless of tick state)
//   - alreadyTicked: the label exists AND is `- [x]`
//
// Throws on unknown `key` (parity with tickLifecycleItem).
export function lifecycleItemState({ body, key } = {}) {
  if (!(key in LIFECYCLE_LABELS)) {
    throw new Error(`lifecycleItemState: unknown lifecycle key "${key}"`);
  }
  const loc = locateLifecycleSection(body);
  if (!loc) return { sectionPresent: false, labelFound: false, alreadyTicked: false };
  const items = parseLifecycleItems(body);
  const match = items.find((it) => it.key === key);
  if (!match) return { sectionPresent: true, labelFound: false, alreadyTicked: false };
  return { sectionPresent: true, labelFound: true, alreadyTicked: Boolean(match.checked) };
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

// #231 — Detect any Functional DoD items that carry an `aitm-verified cmd="..."`
// declaration AND are already ticked. The green tick is owned by `autoTickVerified`
// (only after the sandbox records a passing exit code). A pre-tick here is the
// same trust-attestation pattern that the lifecycle pretick guard catches —
// un-tick so the sandbox-driven re-tick is the only path to green. Judgment
// items (no marker) are untouched. Returns { body, regressions: [{ label }] }.
// Detection routes through the shared `hasVerifiedDeclaration`, so a consolidated
// `aitm-verified cmd="..."` declaration triggers the pre-tick guard. A
// consolidated proof stamp (ts/sha) is not a declaration and is left to the
// legitimate green-tick path.
export function detectFunctionalPretick(body) {
  const loc = locateFunctionalSection(body);
  if (!loc) return { body: String(body || ''), regressions: [] };
  const regressions = [];
  const nextSection = loc.section.replace(/^- \[x\](\s+)(.+)$/gm, (line, sp, rest) => {
    if (!hasVerifiedDeclaration(rest)) return line;
    const label = rest.replace(/<!--[\s\S]*?-->/g, '').trim();
    regressions.push({ label });
    return `- [ ]${sp}${rest}`;
  });
  if (nextSection === loc.section) return { body: String(body || ''), regressions: [] };
  return { body: loc.before + nextSection + loc.after, regressions };
}
