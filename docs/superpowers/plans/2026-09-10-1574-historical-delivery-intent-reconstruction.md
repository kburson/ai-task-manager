# Historical Delivery Intent Reconstruction Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let an explicitly requested advanced-head recovery reconstruct a missing external delivery intent exclusively from verified pull-request and Git evidence.

**Architecture:** Preserve the existing historical-intent validator and delivery verifier. Add an intent-free historical reconstruction preflight, version the reconciliation evidence to mark retroactive origin, and route only the explicit no-intent/advanced-head case through proof-before-write verification.

**Tech Stack:** Node.js 22+ ESM, `node:test`, GitHub CLI provider observations, Git object inspection, AITM canonical issue records.

## Global Constraints

- `delivery-verification.mjs` merge-method equality remains unchanged.
- The operator declaration is checked against observation and is never evidence.
- Existing `aitm.delivery-method-reconciliation/v1` records retain their exact schema and rendering.
- No issue comment is written until merged status, accepted-head identity, topology, and trunk reachability all pass.
- The lane requires both `--reconcile-merge-method` and a substantive `--reason`.
- #1573 help registration and unrelated refactors remain out of scope.

---

### Task 1: Version Retroactive Reconciliation Evidence

**Files:**

- Modify: `scripts/task-tracker/lib/delivery-method-reconciliation.mjs`
- Modify: `scripts/tests/unit/task-tracker/lib/delivery-method-reconciliation.test.mjs`

**Interfaces:**

- Consumes: the current v1 record builder and validator.
- Produces: exact v2 records with `intentOrigin: 'retroactively-reconstructed'` while retaining exact v1 behavior.

- [ ] **Step 1: Write failing v2 record tests**

Add tests that call `buildMethodReconciliation` with
`intentOrigin: 'retroactively-reconstructed'` and expect schema
`aitm.delivery-method-reconciliation/v2`, the exact additional key, frozen
output, tamper refusal, and visible retroactive wording. Retain an assertion
that the existing input still produces the exact v1 keys.

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```bash
node --test scripts/tests/unit/task-tracker/lib/delivery-method-reconciliation.test.mjs
```

Expected: the new v2 assertions fail because the builder currently ignores the
origin input and always emits v1.

- [ ] **Step 3: Implement exact v1/v2 validation and rendering**

Add a v2 schema constant and key list. Select v2 only for the exact retroactive
origin value; validate each schema against its own exact key set. Render v2 with
the explicit no-delivery-time-intent explanation. Keep v1 output byte-compatible.

- [ ] **Step 4: Run the focused test and verify GREEN**

Run the same command and require zero failures.

- [ ] **Step 5: Commit the slice**

```bash
git add scripts/task-tracker/lib/delivery-method-reconciliation.mjs \
  scripts/tests/unit/task-tracker/lib/delivery-method-reconciliation.test.mjs
git commit -m "[#1574] Record retroactive intent reconstruction"
```

### Task 2: Add the Intent-Free Historical Reconstruction Preflight

**Files:**

- Modify: `scripts/task-tracker/lib/delivery-preflight.mjs`
- Modify: `scripts/tests/unit/task-tracker/core/full-auto-close-doctrine.test.mjs`

**Interfaces:**

- Consumes: existing delivery-authority, merged-PR, accepted-head, configuration,
  attribution, and dirty-path validators.
- Produces: `validateHistoricalReconstructionPreflight(input)` returning
  `{ issue, pr, expectedHeadSha, acceptedSha, observedLocalHeadSha,
headRelation, mergeMethod, commitText }` as a deeply frozen projection.

- [ ] **Step 1: Write failing reconstruction-preflight tests**

Add a success case with an advanced head, merged pull request, exact Test/Review
SHA, no intent field, and full-auto approval. Add table cases for current head,
unmerged PR, evidence mismatch, dirty paths, wrong root lineage, and invalid
configuration.

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```bash
node --test scripts/tests/unit/task-tracker/core/full-auto-close-doctrine.test.mjs
```

Expected: import or function-not-defined failure for the new public preflight.

- [ ] **Step 3: Implement the narrow preflight**

Reuse private validators in `delivery-preflight.mjs`. Give reconstruction its
own exact input-key list and do not change
`validateHistoricalRecoveryPreflight`. Require `headRelation === 'advanced'`, a
merged matching PR, exact accepted Test/Review/head evidence, no dirty overlap,
valid provider-action configuration, and derived attribution.

- [ ] **Step 4: Run the focused test and verify GREEN**

Run the same command and require zero failures.

- [ ] **Step 5: Commit the slice**

```bash
git add scripts/task-tracker/lib/delivery-preflight.mjs \
  scripts/tests/unit/task-tracker/core/full-auto-close-doctrine.test.mjs
git commit -m "[#1574] Validate historical intent reconstruction authority"
```

