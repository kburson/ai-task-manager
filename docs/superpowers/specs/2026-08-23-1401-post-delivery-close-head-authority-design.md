# Post-Delivery Close Head Authority Design

## Context

Issue #1401 was discovered when closing #1397 after #1399 had been delivered from the same long-lived branch. #1397 retained matching Test and Review evidence, a uniquely matched merged PR, and a verified delivery receipt for its accepted source SHA. Close nevertheless refused because the worktree had legitimately advanced to #1399's later source SHA.

## Decision

Close will derive the accepted delivery head from the issue's matching Test and Review evidence. The current local HEAD remains a required well-formed observation, but it is not required to equal the historical accepted SHA after delivery.

Authority remains downstream and immutable: exactly one merged PR must have that accepted head, and the projected verified receipt must bind the same issue, PR, expected head, base, intent, and merge commit.

## Safety

The change does not authorize an untested source or use a later local commit as delivery evidence. Missing Agent Review, missing Test evidence, divergent Test and Review SHAs, ambiguous PRs, or absent/mismatched receipts still fail closed. No refs are rewound and no historical records are rewritten.

## Verification

The pure accepted-head test will model a later valid local HEAD and prove that matching Test/Review evidence still selects the delivered source. Negative cases cover malformed local observations and missing or divergent lifecycle evidence. Existing exact-head PR and receipt adversarial cases remain the authorization floor, followed by the complete governed suite and the pending live #1397 close.
