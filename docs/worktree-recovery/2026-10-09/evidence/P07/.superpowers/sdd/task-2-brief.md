### Task 2: Delete the obsolete authority and remove all live wiring

**Files:**

- Modify: `scripts/task-tracker/test-impact-manifest.json:88-121`
- Modify: `scripts/tests/integration/task-tracker/lib/test-impact-selector.test.mjs:35-55,285-427`
- Modify: `scripts/tests/slow/task-tracker/core/maintenance-scripts-strict-argv.test.mjs:21-43`
- Modify: `scripts/tests/unit/task-tracker/core/residue-audit-scope.test.mjs:49-57`
- Modify: `package.json:1-40`
- Modify: `scripts/tests/integration/meta/test-tree-layout.baseline.json:1-end`
- Delete: every path listed in the plan's **Deleted** section.

**Interfaces:**

- Consumes: the current-state layout guard and baseline from Task 1.
- Produces: one test-impact rule that selects
  `scripts/tests/integration/meta/test-tree-layout.test.mjs` for live test or
  baseline changes.
- Produces: a HEAD with no historical membership, receipt, or graduation
  runtime dependency.

- [ ] **Step 1: Change the test-impact expectations first**

Replace the migration-era constants with:

```js
const CURRENT_TREE_TEST = 'scripts/tests/integration/meta/test-tree-layout.test.mjs';
const EXPENSIVE_PACKAGE_TEST = 'scripts/tests/integration/meta/package-test-corpus.test.mjs';
const CORPUS_DISCOVERED = [
  CURRENT_TREE_TEST,
  EXPENSIVE_PACKAGE_TEST,
  'scripts/tests/unit/lib/live.test.mjs',
  'scripts/tests/integration/lib/live.test.mjs',
  'scripts/tests/slow/lib/live.test.mjs',
];
```

Rename the corpus-selection describe block to `checked-in current-tree
selection`. Keep the literal-manifest-path drift test. Replace the remaining
membership, registry, pre-move, receipt, evidence, and graduation cases with:

```js
test('a test content edit selects itself and the current-tree guard', (t) => {
  const projectRoot = corpusSelectionProject(t);
  const changed = 'scripts/tests/unit/lib/live.test.mjs';
  const result = selectCorpus(projectRoot, [changed]);

  assert.deepEqual(result.tests, [changed, CURRENT_TREE_TEST].sort());
  assert.ok(signals(result, changed).includes('changed-test'));
  assert.deepEqual(manifestReasons(result, CURRENT_TREE_TEST), [
    'current test tree authority change',
  ]);
  assert.equal(result.escalated, false);
});

test('a deleted integration test selects the current-tree guard and retains its former lane', (t) => {
  const projectRoot = corpusSelectionProject(t);
  const deleted = 'scripts/tests/integration/lib/deleted.test.mjs';
  const result = selectCorpus(projectRoot, [deleted]);

  assert.ok(result.tests.includes(CURRENT_TREE_TEST));
  assert.deepEqual(result.lanes, ['integration']);
  assert.equal(result.escalated, true);
  assert.ok(
    result.reasons.some(
      ({ changedPath, signal }) => changedPath === deleted && signal === 'deleted-test-lane'
    )
  );
  assert.deepEqual(manifestReasons(result, CURRENT_TREE_TEST), [
    'current test tree authority change',
  ]);
});

test('a rename selects the current-tree guard while the old path retains lane escalation', (t) => {
  const projectRoot = corpusSelectionProject(t);
  const oldPath = 'scripts/tests/integration/lib/renamed.test.mjs';
  const newPath = 'scripts/tests/unit/lib/live.test.mjs';
  const result = selectCorpus(projectRoot, [oldPath, newPath]);

  assert.ok(result.tests.includes(newPath));
  assert.ok(result.tests.includes(CURRENT_TREE_TEST));
  assert.deepEqual(result.lanes, ['integration']);
  assert.equal(result.escalated, true);
});

test('the current tree baseline selects the current-tree guard', (t) => {
  const projectRoot = corpusSelectionProject(t);
  const baseline = 'scripts/tests/integration/meta/test-tree-layout.baseline.json';
  writeFixture(projectRoot, baseline);
  const result = selectCorpus(projectRoot, [baseline]);

  assert.deepEqual(result.tests, [CURRENT_TREE_TEST]);
  assert.deepEqual(manifestReasons(result, CURRENT_TREE_TEST), [
    'current test tree authority change',
  ]);
  assert.equal(result.escalated, false);
});
```

- [ ] **Step 2: Run the changed selector tests and observe the old manifest fail**

Run:

```bash
node --test scripts/tests/integration/task-tracker/lib/test-impact-selector.test.mjs
```

Expected: FAIL because the checked-in manifest still selects the deleted
membership guard and has no current-baseline rule.

- [ ] **Step 3: Replace the three migration-era impact rules with one current rule**

In `scripts/task-tracker/test-impact-manifest.json`, replace the rules whose
reasons are `test corpus membership authority change`, `frozen test corpus
authority change`, and `frozen retirement authority and graduation workflow
change` with:

