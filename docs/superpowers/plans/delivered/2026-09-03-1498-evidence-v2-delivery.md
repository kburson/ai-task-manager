# Explicit acceptance-to-PR delivery implementation plan

> **For agentic workers:** Use executing-plans inline, serially. No subagents.

**Goal:** Fulfil #1498, Task 3 of epic #1495, without enabling production v2 delivery.

**Architecture:** A strict delivery intent binds an immutable acceptance to one explicit provider PR, current provider head concurrency precondition, target and requested method. A delivery record is appended only after provider readback and independent Git content/method verification. The existing v1 path stays unchanged for unenrolled issues.

**Tech Stack:** Node 22+, ESM, built-in crypto/fs/child_process, existing evidence-v2 journal and real-Git/provider harness. No dependencies or database.

## Global constraints

Use the recorded #1498 worktree and #1496/#1497 foundations. Preserve v1 defaults and all original #1490/#1488/#1485/#1226 records, refs and worktrees. No production enrollment or delivery. Provider PR identity is explicit; expected head is only a concurrency check. Content proof and configured squash-only method proof are separate. Do not edit the pinned epic plan; its inherited test-path typo is corrected only in this child issue and plan.

### Task 1: Strict delivery records and intent resolution

Files: `scripts/task-tracker/lib/evidence-v2/{delivery,record-schema,journal-validation}.mjs`; `scripts/tests/unit/task-tracker/lib/evidence-v2/delivery.test.mjs`.

- [x] Write failing pure tests for explicit PR identity, exact repository/target/candidate acceptance, head concurrency, requested method and immutable return values.
- [x] Add exact `delivery-intent` and `delivery` payload shapes. Require typed references from intent to acceptance/candidate and from delivery to intent/acceptance; validate same-cycle and same-repository relationships and payload cross-fields.
- [x] Implement `resolveDeliveryIntent({acceptance,candidate,pr,policy,operation})`. Validate complete records, exact accepted subject/material, explicit provider PR ID/number, target identity, authorized method, canonical operation identity and current expected head. Return payload material only; journal wrapping remains `createRecord` ownership.
- [x] Run focused unit tests and schema/journal regression tests.

### Task 2: Observed content and method verification

Files: `scripts/task-tracker/lib/evidence-v2/delivery.mjs`; `scripts/tests/integration/task-tracker/lib/evidence-v2/delivery-flow.test.mjs`.

- [x] Add real-Git fixtures for metadata-only amend, multi-source squash, unchanged-tree rebase, rebase onto a changed target, dropped/reverted accepted bytes, and post-delivery source/target advancement.
- [x] Implement `verifyDelivery({intent,acceptance,candidate,observations,ports})`. Re-read the explicitly named PR, require exact repository/PR/target and pre-action head, inspect landed commit/tree and accepted material through Git ports, and return a strict delivery payload only after content verification.
- [x] Classify content equality independently from merge method. Preserve required configured method evidence; missing/contradictory squash proof refuses even when bytes match. A changed target integration tree requires a new candidate/verification/acceptance.
- [x] Treat later ordinary branch movement as historical observation. Explicit revert, dropped content, wrong landed object, or contradictory provider readback refuses current eligibility.

### Task 3: Intent-first provider action and ambiguous retry

Files: `scripts/tests/helpers/evidence-v2/{provider,provider-transport}.mjs`; the narrow v2 seams in `scripts/task-tracker/lib/{delivery-authority,delivery-verification,close-delivery-receipt}.mjs` and `scripts/task-tracker/verbs/deliver.mjs`.

- [x] Extend the synthetic provider with explicit PR inventory/read/action/readback and a physical-effects ledger. Keep production identities impossible in rehearsal.
- [x] Select v2 only through `selectEvidenceProtocol`. Append the intent through the #1497 journal before provider mutation; issue the provider action using the intent's exact PR and expected head; re-read and verify; append delivery after success.
- [x] On a lost response, reconcile the original operation/intent against provider and journal observations. Refuse a new operation, alternate PR or divergent bytes while the original outcome is uncertain. Assert exactly one physical provider delivery and one logical delivery record.
- [x] Keep all v1 exports/signatures and default paths unchanged. Run existing delivery authority, verification-attribution, provider-action, recovery and close-receipt suites.

### Task 4: Governed completion

- [ ] Run affected checks and full lint/format, commit as `[#1498]`, stamp/check each AC independently and create commit trace.
- [ ] Run isolated task Test once, record serial implementation review, review and Full-Auto approve. Verify the exact receipt before local merge-back to the epic, push and verify hosted CI. Relocate the binding after proven merged worktree cleanup and close through sanctioned CLI.

No test claim is earned by this plan. Each checkbox is updated only after its associated observed result.
