# Terminal Timing Seal Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the first valid `issue:closed` timing row an irreversible seal, prevent duplicate close activity, and heal historical post-terminal rows deterministically.

**Architecture:** A parser-backed seal predicate lives beside the existing terminal-review handoff policy and is enforced at the locked timing-comment append boundary. Close-pair reconciliation consumes the same irreversible invariant, while the existing pure healer removes historical post-seal timing rows before its established transforms and reports exact counts through the CLI.

**Tech Stack:** Node.js ES modules, `node:test`, GitHub timing-comment helpers, AITM governed lifecycle commands.

## Global Constraints

- The first exact parsed `issue:closed` timing row is authoritative and irreversible.
- Prose and malformed rows that only mention `issue:closed` do not seal the log.
- Preserve the first seal, all pre-seal bytes, non-timing prose, and newline shape.
- A second healer pass must be byte-identical.
- Deliver design, plan, tests, and implementation in exactly one `[#1134]` commit.
- Run every production change through a witnessed RED test before GREEN implementation.
- Do not use subagents.

---

### Task 1: Seal the locked append boundary

**Files:**

- Modify: `scripts/task-tracker/tests/unit/lib/terminal-review-handoff.test.mjs`
- Modify: `scripts/task-tracker/lib/terminal-review-handoff.mjs`
- Modify: `scripts/task-tracker/gh-timing-comment.mjs`

**Interfaces:**

- Consumes: `parseTimingRow(line)` and the existing `isTerminalReviewHandoffOpen(body)` policy.
- Produces: `hasTerminalTimingSeal(body): boolean` and `shouldSuppressTimingAppend(body, event): boolean`.

- [ ] **Step 1: Add the production-shaped failing append test**

Append a valid `review:approved` / `issue:wrap` / `issue:closed` sequence, then
attempt `resumed`, another approval/wrap/closed sequence, and
`switch-out:#1129`. Assert that the final parsed event list is exactly the
prefix through the first `issue:closed`. Add a separate assertion that prose
containing `issue:closed` does not suppress a normal row.

- [ ] **Step 2: Run the focused test and witness RED**

Run:

```sh
node --test scripts/task-tracker/tests/unit/lib/terminal-review-handoff.test.mjs
```

Expected: FAIL because rows after the first seal are still present.

- [ ] **Step 3: Add the seal and combined suppression predicates**

Implement the following behavior in
`scripts/task-tracker/lib/terminal-review-handoff.mjs`:

```js
export function hasTerminalTimingSeal(body) {
  return String(body ?? '')
    .split('\n')
    .some((line) => {
      const row = parseTimingRow(line);
      return row?.event === 'issue:closed' && isTableTimingTimestamp(row.ts);
    });
}

export function shouldSuppressTimingAppend(body, event) {
  return hasTerminalTimingSeal(body) || shouldSuppressTerminalSessionEvent(body, event);
}
```

Import `shouldSuppressTimingAppend` in `gh-timing-comment.mjs` and invoke it at
the beginning of `appendRow`, before duplicate-approval and duplicate-start
logic. Return the original body when it reports true.

- [ ] **Step 4: Run the focused test and witness GREEN**

Run the Task 1 command again. Expected: all tests pass.

### Task 2: Make close-pair reconciliation terminal after any seal

**Files:**

- Modify: `scripts/task-tracker/tests/unit/core/timing-rollup.test.mjs`
- Modify: `scripts/task-tracker/timing-rollup.mjs`

**Interfaces:**

- Consumes: `parseTimingRows(body)` and `PHASE_EVENTS.done.complete.event`.
- Produces: `pendingClosePairState(body)` returning both flags true after any seal.

- [ ] **Step 1: Add the malformed-tail failing test**

Build a log ending with `issue:closed`, followed by `resumed`, duplicate
`review:approved`, and `switch-out:#1129`. Assert:

```js
assert.deepEqual(pendingClosePairState(body), {
  reviewApproved: true,
  issueWrap: true,
});
```

- [ ] **Step 2: Run the focused test and witness RED**

Run:

```sh
node --test scripts/task-tracker/tests/unit/core/timing-rollup.test.mjs
```

Expected: FAIL because the post-close window reports `issueWrap: false`.

- [ ] **Step 3: Replace tail-dependent windowing with the irreversible rule**

After parsing rows and resolving event names, return both flags true whenever
any row event equals `closedEvent`. Preserve the existing window scan only for
logs with no close seal.

- [ ] **Step 4: Run the focused test and witness GREEN**

Run the Task 2 command again. Expected: all assertions pass.

### Task 3: Remove historical post-terminal rows in the pure healer

**Files:**

- Modify: `scripts/task-tracker/tests/unit/lib/heal-timing-log.test.mjs`
- Modify: `scripts/task-tracker/lib/heal-timing-log.mjs`

