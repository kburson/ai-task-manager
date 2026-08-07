// #545 — Label-driven issue-title kind prefixes.
//
// Generalizes the bug-only `ensureBugEmoji` (#507) into a kind→prefix map keyed
// off durable issue labels. Each prefix is a scan-emoji + a square-bracketed
// kind word: the emoji is the quick visual signal, the bracketed word is the
// slower type-verification read. Square brackets (not curly/parens) avoid
// collision with this repo's `{discuss}`-style directive grammar and match the
// existing `[Request]`/`[Task]` prefixes.
//
// Pure and side-effect-free so the rule is unit-testable without spawning `gh`.
// The label remains the source of truth (CLI-created issues never use the web
// `.github/ISSUE_TEMPLATE/*.yml` title defaults; those only mirror this map).

export const BUG_EMOJI = '🐞';

// Epic-ness is dynamic (an issue becomes an epic when it gains its first child),
// but the durable `epic` label is also a canonical title-prefix signal (#1130).
// It leads the map so an Epic prefix wins when an issue retains a secondary
// kind label such as `bug`.
export const EPIC_PREFIX = '🧑‍🧒‍🧒 [Epic] ';

// Label → title prefix. Order of keys is the precedence used when an issue
// carries more than one kind label (first match wins).
export const KIND_PREFIXES = {
  epic: EPIC_PREFIX,
  bug: '🐞 [BUG] ',
  'beta-defect': '🐞 [Defect] ',
  'beta-feature': '🙏 [Feature Request] ',
  idea: '🤓 [Idea] ',
};

// Legacy prefixes we strip so a migrating title never carries two markers: the
// pre-#545 bare bug emoji (`🐞 `) and the `EPIC: ` text convention.
const LEGACY_PREFIXES = [`${BUG_EMOJI} `, 'EPIC: '];

// Every prefix we recognize for stripping, longest-first so a longer prefix is
// matched before a shorter one that is its own substring (e.g. `🐞 [BUG] `
// before the legacy bare `🐞 `).
const KNOWN_PREFIXES = [...new Set([...Object.values(KIND_PREFIXES), ...LEGACY_PREFIXES])].sort(
  (a, b) => b.length - a.length
);

// Strip a single leading known prefix from `title`, if present. Prefixes are
// compared as opaque substrings (never by code-point length) so ZWJ sequences
// like the epic glyph are handled correctly. Returns the unprefixed remainder.
// Exported (#921) so the duplicate-child guard normalizes titles against the
// same prefix set before comparing similarity.
export function stripKnownPrefix(title) {
  const t = String(title ?? '');
  for (const p of KNOWN_PREFIXES) {
    if (t.startsWith(p)) return t.slice(p.length);
  }
  return t;
}

// Pick the kind prefix for a label set, honoring KIND_PREFIXES key order as
// precedence. Returns null when no kind label is present. Case-insensitive to
// tolerate label-casing drift in the GitHub UI.
function pickPrefix(labels = []) {
  const lower = new Set((labels || []).map((l) => String(l).toLowerCase()));
  for (const [label, prefix] of Object.entries(KIND_PREFIXES)) {
    if (lower.has(label)) return prefix;
  }
  return null;
}

// Apply the correct label-derived kind prefix to `title`. When no kind label is
// present the title is returned untouched (no stripping). When a kind label is
// present the title is re-stamped: any existing known/legacy prefix is stripped
// first, so the result is idempotent and migrates a stale prefix in one pass.
export function ensureKindPrefix(title, labels = []) {
  const prefix = pickPrefix(labels);
  if (!prefix) return String(title ?? '');
  return prefix + stripKnownPrefix(title);
}

// Apply the epic prefix to `title`, idempotently. Strips any existing known or
// legacy prefix (including the retired `EPIC: ` convention) first.
export function ensureEpicPrefix(title) {
  return EPIC_PREFIX + stripKnownPrefix(title);
}

// Back-compat shim for #507 callers. Delegates to the generalized helper.
export function ensureBugEmoji(title, labels = []) {
  return ensureKindPrefix(title, labels);
}
