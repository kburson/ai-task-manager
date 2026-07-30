<!-- cspell:ignore optout -->

# Checkbox-label gates inventory & policy (#179)

This document inventories every place in `scripts/task-tracker/` that depends on
an exact checkbox-label string match against the Definition of Done, and
documents the policy that keeps those gates honest when users customize the DoD
template.

## Why this exists

The DoD template at `templates/definition-of-done.md` (or its runtime override
at `.ai-task-manager/templates/definition-of-done.md`) is user-editable. Several verbs and
gates locate items in the body via hard-coded label-string matches. When a user
renames or removes a label, those matches silently no-op — the verb appears to
succeed but the side effect never lands.

The historical #175 close exposed this concretely: `approve.mjs` posted the
Full-Auto audit comment but the legacy `Passed final human review` box stayed
unticked because the template had been customized. Close then advanced to Done
with an inconsistent audit record. Current review-epoch authority closes that
gap; the incident remains historical provenance.

## Inventory

| #   | File                                                                                               | Label matched                                                                         | Purpose                                           | Behavior on miss                                                    |
| --- | -------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- | ------------------------------------------------- | ------------------------------------------------------------------- |
| 1   | [agent-review/review-gate.mjs](../../scripts/task-tracker/lib/agent-review/review-gate.mjs)        | `Agent Review Passed`                                                                 | Tick and stamp current-epoch passing proof        | Approval and close remain blocked                                   |
| 2   | [verbs/approve.mjs](../../scripts/task-tracker/verbs/approve.mjs)                                  | `Final Review Passed` (legacy alias accepted)                                         | Tick lifecycle item on current approval           | Stderr WARN + timing-log `lifecycle-warn` row (#179)                |
| 3   | [verbs/close.mjs](../../scripts/task-tracker/verbs/close.mjs) `tickLifecycleOnClose`               | `Story closed and moved to Done`, `Timing data flushed to issue`                      | Tick lifecycle items on close                     | Best-effort no-op; hard-blocked upstream by close-gate (#179)       |
| 4   | [close-gate.mjs](../../scripts/task-tracker/close-gate.mjs) `uncheckedPreCloseCheckboxes`          | All `- [ ]` checkboxes not in `CLOSE_OWNED_CHECKBOXES` or `LIFECYCLE_LABEL_SET`       | Block close on unchecked items                    | Counted as blocker (existing behavior)                              |
| 5   | [close-gate.mjs](../../scripts/task-tracker/close-gate.mjs) `assertLifecycleSatisfied` (#179)      | The four lifecycle labels in `LIFECYCLE_LABELS`                                       | Hard Review→Done gate                             | Block (default) or WARN (when `lifecycleCheckboxesRequired: false`) |
| 6   | [gh/move-state.mjs](../../scripts/gh/move-state.mjs)                                               | Same as #4 + #5                                                                       | Parallel enforcement at the chokepoint script     | Same as close.mjs                                                   |
| 7   | [lib/body-gates.mjs](../../scripts/task-tracker/lib/body-gates.mjs) `verification-commands` (#195) | All `- [ ]` under `Verification Commands` heading **excluding** `LIFECYCLE_LABEL_SET` | Block test→review on unchecked verification items | Counted as blocker; lifecycle labels filtered (owned by close-gate) |

The authoritative key→label map lives at
[lib/lifecycle-dod.mjs](../../scripts/task-tracker/lib/lifecycle-dod.mjs):

```js
export const LIFECYCLE_LABELS = {
  'agent-review-passed': 'Agent Review Passed',
  'passed-final-review': 'Final Review Passed',
  'story-closed': 'Story closed and moved to Done',
  'timing-flushed': 'Timing data flushed to issue',
};
```

Verbs MUST consume this map, not redefine labels.

## Policy (Q1 resolution): hybrid contract

**Lifecycle labels are reserved.** They are owned by verbs, not by the user.
The pre-close gate (`assertLifecycleSatisfied`) refuses to advance to Done
unless each **non-close-owned** lifecycle key is satisfied by ONE of:

1. Visible checkbox ticked (`- [x] <label>`), OR
2. Current Full-Auto Review authority satisfies `passed-final-review`, OR
3. Explicit per-key opt-out marker:
   `<!-- aitm-lifecycle-optout: <key> -->`.

The second path means the consolidated `aitm-review-approved` marker has
`provenance="full-auto"` and matches the current Review epoch, passing Agent
Review proof, and persisted `aitm-dod-verified` SHA. The retired standalone
`aitm-full-auto-approved` marker is historical evidence only.

**Close-owned keys are filtered from blocking.** `story-closed` and
`timing-flushed` are stamped by `tickLifecycleOnClose` INSIDE the close verb,
after the pre-close gate runs. Blocking on them would deadlock close. They
are tracked in `CLOSE_OWNED_LIFECYCLE_KEYS` at `close-gate.mjs` and excluded
from the gate's `missing` blocker list. The full per-key status remains in
`results`, so `preflight-issue.mjs --check-integrity` still reports them.

Net effect: `agent-review-passed` and `passed-final-review` are enforced
pre-close for current bodies. Older bodies with no Agent Review label retain a
narrow absent-label compatibility path, but current Review authority still
must be valid.

## Review authority is stronger than checkbox state

Visible lifecycle boxes are projections. Close additionally requires current
Review authority: persisted Test SHA, latest-epoch passing Agent Review proof
for that SHA, matching truthful human or Full-Auto approval, and no later
invalidation. Demotion, demotion-shaped reconciliation, and Agent Review
failure invalidate authority while retaining historical markers for audit.

For approval given in chat, use `/task approve #N --human`. In Full-Auto, run
`/task approve #N` under the authorized signals so the consolidated
`aitm-review-approved` marker records truthful Full-Auto provenance. Never
hand-tick `Final Review Passed` or restore old markers to repair stale
authority; re-run Test, Review, and approval in order.

**Body-gate `verification-commands` scope excludes lifecycle labels.** The
`### Verification Commands` heading is typically `###`, and its sibling
`### Definition of Done` houses the `#### Lifecycle` subsection. Because
`nextSectionEnd` in [lib/body-gates.mjs](../../scripts/task-tracker/lib/body-gates.mjs)
only terminates the scope at `##`, the Verification Commands scan walks into
the Lifecycle subsection. The rule filters labels in `LIFECYCLE_LABEL_SET` from
its unchecked-item collection — those labels are enforced by
`assertLifecycleSatisfied` (#179) at close, not by this body-gate (#195).

**Preflight only warns.** Issue creation via `preflight-issue.mjs --shape ...`
emits a structured `[task-tracker] WARN:` block to stderr listing any reserved
labels absent from the assembled body. It never blocks.

**Existing issues are swept** via:

```
node scripts/task-tracker/preflight-issue.mjs --check-integrity <issue#>
```

Read-only; prints per-key status and whether close-gate would currently block.

**Toggle.** `.ai-task-manager/task-tracker.json` → `lifecycleCheckboxesRequired`
(default `true`). When `false`, close-gate downgrades from BLOCK to a
`WARN: lifecycle-incomplete` row in the timing log.

## Opt-out marker

To intentionally skip a lifecycle item — e.g., a workflow that doesn't need
machine-generated timing summaries — stamp the marker in the issue body:

```html
<!-- aitm-lifecycle-optout: timing-flushed -->
```

The marker is registered in `MARKER_PATTERNS` at
[lib/gh-edit-guard.mjs](../../scripts/task-tracker/lib/gh-edit-guard.mjs), so
once stamped it cannot be silently dropped by a subsequent `gh issue edit`.

## Verification

- Unit: `npm test -- lifecycle-satisfaction close-gates gh-edit-guard preflight-issue`
- Integration: create a throwaway issue with the DoD's `Final Review Passed`
  line removed; confirm preflight emits a WARN line; confirm close-gate blocks;
  add the opt-out marker and confirm close-gate passes.
- Audit path: an issue with current Full-Auto `aitm-review-approved` authority
  and unticked `Final Review Passed` reports the lifecycle item as audited.
