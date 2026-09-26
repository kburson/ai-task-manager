# #1783 One-Issue Local-Trunk Close Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task by task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a release operator authorize exactly one verified no-PR local-trunk close through a fresh Codex user message, with a durable distinct receipt and no project-wide policy change.

**Architecture:** Extend the #1787 workflow-exception/v2 delivery scope, authority resolver, and single-use journal with a separate local-trunk kind. A pure close eligibility evaluator validates exact Test/Review evidence, complete PR absence, and local and remote trunk reachability. Close publishes and verifies a typed local receipt before Done; ordinary PR and standing local-trunk paths remain separate.

**Tech Stack:** Node.js 26 ESM, GitHub issue comments/Projects, local Git graph, `node:test`, AITM governed verbs.

**Spec:** `docs/superpowers/specs/2026-09-26-1783-one-issue-local-trunk-close-design.md`

## Global Constraints

- Only a fresh, exact, host-verified Codex user message can authorize the one-issue lane. Agent text, Full-Auto, CLI flags, and proposal files cannot grant it.
- Scope binds repository, issue, accepted SHA, base/ref target, null PR, one requirement ID, one operation ID, and bounded expiry.
- All ordinary completion, Test, Review, dependency, attribution, worktree, and Git proof gates remain active. No PR verifier predicate is waived.
- Never change project-wide `fullAutoMerge` or classify the local-trunk result as ordinary PR delivery.
- Preserve #1787 journal replay and readback guarantees across concurrent hosts and uncertain writes.
- Use AITM issue #1783 and `[#1783]` attribution throughout. Start by verifying the active binding and self-link in this worktree.

## Story Intent

- **Beneficiary:** A release operator closing a verified historical issue.
- **Capability:** Authorize one no-PR local-trunk close with a fresh, exact human decision and a durable audit trail.
- **Need:** The accepted code is already on trunk without a PR receipt, while the standing local-trunk policy grants broader authority.
- **Value or failure prevented:** The one issue can close without granting future agents no-PR close authority or falsely claiming PR delivery.

## File Responsibilities

- `scripts/task-tracker/lib/workflow-policy/catalog.mjs`, `exception-record.mjs`, `delivery-request.mjs`, `delivery-scope.mjs`: closed local-trunk requirement and v2 request/record validation.
- `scripts/task-tracker/verbs/workflow-exception.mjs`: read-only exact preparation and host-verified record/revise/revoke for the local kind.
- `scripts/task-tracker/lib/local-trunk-close-proof.mjs`: pure eligibility verdict over fresh complete evidence; no mutation capability.
- `scripts/task-tracker/lib/local-trunk-close-receipt.mjs`: typed receipt codec and exact pinned historical verification.
- `scripts/task-tracker/lib/close-delivery-receipt.mjs`, `scripts/task-tracker/verbs/close.mjs`, `scripts/task-tracker/lib/action-decision/close.mjs`: shared close proof, journal burn/publication, read-only explanation, and recovery.
- `docs/guides/workflow.md` and command-surface help: operator instructions and truthful result vocabulary.

## Implementation Tasks

### Task 1: Admit the Closed Local-Trunk Scope

#### Story Intent

- **Beneficiary:** A release operator preparing a one-issue close grant.
- **Capability:** Validate a closed local-trunk scope and requirement ID.
- **Need:** The PR waiver schema must not accidentally admit no-PR authority.
- **Value or failure prevented:** Only exact local-trunk grants can reach the authority resolver.

#### Files

**Files:** Modify `scripts/task-tracker/lib/workflow-policy/catalog.mjs`, `exception-record.mjs`, `delivery-request.mjs`, `delivery-scope.mjs`; create `scripts/tests/unit/task-tracker/lib/local-trunk-close-scope.test.mjs`.

**Interfaces:** Produce one local-trunk requirement ID and a v2 delivery-scope validator accepted only for `exceptionKind: delivery.local-trunk-close-authorization` with `pullRequest: null`. Reuse `buildDeliveryScope` and canonical digest; do not create a parallel grant schema.

- [ ] Write tests for one exact local scope and for PR-kind, PR-number, extra-ID, repo, issue, SHA, trunk-ref, operation, and expiry mismatches.
- [ ] Run the focused test and confirm it fails for the missing local-kind support.
- [ ] Implement the smallest schema/catalog extension and run the focused test green.
- [ ] Run the existing #1787 scope and PR-waiver tests; verify no ordinary policy change.

**Verification Commands:**

```sh
node --test scripts/tests/unit/task-tracker/lib/local-trunk-close-scope.test.mjs
```

### Task 2: Prepare and Record Host-Verified Authority

#### Story Intent

- **Beneficiary:** A release operator authorizing one historical close.
- **Capability:** Prepare and record a fresh host-verified decision.
- **Need:** A saved request or agent text cannot establish human authority.
- **Value or failure prevented:** The issue has a visible, attributable, revocable grant for one operation.

#### Files

**Files:** Modify `scripts/task-tracker/verbs/workflow-exception.mjs`, `scripts/task-tracker/lib/workflow-policy/delivery-request.mjs`, `delivery-waiver-authority.mjs`; create `scripts/tests/integration/task-tracker/verbs/local-trunk-close-authority.test.mjs`.

**Interfaces:** Add a read-only local-trunk proposal path to existing `prepare`; its approval statement names local-trunk lane, exact scope, operation, and digest. `record`/`revise`/`revoke` retain the existing Codex transcript verifier and issue comment chain.

