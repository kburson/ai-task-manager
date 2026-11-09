# Task 2 Report — Validate active frozen-retirement receipts

## Scope and baseline

- Worktree: `.claude/worktrees/articles-book-publication-6a7dfe`
- Branch: `claude/articles-book-publication-6a7dfe`
- Starting commit: `dd1705d6922465b92017dc88a24c46cb6d0d9efc`
- Task type: bounded chore; no GitHub issue was created or bound.

## TDD evidence

### RED

After adding the test and its post-snapshot membership record, before creating
the implementation module, I ran:

```text
node --test scripts/tests/unit/meta/frozen-test-retirements.test.mjs
```

Result: failed as expected with `ERR_MODULE_NOT_FOUND` for
`scripts/tests/lib/frozen-test-retirements.mjs`. Node reported one failed test
file and zero passing tests.

### GREEN

After the minimal loader implementation and formatting, I ran:

```text
node --test scripts/tests/unit/meta/frozen-test-retirements.test.mjs
node --test scripts/tests/integration/meta/test-corpus-membership.test.mjs
npx prettier --check scripts/tests/lib/frozen-test-retirements.mjs scripts/tests/unit/meta/frozen-test-retirements.test.mjs scripts/tests/fixtures/test-corpus-post-snapshot/unit/meta/frozen-test-retirements.test.mjs.json
npx eslint scripts/tests/lib/frozen-test-retirements.mjs scripts/tests/unit/meta/frozen-test-retirements.test.mjs
npm run lint:test-reach
git diff --check
git diff --exit-code -- scripts/tests/fixtures/test-corpus-pre-move.json scripts/tests/integration/meta/test-tree-layout.baseline.json
```

Results:

- `frozen-test-retirements.test.mjs`: 12 passed, 0 failed.
- `test-corpus-membership.test.mjs`: 21 passed, 0 failed.
- Prettier and ESLint completed cleanly for the changed JavaScript files.
- `lint:test-reach` reported 0 new offenders (32 pre-existing baselined
  offenders).
- `git diff --check` completed cleanly.
- The immutable pre-move corpus fixture and tree-layout baseline remained
  byte-for-byte unchanged.

## Implementation

Added `scripts/tests/lib/frozen-test-retirements.mjs` with:

- exported retirement/evidence root constants;
- deterministic canonical receipt-path derivation;
- sorted recursive receipt discovery and accumulated malformed-file diagnostics;
- exact receipt schema, frozen/post-snapshot membership, digest, reason,
  deterministic location, evidence-boundary, missing-evidence, duplicate, and
  live-test-overlap validation; and
- normalized active retirement objects carrying their receipt and evidence
  files plus `source: 'active'`.

Added `scripts/tests/unit/meta/frozen-test-retirements.test.mjs` with isolated
fixture coverage for malformed JSON, exact keys, schema, digest, blank reason,
field type, non-frozen/post-snapshot paths, missing/escaping evidence,
duplicates, misplaced receipts, receipt/live-test overlap, shared evidence,
sorted diagnostics, and absent roots.

Added the required post-snapshot membership record at
`scripts/tests/fixtures/test-corpus-post-snapshot/unit/meta/frozen-test-retirements.test.mjs.json`.

## Commit

`6d9058097bb1250e5733d30278b53e0f18470ec8 feat(test-corpus): validate frozen retirement receipts`

The commit contains exactly the three Task 2 implementation files specified in
the plan. No push, merge, history rewrite, or pull request was performed.

## Self-review

- Confirmed outputs and diagnostics are POSIX-normalized and deterministically
  sorted.
- Confirmed malformed individual receipts do not abort scanning later receipts.
- Confirmed a misplaced but otherwise valid receipt is reported separately from
  malformed content, preserving all repair targets.
- Confirmed shared temporary evidence is accepted for multiple active receipts.
- Confirmed frozen source data was not edited or regenerated.

## Concerns

