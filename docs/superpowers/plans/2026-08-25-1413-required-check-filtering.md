# Required Check Filtering Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make governed delivery evaluate only GitHub-required checks for the exact pull-request head.

**Architecture:** Replace the complete PR rollup adapter with GitHub CLI's required-check query. Re-read the PR head after the query and let the existing exact-head preflight reject drift; retain pending output as non-green evidence.

**Tech Stack:** Node.js ESM, `node:test`, GitHub CLI, AITM delivery preflight.

## Global Constraints

- Do not change the provider-action envelope or merge behavior.
- Do not treat optional, skipped, or historical check runs as required.
- Missing, unreadable, pending, failed, or wrong-head required checks remain fail-closed.
- Do not create a successor defect.

---

### Task 1: Resolve only exact-head required checks

**Files:**

- Modify: `scripts/task-tracker/verbs/deliver.mjs`
- Test: `scripts/tests/unit/task-tracker/verbs/deliver-default-deps.test.mjs`

**Interfaces:**

- Consumes: `createDefaultDeliverDeps(ctx, { exec })` and `fetchRequiredChecks({ prNumber, expectedHeadSha })`.
- Produces: `{ readable: true, required: Array<{ name, headSha, status, conclusion }> }` containing only GitHub-required checks.

- [ ] **Step 1: Write the failing adapter regression tests**

Add one test whose mocked PR snapshot contains a green required check, a skipped optional check, and a failed historical check. Mock `gh pr checks <N> -R <repo> --required --json name,state` to return only the required success and mock the head readback at the expected SHA. Assert that `fetchRequiredChecks()` returns exactly one green required check and that the required-only command was invoked.

Add a second test where the checks command throws exit code `8` with JSON stdout containing a pending required check. Assert that the returned check is non-green and retains the exact head SHA.

- [ ] **Step 2: Run the tests and verify RED**

Run:

```bash
node --test scripts/tests/unit/task-tracker/verbs/deliver-default-deps.test.mjs
```

Expected: FAIL because the current adapter returns the complete stored `statusCheckRollup` and never calls `gh pr checks --required`.

- [ ] **Step 3: Implement the minimal required-check adapter**

In `createDefaultDeliverDeps`, stop storing the complete `statusCheckRollup` as the required set. Add a helper that executes:

```js
['pr', 'checks', String(prNumber), '-R', ctx.cfg.repo, '--required', '--json', 'name,state'];
```

Parse normal JSON output. When the command rejects with numeric exit code `8`, parse its JSON `stdout` so pending checks remain visible and non-green; rethrow every other error. Then read `headRefOid` with `gh pr view`, normalize the required entries, and attach that live SHA. A success maps to `status: 'COMPLETED'` and `conclusion: 'SUCCESS'`; every other state remains non-green.

- [ ] **Step 4: Run the focused tests and verify GREEN**

Run:

```bash
node --test scripts/tests/unit/task-tracker/verbs/deliver-default-deps.test.mjs
```

Expected: PASS, including required-only filtering and pending exit-code handling.

- [ ] **Step 5: Run the delivery regression set**

Run:

```bash
node --test scripts/tests/unit/task-tracker/lib/delivery-provider-action.test.mjs scripts/tests/unit/task-tracker/verbs/deliver.test.mjs scripts/tests/unit/task-tracker/verbs/deliver-default-deps.test.mjs
```

Expected: PASS with exact-head, non-green, unreadable-check, and provider-action behavior unchanged.

- [ ] **Step 6: Commit the repair**

```bash
git add scripts/task-tracker/verbs/deliver.mjs scripts/tests/unit/task-tracker/verbs/deliver-default-deps.test.mjs docs/superpowers/plans/2026-08-25-1413-required-check-filtering.md
git commit -m "[#1413] Filter delivery to required checks"
```
