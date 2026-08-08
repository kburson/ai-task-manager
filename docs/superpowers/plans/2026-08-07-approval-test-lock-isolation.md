# Approval Test Lock Isolation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. No subagent delegation is authorized for this story.

**Goal:** Prevent issue-58 approval unit fixtures from contending for the same filesystem lock during the parallel fast lane.

**Architecture:** Reuse the test runner's explicit `@parallel-unsafe` source marker to route the two shared-lock fixtures into its existing serial phase. Pin the scheduling contract with the existing classifier test; do not alter production locking or global pool concurrency.

**Tech Stack:** Node.js ESM, `node:test`, repository fast/slow runners.

## Global Constraints

- Preserve the real `runApprove` issue-lock boundary in the approval fixtures.
- Keep the bounded pool and production lock implementation unchanged.
- Use one commit for all #1139 artifacts and implementation.
- Base the story on `f684ef3bbe429fc499f5e65ff36235f27901d2b8`.

---

### Task 1: Route shared-lock approval fixtures to the serial phase

**Files:**

- Modify: `scripts/task-tracker/tests/unit/lib/test-parallel-safety.test.mjs`
- Modify: `scripts/task-tracker/tests/unit/verbs/approve-core.test.mjs`
- Modify: `scripts/task-tracker/tests/unit/verbs/approve-full-auto-detect.test.mjs`
- Create: `docs/superpowers/specs/2026-08-07-approval-test-lock-isolation-design.md`
- Create: `docs/superpowers/plans/2026-08-07-approval-test-lock-isolation.md`

**Interfaces:**

- Consumes: `isParallelSafe(fullPath)` and the existing `@parallel-unsafe` marker contract.
- Produces: serial classification for both issue-58 approval fixtures without changing their test bodies.

- [ ] **Step 1: Write the failing classifier regression**

Add a `node:test` case that resolves both approval fixture paths and asserts
`isParallelSafe(path) === false` for each.

- [ ] **Step 2: Verify RED**

Run:

```bash
node --test scripts/task-tracker/tests/unit/lib/test-parallel-safety.test.mjs
```

Expected: failure naming at least one approval fixture as pool-eligible.

- [ ] **Step 3: Apply the minimal scheduling declaration**

Add this source comment near the story tag in each affected approval fixture:

```js
// @parallel-unsafe (shares the real repository issue lock for fixture issue 58)
```

- [ ] **Step 4: Verify GREEN and the real approval fixtures**

Run:

```bash
node --test scripts/task-tracker/tests/unit/lib/test-parallel-safety.test.mjs scripts/task-tracker/tests/unit/verbs/approve-core.test.mjs scripts/task-tracker/tests/unit/verbs/approve-full-auto-detect.test.mjs
```

Expected: all tests pass with no `IssueLockError`.

- [ ] **Step 5: Run repository verification**

Run `npm test`, `npm run test:slow`, `npm run lint`, `npm run format:check`,
`node scripts/dev-env/verify-local-worktree.mjs`, and `git diff --check`.

- [ ] **Step 6: Commit the story once**

Stage only the five files listed above and commit:

```bash
git commit -m "[#1139] fix(tests): serialize shared approval locks"
```