None. Historical Git hydration and reconciliation integration remain deliberately
out of scope for subsequent tasks.

## Review-fix evidence

Two Important review findings were corrected after the initial Task 2 commit.

### RED

After adjusting the unit tests before changing the loader, I ran:

```text
node --test scripts/tests/unit/meta/frozen-test-retirements.test.mjs
```

Result: 8 passed and 4 failed, as expected. The failures showed that a
nonblank reason without terminal punctuation was accepted, and that duplicate,
misplaced, and receipt/live-test-overlap records were still returned in
`retirements`.

### GREEN

After the minimal loader change, I ran:

```text
node --test scripts/tests/unit/meta/frozen-test-retirements.test.mjs
node --test scripts/tests/integration/meta/test-corpus-membership.test.mjs
npx prettier --check scripts/tests/lib/frozen-test-retirements.mjs scripts/tests/unit/meta/frozen-test-retirements.test.mjs
npx eslint scripts/tests/lib/frozen-test-retirements.mjs scripts/tests/unit/meta/frozen-test-retirements.test.mjs
git diff --check
git diff --exit-code -- scripts/tests/fixtures/test-corpus-pre-move.json scripts/tests/integration/meta/test-tree-layout.baseline.json
```

Results:

- `frozen-test-retirements.test.mjs`: 12 passed, 0 failed.
- `test-corpus-membership.test.mjs`: 21 passed, 0 failed.
- Formatting and ESLint completed cleanly for both changed JavaScript files.
- The immutable corpus fixture and tree-layout baseline remained unchanged.

### Review fix summary

- Candidate receipts are collected for deterministic diagnostics, then only a
  uniquely declared, deterministically located receipt with no live-test
  overlap enters authoritative `retirements`.
- Duplicate declarations exclude every receipt for that logical test path;
  misplaced receipts remain in `misplacedReceipts`; and overlap diagnostics are
  retained.
- Reasons must now be nonblank after trimming and end in `.`, `!`, or `?`.

Review-fix commit:

`56be4e86612f30f216e29621be018b8d66a46de7 fix(test-corpus): fail closed invalid retirement receipts`

## Mixed-validity duplicate fix evidence

### RED

After adding the mixed-validity duplicate test before changing the loader, I
ran:

```text
node --test scripts/tests/unit/meta/frozen-test-retirements.test.mjs
```

Result: 12 passed and 1 failed, as expected. The new test showed that a valid
canonical receipt remained in `retirements` when a second receipt declared the
same canonical frozen path but failed reason validation.

### GREEN

After recording canonical frozen-path declarations immediately after JSON
parsing and before field validation, I ran:

```text
node --test scripts/tests/unit/meta/frozen-test-retirements.test.mjs
node --test scripts/tests/integration/meta/test-corpus-membership.test.mjs
npx prettier --check scripts/tests/lib/frozen-test-retirements.mjs scripts/tests/unit/meta/frozen-test-retirements.test.mjs
npx eslint scripts/tests/lib/frozen-test-retirements.mjs scripts/tests/unit/meta/frozen-test-retirements.test.mjs
git diff --check
git diff --exit-code -- scripts/tests/fixtures/test-corpus-pre-move.json scripts/tests/integration/meta/test-tree-layout.baseline.json
```

Results:

- `frozen-test-retirements.test.mjs`: 13 passed, 0 failed.
- `test-corpus-membership.test.mjs`: 21 passed, 0 failed.
- Formatting and ESLint completed cleanly for both changed JavaScript files.
- The immutable corpus fixture and tree-layout baseline remained unchanged.

The mixed-validity duplicate retains deterministic duplicate and reason errors
plus its misplaced-receipt diagnostic, while no receipt for that path is
authoritative.

Mixed-validity duplicate fix commit:

`da60e4176e2b070a95aed52708baf303651fa29b fix(test-corpus): reject mixed-validity retirement duplicates`
