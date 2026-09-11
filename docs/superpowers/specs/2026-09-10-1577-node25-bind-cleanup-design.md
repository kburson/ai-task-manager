# Node 25 Bind Test Cleanup Design

<!-- cspell:words ENOENT subtests -->

- **Date:** 2026-09-10
- **Status:** Approved
- **Issue:** #1577
- **Blocks:** #1546

## Summary

Place the two integration cases registered after the file's top-level dynamic
import in a dedicated `describe` suite. Register the existing cleanup callback
with that suite's `after` hook. Preserve the shared fixture, both test cases,
all assertions, and all production code.

## Problem

The test file registers six unit cases, awaits a dynamic import, and then creates
one isolated temporary project for two more top-level integration cases. On Node
25, a root `after` hook registered after this mixed pre-await/post-await sequence
can run after the earlier root lifecycle but before the later integration cases
finish. It removes the shared project before the second integration case writes
`state-1.json`, producing a deterministic `ENOENT` failure.

Instrumentation traced the removal to the test file's own hook with context name
`<root>`. Replacing `test.after(...)` with the named top-level `after(...)`
export did not change the timing and preserved the same 7-pass/1-fail result.
Neither `verbResume` nor the scheduler removes the fixture. A scratch reproduction
with a suite-local hook passes all post-await cases.

## Constraints

- Do not change production task-tracker behavior.
- Do not change either integration case or its assertions.
- Keep one shared isolated fixture for the module.
- Keep cleanup owned by the Node test runner.
- Do not add process-global exit handlers.
- Keep #1577's implementation diff separate from the preceding #1546 commit.

## Considered Approaches

### Suite-scoped `after` hook

Import `describe` alongside `after` and `test`. Wrap only the two integration
cases in a named suite and register `after(...)` inside its synchronous suite
callback before those cases. This gives the shared fixture an explicit owner
whose lifecycle includes both post-await tests. This is the selected approach.

### Move all registration after the dynamic import

Move the temporary-project setup and dynamic import before every unit case so all
tests register on one side of the top-level await. This follows other working
files but changes environment initialization for unrelated unit cases and moves
a larger block of code.

### Per-test fixtures

Create and remove a separate temporary project inside each integration case.
This avoids shared lifetime concerns but duplicates setup and stops exercising
the intended shared-fixture structure.

## Detailed Design

The module continues creating `tmp` once and importing `verbResume` only after
the temporary environment is configured. The unit cases remain top-level. The
two integration cases move into a named `describe` suite registered after the
dynamic import. The suite registers its `after` hook before its two cases, and
that hook removes `tmp` recursively and idempotently after both complete.

The failed module-scoped attempt remains in commit history as diagnostic
evidence. A corrective implementation commit adds the suite boundary; no
history rewrite is required.

The current failing second case remains the regression test. Its successful
write of `state-1.json` proves the fixture was not removed after the first case.
Successful suite completion proves the suite-scoped cleanup did not interfere
with either case.

## Verification

1. Capture the existing Node 25 RED result: seven subtests pass and the second
   top-level case fails with `ENOENT`.
2. Import `describe`, create one suite around the two post-await integration
   cases, and register the existing cleanup callback inside that suite.
3. Run the focused file and require all eight subtests to pass.
4. Inspect the issue-specific diff to confirm no production code or assertions
   changed.
5. Run the governed Develop iteration verifier, exact-SHA finalization, and the
   normal Test-stage verification contract.

## Success Criteria

- The focused bind integration file passes all eight subtests on Node 25.
- The shared fixture remains available through both cases.
- Cleanup remains deterministic and suite-scoped around the shared fixture's
  two consumers.
- No production behavior or test assertion changes.
- #1546 can resume governed Test verification after #1577 reaches Done.
