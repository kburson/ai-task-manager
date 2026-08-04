# Terminal Review Handoff Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prevent stale terminal session handoffs from inserting stop/resume
noise, duplicate word attribution, or regressing Word Markers after a successful
Agent Review.

**Architecture:** A pure classifier identifies an unmatched `review:passed`
handoff. The stop verb preserves that binding, while the already-locked timing
append boundary suppresses stale session rows and carries durable markers
forward.

**Tech Stack:** Node.js ESM, `node:test`, Markdown Timing Logs, AITM verb
contexts, GitHub issue comments.

## Global Constraints

- Preserve the canonical `review:passed → review:approved → issue:wrap` order.
- Do not change explicit non-terminal stop/resume semantics.
- Do not rewrite historical timing logs.
- Treat unreadable timing evidence as unknown, not as an open handoff.
- Keep Stop hooks non-writers.
- Reference base commit: `782e1da40402536ea6183a0fdca930b922e132b9`.

---

### Task 1: Terminal Handoff Classifier and Stop Preservation

**Files:**

- Create: `scripts/task-tracker/lib/terminal-review-handoff.mjs`
- Modify: `scripts/task-tracker/runtime.mjs`
- Modify: `scripts/task-tracker/verbs/stop.mjs`
- Test: `scripts/task-tracker/tests/unit/lib/terminal-review-handoff.test.mjs`

**Interfaces:**

- Consumes: Timing Log Markdown and `ctx.readTimingCommentBody(args)`.
- Produces: `isTerminalReviewHandoffOpen(body): boolean` and
  `shouldSuppressTerminalSessionEvent(body, event): boolean`.

- [ ] **Step 1: Write the failing stop-preservation test**

```js
test('stop keeps a stale worktree bound after durable review:passed', async () => {
  const ctx = stopContext({ timingBody: bodyWith('review:passed') });
  await verbStop(ctx);
  assert.equal(ctx.flushCalls.length, 0);
  assert.equal(loadState(ctx.statePath).active, '#1077');
});
```

- [ ] **Step 2: Run the focused verifier and confirm RED**

Run:
`node --test scripts/task-tracker/tests/unit/lib/terminal-review-handoff.test.mjs`

Expected: failure because the classifier does not exist or stop calls the flush
seam once.

- [ ] **Step 3: Implement the pure classifier**

```js
export function isTerminalReviewHandoffOpen(body) {
  let open = false;
  for (const line of String(body ?? '').split('\n')) {
    const event = parseTimingRow(line)?.event;
    if (!event) continue;
    if (event === 'review:passed') open = true;
    if (TERMINAL_REVIEW_CLOSERS.has(event)) open = false;
  }
  return open;
}
```

- [ ] **Step 4: Expose the existing reader and guard stop**

Assign `ctx.readTimingCommentBody = readTimingCommentBody` in `runtime.mjs`.
In `verbStop`, read the durable body after queue drain; when the classifier is
open, retain state, set fleet status to `paused`, print direct close guidance,
and return before `flushActiveToGH`.

- [ ] **Step 5: Run the focused verifier and stop/resume regression test**

Run:

```bash
node --test scripts/task-tracker/tests/unit/lib/terminal-review-handoff.test.mjs
node scripts/task-tracker/tests/unit/lib/verb-start-resume-stop.test.mjs
```

Expected: both commands exit 0.

- [ ] **Step 6: Commit the first behavior slice**

```bash
git add scripts/task-tracker/lib/terminal-review-handoff.mjs \
  scripts/task-tracker/runtime.mjs scripts/task-tracker/verbs/stop.mjs \
  scripts/task-tracker/tests/unit/lib/terminal-review-handoff.test.mjs
git commit -m "fix(timing): preserve terminal review handoff [#1097]"
```

### Task 2: Locked Ledger Idempotency and Marker Monotonicity

**Files:**

- Modify: `scripts/task-tracker/gh-timing-comment.mjs`
- Modify: `scripts/task-tracker/tests/unit/lib/terminal-review-handoff.test.mjs`

**Interfaces:**

- Consumes: the Task 1 classifier and parsed Timing Log rows.
- Produces: an `appendRow(body, row)` result that suppresses terminal session
  noise and never lowers the durable marker.

