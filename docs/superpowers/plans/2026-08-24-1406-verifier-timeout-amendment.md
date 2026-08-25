# Governed Verifier Timeout Amendment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give governed verifier commands a 20-minute bounded ceiling so the complete #1406 quality safety net can produce an honest evidence stamp.

**Architecture:** Keep `runVerifiers` and all callers unchanged. Use a 20-minute centralized `TEST_RUNNER_TIMEOUT_MS` for each aggregate verifier command and a separate 10-minute `TEST_FILE_TIMEOUT_MS` for each child spawned by `run-tests.mjs`.

**Tech Stack:** Node.js ESM, `node:test`, AITM evidence runner.

## Global Constraints

- Preserve every test lane, assertion, verifier command, and fail-closed behavior.
- Keep aggregate verifier and individual test-file timeout policies independent.
- Create no successor defect, implement no TIA behavior, and do not touch #1381.

---

### Task 1: Prove and Raise the Verifier Ceiling

**Files:**

- Modify: `scripts/tests/unit/task-tracker/lib/lane-split-dod-stamp.test.mjs`
- Modify: `scripts/task-tracker/lib/process-timeouts.mjs`

**Interfaces:**

- Consumes: `TEST_RUNNER_TIMEOUT_MS` in `runVerifiers`.
- Produces: a 1200000ms per-command verifier ceiling with unchanged execution semantics.

- [x] **Step 1: Write the failing regression**

Change the existing exact-value assertion and explanatory text to require 20
minutes:

```js
assert.equal(TEST_RUNNER_TIMEOUT_MS, 1_200_000);
```

- [x] **Step 2: Run RED**

Run:

```bash
node --test scripts/tests/unit/task-tracker/lib/lane-split-dod-stamp.test.mjs
```

Expected: FAIL because the actual value is still 600000.

- [x] **Step 3: Implement the minimal policy change**

Update the centralized constant:

```js
export const TEST_RUNNER_TIMEOUT_MS = 1_200_000;
```

Update its comment to explain that the successful governed aggregate quality
command took 17 minutes 32 seconds and 20 minutes preserves bounded headroom
until TIA reduces the required safety-net scope.

- [x] **Step 4: Run GREEN and focused neighbors**

Run the two existing files:

```bash
node --test scripts/tests/unit/task-tracker/lib/lane-split-dod-stamp.test.mjs scripts/tests/unit/task-tracker/lib/process-timeouts.test.mjs
```

Expected: both files pass.

- [x] **Step 5: Commit**

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

- [x] **Step 1: Run formatting and focused verification**

```bash
npm run format:check
node --test scripts/tests/unit/task-tracker/lib/lane-split-dod-stamp.test.mjs scripts/tests/unit/task-tracker/lib/process-timeouts.test.mjs
```

- [x] **Step 2: Rerun the blocked acceptance stamp**

Run `npx aitm ac-stamp` with #1406's exact fifth Acceptance Criterion label.
Expected: `npm run quality` exits 0 and the marker records the exact new head.

- [x] **Step 3: Inspect slow-suite history**

Use retained GitHub Actions run/job evidence to report a bounded failure-rate
sample. Separate slow-lane failures from unrelated workflow failures when the
logs allow it; otherwise report the observable aggregate and the missing
instrumentation needed for a trustworthy slow-only metric.

### Task 3: Apply Independent Review Corrections

**Files:**

- Modify: `scripts/task-tracker/lib/process-timeouts.mjs`
- Modify: `scripts/run-tests.mjs`
- Modify: `scripts/tests/unit/task-tracker/lib/process-timeouts.test.mjs`
- Modify: `scripts/tests/unit/task-tracker/core/run-tests-kill-report.test.mjs`
- Modify: amendment specification and plan
- Add: `docs/evidence/2026-08-24-1406-slow-suite-failure-metric.md`

- [x] **Step 1: Prove the per-file cutoff was accidentally coupled**

Add regressions requiring a dedicated 600000ms test-file constant and its use
by `run-tests.mjs`; run them against `73b4febf` and observe RED.

- [x] **Step 2: Restore the narrower safety boundary**

Add `TEST_FILE_TIMEOUT_MS = 600_000`, use it for `spawnTestChild`, and retain
`TEST_RUNNER_TIMEOUT_MS = 1_200_000` only for aggregate declared verifiers.

- [x] **Step 3: Reconcile evidence and authority**

Record the successful governed runtime as 17m32s, preserve the slow-suite
metric in tracked evidence, and publish the owner's development-amendment
approval using governed comment key `plan.verifier-timeout-amendment-v1`.

- [x] **Step 4: Verify, commit, and request Claude re-review**

Run formatting and all focused timeout regressions, commit the correction, and
prepare an exact-range handoff for the same persistent Claude reviewer.
