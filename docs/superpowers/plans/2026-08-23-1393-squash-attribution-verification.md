# #1393 Governed Squash Attribution Verification Implementation Plan

**Goal:** Allow exact, trunk-reachable multi-issue squash commits to produce governed delivery receipts while retaining fail-closed attribution validation.

**Architecture:** Validate the canonical attribution line at the delivery-verification boundary from the already-inspected merge commit message. Do not broaden generic subject-only commit attribution.

---

## Task 1: Characterize the live failure

**Files:**

- Create: `scripts/tests/unit/task-tracker/lib/delivery-verification-attribution.test.mjs`
- Create: `scripts/tests/fixtures/test-corpus-post-snapshot/unit/task-tracker/lib/delivery-verification-attribution.test.mjs.json`

Add a direct `verifyDeliveredPullRequest` harness reproducing PR #1391's valid multi-token squash message while making any call to generic `attributingCommits` fail the test. Confirm the test initially fails with `delivery-verification:attribution`.

## Task 2: Add the delivery-local canonical assertion

**File:** `scripts/task-tracker/lib/delivery-verification.mjs`

Derive the expected final attribution line from the verified intent and require one exact occurrence in the inspected commit message. Replace the per-token subject-only lookup with this assertion. Preserve all existing authority, reachability, merge-method, and byte checks.

## Task 3: Cover fail-closed variants

**File:** `scripts/tests/unit/task-tracker/lib/delivery-verification-attribution.test.mjs`

Cover missing, duplicated, reordered, malformed, and unauthorized token lines. Verify ordinary authorized bytes and external-recovery behavior remain compatible through the existing delivery suite.

## Task 4: Verify and deliver

Run the focused verification commands, generic commit-attribution tests, lint, formatting, and the governed Test gate. Obtain independent review, update the open governed branch/PR if required, and recover #1392's live receipt before resuming the remaining blocked chain.
