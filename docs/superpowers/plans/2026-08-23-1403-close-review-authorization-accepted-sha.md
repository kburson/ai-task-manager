# Close Review Authorization Accepted-SHA Implementation Plan

**Issue:** #1403

**Goal:** Evaluate close-time approval against the accepted delivered SHA even after the shared local branch advances.

## Task 1: Add the failing wiring regression

- Model close input whose accepted SHA differs from later local HEAD.
- Inject the review-authorization seam and capture its `acceptedHeadSha` input.
- Prove the current wiring supplies null and refuses before the receipt gate.

## Task 2: Preserve accepted authority

- Pass `gateInput.acceptedSha` directly to review authorization.
- Keep exact approval-SHA and current Full-Auto/human policy checks unchanged.
- Keep receipt authorization after review authorization and before terminal effects.

## Task 3: Verify and deliver

- Run focused close wiring, authorization, and receipt tests.
- Run the complete governed Test suite and fresh exact-head Review.
- Deliver through the sanctioned provider action, close #1403, then retry #1397.
