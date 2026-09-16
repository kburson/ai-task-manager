# Close Comment Instant Normalization Design

## Context

Issue #1399 was discovered during the live close of #1397. Delivery persisted an exact-head receipt whose GitHub issue comment reported `created_at` as a normal whole-second RFC3339 instant. Close passed that provider value unchanged to the strict delivery-record parser, which accepts only canonical millisecond instants, and refused with `delivery-records:comment-created-at`.

## Decision

The close GitHub adapter will normalize every issue-comment `created_at` value with the existing shared `normalizeGitHubInstant` helper before constructing parser input. If normalization fails, close will refuse with a close-adapter-specific timestamp error before any record projection or terminal mutation.

The delivery-record parser will remain strict. Canonicalization belongs at the provider boundary, matching the existing delivery adapter.

## Safety

The change does not relax record schemas, timestamp validation, or exact-head authority. Missing, malformed, or out-of-range provider timestamps remain non-authorizing. PR selection, Test and Review SHA agreement, intent linkage, merge verification, and receipt equality remain unchanged.

## Verification

Focused close input-loader tests will use ordinary GitHub whole-second timestamps and assert canonical millisecond projection. They will also prove that invalid timestamps fail before records can authorize close. Existing delivery-record parser tests remain the strict-core regression floor, followed by the complete governed suite.