**Interfaces:**

- Consumes: `parseTimingRow(line)` and `isTableTimingTimestamp(row.ts)`.
- Produces: `countPostTerminalRows(body): number` and a post-terminal cleanup as the first `healTimingLog` transform.

- [ ] **Step 1: Add healer count, prefix, prose, and idempotency tests**

Construct the exact #1127-shaped suffix after a first valid seal. Assert that
the pre-heal count equals the number of parsed timing rows after the seal, the
healed count is zero, the result keeps the first seal and byte-identical prefix,
non-timing prose remains, duplicate close rows are absent, and a second call
returns the same string.

- [ ] **Step 2: Run the healer test and witness RED**

Run:

```sh
node --test scripts/task-tracker/tests/unit/lib/heal-timing-log.test.mjs
```

Expected: FAIL because `countPostTerminalRows` is not exported and the suffix
is not removed.

- [ ] **Step 3: Add shared post-terminal index discovery**

Add a helper that scans lines in document order, records the first parsed timing
row whose exact event is `issue:closed`, and marks every later parsed row with a
table timing timestamp for removal. Export a count based on that index set.

At the beginning of `healTimingLog`, remove those indexes and feed the resulting
lines into the existing stop/resume, redundant-pass, retired-row, and phase
recomputation passes. Retain original-line use only where the existing transform
needs to detect legacy rows or compute before/after brackets against the
post-terminal-cleaned substrate.

- [ ] **Step 4: Run the healer test and witness GREEN**

Run the Task 3 command again. Expected: all healer tests pass.

### Task 4: Report post-terminal cleanup counts

**Files:**

- Modify: `scripts/task-tracker/tests/unit/core/heal-timing-log-command.test.mjs`
- Modify: `scripts/task-tracker/heal-timing-log.mjs`

**Interfaces:**

- Consumes: `countPostTerminalRows(body)` from the pure healer.
- Produces: `postTerminalBefore` / `postTerminalAfter` result fields, `postTerminal=N -> 0` per-issue output, and `postTerminalRows=N` sweep summary output.

- [ ] **Step 1: Add command-result and report failing tests**

Extend no-comment, dry-run, healed, already-canonical, per-issue, and sweep
assertions to include post-terminal counts. The sweep aggregate must sum
`postTerminalBefore` for changed issues.

- [ ] **Step 2: Run the command test and witness RED**

Run:

```sh
node --test scripts/task-tracker/tests/unit/core/heal-timing-log-command.test.mjs
```

Expected: FAIL because the result fields and report labels are absent.

- [ ] **Step 3: Plumb count fields through the driver**

Import `countPostTerminalRows`, compute before and after values around
`healTimingLog`, add zero values to the no-comment result, append
`postTerminal=${before} -> ${after}` in `formatRemovalCounts`, and add a sweep
counter rendered as `postTerminalRows=${total}`.

- [ ] **Step 4: Run the command test and witness GREEN**

Run the Task 4 command again. Expected: all command tests pass.

### Task 5: Refactor, verify, and deliver one story commit

**Files:**

- Review every file named in Tasks 1-4.
- Include:
  `docs/superpowers/specs/2026-08-07-terminal-timing-seal-design.md`
- Include:
  `docs/superpowers/plans/2026-08-07-terminal-timing-seal.md`

**Interfaces:**

- Consumes: all RED/GREEN behavior established above.
- Produces: one reviewable #1134 commit with governed verification evidence.

- [ ] **Step 1: Run all four focused test files together**

```sh
node --test \
  scripts/task-tracker/tests/unit/lib/terminal-review-handoff.test.mjs \
  scripts/task-tracker/tests/unit/core/timing-rollup.test.mjs \
  scripts/task-tracker/tests/unit/lib/heal-timing-log.test.mjs \
  scripts/task-tracker/tests/unit/core/heal-timing-log-command.test.mjs
```

Expected: all focused tests pass.

- [ ] **Step 2: Run repository quality checks**

```sh
npm test
npm run test:slow
npm run lint
npm run format:check
```

Expected: every command exits 0.

- [ ] **Step 3: Review the diff and create the only story commit**

Verify that the branch contains only #1134 design, plan, tests, and production
changes, then stage the exact files and commit once:

```sh
git commit -m "[#1134] fix(timing): seal terminal logs"
```

- [ ] **Step 4: Run governed exact-SHA Test and Review**

Advance through the AITM Test and Review gates using the committed SHA. Verify
each acceptance criterion through its cited focused command, stamp the
functional Definition of Done, run Agent Review, and record Full-Auto approval.

- [ ] **Step 5: Integrate and close**

Show exact feature/trunk refs, ancestry, one-commit delta, clean status, and
verification receipts. Fast-forward local `trunk`, rerun merged verification,
push `trunk`, and close #1134 through `npx aitm close 1134`.
