# Close Record Projection PR Selection Design

## Context

Issue #1397 was discovered after #1395 fixed the pure close receipt gate's pull-request selection. PR #1396 merged at the accepted head and delivery persisted a verified receipt. Close selected the right PR in the pure gate but still reported the receipt missing because its input loader had already replaced delivery records with an empty projection when the branch contained historical PRs.

## Decision

The close input loader will derive exact-head pull-request candidates from the already validated accepted Test and Review SHA. It will fetch and parse delivery comments only when exactly one candidate exists, and it will construct the parser context with that candidate's PR number.

Zero or multiple exact-head candidates retain an empty, non-authorizing projection. The pure #1395 selector remains unchanged and rechecks the same authority before terminal mutation.

## Safety

The delivery record parser and schemas do not change. No parser accepts records from another issue, repository, or pull request. Historical PR order and recency remain irrelevant. Test and Review evidence, live PR head, merge commit, intent, and receipt equality remain required.

## Verification

A focused input-loader test will model historical-first and historical-last PR lists and prove that comments are parsed under the current PR number. It will also prove that zero and duplicate exact-head candidates do not fetch comments or build an authorizing projection. Existing pure receipt-gate and convergence tests remain the regression floor.
