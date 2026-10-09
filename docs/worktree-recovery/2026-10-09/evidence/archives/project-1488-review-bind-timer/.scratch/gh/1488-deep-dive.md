### Files to edit

- `scripts/task-tracker/verbs/start.mjs` — remove the redundant unconditional `resumeReviewActionsAfterBind` call so the wake decision lives solely in the delegated `verbResume`.
- `scripts/tests/unit/task-tracker/verbs/review-state-action.test.mjs` — replace the source-presence assertion that currently pins the defective call in place, and add behavioral coverage of the corrected dispatch.

No change to `scripts/task-tracker/verbs/resume.mjs`, `scripts/task-tracker/verbs/switch.mjs`, `scripts/task-tracker/task-tracker.mjs`, or `scripts/task-tracker/lib/delivery-preflight.mjs`. Their behavior is already correct; the delivery preconditions are legitimate evidence gates and are deliberately left intact.

### Root cause, confirmed against the sources

`verbStart` awaits `verbResume(ctx)` and then unconditionally awaits `ctx.resumeReviewActionsAfterBind(target, 'bind')`. The delegated `verbResume` has already made that decision through `wakeReviewResidents`, which returns early when `ctx.verb === 'start'`. `verbSwitch` guards the identical call with `ctx.verb !== 'start'`.

Two of the three bind call sites therefore already encode an explicit exemption: a `start` bind must not wake Review resident work. `verbStart`'s own second call defeats both guards. Because `resumeReviewActionsAfterBind` re-invokes `verbReview` for any issue whose board state is `review`, and `verbReview` flushes a review timing row and pauses the timer, a `start` bind on a Review-state issue always ends paused.

That makes `deliver` unreachable. `delivery-preflight` requires `timerState === 'running'` and `projectState === 'Review'` together, and `deliver` derives `timerState` from `state.entryStartTs`. No sanctioned verb can produce a running session on a Review-state issue.

### Step-by-step implementation plan

1. Write a failing behavioral test proving that a `start`-verb dispatch against a Review-state issue does not invoke the Review action, driving the dispatcher with a fake `resumeReviewActionsAfterBind` that records invocations.
2. Write a failing behavioral test proving the complementary case: a `resume` or `rebind` dispatch against a Review-state issue still does invoke it, so the fix does not silently disable the Review action.
3. Observe both fail against current `start.mjs`.
4. Remove the `resumeReviewActionsAfterBind` call from `verbStart`, leaving `verbResume` as the single decision point.
5. Rework the source-presence assertion at `review-state-action.test.mjs:175`. It asserts `startSrc` matches `/resumeReviewActionsAfterBind/`, which pins the defect. Replace it with an assertion of the corrected invariant: the callback remains reachable through `resume.mjs`, `switch.mjs`, and the dispatcher in `task-tracker.mjs`, and `verbStart` no longer re-issues it while still delegating to `verbResume`.
6. Observe green, then confirm the end-to-end effect by binding `start` to a live Review-state issue and checking that `entryStartTs` is non-null.

### Test additions

- `scripts/tests/unit/task-tracker/verbs/review-state-action.test.mjs` — a `start`-verb dispatch on a Review-state issue performs no Review-action wake; a `resume`/`rebind` dispatch on the same state still wakes it; and the corrected source invariant for `start.mjs`.

### Identified risks

- Deleting the call without reworking the assertion at line 175 turns a green suite red for the wrong reason; the assertion must be rewritten to pin the corrected invariant rather than simply removed.
- Over-correcting by also exempting `resume` or `rebind` would disable the Review action wherever it is genuinely wanted. Only the `start` path changes.
- Weakening `delivery-preflight` instead would remove a real delivery evidence gate. Explicitly rejected: the defect is that a sanctioned verb cannot produce the required state, not that the requirement is wrong.
- A source-presence assertion is weak evidence on its own, which is why behavioral dispatch coverage is added alongside it.

### Sibling sub-issues to spawn

None. This is a single-call-site removal plus its regression coverage.
