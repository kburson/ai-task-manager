# Close Review Authorization Accepted-SHA Design

## Context

Issue #1403 was discovered when #1397 close progressed past historical delivery-head resolution but still rejected its matching Full-Auto approval. Close replaced the valid accepted SHA with null whenever the shared worktree's current HEAD had advanced.

## Decision

Close will pass `gateInput.acceptedSha` directly to the shared review-authorization resolver. That accepted SHA has already passed Test/Review lifecycle validation. Approval evidence must still name the exact same SHA, and Full-Auto standing authorization still depends on current session/project policy.

## Safety

The authorization resolver is unchanged: wrong-SHA approval, disabled Full-Auto policy, and missing human evidence remain non-authorizing. The exact-head merged-PR and verified-receipt gate still runs immediately afterward. Current local HEAD cannot substitute for the accepted delivered SHA.

## Verification

A close wiring regression will inject a historical accepted SHA and a later local HEAD, then assert that authorization receives the accepted SHA. It will also retain the refusal-before-terminal-effects cases. Shared authorization unit tests and the complete governed suite remain the regression floor.
