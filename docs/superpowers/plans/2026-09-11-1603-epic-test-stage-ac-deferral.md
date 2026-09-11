# Epic Test-Stage AC Deferral Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow code-bearing epics to reach Test when an unchecked AC requires a Test-restricted verifier, without weakening any other epic or no-commit gate.

**Architecture:** Import #1599's exact prerequisite commits onto the isolated trunk-based defect branch, then extend its pure eligibility condition with the parsed `epic` kind. Keep evidence production and checkbox mutation in the existing Test resident action.

**Tech Stack:** Node.js ESM, `node:test`, AITM lifecycle commands, Git.

## Global Constraints

- Preserve #1599 attribution by cherry-picking its exact plan and implementation commits.
- Do not broaden deferral to audit, research, or spike.
- Do not change epic reconciliation, deliverable evidence, or Test fan-in semantics.
- Do not add another blocker beneath #1603.

---

### Task 1: Import the #1599 prerequisite

**Files:**

- Create: `docs/superpowers/plans/2026-09-11-1599-test-stage-ac-evidence-deferral.md`
- Modify: `scripts/task-tracker/lib/code-complete-gate.mjs`
- Create: `scripts/tests/unit/task-tracker/lib/test-stage-ac-defer.test.mjs`

**Interfaces:**

- Consumes: exact commits `2175edbe7` and `14f936c35` from #1592.
- Produces: `isTestStageDeferredAc(declaration, vcItems)` and the code-kind Develop-exit deferral.

- [ ] **Step 1: Cherry-pick the exact dependency commits**

  Run: `git cherry-pick 2175edbe7 14f936c35`

  Expected: both commits apply cleanly with their original `[#1599]` subjects.

- [ ] **Step 2: Verify the imported focused test**

  Run: `node --test scripts/tests/unit/task-tracker/lib/test-stage-ac-defer.test.mjs`

  Expected: all #1599 code-kind and fan-in tests pass.

### Task 2: Add the failing epic policy matrix

**Files:**

- Modify: `scripts/tests/unit/task-tracker/lib/test-stage-ac-defer.test.mjs`

**Interfaces:**

- Consumes: `gateCodeComplete({ cfg, issueNumber, body, deps })`.
- Produces: regression coverage for epic eligibility and non-epic no-commit controls.

- [ ] **Step 1: Add an issue-kind fixture option**

  Extend `bodyFor` with `kind`, `reconciled`, and `deliverable` options. Render `<!-- aitm-issue-kind kind="..." -->`, `<!-- aitm-epic-ac-reconciled ... -->`, and `<!-- aitm-deliverable-posted ... -->` only when requested.

- [ ] **Step 2: Add the failing epic test**

  Add a test that builds a reconciled epic with a deliverable marker and a Test-restricted unchecked AC, then asserts `gateCodeComplete` returns `ok: true` with no blockers.

- [ ] **Step 3: Add control tests**

  Add cases proving an ordinary targeted epic AC still blocks, audit/research/spike Test-restricted ACs still block, and missing epic reconciliation or deliverable markers still produce their dedicated blockers.

- [ ] **Step 4: Run RED**

  Run: `node --test scripts/tests/unit/task-tracker/lib/test-stage-ac-defer.test.mjs`

  Expected: the new eligible-epic test fails with `code-complete-ac-unticked`; all controls pass.

### Task 3: Implement the minimal kind predicate

**Files:**

- Modify: `scripts/task-tracker/lib/code-complete-gate.mjs`
- Test: `scripts/tests/unit/task-tracker/lib/test-stage-ac-defer.test.mjs`

**Interfaces:**

- Consumes: `parseIssueKind(body)`, `isTestStageDeferredAc(ac.label, vcItems)`.
- Produces: a boolean eligibility decision used only by the unchecked-AC branch.

- [ ] **Step 1: Compute deferral eligibility once**

  Immediately after `const audit = isNoCommitKind(body);`, add `const testStageDeferralEligible = !audit || parseIssueKind(body) === 'epic';`.

- [ ] **Step 2: Use the eligibility decision**

  Replace `!audit && isTestStageDeferredAc(ac.label, vcItems)` with `testStageDeferralEligible && isTestStageDeferredAc(ac.label, vcItems)`.

- [ ] **Step 3: Run GREEN**

  Run: `node --test scripts/tests/unit/task-tracker/lib/test-stage-ac-defer.test.mjs`

  Expected: all focused tests pass.

- [ ] **Step 4: Run the independent gate suite**

  Run: `node --test scripts/tests/unit/task-tracker/lib/code-complete-gate.test.mjs`

  Expected: all existing reconciliation, deliverable, evidence, and dirty-tree cases pass.

- [ ] **Step 5: Commit the #1603 implementation**

  Run: `git add scripts/task-tracker/lib/code-complete-gate.mjs scripts/tests/unit/task-tracker/lib/test-stage-ac-defer.test.mjs && git commit -m '[#1603] fix: defer Test-stage evidence for epics'`

### Task 4: Governed verification and delivery

**Files:**

- Verify: all files changed by Tasks 1-3.

**Interfaces:**

- Consumes: the exact committed #1603 branch SHA.
- Produces: Test receipt, Review approval, hosted CI evidence, delivery receipt, and Done close transaction.

- [ ] **Step 1: Run format and lint**

  Run: `npm run format:check && npm run lint`

  Expected: both commands exit 0.

- [ ] **Step 2: Run fast and slow suites**

  Run: `npm test && npm run test:slow`

  Expected: both commands exit 0.

- [ ] **Step 3: Refresh issue evidence**

  Run each #1603 AC stamp individually, then run Functional DoD stamps through the governed Test action.

  Expected: every pre-close criterion is exact-SHA verified.

- [ ] **Step 4: Complete lifecycle**

  Run Review, Full-Auto approval, push, PR creation, hosted CI monitoring, exact provider delivery, delivery reconciliation, and close.

  Expected: #1603 is CLOSED/Done and #1592's dependency disposition clears.