### Task 3: Route Explicit Advanced-Head Reconstruction Through Verification

**Files:**

- Modify: `scripts/task-tracker/verbs/deliver.mjs`
- Modify: `scripts/tests/unit/task-tracker/verbs/deliver.test.mjs`
- Modify: `scripts/task-tracker/lib/delivery-verification.mjs`
- Modify: `scripts/tests/unit/task-tracker/lib/delivery-verification-attribution.test.mjs`
- Verify unchanged: `scripts/tests/unit/task-tracker/lib/delivery-method-reconciliation-regression.test.mjs`

**Interfaces:**

- Consumes: `validateHistoricalReconstructionPreflight`,
  `observeMergeMethod`, `resolveReconciledMergeMethod`, v2
  `buildMethodReconciliation`, `verifyExternalDeliveredPullRequest`, and the
  established intent/receipt append-readback helpers. The external verifier's
  existing internal recovery mode reaches its authority-SHA assertion without
  adding a public input key or weakening merge-method equality.
- Produces: `{ status: 'delivered', mode: 'historical-reconstruction',
recovery: true }` plus v2 reconciliation, external intent, and verified
  receipt records.

- [ ] **Step 1: Write the failing #680-shaped deliver test**

Extend the deliver harness with an advanced local head, merged PR at the older
accepted SHA, no comments, unambiguous two-parent merge topology, and successful
trunk ancestry. Assert the existing no-flag call still refuses
`historical-intent`; then assert an explicit reconciliation returns a delivered
receipt and writes reconciliation, intent, and receipt in that order.

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```bash
node --test scripts/tests/unit/task-tracker/verbs/deliver.test.mjs
```

Expected: the explicit advanced-head case still refuses
`delivery-preflight:historical-intent`. Add a focused verifier test proving the
truthful advanced local HEAD currently refuses
`delivery-verification:authority-sha-mismatch`.

- [ ] **Step 3: Implement proof-before-write routing**

In the advanced-head branch, keep the existing historical recovery call when a
live intent exists. With no intent, require `reconcile`, run the new preflight,
observe and resolve method topology, build the v2 record and prospective
external intent, and call the external verifier in its existing internal
recovery mode. Carry that internal mode into the authority-SHA assertion so the
truthful advanced local HEAD is accepted while the exact public input schema and
merge-method equality remain unchanged. Only after verification returns should
the code append the reconciliation comment, append/read back the intent, and
finalize the receipt with the precomputed verification.

- [ ] **Step 4: Add and run negative zero-write cases**

Cover unmerged PR, unreachable merge commit, unattributable topology, declared
method mismatch, and missing flag. Each case must assert zero new comments.

Run:

```bash
node --test scripts/tests/unit/task-tracker/verbs/deliver.test.mjs \
  scripts/tests/unit/task-tracker/lib/delivery-method-reconciliation-regression.test.mjs
```

Expected: all pass and the unchanged equality regression remains green.

- [ ] **Step 5: Run iteration verification and commit**

```bash
node scripts/task-tracker/verify-develop.mjs --mode iteration
git diff --check
git add scripts/task-tracker/verbs/deliver.mjs \
  scripts/tests/unit/task-tracker/verbs/deliver.test.mjs \
  scripts/task-tracker/lib/delivery-verification.mjs \
  scripts/tests/unit/task-tracker/lib/delivery-verification-attribution.test.mjs
git commit -m "[#1574] Reconstruct missing historical delivery intent"
```

### Task 4: Governed Verification and Lifecycle Completion

**Files:**

- Verify: all issue-owned files and issue #1574 evidence.

**Interfaces:**

- Consumes: the three committed TDD slices.
- Produces: exact-SHA test, review, delivery, and close evidence; then a live
  #680 recovery attempt after #1574 reaches Done.

- [ ] **Step 1: Run formatting and lint gates**

```bash
npm run lint
npm run format:check
```

- [ ] **Step 2: Run unit, integration, fast, and slow suites**

```bash
npm run test:unit
npm run test:integration
npm test
npm run test:slow
```

- [ ] **Step 3: Run exact-SHA finalization**

```bash
node scripts/task-tracker/verify-develop.mjs --mode final --issue 1574
```

- [ ] **Step 4: Stamp each verification criterion and functional DoD item**

Use the sanctioned `npx aitm ac-stamp`, `npx aitm test`, and
`npx aitm dod-stamp` commands; do not hand-edit evidence markers.

- [ ] **Step 5: Run independent review, deliver, and close**

Run the repository's Full-Auto review and provider-action delivery workflow,
verify the exact pushed SHA and hosted CI, then close only from a clean worktree
with a verified delivery receipt.