- [ ] Write failing tests for read-only preparation, exact statement, fresh user-message proof, unsupported host, agent/source mismatch, replay, revocation, and visible typed record readback.
- [ ] Run the focused test red, implement the local-kind dispatch without weakening the PR path, then run it green.
- [ ] Test that generic “deliver #N” text does not satisfy the prepared local-trunk statement.

**Verification Commands:**

```sh
node --test scripts/tests/integration/task-tracker/verbs/local-trunk-close-authority.test.mjs
```

### Task 3: Prove a No-PR SHA Already on Trunk

#### Story Intent

- **Beneficiary:** A release operator checking trunk delivery.
- **Capability:** Prove one accepted SHA is already on trunk without a PR.
- **Need:** A missing PR receipt alone cannot prove delivery.
- **Value or failure prevented:** Close can distinguish genuine trunk reachability from incomplete or conflicting evidence.

#### Files

**Files:** Create `scripts/task-tracker/lib/local-trunk-close-proof.mjs`, `scripts/tests/integration/task-tracker/local-trunk-close.integration.test.mjs`; modify close read ports in `scripts/task-tracker/verbs/close.mjs` and `scripts/task-tracker/lib/action-decision/close.mjs`.

**Interfaces:** The pure evaluator consumes complete PR inventory, exact Test and accepted Review SHAs, configured ref names, complete local and remote Git observations, and current grant scope. It returns `satisfied`, `authorized-local-trunk-close`, `missing`, or `indeterminate` with stable refusal IDs. Explain and locked Close use the same evaluator with fresh read ports.

- [ ] Write failing disposable-repository tests for accepted-SHA reachability, local/remote graph disagreement, shallow or missing objects, PR ambiguity, exact Test/Review mismatch, and grant-scope mismatch.
- [ ] Run red, implement the proof seam and read adapters, then run green.
- [ ] Recheck the branch/worktree and every existing close gate at effect time; do not treat an empty failed PR read as no PR.

**Verification Commands:**

```sh
node --test scripts/tests/integration/task-tracker/local-trunk-close.integration.test.mjs
```

### Task 4: Consume Once and Publish a Distinct Close Receipt

#### Story Intent

- **Beneficiary:** A release operator finalizing a verified issue.
- **Capability:** Consume one grant and publish a typed local-trunk close receipt.
- **Need:** Retries and concurrent hosts could otherwise reuse or lose authority.
- **Value or failure prevented:** One completed close remains auditable and idempotent without granting future closes.

#### Files

**Files:** Create `scripts/task-tracker/lib/local-trunk-close-receipt.mjs`, `scripts/tests/unit/task-tracker/lib/local-trunk-close-receipt.test.mjs`; modify `scripts/task-tracker/lib/close-delivery-receipt.mjs`, `scripts/task-tracker/lib/delivery-waiver-consumption.mjs`, and `scripts/task-tracker/verbs/close.mjs`.

**Interfaces:** Reuse the #1787 journal burn key and readback transaction. Publish `aitm.local-trunk-close-receipt/v1` after confirmed burn and before Done. Pin grant revision, operation, burn, SHA, refs, reason digest, and authorization time. A retry reuses only the exact completed transaction.

- [ ] Write failing tests for first burn, uncertain publication, exact retry, competing host, different intent or issue, expired-after-burn verification, pre-burn revocation, tampered receipt, and incomplete journal.
- [ ] Run red, implement receipt codec and close integration, then run green.
- [ ] Verify issue output and final audit say `authorized-local-trunk-close`, not `delivered` or PR-waiver `passed`.

**Verification Commands:**

```sh
node --test scripts/tests/unit/task-tracker/lib/local-trunk-close-receipt.test.mjs
```

### Task 5: Preserve Existing Lanes and Complete Operator Guidance

#### Story Intent

- **Beneficiary:** A maintainer preserving existing delivery behavior.
- **Capability:** Keep every existing delivery lane intact while documenting the new operator flow.
- **Need:** A new close branch could weaken ordinary PR and child/no-commit gates.
- **Value or failure prevented:** Existing issues retain their proof rules and operators can use the new lane safely.

#### Files

**Files:** Modify `docs/guides/workflow.md`, command-surface help; extend `scripts/tests/unit/task-tracker/lib/delivery-default-refusals.test.mjs` and `scripts/tests/integration/task-tracker/lib/action-close.test.mjs`.

**Interfaces:** The operator guide shows prepare, exact fresh approval, record, and close. Regression cases preserve ordinary PR, PR waiver, child-to-epic, no-commit, and standing local-trunk paths with unchanged project config.

- [ ] Write regression tests for each existing lane and for a local-trunk request that tries to authorize a PR failure.
- [ ] Run red where coverage is absent, update help/docs and any needed isolation logic, then run green.
- [ ] Run `npm test`, `npm run test:slow`, `npm run lint`, and `npm run format:check` at the final committed head. Review failures before any Test or Review promotion.

**Verification Commands:**

```sh
node --test scripts/tests/unit/task-tracker/lib/delivery-default-refusals.test.mjs scripts/tests/integration/task-tracker/lib/action-close.test.mjs
```

## Root Integration and Delivery

- Update #1783 AC, VC, DoD, commit trace, deep-dive, and Plan evidence through sanctioned AITM commands.
- Integrate the children in their required sequence, run exact-head verification and semantic Review, then complete governed delivery and Close for #1783.
