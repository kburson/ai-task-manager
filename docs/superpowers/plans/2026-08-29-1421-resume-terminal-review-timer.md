# #1421 Resume Terminal Review Timer Implementation Plan

> Execute test-first in the recorded #1421 worktree. Keep delivery preflight,
> Review approval, occupancy, ownership, and worktree validation fail-closed.

**Goal:** Let a documented numbered `start`/`resume` command reopen exactly one
local timing span when the same issue remains bound after terminal Review.

**Design:** Refine the existing same-issue fast path in `verbResume`. A matching
binding with a non-null `entryStartTs` remains an idempotent `already active`
no-op. A matching binding with `entryStartTs: null` continues through the
existing numbered-bind transaction, which already owns occupancy, worktree,
state, word-marker, and timing-event safety. The durable `review:passed` tail
continues to suppress a duplicate `resumed` row. Delivery preflight is not
changed.

## Task 1: Pin the terminal-handoff recovery contract

**Files:**

- Modify: `scripts/tests/integration/task-tracker/lib/terminal-review-handoff.test.mjs`
- Modify: `scripts/tests/integration/task-tracker/lib/verb-start-resume-stop.test.mjs`

1. Change the terminal-handoff reproduction so the post-handoff state has the
   same bound issue and `entryStartTs: null`.
2. Assert the first numbered `start`/`resume` reopens a non-null local timing
   span while preserving the issue binding and writing no duplicate durable
   timing row.
3. Assert a repeated invocation leaves the first reopened timestamp unchanged,
   writes no timing row, and reports the existing live span.
4. Add focused same-issue tests that distinguish a live span from a bound
   no-span state.
5. Run the two integration files and confirm the new assertions fail for the
   current early-return behavior.

## Task 2: Correct the same-issue routing

**File:**

- Modify: `scripts/task-tracker/verbs/resume.mjs`

1. Make the same-issue early return require a live local `entryStartTs`.
2. Allow the same-issue/no-span case to enter the existing numbered-bind
   transaction without duplicating the occupancy claim.
3. Preserve the existing active-tail timing suppression and emit a clear
   successful recovery message.
4. Run the focused integration files until green.

## Task 3: Prove refusal and delivery boundaries

**Files:**

- Test only: `scripts/tests/unit/task-tracker/verbs/deliver.test.mjs`
- Test only: `scripts/tests/unit/task-tracker/lib/delivery-provider-action.test.mjs`

1. Run the delivery suites to prove a missing timer, approval, ownership, or
   exact-head input remains refused.
2. Confirm no production file under delivery authority or delivery preflight
   changed.
3. Inspect the final diff for only the planned resume implementation and tests.

## Task 4: Governed verification and delivery

1. Run both issue-specific verification commands.
2. Run lint and format checks.
3. Run fast and slow suites through the governed Test verb.
4. Record the commit trail and exact-SHA receipt.
5. Complete autonomous Review, approval, provider-mediated PR delivery, receipt
   verification, and governed Close under the user's full-auto authorization.
