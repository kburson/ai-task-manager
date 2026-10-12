### Task 4: Reconcile active membership without changing frozen data

**Files:**

- Modify: `scripts/tests/lib/test-corpus-membership.mjs`
- Modify: `scripts/tests/integration/meta/test-corpus-membership.test.mjs`
- Modify: `scripts/tests/integration/meta/package-test-corpus.test.mjs`
- Modify: `scripts/tests/integration/meta/test-tree-layout.test.mjs`

**Interfaces:**

- Consumes: validated `retirements` and retirement diagnostics.
- Produces: active frozen membership equal to frozen paths minus retirement
  paths, while post-snapshot semantics remain unchanged.

- [ ] **Step 1: Add failing reconciliation cases**

Extend `reconcileCorpusMembership()` tests with:

```js
retirements: [
  {
    path: 'scripts/tests/unit/lib/retired.test.mjs',
    receiptFile:
      'scripts/tests/fixtures/test-corpus-frozen-retirements/unit/lib/retired.test.mjs.json',
    source: 'active',
  },
];
```

Prove a retired frozen path may be absent, but a live test plus receipt is an
error. Prove retirement/non-frozen and retirement/post-snapshot overlap are
errors, duplicates are deterministic, malformed retirement errors reach the
formatted diagnostic, and existing post-snapshot cases are unchanged.

- [ ] **Step 2: Run and verify red**

```bash
node --test scripts/tests/integration/meta/test-corpus-membership.test.mjs
```

Expected: FAIL because reconciliation ignores retirements.

- [ ] **Step 3: Integrate retirement subtraction**

Add optional inputs:

```js
retirements = [],
retirementErrors = [],
misplacedRetirements = [],
```

Compute:

```js
const retired = new Set(retirements.map(({ path: testPath }) => testPath));
const activeFrozen = new Set(frozenPaths.filter((testPath) => !retired.has(testPath)));
```

Use `activeFrozen`, not the immutable full set, when declaring live membership.
Add explicit result sections for receipt/test overlap, invalid retirement
authority overlap, malformed retirement records, and misplaced receipts.

- [ ] **Step 4: Update the live authority tests**

In the repository-root membership test, load retirements before reconciliation.
In `package-test-corpus.test.mjs`, require each frozen path to be either live or
validated retired; retain all immutable census, hash, lane-correction, and Git
rename tests unchanged.

In `test-tree-layout.test.mjs`, subtract only the validated retired basenames in
their original lanes from the AC3/AC4 dropped-file result. Do not write or
regenerate its baseline JSON.

- [ ] **Step 5: Verify focused authority tests**

```bash
node --test scripts/tests/unit/meta/frozen-test-retirements.test.mjs scripts/tests/integration/meta/test-corpus-membership.test.mjs scripts/tests/integration/meta/package-test-corpus.test.mjs scripts/tests/integration/meta/test-tree-layout.test.mjs
git diff --exit-code -- scripts/tests/fixtures/test-corpus-pre-move.json scripts/tests/integration/meta/test-tree-layout.baseline.json
```

Expected: tests pass and both frozen data files are byte-for-byte untouched.

- [ ] **Step 6: Commit**

```bash
git add scripts/tests/lib/test-corpus-membership.mjs scripts/tests/integration/meta/test-corpus-membership.test.mjs scripts/tests/integration/meta/package-test-corpus.test.mjs scripts/tests/integration/meta/test-tree-layout.test.mjs
git commit -m "feat(test-corpus): reconcile retired frozen tests"
```

---

