# No Required Checks Delivery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let exact-head delivery treat GitHub CLI's explicit absent-required-checks response as a readable empty policy while every unrelated failure remains fail-closed.

**Architecture:** Extend the existing `requiredChecksJson` adapter in `deliver.mjs`, where exit code 8 is already decoded as pending-check JSON. Classify exit code 1 only when stderr or the generated error message contains GitHub's stable `no required checks reported on the '…' branch` diagnostic, return an empty array, and retain the existing independent live-head read-back.

**Tech Stack:** Node.js ESM, `node:test`, GitHub CLI adapter injection, AI Task Manager delivery verification.

## Global Constraints

- Keep all unrelated GitHub CLI failures fail-closed.
- Preserve exit-code-8 pending-check behavior.
- Preserve exact-head read-back and head-drift refusal.
- Do not change branch protection, required-check configuration, provider actions, delivery receipts, or protected issue histories.
- Execute serially in the governed `feature/child/1504` worktree.

---

### Task 1: Classify GitHub's absent required-check policy

**Files:**

- Modify: `scripts/task-tracker/verbs/deliver.mjs:913`
- Test: `scripts/tests/unit/task-tracker/verbs/deliver-default-deps.test.mjs`

**Interfaces:**

- Consumes: injected `exec(command, args)` errors with `code`, `stdout`, `stderr`, and `message`; existing `fetchRequiredChecks({ prNumber, expectedHeadSha })`.
- Produces: `{ readable: true, required: [] }` at the expected head, `{ readable: false, required: [] }` after head drift, and the original rejection for unrelated exit-one errors.

- [ ] **Step 1: Write failing adapter tests**

Add tests that inject an exit-one error whose stderr is `no required checks reported on the 'feature/child/1504' branch`, then assert a readable empty set at `HEAD`; repeat with a different live head and assert unreadable; inject `authentication failed` and assert rejection.

- [ ] **Step 2: Run the focused file and verify RED**

Run: `node --test scripts/tests/unit/task-tracker/verbs/deliver-default-deps.test.mjs`

Expected: the absent-policy test fails because the original exit-one error is propagated.

- [ ] **Step 3: Implement the narrow classifier**

Inside `requiredChecksJson`, keep the exit-code-8 JSON parse first. For exit code 1, combine `error.stderr` and `error.message`, require the diagnostic pattern `/no required checks reported on the '[^']+' branch/i`, and return `[]`. Throw the original error for every other shape.

- [ ] **Step 4: Run focused tests and verify GREEN**

Run: `node --test scripts/tests/unit/task-tracker/verbs/deliver-default-deps.test.mjs`

Expected: all tests pass with no warnings.

- [ ] **Step 5: Run the complete delivery contract**

Run: `node --test scripts/tests/unit/task-tracker/verbs/deliver.test.mjs`

Expected: all tests pass.

- [ ] **Step 6: Commit the implementation**

```bash
git add docs/superpowers/plans/2026-09-03-1504-no-required-checks-delivery.md \
  scripts/task-tracker/verbs/deliver.mjs \
  scripts/tests/unit/task-tracker/verbs/deliver-default-deps.test.mjs
git commit -m "[#1504] Classify absent required checks"
```

- [ ] **Step 7: Run governed verification**

Run the root Verification Commands in order through `/task test 1504`, review the exact-SHA receipt, and stamp each acceptance criterion from its cited commands before Review.
