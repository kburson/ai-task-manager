# Node 25 Bind Test Cleanup Design

- **Date:** 2026-09-10
- **Status:** Approved
- **Issue:** #1577
- **Blocks:** #1546

## Summary

Make the cleanup hook in
`scripts/tests/integration/task-tracker/verbs/bind.test.mjs` explicitly
module-scoped. Import the top-level `after` function from `node:test` and use it
for the existing cleanup callback. Preserve the shared fixture, both test cases,
all assertions, and all production code.

## Problem

The test file creates one isolated temporary project for two top-level tests and
registers its cleanup with `test.after(...)` after the asynchronous tests have
started. On Node 25, the hook attaches to the active first test scope. It removes
the shared project before the second test writes `state-1.json`, producing a
deterministic `ENOENT` failure.

Instrumentation traced the removal to the test file's own cleanup callback.
Neither `verbResume` nor the scheduler removes the fixture.

## Constraints

- Do not change production task-tracker behavior.
- Do not change either test case or its assertions.
- Keep one shared isolated fixture for the module.
- Keep cleanup owned by the Node test runner.
- Do not add process-global exit handlers.
- Keep #1577's implementation diff separate from the preceding #1546 commit.

## Considered Approaches

### Module-scoped `after` export

Import `{ after, test }` from `node:test` and replace `test.after(...)` with
`after(...)`. This makes hook ownership explicit, retains the fixture and
assertions, and limits the behavioral change to cleanup timing. This is the
selected approach.

### Per-test fixtures

Create and remove a separate temporary project inside each test. This would
avoid shared lifetime concerns but would duplicate setup, increase churn, and
stop testing the current shared-fixture structure.

### Process-exit cleanup

Register cleanup with a process exit handler. This is less test-runner-aware,
can make failure cleanup less deterministic, and broadens lifecycle ownership
beyond the module. It is rejected.

## Detailed Design

The module continues creating `tmp` once. The test runner's top-level `after`
hook removes `tmp` recursively and idempotently after all tests in the module
complete. No new adapter, helper, state, or error path is introduced.

The current failing second case remains the regression test. Its successful
write of `state-1.json` proves the fixture was not removed after the first case.
Successful process completion proves the root-scoped cleanup ran without
interfering with either case.

## Verification

1. Capture the existing Node 25 RED result: seven subtests pass and the second
   top-level case fails with `ENOENT`.
2. Apply only the import and hook-registration change.
3. Run the focused file and require all eight subtests to pass.
4. Inspect the issue-specific diff to confirm no production code or assertions
   changed.
5. Run the governed Develop iteration verifier, exact-SHA finalization, and the
   normal Test-stage verification contract.

## Success Criteria

- The focused bind integration file passes all eight subtests on Node 25.
- The shared fixture remains available through both cases.
- Cleanup remains deterministic and module-scoped.
- No production behavior or test assertion changes.
- #1546 can resume governed Test verification after #1577 reaches Done.
