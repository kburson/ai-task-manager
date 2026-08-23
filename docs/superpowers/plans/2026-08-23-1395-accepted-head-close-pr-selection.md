# Accepted-Head Close PR Selection Implementation Plan

**Issue:** #1395

**Goal:** Allow governed close to ignore historical pull requests while preserving exact-head ambiguity and every existing delivery receipt assertion.

## Task 1: Lock the regression

- Extend `scripts/tests/unit/task-tracker/verbs/close-delivery-receipt.test.mjs` with historical-first and historical-last cases where exactly one pull request matches the accepted SHA.
- Add zero-match and duplicate-exact-head refusal cases.
- Run the focused test and confirm the new success cases fail for `close-delivery-receipt:ambiguous-pr`.

## Task 2: Select by accepted head

- In `scripts/task-tracker/lib/close-delivery-receipt.mjs`, filter the pull-request list by `headRefOid === acceptedSha`.
- Require exactly one exact-head match and run all existing assertions against it.
- Keep malformed lists and malformed selected entries fail closed.

## Task 3: Verify and deliver

- Run the focused close receipt and close convergence tests.
- Run lint, format, fast, and slow repository verification through the governed Test verb.
- Obtain fresh independent Review evidence at the exact head.
- Deliver through the sanctioned provider action, verify the receipt, close #1395, then retry and close blocked #1393.
