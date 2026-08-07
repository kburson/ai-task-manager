# Approval Test Lock Isolation Design

## Problem

The fast test runner correctly isolates each test file in a separate Node
process, but those processes still share the repository's filesystem. Two pure
approval unit-test files call `runApprove` with issue 58 and no `projectDir`, so
they acquire the same real issue lock when the bounded pool overlaps them. Two
consecutive full-suite runs failed with `IssueLockError`, while the same fixture
passed alone.

## Decision

Declare `approve-core.test.mjs` and `approve-full-auto-detect.test.mjs`
parallel-unsafe with the runner's existing `@parallel-unsafe` marker. Extend the
parallel-safety classifier test to assert both files remain serial-only.

This is preferable to injecting a no-op lock because the approval fixtures keep
exercising the real lock boundary. It is preferable to isolated per-file project
directories because the test suite already has an explicit shared-resource
scheduling contract. It is preferable to reducing pool concurrency because the
hazard is limited to these fixtures.

## Behavior

The runner continues to execute all pool-safe unit files at bounded concurrency.
The two marked approval files move to the existing serial phase, where the real
issue-58 lock is acquired and released without cross-file contention. Production
approval and lock behavior do not change.

## Verification

Test-first evidence adds a classifier assertion that fails while either file is
pool-eligible. After the markers are applied, the classifier and both approval
fixtures must pass together. The full fast lane must then pass under its normal
pool scheduling, followed by the standard slow, lint, and format lanes.

## Delivery

Issue #1139 is a deepest-first blocker of #1138. All design, test, and marker
changes land in one `#1139` commit based on the exact #1133 commit. That commit is
then fast-forwarded into the #1138 branch before #1138 resumes verification.
