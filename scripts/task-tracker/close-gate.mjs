// cspell:ignore optout optouts Optouts
// Shared close-gate logic. The set of checkbox labels that `/task close`
// itself owns (i.e., side effects of closing, not user-verifiable items) and
// the function that lists pre-close blockers from an issue body.
//
// Both `scripts/task-tracker/verbs/close.mjs` (via runtime.mjs re-export)
// and `scripts/gh/move-state.mjs` consume these to keep the two enforcement
// paths in sync.

import { LIFECYCLE_LABEL_SET, lifecycleSatisfaction } from './lib/lifecycle-dod.mjs';
import { hasFullAutoApproved } from './lib/markers.mjs';

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

// Lifecycle keys that the close verb itself ticks via `tickLifecycleOnClose`
// AFTER the pre-close gate runs. Filtering them out of the gate's blocker
// list resolves the chicken-and-egg deadlock from #179 (gate refused to pass
// the very keys that only get ticked once it passes). They remain in
// `results` so integrity sweeps still report their status.
export const CLOSE_OWNED_LIFECYCLE_KEYS = new Set(['story-closed', 'timing-flushed']);

// Lifecycle keys whose `absent` status (label line missing entirely) must NOT
// block close (#809). `agent-review-passed` was introduced by the two-checkbox
// split; bodies authored before it lack the line, and forcing them to add it
// would deadlock every in-flight issue. A `missing` (present-but-unticked)
// `agent-review-passed` still blocks — that is the prerequisite gate for
// new-template bodies. Only the wholly-absent case is tolerated.
export const ABSENT_TOLERANT_LIFECYCLE_KEYS = new Set(['agent-review-passed']);

// Hard Review → Done lifecycle gate (#179). Returns `{ block, missing, results }`
// where `results` is the full per-key satisfaction list (also useful for
// non-blocking WARN emission when `lifecycleCheckboxesRequired` is false).
//
// `body` — current issue body
// `required` — when false, computes status but never blocks (caller emits WARN)
//
// `agent-review-passed` and `passed-final-review` are enforced pre-close.
// Close-owned keys are excluded from blocking via CLOSE_OWNED_LIFECYCLE_KEYS.
// A `missing` key (present-but-unticked) always blocks; an `absent` key blocks
// too, except the back-compat-tolerant keys in ABSENT_TOLERANT_LIFECYCLE_KEYS.
// Because a present-but-unticked `agent-review-passed` is `missing` (which
// blocks) while `passed-final-review` cannot be ticked before it, the agent
// gate is enforced as the prerequisite the final sign-off sits on.
export function assertLifecycleSatisfied({ body, required = true } = {}) {
  const src = String(body || '');
  const fullAutoApproved = hasFullAutoApproved(src);
  const results = lifecycleSatisfaction(src, { fullAutoApproved });
  const missing = results.filter((r) => {
    if (CLOSE_OWNED_LIFECYCLE_KEYS.has(r.key)) return false;
    if (r.status === 'missing') return true;
    if (r.status === 'absent') return !ABSENT_TOLERANT_LIFECYCLE_KEYS.has(r.key);
    return false;
  });
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
