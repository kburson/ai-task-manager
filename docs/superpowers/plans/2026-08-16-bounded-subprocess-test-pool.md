# Bounded Subprocess Test Pool Implementation Plan

<!-- cspell:words cpus -->

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Keep the complete unit lane below its fixed section ceiling by moving directly detected subprocess tests from exclusive serial execution into a separate two-worker phase without weakening fail-closed isolation.

**Architecture:** A pure classifier and scheduling seam split unit entries into pure-pool, subprocess-pool, and exclusive-serial phases. The runner awaits those phases in order and retains canonical result emission; timing schema 3 and section reporting expose the new phase truthfully.

**Tech Stack:** Node.js ESM, `node:test`, existing AITM test discovery, pool, timing, and ceiling modules.

## Global Constraints

- Keep `poolConcurrency()` at `cpus - 1` and cap subprocess concurrency at `Math.min(2, poolConcurrency(cpus))`.
- `@parallel-unsafe` and unreadable sources always route to exclusive serial.
- Integration and slow files remain serial.
- Preserve child environment, timeout, max-buffer, failure reporting, result ordering, and fleet-leak guards.
- Keep the 600-second ceiling unchanged for every non-empty phase; `all` remains exempt.
- Do not move tests, add concurrency overrides, or fold in #945 fixture consolidation.

---

### Task 1: Add fail-closed three-way scheduling primitives

**Files:**

- Modify: `scripts/task-tracker/lib/test-parallel-safety.mjs`
- Modify: `scripts/run-tests-pool.mjs`
- Create: `scripts/run-tests-schedule.mjs`
- Modify: `scripts/tests/unit/task-tracker/lib/test-parallel-safety.test.mjs`
- Modify: `scripts/tests/integration/task-tracker/core/run-tests-pool.test.mjs`
- Create: `scripts/tests/unit/task-tracker/core/run-tests-schedule.test.mjs`

**Interfaces:**

- Produces: `testSchedulingClass(fullPath, read?) -> 'pooled'|'subprocess'|'serial'`.
- Preserves: `isParallelSafe(fullPath, read?) -> boolean`, true only for `pooled`.
- Produces: `subprocessPoolConcurrency(cpus?) -> 1|2`.
- Produces: `partitionTestEntries(entries, { laneOfEntry?, classify? }?) -> { pooledEntries, subprocessEntries, serialEntries }`.

- [ ] **Step 1: Write classifier RED tests**

Add tests asserting pure source is `pooled`, an unmarked direct `node:child_process` reference is `subprocess`, marker-plus-direct-reference is `serial`, unreadable source is `serial`, and all existing `isParallelSafe()` assertions remain unchanged.

- [ ] **Step 2: Run classifier RED**

Run: `node --test scripts/tests/unit/task-tracker/lib/test-parallel-safety.test.mjs`

Expected: FAIL because `testSchedulingClass` is not exported.

- [ ] **Step 3: Implement the classifier**

Add immutable class names and this precedence:

```js
export function testSchedulingClass(fullPath, read = readFileSync) {
  let src;
  try {
    src = read(fullPath, 'utf8');
  } catch {
    return 'serial';
  }
  if (PARALLEL_UNSAFE_MARKER_RE.test(src)) return 'serial';
  return spawnsSubprocess(src) ? 'subprocess' : 'pooled';
}

export function isParallelSafe(fullPath, read = readFileSync) {
  return testSchedulingClass(fullPath, read) === 'pooled';
}
```

- [ ] **Step 4: Write pool-cap and partition RED tests**

Assert `subprocessPoolConcurrency(10) === 2`, values at or below two cores yield one, invalid input yields one, and the generic pool never exceeds the cap while retaining input-order results. In the schedule test, inject lane and class functions to prove unit entries route by class while integration and slow entries always route to serial. Assert the three returned arrays preserve their input-relative order.

- [ ] **Step 5: Run pool and schedule RED**

Run: `node --test scripts/tests/integration/task-tracker/core/run-tests-pool.test.mjs scripts/tests/unit/task-tracker/core/run-tests-schedule.test.mjs`

Expected: FAIL because `subprocessPoolConcurrency` and `partitionTestEntries` do not exist.

- [ ] **Step 6: Implement the cap and pure partition seam**

Add:

```js
export function subprocessPoolConcurrency(cpus = os.cpus().length) {
  return Math.min(2, poolConcurrency(cpus));
}
```

Create `partitionTestEntries()` so only unit entries can enter either pool; `serial` classifications and every non-unit lane enter `serialEntries`. Default lane resolution uses `laneOf(entry.label)` and default classification uses `testSchedulingClass(entry.full)`.

- [ ] **Step 7: Run focused GREEN and commit**

Run: `node --test scripts/tests/unit/task-tracker/lib/test-parallel-safety.test.mjs scripts/tests/integration/task-tracker/core/run-tests-pool.test.mjs scripts/tests/unit/task-tracker/core/run-tests-schedule.test.mjs`

Expected: PASS.

Commit: `[#1208] feat(test): classify bounded subprocess scheduling`

