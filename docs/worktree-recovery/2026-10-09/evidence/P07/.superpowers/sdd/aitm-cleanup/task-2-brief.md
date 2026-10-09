### Task 2: Validate active frozen-retirement receipts

**Files:**

- Create: `scripts/tests/lib/frozen-test-retirements.mjs`
- Create: `scripts/tests/unit/meta/frozen-test-retirements.test.mjs`
- Create: `scripts/tests/fixtures/test-corpus-post-snapshot/unit/meta/frozen-test-retirements.test.mjs.json`

**Interfaces:**

- Consumes: project root, finalized frozen paths, post-snapshot record paths,
  live discovered paths, and optional injected Git runner.
- Produces:
  `retirementReceiptPathForTestPath(testPath) -> string`,
  `loadActiveFrozenRetirements(options) -> {retirements, errors,
misplacedReceipts, rootPresent}`, and exact schema/evidence validation.

- [ ] **Step 1: Write failing deterministic-path and schema tests**

Create the test with `// @chore` on line 1. Assert:

```js
assert.equal(
  retirementReceiptPathForTestPath('scripts/tests/unit/articles/publish-articles.test.mjs'),
  'scripts/tests/fixtures/test-corpus-frozen-retirements/unit/articles/publish-articles.test.mjs.json'
);
```

Cover exact keys, integer schema `1`, canonical frozen-only paths, 64-character
lowercase SHA-256, non-empty sentence reason, deterministic physical location,
and evidence restricted beneath
`docs/evidence/temporary-test-retirements/*.md` without `..` or absolute paths.

Fixtures must cover malformed JSON, extra/missing keys, duplicate declarations,
post-snapshot overlap, non-frozen paths, missing evidence, receipt/test overlap,
shared evidence, and sorted diagnostics.

- [ ] **Step 2: Add the membership record and verify red**

```json
{
  "schema": 1,
  "path": "scripts/tests/unit/meta/frozen-test-retirements.test.mjs"
}
```

Run:

```bash
node --test scripts/tests/unit/meta/frozen-test-retirements.test.mjs
```

Expected: FAIL with `ERR_MODULE_NOT_FOUND`.

- [ ] **Step 3: Implement active receipt loading**

Export constants:

```js
export const FROZEN_RETIREMENT_ROOT = 'scripts/tests/fixtures/test-corpus-frozen-retirements';
export const TEMPORARY_RETIREMENT_EVIDENCE_ROOT = 'docs/evidence/temporary-test-retirements';
```

Normalize every repository path to POSIX form and reject absolute or escaping
paths. Accept exactly:

```js
['evidence', 'lastLiveSha256', 'path', 'reason', 'schema'];
```

Return normalized retirement objects with `receiptFile`, `evidenceFile`,
`source: 'active'`, and the receipt fields. Never throw for one malformed file;
collect deterministic errors so all repair targets are visible in one run.

- [ ] **Step 4: Verify active loading**

```bash
node --test scripts/tests/unit/meta/frozen-test-retirements.test.mjs
node --test scripts/tests/integration/meta/test-corpus-membership.test.mjs
```

Expected: new tests pass and existing membership behavior remains unchanged.

- [ ] **Step 5: Commit**

```bash
git add scripts/tests/lib/frozen-test-retirements.mjs scripts/tests/unit/meta/frozen-test-retirements.test.mjs scripts/tests/fixtures/test-corpus-post-snapshot/unit/meta/frozen-test-retirements.test.mjs.json
git commit -m "feat(test-corpus): validate frozen retirement receipts"
```

---

