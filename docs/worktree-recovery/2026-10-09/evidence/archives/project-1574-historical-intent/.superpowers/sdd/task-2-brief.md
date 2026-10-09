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

