# Close Record Projection PR Selection Implementation Plan

**Issue:** #1397

**Goal:** Project close-time delivery records under the unique accepted-head pull request before the pure receipt gate evaluates them.

## Task 1: Add the failing adapter regression

- Export the close delivery-gate input loader for direct unit coverage without invoking terminal mutations.
- Add a focused test with historical-first and historical-last branch PR lists plus a verified current-PR intent and receipt.
- Confirm the current loader returns an empty projection and fails the expected receipt assertion.

## Task 2: Select before projection

- Filter pull requests by `headRefOid === acceptedSha` in the input loader.
- Fetch and parse comments only for exactly one exact-head candidate.
- Use the selected PR number as the strict parser context; preserve an empty projection for zero or duplicate exact-head matches.

## Task 3: Verify and deliver

- Run the new loader test, the pure #1395 receipt test, and close convergence tests.
- Run the complete governed Test suite and fresh exact-head Review.
- Deliver through the sanctioned provider action, close #1397, then retry and close blocked #1395 and #1393.
