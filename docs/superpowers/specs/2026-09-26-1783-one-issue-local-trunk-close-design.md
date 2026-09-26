# #1783 One-Issue Local-Trunk Close Authorization Design

## Story Intent

- **Beneficiary:** A release operator closing a verified historical issue.
- **Capability:** Authorize one no-PR local-trunk close with a fresh, exact human decision and a durable audit trail.
- **Need:** The accepted code can already be on trunk while the issue lacks a PR delivery receipt, and the standing repository-wide local-trunk policy is too broad for one exception.
- **Value or failure prevented:** The operator can close the one verified issue without granting future agents general no-PR close authority or claiming that a PR was delivered.

## Boundary

Issue #1787 supplied the shared `aitm.workflow-exception/v2` delivery scope, Codex transcript authority, grant chain, and single-use journal. #1783 adds the separate `delivery.local-trunk-close-authorization` consumer. It does not classify a failed PR verifier as waived, change project-wide `fullAutoMerge`, create a GitHub PR, or weaken ordinary PR delivery.

The target is a top-level, commit-bearing issue in Review with no candidate PR and an accepted SHA already reachable from the configured trunk. The existing project-wide `local-trunk-lane` remains a separate standing policy. Child-to-epic and issue-resident no-commit paths retain their existing receipts.

## Operator Flow

1. `aitm workflow-exception prepare #N --input-file <proposal> --json` reads the issue, Test and Review receipts, configured trunk identity, live local and remote trunk, and complete PR inventory. It returns the exact `delivery.local-trunk-close-authorization` scope and an approval statement. Preparation is read-only.
2. The operator sends that exact statement as a fresh message in a supported Codex session. The statement names issue `#N`, repository, accepted SHA, resolved trunk ref, local-trunk lane, operation ID, and proposal digest. A general request to deliver an issue is not this approval.
3. `aitm workflow-exception record #N --input-file <request>` verifies the message in the current Codex transcript, validates the exact v2 scope, and appends a visible human-readable issue comment with the typed hidden grant. Revise and revoke use the existing revision chain. An unsupported host, stale or ambiguous message, missing scope field, or failed readback refuses.
4. `aitm close #N` re-reads the live issue, records, complete PR inventory, Test and Review evidence, trunk graph, and grant chain. Only the one no-PR local-trunk condition is authorized by the grant. Every other close gate remains active. It burns the operation through #1787's durable journal before publishing a typed local-trunk receipt and moving Review to Done.
5. On a retry, close reconciles the journal and receipt by exact operation and content. It returns the existing result when the same transaction completed; it never burns again, mints another operation, or applies the grant to a different issue.

## Scope and Authority

Use the existing `aitm.delivery-exception-scope/v1` keys with `exceptionKind: "delivery.local-trunk-close-authorization"`, `pullRequest: null`, and the new requirement ID `delivery.local-trunk-close-authorization`. Keep the exact repository, issue, accepted head SHA, base ref, resolved trunk ref, and `deliveryOperationId` in the canonical scope digest. The grant also carries a non-placeholder reason and finite expiry. V1 workflow exceptions cannot authorize this lane.

The delivery v2 validator admits this ID only with the local-trunk kind and a null PR. It must reject the PR invariant-waiver kind with this ID, a PR number in the local-trunk scope, multiple IDs, any hard guardrail ID, and all unknown kinds. The existing PR waiver validator continues to accept only its own eligible verifier IDs.

The approval source must be `codex-session/v1`, with `host-verified-user-message` and the exact statement generated from the prepared proposal. The recording actor cannot self-authorize. Full-Auto, a CLI flag, an agent-written issue comment, or a saved proposal is never authority.

## Close Proof

The local-trunk lane is eligible only when all these facts are freshly proven:

- The issue is open in Review, top-level, commit-bearing, bound to its recorded worktree and branch, with ordinary completion approval and required checkboxes.
- Exact Test and accepted Review evidence name the same accepted SHA; source attribution and every existing non-delivery gate remain valid.
- The complete PR inventory for the issue contains no delivery candidate. An unreadable, incomplete, or ambiguous inventory is indeterminate, not an empty inventory.
- The accepted SHA is a complete local Git object reachable from both the configured local trunk ref and independently fetched remote trunk ref. A shallow or unavailable graph refuses. The trunk ref names match the grant; a moving trunk tip is allowed only while reachability remains true.
- The v2 grant is active at its initial burn, exact to this repository, issue, SHA, trunk target, operation, requirement ID, and issue-body scope. Its fresh Codex user-message authority is independently revalidated.

Grant liveness and expiry are checked at the initial burn. A completed receipt instead verifies its pinned historical grant and burn, including authorization time before expiry; later expiry or revocation cannot erase a truthful completed event. A revocation effective before the burn, altered grant, missing burn, changed accepted SHA, changed trunk target, or lost reachability refuses.

## Durable Result

Publish an issue-resident `aitm.local-trunk-close-receipt/v1` record linked to the immutable grant revision, operation ID, burn OID, repository, issue, accepted SHA, trunk refs, authorization time, and reason digest. Its result is `authorized-local-trunk-close`, never `delivered` or a passed PR predicate. The visible issue comment states that the code was already on trunk and the operator authorized a one-issue no-PR close. The final close output and issue audit cite the same receipt and operation.

Publication follows the #1787 journal's burn and readback rules. Missing, duplicate, conflicting, or unreadable grant, burn, or receipt evidence is indeterminate. Close must not change Status to Done before the exact receipt has been verified. The receipt is independent of project-wide `.ai-task-manager/task-tracker.json` and survives agent sessions and worktree removal.

## Integration Points

- Extend `workflow-policy/catalog.mjs`, `exception-record.mjs`, `delivery-request.mjs`, and the `workflow-exception` prepare/readback path with a closed local-trunk kind.
- Add a local-trunk evidence evaluator that gathers complete PR inventory and Git reachability, and a pure eligibility decision reused by Explain and locked Close.
- Extend `close-delivery-receipt.mjs`, `close.mjs`, and the #1787 journal/consumption seam to publish and verify the typed local receipt. Do not route this through the PR intent or `github.merge-pull-request` provider action.
- Update help and workflow documentation to show the two-pass human approval and the distinct audit result.

## Verification

Unit tests cover exact scope validation, kind isolation, stale and mismatched human statements, expiry/revocation, accepted-SHA and trunk mismatch, PR-inventory ambiguity, reachability, replay, and historical receipt verification. Integration tests use a disposable Git repository and GitHub record seams to prove that one matching operation closes and retries idempotently, while another issue, SHA, repo, or future operation cannot use it. Regression tests preserve ordinary PR delivery, child-to-epic, no-commit, and standing local-trunk behavior.
