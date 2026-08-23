# GitHub PR Merge Timestamp Normalization Design

## Problem

After the sanctioned provider merged PR #1385, `/task deliver #1389` could not verify the live result. GitHub exposed `mergedAt` as `2026-08-23T03:57:33Z`, while the delivery domain requires the unique canonical millisecond representation `2026-08-23T03:57:33.000Z`.

The strict domain rule is intentional. Delivery ordering, intent comparison, and immutable receipts should not admit multiple textual representations of the same instant. The defect is that `createDefaultDeliverDeps.fetchPullRequest` forwards provider bytes directly into that domain.

## Decision

Normalize `mergedAt` at the GitHub pull-request adapter boundary with the existing `normalizeGitHubInstant` helper. A merged pull request must produce a canonical millisecond ISO instant before `verifyLiveDelivery` sees it. A missing or invalid provider timestamp must fail closed with a delivery adapter error.

The delivery verifier remains unchanged. It continues rejecting any noncanonical internal pull-request timestamp, preserving its role as the domain boundary guard.

## Alternatives Rejected

1. Relax `isCanonicalInstant` in delivery verification. This would admit multiple internal spellings and weaken immutable record ordering.
2. Normalize inside `verifyLiveDelivery`. This would mix provider repair into domain validation and conceal malformed internal callers.
3. Special-case the existing PR or fabricate a receipt. This would bypass live evidence and make recovery unauditable.

## Data Flow

1. `gh pr view --json ...mergedAt...` returns the provider snapshot.
2. `fetchPullRequest` normalizes a non-null `mergedAt` with `normalizeGitHubInstant`.
3. Invalid non-null values cause `deliver:pull-request-merged-at`; an unmerged pull request may retain `null`.
4. `verifyLiveDelivery` receives canonical internal data and performs its existing strict check, intent ordering, trunk reachability, merge-method verification, and receipt construction.

## Testing

Focused default-dependency tests will reproduce GitHub's whole-second value and require `.000Z` output. A separate test will provide a malformed merged timestamp and require fail-closed rejection. Existing delivery-verification tests remain green and continue proving that noncanonical internal inputs are rejected.

The live acceptance is recovery of intent `01M0PC83J1G7N2T7DZK0DJDCGC` for PR #1385: `/task deliver #1389` must observe merge commit `7c508fb6258390c577ad1091fa4827500e4e70e4`, write the receipt, and never emit a second merge action.

## Scope Boundaries

No schema changes, record rewrites, verifier relaxation, provider action changes, repeat merge, or unrelated timestamp cleanup are included.
