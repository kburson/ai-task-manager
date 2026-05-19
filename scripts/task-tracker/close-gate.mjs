// cspell:ignore optout optouts Optouts
// Shared close-gate logic. The set of checkbox labels that `/task close`
// itself owns (i.e., side effects of closing, not user-verifiable items) and
// the function that lists pre-close blockers from an issue body.
//
// Both `scripts/task-tracker/verbs/close.mjs` (via runtime.mjs re-export)
// and `scripts/gh/move-state.mjs` consume these to keep the two enforcement
// paths in sync.

import { LIFECYCLE_LABEL_SET, lifecycleSatisfaction } from './lib/lifecycle-dod.mjs';
import { FULL_AUTO_APPROVED_RE } from './lib/markers.mjs';

export const CLOSE_OWNED_CHECKBOXES = new Set([
  'Issue moved to Done',
  '`/task close` run (moves to Done, deregisters from fleet)',
  'If this completes the parent epic: update parent body; close parent if all siblings Done',
]);

// Strip fenced code blocks (``` … ```) so example markdown inside spec/docs
// sections doesn't get scanned as live checkboxes. Issue bodies frequently
// include template examples that legitimately render as `- [ ]`.
function stripFencedBlocks(src) {
  return String(src ?? '').replace(/^```[^\n]*\n[\s\S]*?^```[ \t]*$/gm, '');
}

export function uncheckedPreCloseCheckboxes(body) {
  return [...stripFencedBlocks(body).matchAll(/^- \[ \] (.+)$/gm)]
    .map((m) => m[1])
    .filter((label) => !CLOSE_OWNED_CHECKBOXES.has(label))
    .filter((label) => !LIFECYCLE_LABEL_SET.has(label.trim()))
    .map((label) => `- [ ] ${label}`);
}

// Hard Review → Done lifecycle gate (#179). Returns `{ block, missing, results }`
// where `results` is the full per-key satisfaction list (also useful for
// non-blocking WARN emission when `lifecycleCheckboxesRequired` is false).
//
// `body` — current issue body
// `required` — when false, computes status but never blocks (caller emits WARN)
export function assertLifecycleSatisfied({ body, required = true } = {}) {
  const src = String(body || '');
  const fullAutoApproved = FULL_AUTO_APPROVED_RE.test(src);
  const results = lifecycleSatisfaction(src, { fullAutoApproved });
  const missing = results.filter((r) => r.status === 'missing');
  if (!required || missing.length === 0) {
    return { block: false, missing, results };
  }
  const labels = missing.map((m) => `${m.key} (${m.label})`).join(', ');
  return {
    block: true,
    missing,
    results,
    reason:
      `lifecycle-incomplete: ${labels} — tick the visible checkbox, ` +
      'or stamp `<!-- aitm-lifecycle-optout: <key> -->` for each intentional skip.',
  };
}
