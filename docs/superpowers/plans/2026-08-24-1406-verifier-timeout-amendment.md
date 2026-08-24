# Governed Verifier Timeout Amendment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give governed verifier commands a 20-minute bounded ceiling so the complete #1406 quality safety net can produce an honest evidence stamp.

**Architecture:** Keep `runVerifiers` and all callers unchanged. Update the single centralized `TEST_RUNNER_TIMEOUT_MS` policy constant and the existing unit regression that proves each declared verifier command receives it.

**Tech Stack:** Node.js ESM, `node:test`, AITM evidence runner.

## Global Constraints

- Preserve every test lane, assertion, verifier command, and fail-closed behavior.
- Change only the central test-verifier timeout policy and its direct regression.
- Create no successor defect, implement no TIA behavior, and do not touch #1381.

---

### Task 1: Prove and Raise the Verifier Ceiling

**Files:**

- Modify: `scripts/tests/unit/task-tracker/lib/lane-split-dod-stamp.test.mjs`
- Modify: `scripts/task-tracker/lib/process-timeouts.mjs`

**Interfaces:**

- Consumes: `TEST_RUNNER_TIMEOUT_MS` in `runVerifiers`.
- Produces: a 1200000ms per-command verifier ceiling with unchanged execution semantics.

- [ ] **Step 1: Write the failing regression**

Change the existing exact-value assertion and explanatory text to require 20
minutes:

```js
assert.equal(TEST_RUNNER_TIMEOUT_MS, 1_200_000);
```

- [ ] **Step 2: Run RED**

Run:

```bash
node --test scripts/tests/unit/task-tracker/lib/lane-split-dod-stamp.test.mjs
```

Expected: FAIL because the actual value is still 600000.

- [ ] **Step 3: Implement the minimal policy change**

Update the centralized constant:

```js
export const TEST_RUNNER_TIMEOUT_MS = 1_200_000;
```

Update its comment to explain that the current aggregate quality command takes
about 12.5 minutes and 20 minutes preserves bounded headroom until TIA reduces
the required safety-net scope.

- [ ] **Step 4: Run GREEN and focused neighbors**

Run the two existing files:

```bash
node --test scripts/tests/unit/task-tracker/lib/lane-split-dod-stamp.test.mjs scripts/tests/unit/task-tracker/lib/process-timeouts.test.mjs
```

Expected: both files pass.

- [ ] **Step 5: Commit**

```bash
git add scripts/task-tracker/lib/process-timeouts.mjs scripts/tests/unit/task-tracker/lib/lane-split-dod-stamp.test.mjs
git commit -m "[#1406] Extend governed verifier budget"
```

### Task 2: Reproduce the Governed Evidence Path

**Files:**

- Verify only.

**Interfaces:**

- Consumes: the Task 1 commit and #1406's unchanged `npm run quality` verifier.
- Produces: an exact-head governed AC receipt.

- [ ] **Step 1: Run formatting and focused verification**

```bash
npm run format:check
node --test scripts/tests/unit/task-tracker/lib/lane-split-dod-stamp.test.mjs scripts/tests/unit/task-tracker/lib/process-timeouts.test.mjs
```

- [ ] **Step 2: Rerun the blocked acceptance stamp**

Run `npx aitm ac-stamp` with #1406's exact fifth Acceptance Criterion label.
Expected: `npm run quality` exits 0 and the marker records the exact new head.

- [ ] **Step 3: Inspect slow-suite history**

Use retained GitHub Actions run/job evidence to report a bounded failure-rate
sample. Separate slow-lane failures from unrelated workflow failures when the
logs allow it; otherwise report the observable aggregate and the missing
instrumentation needed for a trustworthy slow-only metric.