- [ ] **Step 1: Add the failing #1077 sequence test**

```js
test('locked append reduces the #1077 handoff to canonical terminal rows', () => {
  const result = appendEvents([
    ['review:passed', 101167, 0],
    ['stop', 103145, 17631],
    ['resumed', 103183, 0],
    ['stop', 103145, 17631],
    ['review:approved', 103183, 0],
    ['issue:wrap', 103183, 0],
  ]);
  assert.deepEqual(events(result), ['review:passed', 'review:approved', 'issue:wrap']);
  assert.deepEqual(markers(result), [101167, 103183, 103183]);
});
```

- [ ] **Step 2: Run the focused verifier and confirm RED**

Run:
`node --test scripts/task-tracker/tests/unit/lib/terminal-review-handoff.test.mjs`

Expected: `stop` and `resumed` remain in the output.

- [ ] **Step 3: Suppress terminal session events inside `appendRow`**

Call `shouldSuppressTerminalSessionEvent(body, rowEventSlug(effectiveRow))`
before the existing interruption and timestamp guards; return the unchanged
body when it is true.

- [ ] **Step 4: Add and verify a RED marker-carry test**

Build a non-terminal tail at marker `200`, append a row at marker `150`, and
assert marker `200` while all non-marker cells remain byte-identical.

- [ ] **Step 5: Implement durable marker carry-forward**

Parse the last stored numeric marker and incoming marker. When both are finite
and incoming is lower, rewrite only pipe-delimited cell 6 using
`replaceTimingRowCell` and the existing locale number format.

- [ ] **Step 6: Run affected timing suites**

Run:

```bash
node --test scripts/task-tracker/tests/unit/lib/terminal-review-handoff.test.mjs
node scripts/task-tracker/tests/unit/lib/timing-departure-guard.test.mjs
node --test scripts/task-tracker/tests/unit/core/gh-timing-comment.test.mjs
node --test scripts/task-tracker/lib/agent-review/validators/timing-log-sequence.test.mjs
```

Expected: every command exits 0.

- [ ] **Step 7: Commit the ledger slice**

```bash
git add scripts/task-tracker/gh-timing-comment.mjs \
  scripts/task-tracker/tests/unit/lib/terminal-review-handoff.test.mjs
git commit -m "fix(timing): seal reviewed timing ledger [#1097]"
```

### Task 3: Documentation and Full Verification

**Files:**

- Modify: `docs/superpowers/specs/2026-08-04-terminal-review-handoff-design.md`
- Modify: `docs/superpowers/plans/2026-08-04-terminal-review-handoff.md`
- Verify: `scripts/task-tracker/tests/unit/lib/terminal-review-handoff.test.mjs`

**Interfaces:**

- Consumes: Tasks 1 and 2 at a clean committed SHA.
- Produces: implementation-grade design provenance and complete repository
  evidence for AITM Test and Review.

- [ ] **Step 1: Re-read the diff against the design**

Run: `git diff 782e1da40402536ea6183a0fdca930b922e132b9...HEAD --check`

Expected: exit 0 and no output.

- [ ] **Step 2: Run static verification**

```bash
npm run lint
npm run format:check
```

Expected: both commands exit 0 with no lint or formatting errors.

- [ ] **Step 3: Run complete automated verification**

```bash
npm test
npm run test:slow
```

Expected: all fast and slow lane files pass with zero failures.

- [ ] **Step 4: Verify the worktree environment and exact commit trail**

```bash
node scripts/dev-env/verify-local-worktree.mjs
git log --oneline -3
git status --short
```

Expected: the environment verifier exits 0, issue-attributed commits are
visible, and status is clean.

- [ ] **Step 5: Commit any final documentation correction**

```bash
git add docs/superpowers/specs/2026-08-04-terminal-review-handoff-design.md \
  docs/superpowers/plans/2026-08-04-terminal-review-handoff.md
git commit -m "docs(timing): record terminal handoff design [#1097]"
```

- [ ] **Step 6: Run the governed AITM Test and Review workflow**

Run `npx aitm test 1097`, inspect the sandbox receipt, run the exact-SHA review,
resolve any findings test-first, and only then advance through Review and Done.
