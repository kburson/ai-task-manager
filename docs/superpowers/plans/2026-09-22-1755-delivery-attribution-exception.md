# Scoped Delivery Attribution Exception Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permit one explicitly authorized mixed-history PR delivery while preserving all other AITM gates and truthful audit evidence.

**Architecture:** A separate GitHub-backed exception record binds a host-verified user message to the complete ordered PR source inventory and exact per-commit mappings. Delivery evaluates that record only after ordinary attribution refuses, re-reads the PR before authorizing a provider action, and carries `waived` attribution through intent, verification, and receipt.

**Tech Stack:** Node.js 26, ESM, `node:test`, GitHub CLI/GraphQL, AITM record envelopes.

**Spec:** `docs/superpowers/specs/2026-09-22-1755-delivery-attribution-exception-design.md`

## Global Constraints

- Keep the `workflow-policy/catalog.mjs` restriction against commit provenance waivers.
- No environment flag, generic force, label, ordinary comment, or agent-authored authorization.
- No ai-peer-review mutation, paid provider, npm publication, or new issue.
- User authorization for ai-peer-review #39 is a separate future operation.
- All existing delivery gates, exact-head CI, and protected provider action remain mandatory.

## Story Intent

- **Beneficiary:** AITM delivery operator
- **Capability:** authorize exact attribution for historical source commits during one PR delivery
- **Need:** immutable mixed history currently blocks delivery after valid Test, Review, and CI evidence
- **Value or failure prevented:** a reviewed PR reaches trunk without rewriting accepted history or silently bypassing provenance checks

## Implementation Tasks

---

### Task 1: Canonical source inventory and mapping evaluator

**Files:** Create `scripts/task-tracker/lib/delivery-attribution-exception.mjs`; modify `scripts/task-tracker/lib/delivery-attribution.mjs`; test `scripts/tests/unit/task-tracker/lib/delivery-attribution-exception.test.mjs`.

**Interfaces:** `createDeliverySourceScope({repository, issueNumber, prNumber, baseRef, headRef, expectedHeadSha, sourceCommits})` returns frozen canonical scope plus `sourceDigest`; `evaluateDeliveryAttributionException({scope, mappings, authorization})` returns sorted `attributionTokens`, deterministic commit text, and a `waived` disposition. Reject every extra, missing, or duplicate mapping and every mutation of the ordered source `(oid, messageHeadline)` inventory.

- [ ] Write a failing test with two canonical subjects and one single-parent unattributed subject; assert ordinary `buildDeliveryCommitText` throws, then assert the new evaluator yields `[#39]` and `[#88]` tokens only when SHA mapping is exact.
- [ ] Run `node --test scripts/tests/unit/task-tracker/lib/delivery-attribution-exception.test.mjs` and observe the missing API failure.
- [ ] Implement canonical JSON hashing, strict field/subject/SHA validation, exact mapping set equality, and deterministic token/message construction. Export a parser from `delivery-attribution.mjs` only if the evaluator needs it; do not relax the ordinary builder.
- [ ] Add negative tests for subject/SHA/order mutation, wrong scope, duplicate/missing/extra mapping, wildcard, malformed token, top-level-token absence, and duplicate source SHA. Run the focused test and confirm green.
- [ ] Commit the tested boundary with a `[#1755]` subject.

### Task 2: Separate immutable authorization record and command

**Files:** Create `scripts/task-tracker/lib/delivery-attribution-exception-record.mjs` and `scripts/task-tracker/verbs/delivery-attribution-exception.mjs`; modify command dispatch/catalog and `scripts/lib/self-doc.mjs`; test `scripts/tests/integration/task-tracker/verbs/delivery-attribution-exception.test.mjs`.

**Interfaces:** `prepare` prints exact scope and the required authorization statement; `record` verifies `aitm.authorization-source/v1` via the existing host transcript loader and appends a typed record envelope; `show` resolves only one active head; `revoke` and `supersede` append linked revisions. The evaluator consumes only the current valid record, never a request file or ordinary comment.

