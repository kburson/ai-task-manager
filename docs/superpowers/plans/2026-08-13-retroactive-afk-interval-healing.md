# Retroactive AFK Interval Healing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Local execution is strictly sequential until cloud CI validation is available.

**Goal:** Add a dry-run-first maintenance command that safely records one known retroactive AFK interval as an authoritative timing-v2 bracket.

**Architecture:** A pure transformer validates and renders the proposed Timing Log body; a thin CLI owns strict argv, timing-lock serialization, GitHub I/O, blast-radius authority, and exact read-back. Existing timing-v2 calculators and completed-row reconciliation remain the only accounting implementations.

**Tech Stack:** Node.js ESM, `node:test`, GitHub CLI-backed timing-comment helpers, AITM timing-v2 markdown rows.

## Global Constraints

- Dry-run is the default; only explicit `--apply` may mutate.
- No additive cached-duration edits or transcript-threshold rewrite.
- Both endpoints must resolve to one unambiguous lifecycle phase visit.
- Every ambiguity is a pre-write refusal.
- Apply runs under the per-issue timing lock and succeeds only after exact read-back.
- Formatting and lint run before full fast and slow tests; broad lanes never overlap.

---

### Task 1: Pure interval transform

**Files:**

- Create: `scripts/task-tracker/lib/heal-timing-interval.mjs`
- Create: `scripts/task-tracker/tests/unit/lib/heal-timing-interval.test.mjs`
- Reuse: `scripts/task-tracker/lib/timing-row-reader.mjs`
- Reuse: `scripts/task-tracker/lib/timing-rows.mjs`
- Reuse: `scripts/task-tracker/lib/heal-timing-log.mjs`

**Interfaces:**

- Consumes: Timing Log markdown and `{ start, end }` timestamp inputs.
- Produces: `proposeTimingIntervalRepair(body, { start, end })`, returning
  `{ status, body, phaseEvent, intervalSec, before, after }` for `repair` or
  `already-applied`, and throwing a named refusal before mutation otherwise.

- [ ] **Step 1: Write the failing valid-interval tests**

  Add a real timing table with `develop:started`, a four-minute interval, and a
  later `develop:completed` row. Assert the proposal inserts exactly one
  `pause:retroactive` and one `resumed` row in timestamp order, moves 240 seconds
  from Develop active to idle, preserves total elapsed seconds, inherits both
  marker columns, and reconciles the completion row cache.

  ```js
  const result = proposeTimingIntervalRepair(body, {
    start: '2026-08-13T10:02:00-05:00',
    end: '2026-08-13T10:06:00-05:00',
  });
  assert.equal(result.status, 'repair');
  assert.equal(result.intervalSec, 240);
  assert.equal(result.after.totalActiveSec, result.before.totalActiveSec - 240);
  assert.equal(result.after.totalIdleSec, result.before.totalIdleSec + 240);
  assert.equal(result.body.match(/pause:retroactive/g)?.length, 1);
  assert.equal(result.body.match(/\| resumed \|/g)?.length, 1);
  ```

- [ ] **Step 2: Run the focused test and capture RED**

  Run: `node --test scripts/task-tracker/tests/unit/lib/heal-timing-interval.test.mjs`

  Expected: module-not-found or missing-export failure before production code exists.

- [ ] **Step 3: Add refusal and idempotency tests**

  Cover unreadable timestamps, `end <= start`, endpoint outside a phase visit,
  lifecycle-boundary crossing, overlap with an existing departure bracket,
  unpaired interruption, partial retroactive pair, exact existing pair, malformed
  or non-chronological rows, and an accounting delta not equal to the interval.

- [ ] **Step 4: Implement the smallest pure transformer**

  Parse rows with their source line indexes. Resolve a single lifecycle enter/
  complete visit containing both endpoints. Render two fixed zero-value rows
  with inherited markers and offset, insert them chronologically, call
  `recomputeCompletedRows`, and compare `computeActiveByPhaseSpans` before and
  after. Do not expose active, idle, word-delta, event, or description overrides.

  ```js
  export function proposeTimingIntervalRepair(body, { start, end } = {}) {
    const interval = resolveRepairInterval(body, { start, end });
    const exact = findExactRetroactivePair(interval.rows, interval);
    if (exact) return alreadyAppliedResult(body, interval);
    assertNoConflictingBracket(interval.rows, interval);
    const inserted = insertRetroactivePair(body, interval);
    const nextBody = recomputeCompletedRows(inserted);
    return assertExactAccountingDelta(body, nextBody, interval);
  }
  ```

- [ ] **Step 5: Run focused GREEN**

  Run: `node --test scripts/task-tracker/tests/unit/lib/heal-timing-interval.test.mjs`

  Expected: all pure transform and refusal tests pass.

### Task 2: Locked dry-run/apply command

**Files:**

- Create: `scripts/task-tracker/heal-timing-interval.mjs`
- Create: `scripts/task-tracker/tests/unit/maintenance/heal-timing-interval-cli.test.mjs`
- Reuse: `scripts/task-tracker/gh-timing-comment.mjs`
- Reuse: `scripts/task-tracker/locks.mjs`
- Reuse: `scripts/task-tracker/lib/argv-strict.mjs`
- Reuse: `scripts/task-tracker/lib/blast-radius-guard.mjs`

**Interfaces:**

