// Shared close-gate logic. The set of checkbox labels that `/task close`
// itself owns (i.e., side effects of closing, not user-verifiable items) and
// the function that lists pre-close blockers from an issue body.
//
// Both `scripts/task-tracker/verbs/close.mjs` (via runtime.mjs re-export)
// and `scripts/gh/move-state.mjs` consume these to keep the two enforcement
// paths in sync.

import { LIFECYCLE_LABEL_SET } from './lib/lifecycle-dod.mjs';

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
