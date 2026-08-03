// cspell:ignore optout optouts Optouts
import { hasVerifiedDeclaration, hasExecutionProof } from './proof-marker.mjs';

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
  'agent-review-passed': 'Agent Review Passed',
  'passed-final-review': 'Final Review Passed',
  'story-closed': 'Story closed and moved to Done',
  'timing-flushed': 'Timing data flushed to issue',
};

export const REVIEW_OWNED_LIFECYCLE_KEYS = new Set(['agent-review-passed', 'passed-final-review']);
export const HOUSEKEEPING_KEYS = new Set(['story-closed', 'timing-flushed']);

// Back-compat label aliases (#809). Bodies authored before the two-checkbox
// split carried a single `Passed final human review` line for the
// `passed-final-review` key. The parser and ticker accept the old label so
// in-flight issues still map to the key and tick on the old text.
export const LIFECYCLE_LABEL_ALIASES = {
  'passed-final-review': ['Passed final human review'],
};

export const LIFECYCLE_LABEL_SET = new Set([
  ...Object.values(LIFECYCLE_LABELS),
  ...Object.values(LIFECYCLE_LABEL_ALIASES).flat(),
]);

// Resolve a human-readable label (canonical or alias) to its lifecycle key.
function labelToKey(label) {
  const direct = Object.entries(LIFECYCLE_LABELS).find(([, l]) => l === label)?.[0];
  if (direct) return direct;
  for (const [key, aliases] of Object.entries(LIFECYCLE_LABEL_ALIASES)) {
    if (aliases.includes(label)) return key;
  }
  return null;
}

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
//   'absent'  — the label line is not present in the section at all (an
//               old-template body predating the key); close-gate treats an
//               absent `agent-review-passed` as non-blocking for back-compat
//   'missing' — line present but unticked; close-gate must block when required
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
    else if (!it) status = 'absent';
    else status = 'missing';
    out.push({ key, label, status });
  }
  return out;
}

// #1036 — "Lifecycle" is common prose-heading vocabulary in deep dives.
// Match owned DoD subsections exactly so descriptive headings cannot shadow
// them. #982 splits the canonical Review and Close ownership while retaining
// the combined heading as a legacy fallback.
const CANONICAL_LIFECYCLE_HEADING_RE = /^#{3,4}\s+Lifecycle\s+\(verified at Review\)\s*$/im;
const HOUSEKEEPING_HEADING_RE = /^#{3,4}\s+Housekeeping\s+\(verified at Close\)\s*$/im;
const LEGACY_LIFECYCLE_HEADING_RE = /^#{3,4}\s+Lifecycle\s+\(auto-ticked at Review\/Close\)\s*$/im;
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
  return (
    locateBy(CANONICAL_LIFECYCLE_HEADING_RE, body) ?? locateBy(LEGACY_LIFECYCLE_HEADING_RE, body)
  );
}

export function locateHousekeepingSection(body) {
  return locateBy(HOUSEKEEPING_HEADING_RE, body);
}

function locateSectionForKey(body, key) {
  const lifecycle = locateBy(CANONICAL_LIFECYCLE_HEADING_RE, body);
  const housekeeping = locateHousekeepingSection(body);
  if (lifecycle || housekeeping) {
    return HOUSEKEEPING_KEYS.has(key) ? housekeeping : lifecycle;
  }
  return locateBy(LEGACY_LIFECYCLE_HEADING_RE, body);
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

function parseOwnedItems(loc) {
  const items = [];
  const re = /^- \[([ x])\]\s+(.+)$/gm;
  let m;
  while ((m = re.exec(loc.section)) !== null) {
    const checked = m[1] === 'x';
    // #933 — strip any trailing HTML-comment marker before resolving the key.
    // A passed `agent-review` gate line carries a trailing `<!-- ... -->`
    // marker; folding it into the label broke the exact-string `labelToKey`
    // match, so a marker-bearing lifecycle item resolved to key=null and was
    // invisible to the close-gate, pretick detection, and satisfaction scan.
    const label = m[2].replace(/<!--[\s\S]*?-->/g, '').trim();
    const key = labelToKey(label);
    items.push({ key, label, checked });
  }
  return items;
}

export function parseLifecycleItems(body) {
  const canonical = [
    locateBy(CANONICAL_LIFECYCLE_HEADING_RE, body),
    locateHousekeepingSection(body),
  ].filter(Boolean);
  if (canonical.length > 0) {
    return canonical
      .sort((left, right) => left.start - right.start)
      .flatMap((loc) => parseOwnedItems(loc));
  }
  const legacy = locateBy(LEGACY_LIFECYCLE_HEADING_RE, body);
  return legacy ? parseOwnedItems(legacy) : [];
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
  const loc = locateSectionForKey(body, key);
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
  const loc = locateSectionForKey(body, key);
  if (!loc) return String(body || '');
  const fromChar = tick ? ' ' : 'x';
  const toChar = tick ? 'x' : ' ';
  // Try the canonical label first, then any back-compat aliases — whichever
  // one the body actually carries is the line we toggle.
  const labels = [LIFECYCLE_LABELS[key], ...(LIFECYCLE_LABEL_ALIASES[key] || [])];
  for (const label of labels) {
    const labelRe = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    // #933 — match the box + whitespace + label, then require only a word
    // boundary (whitespace or EOL) AFTER the label via lookahead — never the
    // old `\s*$` EOL anchor. That anchor silently no-op'd every toggle once the
    // line carried a trailing `<!-- ... -->` marker (e.g. a passed
    // `agent-review` gate line after a Review demote + re-drive). The lookahead
    // keeps the marker (and any trailing content) outside the match, so the
    // replace flips only the single box char and preserves the rest of the line
    // byte-for-byte.
    const re = new RegExp(`(^- )\\[${fromChar}\\](\\s+${labelRe})(?=\\s|$)`, 'm');
    const next = loc.section.replace(re, `$1[${toChar}]$2`);
    if (next !== loc.section) return loc.before + next + loc.after;
  }
  return String(body || '');
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
// `aitm-verified cmd="..."` declaration triggers the pre-tick guard.
//
// #481 — `cmd` is now read regardless of run-props, so `hasVerifiedDeclaration`
// alone is true even for the legitimate green path (the single-expandable marker
// carrying declaration + run-props in one comment). The pre-tick is "ticked WITH
// a declaration but WITHOUT execution proof": a marker that also carries run-props
// (`ts`/`sha`/`evidence`) is the sandbox-stamped green tick and must be left
// alone. Gate on `!hasExecutionProof(rest)` so only declaration-only ticks regress.
export function detectFunctionalPretick(body) {
  const loc = locateFunctionalSection(body);
  if (!loc) return { body: String(body || ''), regressions: [] };
  const regressions = [];
  const nextSection = loc.section.replace(/^- \[x\](\s+)(.+)$/gm, (line, sp, rest) => {
    if (!hasVerifiedDeclaration(rest) || hasExecutionProof(rest)) return line;
    const label = rest.replace(/<!--[\s\S]*?-->/g, '').trim();
    regressions.push({ label });
    return `- [ ]${sp}${rest}`;
  });
  if (nextSection === loc.section) return { body: String(body || ''), regressions: [] };
  return { body: loc.before + nextSection + loc.after, regressions };
}