- Consumes: `<issue#> --start <timestamp> --end <timestamp> [--apply] [--yes]`.
- Produces: `runHealTimingInterval(...)`, `parseArgs(argv)`, and `main(argv, deps)`.

- [ ] **Step 1: Write failing CLI tests**

  Prove default dry-run makes zero writes; apply runs once under the timing lock;
  exact read-back is mandatory; a thrown update reconciles only when a fresh read
  equals the intended body; already-applied is a no-write success; unknown,
  duplicate, empty, and incomplete argv exit 2 before I/O.

  ```js
  const result = await runHealTimingInterval({
    issueNumber: 1249,
    repo: 'owner/repo',
    start,
    end,
    apply: false,
    deps,
  });
  assert.equal(result.status, 'dry-run');
  assert.equal(updates.length, 0);
  ```

- [ ] **Step 2: Run the CLI test and capture RED**

  Run: `node --test scripts/task-tracker/tests/unit/maintenance/heal-timing-interval-cli.test.mjs`

  Expected: module-not-found or missing-export failure.

- [ ] **Step 3: Implement strict parsing and transaction control**

  Use `assertKnownArgv` with one positional and only `--start`, `--end`,
  `--apply`, `--check-only`, `--yes`, `--help`, and `-h`. Require non-empty
  start/end exactly once. Resolve configuration before GitHub access and
  `confirmBlastRadius` before apply.

  ```js
  const result = await withLock(
    timingLockPath(args.issue, getProjectDir()),
    () => runHealTimingInterval({ issueNumber: args.issue, repo: cfg.repo, ...args }),
    { timeoutMs: 10_000, retries: 2 }
  );
  ```

- [ ] **Step 4: Implement exact write/read-back reconciliation**

  Read one timing comment, compute the pure proposal, and return the proposal on
  dry-run. On apply, update once and fetch again. If update throws, fetch again;
  return `healed-after-ambiguous-write` only if the exact intended body is
  present, otherwise rethrow with the original error as cause.

- [ ] **Step 5: Run CLI and combined focused GREEN**

  Run:

  ```bash
  node --test \
    scripts/task-tracker/tests/unit/lib/heal-timing-interval.test.mjs \
    scripts/task-tracker/tests/unit/maintenance/heal-timing-interval-cli.test.mjs
  ```

  Expected: all focused tests pass with no real GitHub writes.

### Task 3: Command surface and package integration

**Files:**

- Modify: `scripts/task-tracker/lib/command-surface/entrypoints.mjs`
- Modify: `scripts/lib/self-doc.mjs`
- Modify: `scripts/task-tracker/tests/unit/core/package-boundary.test.mjs`
- Modify only if an exact fixture requires it: command catalog/help tests.

**Interfaces:**

- Consumes: the new direct live-maintenance command.
- Produces: package inclusion, entrypoint classification, and detailed help.

- [ ] **Step 1: Add failing integration assertions**

  Require the new executable in the live-maintenance entrypoint set, require a
  detailed self-doc record, and require the packaged tarball to contain both new
  runtime modules.

- [ ] **Step 2: Run focused integration tests and capture RED**

  Run the exact package, entrypoint-classification, and self-documentation test
  files discovered by `rg`.

- [ ] **Step 3: Register the command and document its contract**

  Add `scripts/task-tracker/heal-timing-interval.mjs` to the live maintenance
  list. Add a `directDoc` record whose effects state dry-run default, explicit
  apply, timing lock, authoritative timing-v2 before/after reporting, and exact
  read-back.

- [ ] **Step 4: Update only intentional exact inventories**

  Raise the package entry ceiling by exactly the number of newly shipped files
  and adjust no unrelated baseline.

- [ ] **Step 5: Run all #1249-focused tests GREEN**

  Run both issue Verification Commands plus the discovered command-surface,
  help, and package-boundary files. Expected: all pass.

### Task 4: Final sequential verification and governed delivery

**Files:**

- Modify only files already named by Tasks 1-3.
- Update issue evidence through sanctioned AITM verbs; do not hand-edit evidence.

- [ ] **Step 1: Format before broad tests**

  Run in this order:

  ```bash
  npm run format
  npm run lint
  npm run format:check
  git diff --check
  ```

  Expected: each exits 0. If formatting changes production or tests, rerun every
  focused command before broad suites.

- [ ] **Step 2: Run the fast suite alone**

  Run: `npm test`

  Expected: all fast files pass. Confirm no `run-tests.mjs`, `npm test`, or
  `test:slow` descendant remains before the next command.

- [ ] **Step 3: Run the slow suite alone**

  Run: `npm run test:slow`

  Expected: all slow files pass. Confirm its process tree is gone.

- [ ] **Step 4: Commit and trace**

  Stage only #1249 files and commit with a `[#1249]` subject. Run
  `TT_FULL_AUTO=1 npx aitm commit-trace 1249` and verify the exact HEAD appears
  in the issue ledger.

- [ ] **Step 5: Run governed Test and Review**

  Run `TT_FULL_AUTO=1 npx aitm test 1249` on a clean exact SHA. After Test,
  perform an independent local review, promote to Review, and record Full-Auto
  approval using sanctioned verbs.

- [ ] **Step 6: Deliver sequentially**

  Cherry-pick only the #1249 commits onto local trunk after confirming the
  parent delta and clean merge. Verify the resulting trunk tree sequentially.
  Attempt sanctioned close; if `origin/trunk` reachability refuses, retain the
  approved Review issue and report that remote-only blocker without pushing.