```json
{
  "sources": [
    "scripts/tests/**/*.test.mjs",
    "scripts/tests/integration/meta/test-tree-layout.baseline.json"
  ],
  "tests": ["scripts/tests/integration/meta/test-tree-layout.test.mjs"],
  "reason": "current test tree authority change"
}
```

Run the selector test again. Expected: PASS.

- [ ] **Step 4: Remove the command and remaining current-code references**

Use `apply_patch` to:

- remove `graduate:frozen-tests` from `package.json`;
- remove `scripts/maintenance/graduate-frozen-test-retirements.mjs` from
  `APPLY_SCRIPTS`; and
- replace the obsolete residue-audit example
  `scripts/tests/fixtures/test-corpus-pre-move.json` with the generic current
  path `scripts/tests/fixtures/generated.json`, preserving the assertion that
  generated-looking files outside `docs/research` are audited.

Run:

```bash
node --test scripts/tests/unit/task-tracker/core/residue-audit-scope.test.mjs
node --test scripts/tests/slow/task-tracker/core/maintenance-scripts-strict-argv.test.mjs
```

Expected: PASS with only live maintenance scripts covered.

- [ ] **Step 5: Delete the approved obsolete artifacts**

Delete exactly the approved files and roots:

```bash
git rm -- .github/workflows/graduate-frozen-test-retirements.yml \
  docs/evidence/temporary-test-retirements/2026-08-25-writing-studio-extraction.md \
  scripts/maintenance/graduate-frozen-test-retirements.mjs \
  scripts/tests/lib/frozen-test-retirements.mjs \
  scripts/tests/lib/test-corpus-membership.mjs \
  scripts/tests/integration/meta/frozen-test-retirements.test.mjs \
  scripts/tests/integration/meta/test-corpus-membership.test.mjs \
  scripts/tests/integration/maintenance/graduate-frozen-test-retirements.test.mjs \
  scripts/tests/fixtures/test-corpus-pre-move.json
git rm -r -- scripts/tests/fixtures/test-corpus-post-snapshot \
  scripts/tests/fixtures/test-corpus-frozen-retirements
```

Expected: four receipts, 55 post-snapshot records, the old manifest, shared
evidence, two loaders, three dedicated tests, the command, and the workflow are
staged as deleted. No historical spec, plan, review, or research file is staged.

- [ ] **Step 6: Regenerate the baseline after the three dedicated tests disappear**

Repeat the deterministic baseline-generation command from Task 1 Step 4.

Expected: the final baseline counts match `laneManifest()` and no baseline path
names any of the three deleted dedicated tests.

- [ ] **Step 7: Prove live residue is gone and current guards pass**

Run:

```bash
test ! -e scripts/tests/fixtures/test-corpus-pre-move.json
test ! -e scripts/tests/fixtures/test-corpus-post-snapshot
test ! -e scripts/tests/fixtures/test-corpus-frozen-retirements
test ! -e scripts/tests/lib/test-corpus-membership.mjs
test ! -e scripts/tests/lib/frozen-test-retirements.mjs
test ! -e scripts/maintenance/graduate-frozen-test-retirements.mjs
test ! -e .github/workflows/graduate-frozen-test-retirements.yml
rg -n --hidden --glob '!node_modules/**' --glob '!.git/**' --glob '!.tmp/**' \
  --glob '!docs/superpowers/**' --glob '!docs/research/**' \
  'test-corpus-pre-move|test-corpus-post-snapshot|test-corpus-membership|frozen-test-retire|temporary-test-retirements|graduate:frozen-tests' \
  package.json .github scripts docs README.md || true
node --test \
  scripts/tests/integration/meta/test-tree-layout.test.mjs \
  scripts/tests/integration/meta/package-test-corpus.test.mjs \
  scripts/tests/integration/task-tracker/lib/test-impact-selector.test.mjs \
  scripts/tests/unit/task-tracker/core/residue-audit-scope.test.mjs
npm run lint:test-layout
npm run lint:story-tags
npm run lint:line-cap
npm run lint:test-reach
```

Expected: all explicit absence checks and tests pass. The residue search prints
nothing; references in historical Superpowers and research documents are
deliberately excluded.

- [ ] **Step 8: Review and commit the deletion boundary**

Run:

```bash
git diff --check
git status --short
git diff --stat
git diff --name-status
```

Confirm every changed path is named by Task 2 and no main-checkout file is
involved. Then commit:

```bash
git add package.json \
  scripts/task-tracker/test-impact-manifest.json \
  scripts/tests/integration/task-tracker/lib/test-impact-selector.test.mjs \
  scripts/tests/slow/task-tracker/core/maintenance-scripts-strict-argv.test.mjs \
  scripts/tests/unit/task-tracker/core/residue-audit-scope.test.mjs \
  scripts/tests/integration/meta/test-tree-layout.baseline.json
git add -u -- .github docs/evidence scripts/maintenance scripts/tests
git diff --cached --check
git commit -m "chore: retire historical test corpus scaffolding"
```

Expected: the commit contains only the approved deletions, current wiring, and
final baseline refresh.

---

