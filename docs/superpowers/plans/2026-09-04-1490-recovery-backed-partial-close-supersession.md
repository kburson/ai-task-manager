# Recovery-Backed Retry Disposition Correction Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make a recovery-backed stale-close retry accept the persisted `Delivered` disposition that the initial reopened recovery required and retained.

**Architecture:** Preserve every recovery record, transaction boundary, and close-saga step. Correct one pure live-state predicate from an unreachable null disposition to the exact `Delivered` invariant, and prove it with both pure-authorizer and orchestration tests that reproduce the production checkpoint sequence.

**Tech Stack:** Node.js ES modules, `node:test`, AITM governed issue-body operations, AITM close convergence.

## Global Constraints

- The existing `aitm.reopened-close-recovery/v1` and `aitm.delivered-close-supersession/v1` records remain immutable.
- The initial reopened recovery and every recovery-backed retry require terminal disposition `Delivered`.
- Null, `Incorporated`, and every other disposition refuse before persistence.
- No new flag, marker schema, close step, or project-field clearing mutation is added.
- The ordinary stale restart, ordinary reopened restart, and normal close paths remain unchanged.
- Implementation follows RED-GREEN TDD and remains on governed issue #1490.

---

### Task 1: Align the Governed Acceptance Contract

**Files:**

- Update through governed API: GitHub issue `#1490` acceptance criterion
- Create temporarily, then remove: `.tmp/gh/1490-delivered-disposition-ac-operation.json`

**Interfaces:**

- Consumes: the current issue body and its exact `aitm-body-version` marker.
- Produces: the existing recovery-backed acceptance criterion with `Delivered disposition` replacing `null disposition`; no verifier marker or unrelated body byte changes.

- [ ] **Step 1: Read the current body and capture the versioned precondition**

Run:

```bash
gh issue view 1490 --repo kburson/ai-task-manager --json body --jq .body
```

Expected: exactly one acceptance criterion contains `OPEN/REOPENED Review state, null disposition` and carries its existing `aitm-verified` marker.

- [ ] **Step 2: Build the exact governed replacement operation**

Create `.tmp/gh/1490-delivered-disposition-ac-operation.json` as an `aitm.issue-body-operation/v1` `replace-exact` operation using the freshly read body version. Replace only:

```text
OPEN/REOPENED Review state, null disposition
```

with:

```text
OPEN/REOPENED Review state, Delivered disposition
```

Preserve the rest of the criterion, including its verifier marker, byte-for-byte.

- [ ] **Step 3: Apply and verify the governed issue-body operation**

Run:

```bash
node bin/aitm.mjs issue-body 1490 --operation-file .tmp/gh/1490-delivered-disposition-ac-operation.json
gh issue view 1490 --repo kburson/ai-task-manager --json body --jq .body
```

Expected: the criterion says `Delivered disposition`; `null disposition` no longer appears in that criterion; no unrelated body content changes.

- [ ] **Step 4: Remove the temporary operation file**

Use `apply_patch` to delete `.tmp/gh/1490-delivered-disposition-ac-operation.json` after the read-back succeeds.

---

### Task 2: Correct the Recovery-Backed Retry Predicate With TDD

**Files:**

- Modify: `scripts/tests/unit/task-tracker/lib/reopened-close-recovery.test.mjs`
- Modify: `scripts/tests/unit/task-tracker/verbs/close-recovery-backed-stale-wiring.test.mjs`
- Modify: `scripts/task-tracker/lib/reopened-close-recovery.mjs`

**Interfaces:**

- Consumes: `authorizeRecoveryBackedDeliveredCloseRestart(input)` and the persisted `Delivered` project disposition inherited from the historical completed close.
- Produces: the same authorization object as today when every invariant agrees; `ReopenedCloseRecoveryError('live-terminal-state')` for null or alternate dispositions.

- [ ] **Step 1: Change the pure fixture to the production-reachable state**

In `recoveryBackedInput`, change only the live disposition:

```js
const recoveryLive = {
  boardState: 'review',
  issueClosed: false,
  stateReason: 'reopened',
  terminalDisposition: 'Delivered',
  dirty: false,
  bindingOwnership: { disposition: 'own-post-close-claim', authorized: true },
};
```

Extend the contradiction table with both refusal cases:

```js
['missing disposition', { live: { ...base.live, terminalDisposition: null } }, /live-terminal-state/],
[
  'alternate disposition',
  { live: { ...base.live, terminalDisposition: 'Incorporated' } },
  /live-terminal-state/,
],
```

- [ ] **Step 2: Change the wiring fixture to reproduce the persisted production sequence**

In every recovery-backed `common` input used by the interruption/retry tests, set:

```js
terminalDisposition: 'Delivered',
```

Keep the existing sequence that starts with a recovery-backed transaction at `['timing']`, creates or reuses one immutable supersession link, and resumes the ordinary close saga. Add `terminalDisposition: null` to the wiring contradiction matrix so the null state proves no supersession comment, body mutation, or terminal write occurs.

