# Accepted-Head Close PR Selection Design

## Context

Issue #1395 was discovered while closing #1393 after PR #1394 had merged and its delivery receipt had been verified. The source branch also retained historical PR #1391. The delivery verb correctly selected PR #1394 by exact source head, but the close receipt gate rejected the unfiltered two-PR list as ambiguous before comparing either head SHA.

## Decision

The close receipt gate will filter the supplied pull requests by the already validated `acceptedSha`, then require exactly one match. All existing checks will run against that selected pull request: merged state, source branch, delivery target, merge commit, projected live intent, and matching receipt.

Zero exact-head matches and multiple exact-head matches remain ambiguous and fail closed. Array order, recency, and branch name alone provide no authority.

## Compatibility and Safety

The input and receipt schemas do not change. Child-lineage and authorized local-trunk skips remain unchanged. Exact Test and Review evidence remains the authority for `acceptedSha`, and close still performs no terminal mutation before the delivery receipt gate succeeds.

## Verification

Focused tests will cover historical-first and historical-last lists, zero exact-head matches, duplicate exact-head matches, and the existing merged/ref/receipt failures. The governed repository suite remains the final verification floor.
