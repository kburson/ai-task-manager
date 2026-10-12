The failure is a lifecycle-contract mismatch, not missing review execution. Review already loads and revalidates `aitm.workflow-exception/v1`, records `review:waived` with the requirement and authority record, and deliberately avoids an Agent Review Passed stamp. Legacy delivery then discards that typed outcome: `runDeliver`, `deliverNoCommit`, `delivery-preflight.mjs`, and `delivery-authority.mjs` all reduce review authority to `agentReviewPassed === true`.

### Files to edit

- `scripts/task-tracker/lib/delivery-review-authority.mjs` (new): pure typed resolver for `passed` versus `waived` review authority, exact accepted SHA, and fail-closed refusal categories.
- `scripts/task-tracker/lib/terminal-review-handoff.mjs`: expose the current terminal review outcome so delivery can distinguish `review:passed` from `review:waived` and reject a closed or superseded handoff.
- `scripts/task-tracker/lib/delivery-authority.mjs`: consume accepted typed review authority instead of treating the `agentReviewPassed` boolean as the only possible authority.
- `scripts/task-tracker/lib/delivery-preflight.mjs`: require a valid typed review-authority object for current-head, merged, historical-recovery, and historical-reconstruction preflight.
- `scripts/task-tracker/verbs/deliver.mjs`: resolve review authority once for PR and no-commit delivery, reloading the current workflow boundary for waived outcomes and preserving ordinary passed-review behavior.
- `scripts/tests/unit/task-tracker/lib/delivery-provider-action.test.mjs`: prove pure preflight accepts a typed waiver without relabeling it and rejects invalid review authority.
- `scripts/tests/unit/task-tracker/verbs/deliver.test.mjs`: prove live PR delivery revalidates the current exception and refuses missing, stale, revoked, wrong-scope, wrong-requirement, or wrong-head authority.
- `scripts/tests/unit/task-tracker/verbs/deliver-no-commit.test.mjs`: prove the no-commit branch follows the same authority contract.
- `scripts/tests/integration/task-tracker/lib/terminal-review-handoff.test.mjs`: prove the terminal outcome parser distinguishes passed, waived, and closed handoffs.

### Step-by-step implementation plan

1. Add failing unit tests for a valid waived outcome and for fail-closed variants before changing production code.
2. Introduce a frozen typed result whose outcome is exactly `passed` or `waived`, with the accepted SHA and, for a waiver, the requirement ID plus workflow-exception record identity/revision.
3. Extend the terminal-review helper to return the latest open terminal outcome instead of only a boolean.
4. In delivery runtime wiring, keep the existing passed-review resolver unchanged; when it is false, require an open `review:waived` terminal event and reload the workflow boundary for `review.semantic-resident` using the fresh issue body and GitHub comment records.
5. Accept the waived branch only when the live boundary is policy-compatible, the exact semantic requirement is waived, the authority matches the durable Review event, and the accepted SHA equals the current Test receipt. Treat policy unavailability, revocation, scope drift, wrong requirement, authority mismatch, or head mismatch as a specific review-authority refusal.
6. Pass the typed result through PR, historical, merged, and no-commit delivery paths. Never set `agentReviewPassed` to true for a waiver and never stamp Agent Review Passed.
7. Run focused tests, then the repository precommit and full Test-stage verification commands.

### Test additions

- `delivery-provider-action.test.mjs`: valid typed waiver, malformed result, wrong accepted SHA, and unchanged passed path.
- `deliver.test.mjs`: current live waiver acceptance plus absent, revoked, stale/scope-mismatched, wrong-requirement, authority-mismatched, and wrong-head refusals.
- `deliver-no-commit.test.mjs`: valid waiver acceptance and invalid waiver refusal for issue-resident delivery.
- `terminal-review-handoff.test.mjs`: latest open terminal outcome is `passed` or `waived`; later lifecycle events close it.

### Identified risks

- Delivery has four legacy preflight modes plus an early no-commit branch; changing only the ordinary open-PR path would leave inconsistent enforcement.
- Workflow exception validity depends on fresh issue scope and exhaustive GitHub record history. Cached Review-time evidence cannot authorize delivery by itself.
- A terminal timing event proves Review reached a waived outcome but does not independently prove the current authority remains valid; both durable event and live policy must agree.
- Evidence-v2 dispatch occurs before the legacy delivery path. This defect will not alter evidence-v2 semantics unless its own delivery implementation uses the same legacy seam.
- Existing tests and callers construct `agentReviewPassed` booleans. Compatibility should be preserved at external test seams while production logic stops coercing waived into passed.

### Sibling sub-issues to spawn

None. The repair is cohesive and bounded to one delivery authority seam.

## Dependency Map

Depends on: none
Blocks: `kburson/ai-peer-review#60` (delivery), then `kburson/ai-peer-review#61` (serial successor)
