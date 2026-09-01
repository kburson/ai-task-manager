# Develop and Test Resident-Action Ownership Design (#937)

## Problem

The legacy `/task test` sequence performed isolated Test work while the issue
was still in Develop, then moved the board only after that work passed. That
made Test evidence a prerequisite for leaving Develop and gave direct
`/task test`, generic `/task promote`, and bind/resume paths different effective
orchestration.

The stateless Cursor architecture delivered by #1117 provides state-owned,
resumable actions and one explicit boundary per movement trigger. #937 uses that
seam to restore the state boundary: Develop proves Develop work, the transition
makes Test current, and only then may Test work begin.

## Decision

Develop owns an issue-locked resident verification action. It finalizes
implementation verification, targeted tests, full lint, and full formatting at
the exact committed HEAD and persists a `develop-final` receipt. The
Develop-to-Test exit guard consumes that receipt; it does not consume sandbox,
pull-request, or hosted-CI proof.

Test owns a correlation-based resident action for pull-request creation or
observation and exact-head quick CI. Waiting and infrastructure outcomes remain
in Test for retry. A confirmed source failure records an explicit audited
Test-to-Develop demotion before code changes resume.

`/task test` and Develop-state `promote`/`next` converge on the same
Develop-to-Test cursor request. Rebind and resume while Test is current use an
actions-only cursor request and wake Test in place.

## Control flow

1. The Develop resident action verifies the clean exact HEAD and persists its
   final receipt.
2. The Develop exit guard validates that receipt and the normal lifecycle
   evidence.
3. One forward transition commits Test as the current state.
4. Test resident work starts or observes its external run only after that
   transition succeeds.
5. Waiting or infrastructure failure keeps Test current and resumable.
6. Confirmed source failure explicitly demotes to Develop with a recorded
   reason; no implicit board rollback occurs.
7. A green Test receipt enables the existing Test-to-Review boundary.

## Failure and recovery

A missing, malformed, red, or stale Develop receipt refuses the boundary and
leaves the issue in Develop. A refused boundary starts no Test work. Once Test
is current, setup and infrastructure failures remain in Test. Only a classified
source failure uses the governed one-step demotion path.

The Test action is idempotent by correlation identity. Rebind, resume, and
direct Test invocation observe or continue the same run instead of creating
duplicate pull requests or CI runs.

## Compatibility

Existing accepted lifecycle evidence remains readable during migration. The
legacy sandbox-proof guard remains importable for bounded compatibility tests,
but it is no longer registered as the Develop exit authority. Existing Test
receipts and Review validation remain the Test-to-Review contract.

## Verification

Focused tests cover resident-action ownership, receipt-only Develop exit,
Test-before-work ordering, waiting and source-failure classification, explicit
demotion, and direct/promote/rebind/resume parity. Repository lint, formatting,
unit, integration, and slow suites verify the complete change.
