# Code-Complete Contract Routing Decomposition Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace body-only Acceptance Criteria decisions in the code-complete gate with one fail-closed Delivery Contract resolution while preserving every existing evidence and delivery-lane policy.

**Architecture:** The first slice owns the authority boundary: resolve exactly once, adapt normalized AC declarations into the historic consumer shape, and refuse without legacy fallback. The second slice owns policy hardening: prove checked, verifier, non-demonstrable, and audit-waiver decisions are identical across legacy and GitHub-record sources while commit and no-commit delivery lanes remain unchanged.

**Tech Stack:** Node.js ESM, `node:test`, AITM lifecycle gates, immutable GitHub-record Delivery Contracts, injected resolver seams.

**Governing specification:** `docs/superpowers/specs/2026-07-31-github-native-authority-records-design.md`

**Source decomposition:** `docs/superpowers/plans/2026-08-05-1118-ac-vc-gate-decomposition.md`

**Reference commit:** `5b52d9b06922ddc79a77d6a27ddb465505c0c15f`

## Global Constraints

- A valid issue directory makes its Delivery Contract authoritative; a directory, reader, record, contract, or projection failure must refuse without parsing embedded legacy Acceptance Criteria again.
- Preserve `gateCodeComplete({ cfg, issueNumber, body, deps }) -> Promise<{ ok, blockers, shas }>` and the historic `parseAcceptanceCriteria` export.
- Resolve the contract at most once per gate invocation and retain injectable GraphQL, record-reader, comment, SHA, touch-set, and dirty-file seams.
- Keep Verification Command and Definition-of-Done routing out of scope; #1123 and #1119 own those consumers.
- Preserve body-based issue-kind, deliverable, epic-reconciliation, commit-trail, and workspace-cleanliness policy.

---

### Task 1: Single-Attempt Code-Complete Contract Adapter

**Files:**

- Modify: `scripts/task-tracker/lib/code-complete-gate.mjs`
- Test: `scripts/task-tracker/tests/unit/lib/code-complete-gate.test.mjs`
- Test: `scripts/task-tracker/tests/unit/lib/github-records/contract-source.test.mjs`

**Interfaces:**

- Consumes `resolveContractSource({ repository, issue, issueBody, graphql, readContractRecord })`.
- Adds injectable `deps.resolveContractSource`, `deps.graphql`, and `deps.readContractRecord` seams.
- Adapts normalized `{ declaration, checked }` AC items into the existing `{ label, checked, verifiedBy }` policy input.
- Emits `code-complete-contract-source-failed: <message>` on resolver refusal and never falls back to the body.

- [ ] **Step 1: Add failing authority-boundary tests**

Add an injected GitHub-record contract whose AC state contradicts the embedded legacy body and assert the record-backed decision wins. Count resolver calls and require exactly one. Add a resolver rejection beside a valid legacy section and require the deterministic fail-closed blocker while neutralizing commit-trail dependencies.

- [ ] **Step 2: Run the focused tests and verify RED**

Run: `node --test scripts/task-tracker/tests/unit/lib/github-records/contract-source.test.mjs scripts/task-tracker/tests/unit/lib/code-complete-gate.test.mjs`

Expected: FAIL because `gateCodeComplete` ignores the injected resolver and parses the embedded legacy body again.

- [ ] **Step 3: Implement the one-shot resolver adapter**

Import `resolveContractSource` and `resolveVerifiedBy`. Resolve once near the start of `gateCodeComplete`, passing repository, numeric issue, issue body, GraphQL, and record-reader seams. On success convert each normalized declaration into the historic policy shape. On failure append only the deterministic source blocker and skip legacy AC parsing. Leave all post-AC delivery gates unchanged.

- [ ] **Step 4: Run the focused tests and verify GREEN**

Run: `node --test scripts/task-tracker/tests/unit/lib/github-records/contract-source.test.mjs scripts/task-tracker/tests/unit/lib/code-complete-gate.test.mjs`

Expected: PASS for record authority, exactly-one resolution, fail-closed refusal, historic parser compatibility, and existing code-complete behavior.

- [ ] **Step 5: Commit the authority boundary**

Commit the adapter and focused tests. Use the generated child issue number in the repository-standard subject, followed by `feat: resolve code-complete contracts once`.

---

### Task 2: Code-Complete AC Policy Parity Matrix

**Files:**

- Modify if required: `scripts/task-tracker/lib/code-complete-gate.mjs`
- Test: `scripts/task-tracker/tests/unit/lib/code-complete-gate.test.mjs`
- Test: `scripts/task-tracker/tests/unit/lib/github-records/contract-source.test.mjs`

**Interfaces:**

- Consumes the adapter delivered by Task 1 without adding another resolver call.
- Preserves checked, verifier, `aitm-non-demonstrable`, and audit-only `aitm-ac-waived` semantics from the full normalized declaration.
- Preserves body-based code, docs-only, audit, research, spike, and epic delivery-lane behavior.

- [ ] **Step 1: Add the paired policy matrix**

Build equivalent legacy and GitHub-record fixtures for checked verified ACs, unchecked ACs, checked unverified ACs, non-demonstrable opt-outs, and audit-waived ACs. Assert identical AC blockers after neutralizing comments, SHAs, touch sets, and dirty files. Add call-count assertions proving the matrix never introduces a second resolution.

- [ ] **Step 2: Run the focused tests and verify policy gaps**

Run: `node --test scripts/task-tracker/tests/unit/lib/github-records/contract-source.test.mjs scripts/task-tracker/tests/unit/lib/code-complete-gate.test.mjs`

Expected: PASS if Task 1 preserved full declarations correctly, or FAIL only on a precisely identified policy mismatch that this slice must correct.

- [ ] **Step 3: Correct only demonstrated parity mismatches**

If RED identifies a mismatch, adjust the declaration adapter or AC decision loop minimally. Do not change resolver placement, retry behavior, no-commit classification, deliverable markers, epic reconciliation, comment lookup, SHA parsing, touch sets, or dirty-file evaluation. If the matrix is already green, retain the test-only hardening commit.

- [ ] **Step 4: Run focused and lane-regression tests**

Run: `node --test scripts/task-tracker/tests/unit/lib/github-records/contract-source.test.mjs scripts/task-tracker/tests/unit/lib/code-complete-gate.test.mjs scripts/task-tracker/tests/unit/lib/issue-kind.test.mjs`

Expected: PASS with identical authority-mode AC decisions and unchanged delivery-lane classification.

- [ ] **Step 5: Commit the policy hardening**

Commit the paired matrix and any minimal demonstrated correction. Use the generated child issue number in the repository-standard subject, followed by `test: pin code-complete contract parity`.
