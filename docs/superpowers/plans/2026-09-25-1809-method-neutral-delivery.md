# #1809 Method-Neutral Delivery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task by task. Steps use checkbox (`- [ ]`) syntax for tracking. AITM owns issue binding, state, verification, review, and delivery.

**Goal:** Deliver a verified accepted PR through any provable GitHub merge method while retaining the suggested method and message as automatic-action preferences.

**Architecture:** Keep the immutable premerge intent as the exact instruction for an AITM-performed provider action. Verify an already merged PR from one fresh GitHub and Git observation, with method-specific integration and content evidence; a differing method or generated message is recorded as an observation. Publish a new receipt version that binds the accepted head, observed integration, and proof, and make Close independently replay that proof. Preserve all existing receipt and waiver versions for historical reads.

**Tech Stack:** Node.js ESM, `node:test`, Git, GitHub CLI, AITM comment records and lifecycle gates.

**Spec:** [#1809](https://github.com/kburson/ai-task-manager/issues/1809), including its Scope, Reproduction, Fix Direction, Acceptance Criteria, and Out of Scope. The historical #1784/#1785 records remain immutable evidence.

## Scope

Repair governed PR delivery verification, receipt recording, Close replay, read-only diagnosis, automatic-action capability reporting, regression fixtures, and workflow guidance. After code reaches trunk, use ordinary governed delivery and Close for live #1784, then finish #1809. Do not rewrite #1785, weaken accepted-head or attribution gates, or use an exception for a preference difference.

## Context

At the starting tree `66d576063cd5d69069bbd2289148a118cf99b37e`, `delivery-verification.mjs` rejects `observedMergeMethod !== intent.mergeMethod` and mismatched commit title/body. `delivery-records.mjs` correlates receipt method to intent method. `delivery-waiver-merge-method.integration.test.mjs` treats #1784/#1785 as a synthetic waiver case. The real PR's accepted head is `edaa8e402f340af3ca15b5b36ec845b038040d58`; its two-parent merge is `c862f2ba6e6d1a278fa0525f2a79599a5cc9a818`, with that head as second parent and tree `f6efaa724e7502761c26c8b2d146a5f3b5e43266`. The issue's original intent proposed squash and different commit text. `npm test` passed all 910 fast-lane files on the unchanged starting tree.

## Acceptance Criteria

- [ ] A faithful #1784/#1785 fixture succeeds through ordinary delivery and Close without consuming the historical merge-method waiver.
- [ ] Merge, squash, and rebase each have explicit accepted-source and integrated-content proof; contradictory or incomplete evidence refuses delivery.
- [ ] The receipt records the actual method, SHA, topology, title, message, and proof independently of the original action preference; Close verifies the immutable record against current authority.
- [ ] AITM automatic action retains the configured method and exact supplied commit text; missing host capability produces a typed refusal and supported manual next step.
- [ ] A read-only diagnosis evaluates all independently checkable blockers from one stable observation and never recommends a waiver for method or benign text differences.
- [ ] Legacy receipts, genuine waiver paths, CI, Review, source attribution, and trunk reachability remain enforced.
- [ ] Once released, #1784 reaches Done through ordinary deliver and Close; its historical waiver remains only prior-attempt evidence.

## Plan Metadata

- Priority: P1
- Size: XL
- Estimate: 28 hours
- Labels: bug
- Parent issue: #1809
- Decomposition: three ordered children, each below the 24-hour must-split threshold. Parent owns release and live #1784 recovery after child code is integrated.

## Story Intent

- **Beneficiary:** story owner and release operator
- **Capability:** verify and complete a proven accepted PR delivery through the merge method used on GitHub
- **Need:** a suggested squash method and exact message currently block a valid two-parent merge from receiving a delivery receipt
- **Value or failure prevented:** proven implementation can reach Done without an exception for a formatting preference while conflicting identity or content remains blocked

## Global Constraints

- Keep issue #1809 as the parent and use governed child creation and lifecycle commands. Child work follows the task order below; no child silently substitutes for #1809.
- The premerge intent remains immutable and still supplies exact bytes to the sanctioned `github.merge-pull-request` provider action. Never call `gh pr merge` or a shell merge for a governed action.
- Read-only observation must identify one repository, PR, accepted head, merged SHA, source inventory, trunk head, CI, Review, and issue attribution. A changed observation invalidates the proof before publication.
- Unknown topology, ambiguous source mapping, modified content, wrong PR or head, failed required checks, stale Review, unreachability, and conflicting attribution refuse. A missing canonical merge-message trailer is a warning only when independent attribution is complete.
- Keep v1-v4 intent/receipt reads and historical waiver provenance intact. A new observed-facts receipt must be canonical, immutable, and replayed by Close.
- Use exact #1809 issue attribution in commits, PR, Test, Review, delivery, and parent Close. Each child uses its own assigned number when hydrated.
- Run the root issue's declared verification commands, including fast and slow suites, lint, and format checks, at the exact accepted head before Review.

## Implementation Tasks

### Task 1: Prove observed merge integration and diagnose blockers

#### Story Intent

- **Beneficiary:** release operator
- **Capability:** determine whether an accepted PR's source and content reached trunk through merge, squash, or rebase
- **Need:** method preference and message equality currently substitute for proof of the observed integration
- **Value or failure prevented:** valid merges proceed and ambiguous or altered integrations stop with all genuine blockers visible

#### Files and delivery boundary

**Estimate:** 11 hours. This child owns read-only proof and diagnostics, not receipt publication or Close.

**Modify:** `scripts/task-tracker/lib/delivery-verification.mjs`, `scripts/task-tracker/verbs/deliver.mjs`, `scripts/task-tracker/lib/delivery-preflight.mjs`. **Create:** `scripts/task-tracker/lib/delivery-integration-proof.mjs` and focused unit tests. **Test:** `scripts/tests/integration/task-tracker/delivery-waiver-merge-method.integration.test.mjs` plus focused verifier tests.

**Interface:** `verifyObservedIntegration({ repository, pullRequest, acceptedHeadSha, mergedCommitSha, sourceCommits, inspectCommit, isAncestor, compareContent })` returns a frozen `{ method, mergeCommitSha, parents, tree, title, message, sourceMapping, contentProof }`. `diagnoseDeliverySnapshot(snapshot)` returns a closed list of typed predicate failures from that same snapshot. A successful proof requires the exact accepted head, complete source inventory, method-specific topology and content mapping, and merge-SHA reachability on the fetched trunk. It never consults the proposed method or message to decide integration identity.

- [ ] **Step 1: Add RED fixtures.** Reproduce the exact #1784 intent, accepted head, two parents, equal tree, observed title/body, and missing trailer. Add positive merge, squash, and multi-commit rebase fixtures with base advancement; add wrong head, changed tree/delta, incomplete inventory, ambiguous one-parent topology, unreachable merge, and contradictory attribution cases. Assert one diagnosis lists independent blockers together.
- [ ] **Step 2: Run focused tests RED.** Confirm failures are the current method/bytes comparisons and missing rebase proof, rather than malformed test data.
- [ ] **Step 3: Implement proof.** Use Git parent/tree and complete source history. For a two-parent merge, require the accepted head as the PR parent and prove the resulting integrated content against the first parent and accepted source delta; for a squash, prove the one-parent result against the complete source delta; for a rebase, prove a complete ordered source-to-replay mapping and final content. Refuse ambiguous rewrite histories. Treat commit text as observed data while retaining source and issue attribution checks.
- [ ] **Step 4: Make diagnosis read-only and complete.** Collect one immutable observation, evaluate independent PR, head, topology, content, CI, Review, attribution, and trunk predicates, and report all failures without publishing an intent or receipt. A dependency failure is typed indeterminate, not a skipped pass.
- [ ] **Step 5: Run focused tests GREEN.** Verify the real #1784 facts succeed without a waiver and each negative proof fails for its named predicate. Commit with the assigned child token.

**Verification Commands:**

```sh
node --test scripts/tests/integration/task-tracker/delivery-waiver-merge-method.integration.test.mjs scripts/tests/unit/task-tracker/lib/delivery-provider-action.test.mjs
```

**Acceptance criteria:** Exact observed integration proof is independent of the requested method and text; one stable read-only diagnosis lists all real blockers; incomplete or conflicting mapping refuses.

### Task 2: Publish observed-facts receipts and replay them at Close

#### Story Intent

- **Beneficiary:** story owner
- **Capability:** retain a truthful durable receipt for the implementation actually integrated on trunk
- **Need:** existing receipt correlation requires the observed method to equal the suggested method
- **Value or failure prevented:** Close can rely on independently verified delivery without rewriting intent or discarding historical waiver evidence

#### Files and delivery boundary

**Estimate:** 10 hours. Depends on Task 1's accepted proof interface. This child owns record schema, delivery publication, and Close replay.

**Modify:** `scripts/task-tracker/lib/delivery-records.mjs`, `scripts/task-tracker/lib/delivery-verification.mjs`, `scripts/task-tracker/lib/close-delivery-receipt.mjs`, `scripts/task-tracker/verbs/deliver.mjs`, `scripts/task-tracker/verbs/close.mjs`, and exact schema tests. **Test:** close trunk gate, workflow exception, delivery records, and idempotent retry suites.

**Interface:** Add an immutable receipt version whose `observedIntegration` carries `{ method, mergeCommitSha, parents, tree, commitTitle, commitMessage, contentProof }` and whose `intentId`, `prNumber`, `expectedHeadSha`, `baseRef`, and source digest remain correlated to the original intent. Keep `intent.mergeMethod`, `intent.commitTitle`, and `intent.commitMessage` unchanged. Close replays Task 1 proof and compares the canonical observed receipt, including method and message, before accepting it.

- [ ] **Step 1: Add RED record tests.** A proposed squash/observed merge must round-trip and replay; altered method, parent, tree, title, message, accepted head, source digest, or proof must fail. Existing v1-v4 records and waiver lineage must still parse exactly as before.
- [ ] **Step 2: Run focused tests RED.** Observe current `receipt-correlation`, method, or bytes refusals on the positive divergent case.
- [ ] **Step 3: Implement the versioned record and publication.** Consume Task 1's verified proof. Bind all observed facts canonically to one intent and receipt; publish at most one receipt per immutable operation. Keep automatic action's exact requested method/title/message and return a typed missing-capability next step if the host cannot perform it.
- [ ] **Step 4: Replay at Close.** Fetch current PR/trunk authority, reproduce the method-specific proof, and compare the entire canonical receipt. Preserve CI, Review, source attribution, and historical waiver checks; never infer delivery solely from a GitHub merged flag.
- [ ] **Step 5: Run focused tests GREEN.** Cover normal retry, already-merged current-head delivery, Close, and legacy/waived receipts. Commit with the assigned child token.

**Verification Commands:**

```sh
node --test scripts/tests/integration/task-tracker/verbs/close-trunk-delivery-gate.test.mjs scripts/tests/integration/task-tracker/verbs/workflow-exception.test.mjs scripts/tests/unit/task-tracker/lib/delivery-default-refusals.test.mjs
```

**Acceptance criteria:** The new receipt records and replays observed integration truth while preserving intent and legacy records; a method/text preference mismatch needs no waiver.

### Task 3: Finish regression coverage, capability guidance, and release runbook

#### Story Intent

- **Beneficiary:** release operator
- **Capability:** select a supported automatic or manual merge path and diagnose a refused delivery accurately
- **Need:** current guidance presents merge preferences as delivery gates and the historical fixture hides real #1784 message divergence
- **Value or failure prevented:** operators receive actionable capability limits and reproducible proof without seeking serial preference waivers

#### Files and delivery boundary

**Estimate:** 7 hours. Depends on Tasks 1 and 2. This child owns cross-method integration coverage and guidance; the parent owns release and live #1784 completion.

**Modify:** `scripts/tests/integration/task-tracker/delivery-waiver-merge-method.integration.test.mjs`, `scripts/tests/unit/task-tracker/lib/delivery-provider-action.test.mjs`, `scripts/tests/unit/task-tracker/lib/delivery-verification-catalog-ids.test.mjs`, `scripts/tests/integration/task-tracker/verbs/close-trunk-delivery-gate.test.mjs`, `docs/guides/workflow.md`, and the delivery help text. Add focused tests only where an independent behavior is uncovered.

- [ ] **Step 1: Replace synthetic #1784 facts.** Use the real original squash preference and proposed text, accepted head, two-parent merge, equal tree, and different GitHub title/body. Assert ordinary delivered receipt and Close without new waiver; assert the historical waiver remains readable but is not consumed.
- [ ] **Step 2: Add a method matrix.** Cover manual merge, squash, and rebase with matching and differing proposed preferences. For each, assert the observed receipt and negative identity/content/CI/Review/attribution cases. Check automatic-action bytes and typed missing capability.
- [ ] **Step 3: Update user guidance.** State the suggested automatic action, exact provider capability boundary, manual GitHub choice, observed receipt facts, and supported refusal remediation. Remove advice that requests a waiver for benign method or message differences; retain genuine exception and historical recovery instructions.
- [ ] **Step 4: Run declared suites and inspect the diff.** Run targeted integration, `npm run test:integration`, `npm run test:unit`, `npm test`, `npm run test:slow`, `npm run lint`, and `npm run format:check`. Resolve failures and commit with the assigned child token.

**Verification Commands:**

```sh
node --test scripts/tests/integration/task-tracker/delivery-waiver-merge-method.integration.test.mjs scripts/tests/unit/task-tracker/lib/delivery-provider-action.test.mjs scripts/tests/integration/task-tracker/verbs/close-trunk-delivery-gate.test.mjs
npm run test:integration
npm run test:unit
npm test
npm run test:slow
npm run lint
npm run format:check
```

**Acceptance criteria:** Faithful regression and method matrix pass; guidance distinguishes automatic preference from manual choice; all declared suites pass at the accepted head.

## Parent release and live recovery

After all children complete their sanctioned review and integration, reverify #1809's own ACs and all root verification commands at the exact candidate head. Use the governed Test/Review, PR, CI, expected-head provider action, delivery receipt, and Close. Then run ordinary `npx aitm deliver 1784` from #1784's recorded worktree using the released code and its original intent. Verify its new live receipt and run governed `npx aitm close 1784`. Keep the old waiver record visible as an earlier blocked attempt. If #1784 cannot be verified without an exception, leave both issues open and diagnose the failed predicate; do not assert #1809's last AC.