### Task 2: Integrate three phases and truthful timing

**Files:**

- Modify: `scripts/run-tests.mjs`
- Modify: `scripts/run-tests-timing.mjs`
- Modify: `scripts/tests/unit/task-tracker/core/run-tests-timing.test.mjs`
- Modify: `scripts/tests/unit/task-tracker/core/run-tests-elapsed.test.mjs`
- Modify: `scripts/tests/unit/task-tracker/core/run-tests-unit-section-split.test.mjs`

**Interfaces:**

- Consumes: Task 1 `partitionTestEntries()` and `subprocessPoolConcurrency()`.
- Produces: timing artifact schema 3 with `elapsed.runnerMs`, `elapsed.poolMs`, `elapsed.subprocessPoolMs`, and `elapsed.serialMs`.
- Preserves: schema-1 and schema-2 normalization with `subprocessPoolMs: null`.

- [ ] **Step 1: Write timing and ceiling RED tests**

Update fixtures to pass a distinct `subprocessPoolElapsedMs`. Assert schema 3 serializes and normalizes all four elapsed fields; schema 1 and schema 2 normalize the new field to `null`; the human report labels all three execution phases. Update bounded-section tests to model `pooled`, `subprocess`, and `serial`, prove a breach in any one fails closed, prove empty phases are omitted, and prove `all` remains exempt.

- [ ] **Step 2: Run timing and ceiling RED**

Run: `node --test scripts/tests/unit/task-tracker/core/run-tests-timing.test.mjs scripts/tests/unit/task-tracker/core/run-tests-elapsed.test.mjs scripts/tests/unit/task-tracker/core/run-tests-unit-section-split.test.mjs`

Expected: FAIL because schema 3 and subprocess elapsed reporting are absent.

- [ ] **Step 3: Implement schema 3 compatibility**

Thread `subprocessPoolElapsedMs` through `buildTimingReport()`, `serializeArtifact()`, `normalizeTimingArtifact()`, and `formatTimingReport()`. Emit schema 3. For schema 1 and 2, preserve their current truthful fields and add only `subprocessPoolMs: null`; never infer actual elapsed from per-file sums.

- [ ] **Step 4: Integrate sequential runner phases**

Replace inline binary partitioning with `partitionTestEntries()`. Run and await:

```js
const pure = await runPool({ entries: pooledEntries, concurrency: CONCURRENCY, runOne: runEntry });
const subprocess = await runPool({
  entries: subprocessEntries,
  concurrency: subprocessPoolConcurrency(),
  runOne: runEntry,
});
const serialResults = [];
for (const entry of serialEntries) serialResults.push(await runEntry(entry));
```

Measure each phase independently, insert every result into the existing label map, retain canonical `files` emission order, include all three values in artifact/report metadata, and pass all three non-empty sections to `evaluateSections()`.

- [ ] **Step 5: Run cumulative focused GREEN and commit**

Run: `node --test scripts/tests/unit/task-tracker/lib/test-parallel-safety.test.mjs scripts/tests/integration/task-tracker/core/run-tests-pool.test.mjs scripts/tests/unit/task-tracker/core/run-tests-schedule.test.mjs scripts/tests/unit/task-tracker/core/run-tests-timing.test.mjs scripts/tests/unit/task-tracker/core/run-tests-elapsed.test.mjs scripts/tests/unit/task-tracker/core/run-tests-unit-section-split.test.mjs`

Expected: PASS.

Commit: `[#1208] feat(test): run a bounded subprocess phase`

### Task 3: Prove the ceiling repair without weakening safeguards

**Files:**

- Modify only if evidence finds a defect in Task 1 or Task 2 files.
- Evidence: issue #1208 timing and verification comments through sanctioned AITM commands.

**Interfaces:**

- Consumes: complete schema-3 runner.
- Produces: repeatable full-lane evidence at the exact candidate SHA.

- [ ] **Step 1: Run focused and static checks**

Run the cumulative focused command from Task 2, then `npm run lint`, `npm run format:check`, and `git diff --check`.

Expected: every command exits 0.

- [ ] **Step 2: Run two consecutive unit lanes**

Run `npm run test:unit` twice without overlapping other broad test runs. Retain each section summary and timing artifact before the next run overwrites it.

Expected: every discovered unit file passes in both runs; pooled, subprocess, and serial sections are each below 600 seconds; no SIGKILL/null status, timeout, or fleet-registry leak appears.

- [ ] **Step 3: Run plan-declared broad verification**

Run: `npm test`, `npm run test:slow`, `npm run lint`, `npm run format:check`, and `git diff --check`.

Expected: every command exits 0 and no ceiling is relaxed.

- [ ] **Step 4: Verify exact-SHA Develop receipt and commit evidence**

Run: `npx aitm verify-develop 1208 --final` and `git log --oneline -3`.

Expected: exact-HEAD Develop receipt is green and commits follow project convention.

- [ ] **Step 5: Record review evidence**

Request an independent task review and final review against the accepted design, issue AC, plan, and exact candidate SHA. Any safety or timing finding returns to RED-first repair before Test.
