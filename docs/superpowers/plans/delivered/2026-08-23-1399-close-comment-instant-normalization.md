# Close Comment Instant Normalization Implementation Plan

**Issue:** #1399

**Goal:** Normalize provider comment timestamps at the close adapter boundary so fresh exact-head delivery receipts can authorize close.

## Task 1: Add failing adapter regressions

- Extend the close delivery-gate input-loader tests with ordinary GitHub whole-second `created_at` values.
- Assert that valid values reach the record projection as canonical millisecond instants.
- Assert that malformed values fail closed before any receipt can authorize terminal mutation.

## Task 2: Normalize at the provider boundary

- Import the shared GitHub instant normalizer into close.
- Normalize each issue-comment timestamp before calling the strict delivery-record parser.
- Throw a close-adapter-specific error when normalization returns null; do not change the parser.

## Task 3: Verify and deliver

- Run the focused close adapter and delivery-record suites.
- Run the complete governed Test suite and fresh exact-head Review.
- Deliver through the sanctioned provider action, close #1399, then retry and close blocked #1397.
