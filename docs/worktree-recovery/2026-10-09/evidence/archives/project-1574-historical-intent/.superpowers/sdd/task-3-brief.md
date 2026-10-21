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

