# Node 25 Bind Test Cleanup Implementation Plan

<!-- cspell:words ENOENT subtests -->

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Keep the bind integration test's shared temporary project alive through both cases on Node 25, then clean it at suite completion.

**Architecture:** The test module continues to own one shared isolated fixture. The two integration cases registered after the top-level dynamic import move into a dedicated `describe` suite, and the existing cleanup callback becomes that suite's `after` hook; production code, test cases, and assertions remain unchanged.

**Tech Stack:** Node.js 25 built-in test runner, ECMAScript modules, AITM governed verification.

## Global Constraints

- Do not change production task-tracker behavior.
- Do not change either integration case or its assertions.
- Keep one shared isolated fixture for the module.
- Keep cleanup owned by the Node test runner.
- Do not add process-global exit handlers.
- Keep #1577's implementation commit separate from the preceding #1546 commit.
- Governing design: `docs/superpowers/specs/2026-09-10-1577-node25-bind-cleanup-design.md`.

## File Structure

- Modify `scripts/tests/integration/task-tracker/verbs/bind.test.mjs`: import `describe`, group the two post-await integration cases, and register the existing callback with the suite-local cleanup hook.
- No production files, additional helpers, fixtures, or assertions are created.

---

### Task 1: Register Bind Fixture Cleanup in a Post-Await Suite

**Files:**

- Modify: `scripts/tests/integration/task-tracker/verbs/bind.test.mjs:10`
- Modify: `scripts/tests/integration/task-tracker/verbs/bind.test.mjs:153`
- Test: `scripts/tests/integration/task-tracker/verbs/bind.test.mjs`

**Interfaces:**

- Consumes: Node's `describe(name, fn)`, `after(fn)`, and `test(name, fn)` exports from `node:test`.
- Produces: unchanged bind-remediation assertions with cleanup deferred until both post-await integration cases complete.

- [ ] **Step 1: Confirm the existing regression is RED on Node 25**

Run:

```bash
node --version
node --test scripts/tests/integration/task-tracker/verbs/bind.test.mjs
```

Expected: Node reports `v25.6.0`; the test command exits nonzero with seven
subtests passing and the final integration case failing with `ENOENT` for
`.scratch/test/tt-bind-hint-*/state-1.json`.

- [ ] **Step 2: Give the post-await integration cases a suite-local lifecycle**

Replace the import at line 10 with:

```js
import { after, describe, test } from 'node:test';
```

Replace the two integration test registrations and the root cleanup hook with:

```js
describe('verbResume review-remediation hints', () => {
  after(() => rmSync(tmp, { recursive: true, force: true }));

  test('verbResume prints the review-remediation hint when the seed attaches one', async () => {
    process.env.AI_TASK_MANAGER_SESSION_ID = 'bind-hint-present';
    const hint = formatReviewRemediationHint(935, REVIEW_NOT_RUN_BODY);
    const statePath = writeState({ active: null, lastActive: null });
    const out = await captureResume(
      makeCtx({
        rest: ['#935'],
        statePath,
        seedKanban: async () => ({ kanbanState: 'review', reviewRemediationHint: hint }),
      })
    );
    assert.match(out, /\/task review #935/, 'hint reaches stdout');
    assert.match(out, /Do NOT demote/);
  });

  test('verbResume stays silent when the seed attaches no hint', async () => {
    process.env.AI_TASK_MANAGER_SESSION_ID = 'bind-hint-absent';
    const statePath = writeState({ active: null, lastActive: null });
    const out = await captureResume(
      makeCtx({
        rest: ['#936'],
        statePath,
        seedKanban: async () => ({ kanbanState: 'review', reviewRemediationHint: null }),
      })
    );
    assert.equal(/Do NOT demote/.test(out), false, 'no hint printed when none is attached');
  });
});
```

Keep the existing test bodies and assertions byte-for-byte; only add the suite
boundary and indentation required by it.

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

Expected: `git diff --check` exits 0. The issue implementation range adds
`describe`, groups only the two post-await integration cases, and moves the
existing cleanup callback inside that suite. No assertion or production file
changes.

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
git commit -m "[#1577] test: scope post-await bind cleanup to suite"
```

Expected: one corrective commit attributed to #1577 containing only the
test-file change; the earlier falsified module-hook attempt remains in history.

- [ ] **Step 7: Run clean exact-SHA Develop finalization**

Run:

```bash
git status --short
node scripts/task-tracker/verify-develop.mjs --mode final --issue 1577
```

Expected: `git status --short` prints nothing and finalization exits 0 for the
new #1577 commit. Report `CODE_COMPLETE` with the commit SHA and test evidence;
the orchestrator owns promotion, review, delivery, and close.

## Delivery Recovery Amendment — 2026-09-11

The #1577 implementation remains commit
`23aa8ea9f766cd8494d86f208afd64375e404ddd`. It was included in shared
PR #1582 at head `369934e676c88727033cc012bd23eddba2453f47`, which GitHub
squash-merged as `fd2b0830d9c214aac087de4c29efbd13f4c85b0d`.

Issue #1578's target-specific recovery was accepted at
`c94f3b27aefe02d05dc2669bde0641edf2358b06` and delivered through
PR #1586 as `2892ae710804e1e2b99522c2e94ce92d8c7370a8`. Its canonical
attribution trailer is byte-ordered for #1578, so #1577 requires its own
accepted head and canonical delivery boundary.

The preserved `codex/ai-peer-review-design` branch incorporated that landed
commit with the normal, non-rewriting merge
`a01d78402d949b8d160d3c4c6475070f85cafcc6`. The merge tree
`ec17c569d00de0f19048b426ab79d4b072ad1a6d` exactly equals the
`2892ae710804e1e2b99522c2e94ce92d8c7370a8` trunk tree. No rebase, reset,
force-push, substitute branch, issue-lineage change, or fabricated delivery
record was used.

The next PR for #1577 carries only this audit amendment relative to current
trunk. It does not replace or reinterpret the original implementation; it
provides a real, target-specific accepted head and canonical delivery boundary
for the already-reviewed change.