- [ ] **Step 3: Run the focused tests and verify RED**

Run:

```bash
node --test \
  scripts/tests/unit/task-tracker/lib/reopened-close-recovery.test.mjs \
  scripts/tests/unit/task-tracker/verbs/close-recovery-backed-stale-wiring.test.mjs
```

Expected: FAIL with `reopened-close-recovery:live-terminal-state` on the positive `Delivered` recovery-backed case. The failure must come from the old predicate, not fixture construction or syntax.

- [ ] **Step 4: Implement the minimal predicate correction**

In `authorizeRecoveryBackedDeliveredCloseRestart`, replace the disposition clause with:

```js
live.terminalDisposition !== 'Delivered' ||
```

Do not change the initial reopened-recovery authorizer, terminal step order, persistence logic, or any caller.

- [ ] **Step 5: Run the focused tests and verify GREEN**

Run:

```bash
node --test \
  scripts/tests/unit/task-tracker/lib/reopened-close-recovery.test.mjs \
  scripts/tests/unit/task-tracker/verbs/close-recovery-backed-stale-wiring.test.mjs
```

Expected: both files PASS; the `Delivered` positive paths pass and null/alternate disposition refusals pass without persistence.

- [ ] **Step 6: Run the adjacent close-recovery suite**

Run:

```bash
node --test \
  scripts/tests/unit/task-tracker/lib/reopened-close-recovery.test.mjs \
  scripts/tests/unit/task-tracker/lib/delivered-close-supersession.test.mjs \
  scripts/tests/unit/task-tracker/verbs/close-recovery-backed-stale-wiring.test.mjs \
  scripts/tests/unit/task-tracker/verbs/close-reopened-recovery-wiring.test.mjs \
  scripts/tests/unit/task-tracker/verbs/close-delivered-idempotence.test.mjs
```

Expected: all tests PASS with zero failures.

- [ ] **Step 7: Commit the implementation slice**

```bash
git add \
  scripts/task-tracker/lib/reopened-close-recovery.mjs \
  scripts/tests/unit/task-tracker/lib/reopened-close-recovery.test.mjs \
  scripts/tests/unit/task-tracker/verbs/close-recovery-backed-stale-wiring.test.mjs
git commit -m "[#1490] fix(close): retain Delivered retry invariant"
```

---

### Task 3: Verify, Deliver, and Close Through Governed Gates

**Files:**

- Verify only: the complete repository and governed issue `#1490`

**Interfaces:**

- Consumes: the Task 2 commit and the already merged delivery history through PR #1509.
- Produces: fresh exact-SHA Test and Review evidence, a current-head pull request and delivery receipt, then a completed eight-step close transaction with issue #1490 in Done.

- [ ] **Step 1: Run full local verification**

Run, one at a time:

```bash
npm test
npm run test:slow
npm run lint
npm run format:check
git diff --check
git status --short
```

Expected: every command exits 0; tests report zero failures; the worktree contains only intentional committed changes.

- [ ] **Step 2: Record commit provenance and enter governed Test**

Run the repository's governed commit-trace and `test` verbs for #1490. Verify the Test receipt names the exact current `HEAD`; do not reuse the prior `7ef0fb2a` receipt.

- [ ] **Step 3: Complete governed Review and obtain human approval**

Run the governed Review transition and independent review required by the task workflow. Present the exact reviewed SHA and delta for human approval, then record that approval with:

```bash
node bin/aitm.mjs approve 1490 --human
```

- [ ] **Step 4: Push, create the current-head PR, and wait for hosted CI**

Fetch and rebase onto current `origin/trunk` before push if required by the governed workflow. Push the exact approved SHA, create a PR without an auto-close keyword, and verify hosted fast-lane CI succeeds for that SHA.

- [ ] **Step 5: Deliver through the provider-action protocol**

Run:

```bash
node bin/aitm.mjs deliver 1490
```

If it returns one `AITM_PROVIDER_ACTION_REQUIRED` envelope, execute that exact provider action once, then rerun `deliver` to reconcile the live receipt. Verify `origin/trunk` contains the returned merge SHA.

- [ ] **Step 6: Retry the governed close and verify the original symptom**

Run:

```bash
node bin/aitm.mjs close 1490 --restart-stale-transaction
```

Expected: the recovery-backed retry accepts the persisted `Delivered` disposition, reuses or creates exactly one immutable supersession link, converges all eight close steps, closes issue #1490 with state reason `COMPLETED`, and moves its project item to `Done`.

- [ ] **Step 7: Perform final read-only verification**

Run:

```bash
git fetch origin
gh issue view 1490 --repo kburson/ai-task-manager --json state,stateReason,projectItems
git status --short
```

Expected: issue `CLOSED/COMPLETED`, project status `Done`, delivered merge reachable from `origin/trunk`, and a clean governed worktree.
