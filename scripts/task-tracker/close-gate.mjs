// Shared close-gate logic. The set of checkbox labels that `/task close`
// itself owns (i.e., side effects of closing, not user-verifiable items) and
// the function that lists pre-close blockers from an issue body.
//
// Both `scripts/task-tracker/verbs/close.mjs` (via runtime.mjs re-export)
// and `scripts/gh/move-state.mjs` consume these to keep the two enforcement
// paths in sync.

export const CLOSE_OWNED_CHECKBOXES = new Set([
  'Issue moved to Done',
  '`/task close` run (moves to Done, deregisters from fleet)',
  'If this completes the parent epic: update parent body; close parent if all siblings Done',
]);

export function uncheckedPreCloseCheckboxes(body) {
  return [...String(body ?? '').matchAll(/^- \[ \] (.+)$/gm)]
    .map((m) => m[1])
    .filter((label) => !CLOSE_OWNED_CHECKBOXES.has(label))
    .map((label) => `- [ ] ${label}`);
}
