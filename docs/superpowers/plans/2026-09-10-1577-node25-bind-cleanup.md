# Node 25 Bind Test Cleanup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Keep the bind integration test's shared temporary project alive through both cases on Node 25, then clean it at module completion.

**Architecture:** The test module continues to own one shared isolated fixture. Its existing cleanup callback moves from context-sensitive `test.after(...)` registration to the explicit top-level `after(...)` API; production code, test cases, and assertions remain unchanged.

**Tech Stack:** Node.js 25 built-in test runner, ECMAScript modules, AITM governed verification.

## Global Constraints

- Do not change production task-tracker behavior.
- Do not change either test case or its assertions.
- Keep one shared isolated fixture for the module.
- Keep cleanup owned by the Node test runner.
- Do not add process-global exit handlers.
- Keep #1577's implementation commit separate from the preceding #1546 commit.
- Governing design: `docs/superpowers/specs/2026-09-10-1577-node25-bind-cleanup-design.md`.

## File Structure

- Modify `scripts/tests/integration/task-tracker/verbs/bind.test.mjs`: import the module-scoped cleanup hook and register the existing callback with it.
- No production files, additional helpers, fixtures, or assertions are created.

---

### Task 1: Register Bind Fixture Cleanup at Module Scope

**Files:**

- Modify: `scripts/tests/integration/task-tracker/verbs/bind.test.mjs:10`
- Modify: `scripts/tests/integration/task-tracker/verbs/bind.test.mjs:153`
- Test: `scripts/tests/integration/task-tracker/verbs/bind.test.mjs`

**Interfaces:**

- Consumes: Node's top-level `after(fn)` and `test(name, fn)` exports from `node:test`.
- Produces: unchanged bind-remediation test behavior with cleanup deferred until every test in the module completes.

- [ ] **Step 1: Confirm the existing regression is RED on Node 25**

Run:

```bash
node --version
node --test scripts/tests/integration/task-tracker/verbs/bind.test.mjs
```

Expected: Node reports `v25.6.0`; the test command exits nonzero with seven
subtests passing and the final integration case failing with `ENOENT` for
`.tmp/test/tt-bind-hint-*/state-1.json`.

- [ ] **Step 2: Make cleanup registration explicitly module-scoped**

Replace the import at line 10 with:

```js
import { after, test } from 'node:test';
```

Replace the cleanup registration at line 153 with:

```js
after(() => rmSync(tmp, { recursive: true, force: true }));
```

Do not change any other line in the test file.

- [ ] **Step 3: Verify the focused test is GREEN**

Run:

```bash
node --test scripts/tests/integration/task-tracker/verbs/bind.test.mjs
```

Expected: exit 0; all eight subtests pass; no `ENOENT` appears.

- [ ] **Step 4: Prove the implementation diff is limited to hook scope**

Run:

```bash
git diff --check
git diff -- scripts/tests/integration/task-tracker/verbs/bind.test.mjs
```

Expected: `git diff --check` exits 0. The file diff contains exactly two logical
changes: `{ test }` becomes `{ after, test }`, and `test.after(...)` becomes
`after(...)`. No assertion or production file changes.

- [ ] **Step 5: Run governed Develop iteration verification**

Run:

```bash
node scripts/task-tracker/verify-develop.mjs --mode iteration
```

Expected: exit 0; the original bind integration failure is absent.

- [ ] **Step 6: Commit the implementation boundary**

Run:

```bash
git add scripts/tests/integration/task-tracker/verbs/bind.test.mjs
git commit -m "[#1577] test: scope bind cleanup to module"
```

Expected: one commit attributed to #1577 containing only the test-file change.

- [ ] **Step 7: Run clean exact-SHA Develop finalization**

Run:

```bash
git status --short
node scripts/task-tracker/verify-develop.mjs --mode final --issue 1577
```

Expected: `git status --short` prints nothing and finalization exits 0 for the
new #1577 commit. Report `CODE_COMPLETE` with the commit SHA and test evidence;
the orchestrator owns promotion, review, delivery, and close.
