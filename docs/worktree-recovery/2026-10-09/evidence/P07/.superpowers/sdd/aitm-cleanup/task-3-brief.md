### Task 3: Hydrate graduated receipts from canonical history

**Files:**

- Modify: `scripts/tests/lib/frozen-test-retirements.mjs`
- Modify: `scripts/tests/unit/meta/frozen-test-retirements.test.mjs`

**Interfaces:**

- Consumes: a missing frozen test path, deterministic receipt path, and
  complete `origin/trunk` ancestry.
- Produces:
  `hydrateHistoricalFrozenRetirement(options) -> Retirement`, and
  `loadFrozenRetirements(options) -> {retirements, errors,
misplacedReceipts}` combining active and historical authority.

- [ ] **Step 1: Add synthetic-history tests**

Create isolated Git repositories with a bare `origin`, explicit `trunk`, and
feature branches. Test these histories separately:

- fast-forward/rebased delivery commit deletes the test and adds receipt plus
  evidence;
- squash-shaped delivery has no feature commit reachable but has the final
  deletion/receipt tree;
- a merge commit has at least one parent with the pre-deletion blob and a merge
  result with receipt/evidence and no test;
- a later canonical commit deletes the receipt and evidence;
- an undelivered feature-only receipt cannot authorize retirement;
- receipt digest differs from every live parent blob;
- evidence is absent in the receipt tree;
- receipt graduation deletion is not reachable;
- `origin/trunk` is absent;
- repository is shallow; and
- required parent blob is missing.

Assert active receipts do not invoke historical Git inspection.

- [ ] **Step 2: Run and verify red**

```bash
node --test scripts/tests/unit/meta/frozen-test-retirements.test.mjs
```

Expected: history cases fail because hydration is not implemented.

- [ ] **Step 3: Add a fail-closed Git adapter**

Use `execFileSync('git', args, {cwd, encoding})`, never a shell string. Check:

```text
git rev-parse --is-shallow-repository
git rev-parse --verify origin/trunk^{commit}
```

Search only commits reachable from `origin/trunk` and relevant to the receipt
or test path. For each candidate commit, inspect the tree with `git cat-file -e`
and `git show ${commit}:${repositoryPath}`. A delivered-retirement tree is valid
only when:

- the tree contains a valid receipt and its evidence;
- the tree does not contain the test;
- at least one direct parent contains the test;
- that parent blob hashes to `lastLiveSha256`; and
- the candidate is reachable from `origin/trunk`.

For graduated authority, additionally prove a reachable later transition whose
parent contains the receipt and whose tree does not. Do not trust local `HEAD`,
feature refs, reflogs, commit messages, or embedded feature SHAs.

- [ ] **Step 4: Return actionable errors**

Missing or shallow history errors must include:

```text
fetch complete canonical history for origin/trunk and retry
```

Digest errors must name the test and expected digest. Missing evidence, receipt
graduation, or parent blobs must name the deterministic receipt path.

- [ ] **Step 5: Verify every history shape**

```bash
node --test scripts/tests/unit/meta/frozen-test-retirements.test.mjs
```

Expected: all active, squash, rebase, fast-forward, merge, graduated, and
fail-closed cases pass.

- [ ] **Step 6: Commit**

```bash
git add scripts/tests/lib/frozen-test-retirements.mjs scripts/tests/unit/meta/frozen-test-retirements.test.mjs
git commit -m "feat(test-corpus): hydrate historical retirements"
```

---

