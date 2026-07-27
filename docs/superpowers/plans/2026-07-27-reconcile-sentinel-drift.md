# Reconcile Sentinel Drift Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a public, audited reconcile mode that returns an out-of-band board Status to the last saga-verified move-complete sentinel.

**Architecture:** Extend the existing reconcile core with one branch that reads the shared sentinel parser and invokes the confirmed Status-only write seam. Preserve the existing sentinel, rewrite only last-known state, record an audit marker, and refresh session state after the board write confirms.

**Tech Stack:** Node.js 22+, ECMAScript modules, `node:test`, injected I/O seams, GitHub Projects Status writes.

## Global Constraints

- Never stamp a sentinel for an out-of-band board state.
- Never add lifecycle entry markers or timing rows for the recovery operation.
- Fail closed before body mutation when the sentinel is absent, invalid, aligned, or the Status write fails.
- Preserve all existing reconcile mode behavior.

---

### Task 1: Characterize Sentinel-Only Drift Recovery

**Files:**

- Create: `scripts/task-tracker/tests/unit/lib/reconcile-sentinel-drift.test.mjs`
- Modify: `scripts/task-tracker/verbs/reconcile.mjs`

**Interfaces:**

- Consumes: `runReconcile({ issueNumber, mode, cfg, deps, now })`, injected `fetchIssueBody`, `getLiveState`, `runSentinelStatusWrite`, `writeIssueBody`, `mutateBody`, and `persistTrackerState`.
- Produces: the `revert-to-sentinel` result contract `{ status: 'reconciled', mode, from, recorded, to }`.

- [ ] **Step 1: Write the failing core tests**

Add a focused harness with body state `develop`, live state `develop`, and
`<!-- aitm-move-complete state=plan ts=2026-07-27T00:00:00.000Z -->`. Assert a
`revert-to-sentinel` run calls `runSentinelStatusWrite` with target `plan`,
writes `aitm-last-known-state state="plan"` while retaining the sentinel,
persists `plan`, and appends a `reverted` audit marker. Add refusal cases for a
missing sentinel, an unknown sentinel, an aligned sentinel, and a nonzero Status
write result.

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```bash
node --test scripts/task-tracker/tests/unit/lib/reconcile-sentinel-drift.test.mjs
```

Expected: FAIL because `revert-to-sentinel` is rejected as an unknown mode.

- [ ] **Step 3: Implement the minimal core branch**

In `reconcile.mjs`, import `readMoveCompleteState`, add
`revert-to-sentinel` to `MODES`, and execute its branch before the
board-equals-recorded early return. Validate the parsed sentinel against
`STATES`, call the injected Status-only writer, rewrite last-known state with
`writeIssueBodyWithRetry`, refresh session state, and append the audit marker
best-effort.

- [ ] **Step 4: Run focused and existing reconcile tests**

Run:

```bash
node --test scripts/task-tracker/tests/unit/lib/reconcile-sentinel-drift.test.mjs scripts/task-tracker/tests/unit/verbs/reconcile-verb.test.mjs
```

Expected: PASS.

- [ ] **Step 5: Commit the core recovery**

```bash
git add scripts/task-tracker/verbs/reconcile.mjs scripts/task-tracker/tests/unit/lib/reconcile-sentinel-drift.test.mjs
git commit -m "[#1016] fix(reconcile): restore sentinel-verified state"
```

### Task 2: Confirm Status Writes and Align Public Guidance

**Files:**

- Modify: `scripts/task-tracker/verbs/reconcile.mjs`
- Modify: `scripts/task-tracker/verbs/help-data.mjs`
- Modify: `scripts/task-tracker/tests/unit/lib/reconcile-sentinel-drift.test.mjs`
- Test: `scripts/task-tracker/tests/unit/lib/verify-move-invariants.test.mjs`

**Interfaces:**

- Consumes: `runStatusWrite(ctx)`, `STATE_TO_CONFIG_KEY`, `gh`, and `projectItemForIssue`.
- Produces: `defaultRunSentinelStatusWrite({ issueNumber, target, cfg })`, returning the confirmed Status-write exit code.

- [ ] **Step 1: Add failing adapter and help tests**

Assert the default adapter selects `cfg[STATE_TO_CONFIG_KEY[target]]` and maps
`runStatusWrite`'s `{ exit }` result to a numeric exit code. Assert reconcile
help and invalid-usage text list `revert-to-sentinel`, while the existing
move-invariant readout continues to recommend the same accepted mode.

- [ ] **Step 2: Run the focused tests and verify RED**

Run:

```bash
node --test scripts/task-tracker/tests/unit/lib/reconcile-sentinel-drift.test.mjs scripts/task-tracker/tests/unit/lib/verify-move-invariants.test.mjs
```

Expected: FAIL because the adapter is not exported and help omits the new mode.

- [ ] **Step 3: Implement the confirmed Status-only adapter**

Build the existing `runStatusWrite` context with the target option id,
`gh`, and `projectItemForIssue`. Do not call `stampEntryMarkers`, timing
writers, or `writeMoveCompleteMarker`. Update reconcile help, usage, and error
messages to enumerate the accepted public mode.

- [ ] **Step 4: Run the complete focused verification**

Run:

```bash
node --test scripts/task-tracker/tests/unit/lib/reconcile-sentinel-drift.test.mjs scripts/task-tracker/tests/unit/verbs/reconcile-verb.test.mjs scripts/task-tracker/tests/unit/lib/verify-move-invariants.test.mjs
```

Expected: PASS.

- [ ] **Step 5: Run the Develop verification and commit**

Run:

```bash
npx aitm verify-develop
```

Expected: all lint, format, and targeted tests pass.

Then:

```bash
git add scripts/task-tracker/verbs/reconcile.mjs scripts/task-tracker/verbs/help-data.mjs scripts/task-tracker/tests/unit/lib/reconcile-sentinel-drift.test.mjs
git commit -m "[#1016] fix(reconcile): expose sentinel recovery"
```
