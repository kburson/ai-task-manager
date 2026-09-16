# Post-Delivery Close Head Authority Implementation Plan

**Issue:** #1401

**Goal:** Allow a durably delivered issue to close after later governed work advances its shared local branch.

## Task 1: Add the failing historical-head regression

- Extend the pure accepted-delivery-head test with a valid local HEAD later than the matching Test and Review SHA.
- Assert that the delivered Test/Review SHA remains the accepted authority.
- Retain negative cases for malformed local HEAD, missing Test/Agent Review, and divergent Review evidence.

## Task 2: Separate observation from authority

- Keep syntactic validation of the local HEAD observation.
- Require valid Test evidence and accepted Agent Review.
- When Review evidence exists, require it to equal Test evidence rather than current local HEAD.
- Return the matching lifecycle evidence SHA for downstream exact-head PR and receipt validation.

## Task 3: Verify and deliver

- Run the focused accepted-head, receipt, and close-loader suites.
- Run the complete governed Test suite and fresh exact-head Review.
- Deliver through the sanctioned provider action, close #1401, then retry and close #1397.
