# Delivery Readiness Without Provider Effects Implementation Plan

> **For agentic workers:** Follow this plan task by task with test-driven development and review checkpoints. The accepted #1558 WBS Task 16 remains the normative scope.

**Goal:** Explain current delivery readiness across supported lanes without provider or ledger effects, while ensuring execution independently refreshes exact-HEAD authority.

**Architecture:** Add a read-only delivery collector that selects the current lane from fresh issue, lineage, protocol, PR, receipt, review, CI, policy, configuration, and ledger observations. Reuse the existing delivery authority and preflight validators as the source of hard predicates; present their results through the closed action-decision contract. Keep intent/receipt writes, review requests, provider actions, and historical recovery in the sanctioned execution transaction, which re-reads authority before each effect.

**Tech Stack:** Node.js ESM, `node:test`, AITM action decisions, GitHub PR/issue/CI observations, delivery ledger records.

**Spec:** `docs/superpowers/specs/2026-09-15-1558-ask-the-script-guidance-design.md`; accepted WBS Task 16 in `docs/superpowers/plans/2026-09-16-1558-ask-the-script-guidance-hydration-wbs-r3.md`.

## Story Intent

- **Beneficiary:** delivery operator
- **Capability:** inspect whether a release is presently authorized at the exact accepted head
- **Need:** delivery entry mixes observable authorization with provider and ledger mutations
- **Value or failure prevented:** a ready explanation cannot substitute for the guarded provider mutation boundary or act on stale approval

## Global Constraints

- Explanation is advisory, never an authorization capability. Every execution effect re-reads current authority under its existing lock and binds `expectedHeadSha` to the accepted PR head.
- Preserve the seven-field operational decision, all known simultaneous blockers/warnings/human requests, typed args, and explicit indeterminacy on incomplete required reads.
- No provider action, review request, issue comment, intent/receipt write, lock/session/board mutation, or probe in explanation. Missing provider-action capability is a blocker, never shell merge guidance.
- The explicit historical recovery lane remains execution-owned by `validateHistoricalRecoveryPreflight`; unsupported targeted explanations are `action-not-explain-ready`/indeterminate, never ready.
- Preserve v2 protocol routing, no-commit authority, idempotent already-delivered results, merge-method reconciliation, and historical reconstruction protections.
- Keep leading `[#1668]` commit attribution; integrate into `feature/epic/1558`, not trunk.
- Planned Size `XL`, focused human Estimate `22.5h`; re-estimate and revisit decomposition at 24h or a fourth independent implementation unit.

## File Map

- Create `scripts/task-tracker/lib/action-decision/deliver.mjs`: read-only lane collection, current delivery authority/preflight projection, and typed operational verdict.
- Modify `scripts/task-tracker/lib/action-decision/evaluate.mjs`, `navigation.mjs`, and `contract.mjs` only to route and validate delivery decisions and required coded values.
- Modify `scripts/task-tracker/verbs/deliver.mjs` to share pre-effect predicates and refresh them at the existing action/comment/provider boundaries without accepting a prior decision as input.
- Modify `scripts/task-tracker/lib/delivery-preflight.mjs` and `delivery-authority.mjs` only where a pure predicate or diagnostic seam is needed; keep their execution refusal semantics.
- Create `scripts/tests/integration/task-tracker/lib/action-deliver.test.mjs`; extend narrow delivery-provider, real-PR, manual-code-review, action-navigation, and refusal-inventory tests only where parity requires it.

### Task 1: Characterize delivery lanes with failing paired tests

- [ ] Inventory `runDeliver` and `createDefaultDeliverDeps` read/effect calls for child-lineage, v2, no-commit, open PR, merged PR, existing intent/receipt, exact-head advancement, and explicit method/historical reconciliation. Record the first effect boundary in each lane.
- [ ] In `scripts/tests/integration/task-tracker/lib/action-deliver.test.mjs`, add a fixture that compares `evaluateAction({ actionId: 'deliver', ... })` with the existing `runDeliver` preflight/refusal on the same immutable observations. Cover valid open and merged PRs, no-commit, attribution/base/method mismatch, CI, protected-branch rules, exact-head human approval, ledger conflict, missing provider capability, and failed required reads.
- [ ] Assert explanation has zero calls to provider action, review request, issue comment, intent/receipt write, lock/session/board mutation, or probes. An explicit historical recovery variant without collector parity must be indeterminate, not ready.
- [ ] Run `node --test scripts/tests/integration/task-tracker/lib/action-deliver.test.mjs` and retain RED evidence showing the missing delivery collector/routing, not a fixture setup error.

### Task 2: Build the read-only collector and coded decision

- [ ] Use a command-local observation attempt for issue/lineage/protocol, current branch and local/Test/Review heads, PR inventory and selected PR, checks, repository merge methods, review authorization, manual-code-review decision, dirty paths, commit subjects, provider capability, and delivery ledger. Retain full source identity and observation time internally; never persist a decision as authority.
- [ ] Apply `resolveAcceptedDeliveryAuthority` then the appropriate `validateDeliveryPreflight` or `validateMergedDeliveryPreflight`; classify no-commit and already-delivered ledger cases with their existing pure predicates. Keep unavailable, contradictory, or partial reads indeterminate or blocked with typed causes. Preserve waiver-versus-passed and configured-provider constraints.
- [ ] Route `deliver` in `scripts/task-tracker/lib/action-decision/evaluate.mjs` to the collector, validate the closed seven-field result, and add only necessary registered blocker/remediation codes. Navigation may select a sanctioned delivery action only from a fresh supported decision; no recovery command is inferred from prose.
- [ ] Run the focused `action-deliver.test.mjs` and existing `delivery-provider-action`, `delivery-real-pr-evidence`, and `manual-code-review-delivery` tests until GREEN.

### Task 3: Refresh execution authority at effect boundaries

- [ ] Refactor `runDeliver` to call shared pre-effect predicates after fresh locked reads. Before an intent/comment, review request, or provider action, revalidate relevant PR head, CI/review authority, ledger projection, and `expectedHeadSha`; a prior explanation object is never an execution input.
- [ ] Add paired tests: a ready explanation followed by changed PR HEAD, revoked human approval, changed CI, or changed ledger must refuse before provider action. A provider transport or comment-readback failure after a ready preflight is an execution failure, not retrospective readiness.
- [ ] Preserve idempotent already-delivered behavior and external/historical reconstruction proof. Keep `validateHistoricalRecoveryPreflight` as execution authority for explicit recovery; a normal v1 explanation does not silently offer that lane.
- [ ] Run issue VC1 exactly: `node --test scripts/tests/integration/task-tracker/lib/action-deliver.test.mjs scripts/tests/unit/task-tracker/lib/delivery-provider-action.test.mjs scripts/tests/unit/task-tracker/lib/delivery-real-pr-evidence.test.mjs scripts/tests/unit/task-tracker/lib/manual-code-review-delivery.test.mjs`.

### Task 4: Verify and hand off

- [ ] Run `npm run lint`, `npm run format:check`, `npm test`, `npm run test:integration`, and `npm run test:slow`; inspect the changed-path diff and refusal inventory. Do not reinterpret a transport failure as a green preflight.
- [ ] Commit with leading `[#1668]`, individually stamp the two root ACs at the final HEAD, and run governed Test and Review. Fast-forward the reviewed child into `feature/epic/1558`, verify the integrated branch, push it, and close #1668 through AITM Full-Auto.
