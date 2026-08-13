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

The #175 close exposed this concretely: `approve.mjs` posted the Full-Auto
audit comment but `Passed final human review` stayed unticked because the
template had been customized. Close then advanced to Done with an inconsistent
audit record.

## Inventory

| #   | File                                                                                               | Label matched                                                                         | Purpose                                           | Behavior on miss                                                    |
| --- | -------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- | ------------------------------------------------- | ------------------------------------------------------------------- |
| 1   | [verbs/approve.mjs](../../scripts/task-tracker/verbs/approve.mjs)                                  | `Final Review Passed`                                                                 | Tick lifecycle item on approve                    | Stderr WARN + timing-log `lifecycle-warn` row (#179)                |
| 2   | [verbs/close.mjs](../../scripts/task-tracker/verbs/close.mjs) `tickLifecycleOnClose`               | `Story closed and moved to Done`, `Timing data flushed to issue`                      | Tick lifecycle items on close                     | Best-effort no-op; hard-blocked upstream by close-gate (#179)       |
| 3   | [close-gate.mjs](../../scripts/task-tracker/close-gate.mjs) `uncheckedPreCloseCheckboxes`          | All `- [ ]` checkboxes not in `CLOSE_OWNED_CHECKBOXES` or `LIFECYCLE_LABEL_SET`       | Block close on unchecked items                    | Counted as blocker (existing behavior)                              |
| 4   | [close-gate.mjs](../../scripts/task-tracker/close-gate.mjs) `assertLifecycleSatisfied` (#179)      | The four lifecycle labels in `LIFECYCLE_LABELS`                                       | Hard Review→Done gate                             | Block (default) or WARN (when `lifecycleCheckboxesRequired: false`) |
| 5   | [gh/move-state.mjs](../../scripts/gh/move-state.mjs)                                               | Same as #3 + #4                                                                       | Parallel enforcement at the chokepoint script     | Same as close.mjs                                                   |
| 6   | [lib/body-gates.mjs](../../scripts/task-tracker/lib/body-gates.mjs) `verification-commands` (#195) | All `- [ ]` under `Verification Commands` heading **excluding** `LIFECYCLE_LABEL_SET` | Block test→review on unchecked verification items | Counted as blocker; lifecycle labels filtered (owned by close-gate) |

The authoritative key→label map lives at
[lib/lifecycle-dod.mjs](../../scripts/task-tracker/lib/lifecycle-dod.mjs):

```js
export const LIFECYCLE_LABELS = {
  'agent-review-passed': 'Agent Review Passed',
  'passed-final-review': 'Final Review Passed',
  'story-closed': 'Story closed and moved to Done',
  'timing-flushed': 'Timing data flushed to issue',
};

export const REVIEW_OWNED_LIFECYCLE_KEYS = new Set(['agent-review-passed', 'passed-final-review']);
export const HOUSEKEEPING_KEYS = new Set(['story-closed', 'timing-flushed']);
```

Verbs MUST consume this map, not redefine labels. `agent-review-passed` was added
by the two-checkbox split so Review carries a distinct agent-attested checkbox
alongside the human `passed-final-review` sign-off.

## Policy (Q1 resolution): hybrid contract

**Lifecycle labels are reserved.** They are owned by verbs, not by the user.
The pre-close gate (`assertLifecycleSatisfied`) refuses to advance to Done
unless each **non-close-owned** lifecycle key is satisfied by ONE of:

1. Visible checkbox ticked (`- [x] <label>`), OR
2. Corresponding audit marker present
   (`<!-- aitm-full-auto-approved: ... -->` satisfies `passed-final-review`), OR
3. Explicit per-key opt-out marker:
   `<!-- aitm-lifecycle-optout: <key> -->`.

**Close-owned keys are filtered from blocking.** `story-closed` and
`timing-flushed` are stamped by `tickLifecycleOnClose` INSIDE the close verb,
after the pre-close gate runs. Blocking on them would deadlock close. They
are tracked in `CLOSE_OWNED_LIFECYCLE_KEYS` at `close-gate.mjs` and excluded
from the gate's `missing` blocker list. The full per-key status remains in
`results`, so `preflight-issue.mjs --check-integrity` still reports them.

Net effect: both `agent-review-passed` and `passed-final-review` are enforced
pre-close. A body authored before the two-checkbox split, where
`agent-review-passed` never existed, is tolerated — `close-gate.mjs`'s
`ABSENT_TOLERANT_LIFECYCLE_KEYS` skips the key when it is wholly **absent** from
the body. A body that has the line but leaves it unticked still blocks; absence
and an unticked box are treated differently on purpose.

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

## Directory-governed issues

This inventory remains the compatibility contract for `legacy-body/v1`. For a
`github-records/v1` issue, gate consumers resolve the Delivery Contract and
accepted lifecycle evidence through the contract-source boundary. Stable logical
IDs, contract and authority epochs, accepted record IDs, and projection hashes
are authoritative; visible checkbox wording and order are rendered projections.

The hybrid lifecycle rule still applies semantically, but a manual Markdown tick
cannot satisfy it. Test, review, and approval evidence must be accepted under the
current contract and authority epochs. A contract amendment invalidates older
evidence unless policy proves that the changed definition cannot affect it.

Normal directory-governed Develop → Test → Review delivery updates records and
singleton projections, not the issue body. Body label matching remains only for
legacy compatibility and explicit directory-owned operations. See
[GitHub-Native Coordination](../guides/github-native-coordination.md) for the
operator boundary and recovery procedure.

## Verification

- Unit: `npm test -- lifecycle-satisfaction close-gates gh-edit-guard preflight-issue`
- Integration: create a throwaway issue with the DoD's `Final Review Passed`
  line removed; confirm preflight emits a WARN line; confirm close-gate blocks;
  add the opt-out marker and confirm close-gate passes.
- Audit-comment path: an issue with `<!-- aitm-full-auto-approved: ... -->` and
  unticked `Final Review Passed` passes the gate (audited status).
