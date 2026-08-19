# Co-review Consistent Snapshot Implementation Plan

> **For Codex:** Follow the repository's test-driven workflow and complete each
> task against issue #1322 in the bound worktree.

**Goal:** Prevent `co-review status` and `co-review wait` from reporting false
event-count drift during the authorized event-append/state-replace window while
preserving every durable integrity refusal.

**Architecture:** Refactor status inspection to retain one state/event snapshot,
qualify only a valid one-revision event lead under a live mutex for bounded retry,
and reuse the settled events for projection. Keep the public API synchronous and
inject the retry wait only for deterministic tests.

**Tech stack:** Node.js ESM, synchronous filesystem protocol, `node:test`, AITM
co-review CLI.

---

## Task 1: Reproduce and settle the authorized publication window

**Files:**

- Modify: `scripts/tests/unit/review/co-review.test.mjs`
- Modify: `scripts/review/lib/protocol.mjs`

### Step 1: Add a deterministic failing status regression

Initialize a protocol and perform a real owner claim to obtain valid revision N+1
state and events. Restore only the old revision N state and create the mutex,
leaving the exact event-append/state-replace window on disk.

Call `statusProtocol` with an injected retry wait that publishes the captured N+1
state and releases the test mutex. Assert:

- one retry occurs;
- the returned revision is N+1;
- integrity is healthy; and
- the returned turn/claim projection is the settled mutation.

Run:

```text
node --test scripts/tests/unit/review/co-review.test.mjs
```

Expected: the new test fails with `event-count: expected N, actual N+1`.

### Step 2: Read one exact event snapshot per attempt

Refactor event inspection to return both parsed events and errors. Add a bounded
snapshot loop used by `statusProtocol`; do not re-read events during downstream
projection.

### Step 3: Qualify only the authorized transient shape

Consider confirmation only when the sole error is an otherwise-valid forward
event lead. Re-read state against the retained events. Use a small fixed retry
count and delay. Expose injected read and synchronous wait functions for
deterministic tests; the default wait is suitable for a separate writer process.

Before relying on either mutex sample, re-read state and validate it against the
exact observed event array. Accept a fully matching N+k state immediately so
serialized mutations that completed entirely between the state and event reads
cannot be misreported as drift. If the confirmation remains at N and neither
mutex sample is live, fail closed without a delayed retry.

If a second serialized mutation completes before confirmation and advances state
beyond the retained event array, restart the snapshot attempt within the same
fixed budget even when neither earlier mutex sample was live. This restart must
perform a fresh state/event read and must fail closed if continuous publication
exhausts the bound.

Generalize exact confirmation to N+k when multiple serialized mutations complete
inside the first state/event read gap. Every retained event must remain valid and
the confirmed state must match the complete retained projection. An unmatched
multi-event lead with unchanged state must fail immediately; live-lock waiting
remains exclusive to an unchanged exact one-event lead.

Compare every sampled state to the retained event at that state's own revision,
not only to the array's final event. Restart a partially confirmed state only
when its sole remaining error is the forward count mismatch. When confirmation
state is ahead of the retained events, carry it into the next attempt and require
it to match its corresponding newly observed event before accepting any newer
snapshot. Add regressions proving later matching pairs cannot heal initial,
partial-confirmation, or state-ahead projection drift.

Permit state-ahead carry only when the confirmation's sole error is the backward
count mismatch. On the next attempt, validate the carried state with the full
event schema, protocol-ID, type, ordinal revision, count, and projection contract;
only a valid forward count mismatch may remain. Add protocol-ID drift coverage so
a later healthy pair cannot clear already-observed identity evidence.

### Step 4: Run the focused status regression

Run the focused command again and require green.

### Step 5: Commit

```text
git add scripts/review/lib/protocol.mjs scripts/tests/unit/review/co-review.test.mjs
git commit -m '[#1322] fix: settle concurrent co-review snapshots'
```

## Task 2: Cover wait and persistent corruption

**Files:**

- Modify: `scripts/tests/unit/review/co-review.test.mjs`
- Modify: `scripts/review/lib/protocol.mjs`

### Step 1: Add a failing `waitForTurn` interleaving test

Stage the same valid one-event lead and pass the injected consistency seam through
`waitForTurn`. Assert the command returns the settled result instead of throwing
`co-review:integrity`.

### Step 2: Thread consistency options through wait polling

Pass the same bounded snapshot policy into both the first status read and every
subsequent wait poll.

### Step 3: Add durable-drift cases

Assert:

- a one-event lead without a mutex returns the existing event-count diagnostic;
- a one-event lead with a mutex that never settles retries only to the fixed
  bound and then returns the same diagnostic; and
- existing event revision/order and immutable evidence cases remain fail-closed.

### Step 4: Run focused tests

```text
node --test scripts/tests/unit/review/co-review.test.mjs
```

### Step 5: Commit

```text
git add scripts/review/lib/protocol.mjs scripts/tests/unit/review/co-review.test.mjs
git commit -m '[#1322] test: preserve persistent integrity refusals'
```

## Task 3: Update generated role recovery instructions

**Files:**

- Modify: `scripts/review/lib/start.mjs`
- Modify: `scripts/tests/fixtures/co-review-start-cases.mjs`

### Step 1: Add failing handoff wording assertions

For both author and reviewer handoffs, require wording that:

- identifies snapshot publication as the only transient integrity case;
- directs one settled status re-read after an integrity refusal;
- continues when that status is healthy; and
- stops and reports when the mismatch persists.

### Step 2: Update shared handoff prose

Replace unconditional stop wording in the shared recovery and exit-handling
sections with the bounded settled-re-read rule. Preserve the lock prohibition and
all non-integrity exit semantics.

### Step 3: Run focused unit and real-boundary tests

```text
node --test scripts/tests/unit/review/co-review.test.mjs scripts/tests/slow/review/co-review-boundaries.test.mjs
```

### Step 4: Commit

```text
git add scripts/review/lib/start.mjs scripts/tests/fixtures/co-review-start-cases.mjs
git commit -m '[#1322] docs: teach co-review snapshot recovery'
```

## Task 4: Complete governed verification and delivery

### Step 1: Run all declared verification

```text
node --test scripts/tests/unit/review/co-review.test.mjs
node --test scripts/tests/unit/review/co-review.test.mjs scripts/tests/slow/review/co-review-boundaries.test.mjs
npm test
npm run test:slow
npm run lint
npm run format:check
git log --oneline -1
```

### Step 2: Run the final Develop verifier and independent exact-SHA review

Address every actionable finding test-first, rerun the affected gates, and require
a clean re-review.

### Step 3: Advance through governed Test and Review

Record the commit trail, automated-test evidence, isolated Test receipt, agent
review, and Full-Auto final approval.

### Step 4: Publish and integrate

Push the exact reviewed branch, open a PR to `trunk`, wait for exact-SHA CI, merge
through the PR, verify the feature SHA is reachable from `origin/trunk`, and close
issue #1322 through the governed Done workflow.
