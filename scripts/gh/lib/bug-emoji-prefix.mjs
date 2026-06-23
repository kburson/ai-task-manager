// #507 — Internal bug-issue title prefix.
//
// Pure, side-effect-free helper so the prefix logic is unit-testable without
// spawning `gh`. Mirrors the upstream-report core's idempotent title rule, but
// keyed off the durable `bug` label rather than a kind record. The emoji is the
// visual signal; the `bug` label remains the durable bug-signal source of truth.

export const BUG_EMOJI = '🐞';

// Prepend the bug emoji to `title` when `labels` includes `bug`. Idempotent: a
// title that already starts with the emoji is returned unchanged, so repeated
// application (or a hand-prefixed title) never double-stamps. The `bug` match is
// case-insensitive to tolerate label-casing drift in the GitHub UI.
export function ensureBugEmoji(title, labels = []) {
  const t = String(title ?? '');
  const isBug = (labels || []).some((l) => String(l).toLowerCase() === 'bug');
  if (!isBug) return t;
  if (t.startsWith(BUG_EMOJI)) return t;
  return `${BUG_EMOJI} ${t}`;
}