- [ ] Write failing CLI tests proving `prepare` has no writes and `record` refuses agent-authored, unverifiable, or statement-mismatched sources. Include a valid host user message fixture that names the exact scope digest.
- [ ] Run the integration test and observe the missing command/record failure.
- [ ] Implement strict request and envelope schemas, canonical proposal digest, host authority resolution, GitHub comment append/readback, chain resolution, expiry, revocation, supersession, and transport reconciliation. Give the command explicit help for the two steps.
- [ ] Add negative tests for wrong repo/issue/PR/branch/head, expired or competing records, duplicate operation, altered comment, and exact idempotent record retry. Run the focused integration test and confirm green.
- [ ] Commit the tested record and command boundary with a `[#1755]` subject.

### Task 3: Delivery preflight, last-second revalidation, and retry binding

**Files:** Modify `scripts/task-tracker/lib/delivery-preflight.mjs`, `scripts/task-tracker/verbs/deliver.mjs`; extend focused tests in `scripts/tests/unit/task-tracker/lib/delivery-attribution-exception.test.mjs` and `scripts/tests/integration/task-tracker/verbs/delivery-attribution-exception.test.mjs`.

**Interfaces:** `runDeliver` loads the current exception only after ordinary source attribution refuses, matches the PR GitHub source inventory, and re-fetches PR/head/commits before outputting the provider-action envelope. A retry must reuse the same authorized intent bytes; changed scope or a different intent ID refuses.

- [ ] Write a failing delivery-flow test for default refusal, then valid mixed-history intent and changed-head or reordered-commit refusal immediately before the provider action.
- [ ] Run the focused tests and observe the expected failure.
- [ ] Thread full PR source commits through preflight, query the exception record from the issue's immutable comment ledger, and add the last-second GitHub reread. Retain all unrelated preflight and provider-action checks.
- [ ] Add tests for clean-tree, CI, ownership, lifecycle, and binding refusals under a valid exception; assert exact retry succeeds and new operation reuse fails. Run focused tests and confirm green.
- [ ] Commit the tested delivery integration with a `[#1755]` subject.

### Task 4: Truthful intent, verification, and receipt

**Files:** Modify `scripts/task-tracker/lib/delivery-records.mjs`, `scripts/task-tracker/lib/delivery-verification.mjs`, `scripts/task-tracker/verbs/deliver.mjs`; extend both focused test files.

**Interfaces:** New versioned intent/receipt fields carry `attributionDisposition: 'waived'`, exception record ID, source digest, mappings, host message reference, recording actor, and operation ID. Old schemas remain readable. Verification refuses a waived intent without a matching active record and unchanged source inventory.

- [ ] Write failing tests for a visible `waived` receipt, exact authorized mappings, and refusal to relabel a normal pass as waived or a waiver as passed.
- [ ] Run the focused tests and observe schema/receipt failures.
- [ ] Version the record schemas and validators, preserve legacy parsing, propagate exception fields through intent/verification/receipt builders and visible comment rendering, and verify live merge attribution against the derived tokens.
- [ ] Add tests for replay, stale/revoked record after intent, changed inventory, and truthful merge verification. Run focused tests and confirm green.
- [ ] Commit the tested receipt change with a `[#1755]` subject.

### Task 5: Operator docs, full verification, package, PR, delivery

**Files:** Modify `skill/shared/rules/deliver.md`, `docs/guides/workflow.md`, `package.json` if package contents require it; test package smoke coverage under `scripts/tests/integration/task-tracker/verbs/delivery-attribution-exception.test.mjs`.

**Interfaces:** Help and docs describe read-only preparation, exact user message authorization, record/show/revoke/supersede, and default refusal. The package includes every runtime module and guide.

- [ ] Write a failing package smoke assertion that the packed file list contains the command, evaluator, record schema, and guide.
- [ ] Run the integration test and observe the missing-doc/package failure.
- [ ] Update help, rule, guide, and package file list; run the focused test to green.
- [ ] Run `npm run format:check`, `npm run lint`, `npm test`, `npm run test:slow`, package build/validation, and inspect exact outputs. Repair only evidenced failures, then repeat the affected gate.
- [ ] Push the issue branch, open one PR, inspect exact pushed SHA and all required hosted checks. Merge only through the sanctioned exact-head GitHub integration when every gate passes; run governed `aitm deliver` and `aitm close` as authorized.
- [ ] Fast-forward local trunk to the exact merged commit, create a local tarball through the supported packaging workflow, and report its absolute path, package version, merged SHA, SHA-256, CI URLs, consumer install command, and expected tracked dependency changes.
