# Task 3 report: Hydrate graduated receipts from canonical history

## Status

Complete. Task 3 is committed locally. No push, merge, history rewrite, pull
request, or worktree cleanup was performed.

## TDD evidence

### Baseline

Command:

```bash
node --test scripts/tests/unit/meta/frozen-test-retirements.test.mjs
```

Result before adding Task 3 tests: exit 0; 13 tests passed, 0 failed.

### RED

Command:

```bash
node --test scripts/tests/unit/meta/frozen-test-retirements.test.mjs
```

Result after adding the synthetic-history tests and before production changes:
exit 1. Node reported:

```text
SyntaxError: The requested module '../../lib/frozen-test-retirements.mjs' does not provide an export named 'hydrateHistoricalFrozenRetirement'
tests 1
pass 0
fail 1
```

This was the expected feature-missing failure.

### GREEN

Command:

```bash
node --test scripts/tests/unit/meta/frozen-test-retirements.test.mjs
```

Final result: exit 0; 26 tests passed, 0 failed, 0 skipped, 0 todo.

The first implementation run exposed a byte-integrity defect because Git blob
output had been trimmed before hashing. The adapter was corrected to preserve
the exact `git show` bytes, and the focused suite then passed in full.

## Synthetic canonical-history shapes covered

- Active receipt authority returns without invoking the injected historical Git
  adapter.
- Fast-forward delivery followed by reachable receipt/evidence graduation.
- Rebased delivery after canonical trunk advanced, followed by graduation.
- Squash-shaped delivery where the original feature commit is not reachable
  from `origin/trunk`.
- Merge delivery where the merge result first gains the required evidence and a
  direct live parent contains the pre-deletion test blob.
- Later reachable canonical deletion of both receipt and evidence, exercised
  through the combined loader.
- A complete receipt/graduation chain existing only on an undelivered feature
  branch.
- A merge whose every live parent digest differs from the receipt's expected
  digest.
- Evidence absent from the historical receipt tree.
- Receipt graduation deletion existing only on an unreachable feature branch.
- Missing `origin/trunk`.
- A real depth-1 shallow clone.
- A required direct-parent blob removed from the local object database.

## Implementation and authority boundary

- Added `hydrateHistoricalFrozenRetirement(options)`.
- Added `loadFrozenRetirements(options)` combining active and historical
  retirements while preserving deterministic errors and misplaced receipts.
- The default adapter uses argument-array `execFileSync` Git calls; it never
  constructs shell strings.
- Historical candidates come only from commits path-relevant to the receipt or
  test and reachable from `origin/trunk`.
- Delivery proof requires a valid receipt, evidence in the same tree, test
  absence in the result, a direct live parent, and an exact SHA-256 match of the
  parent blob.
- Graduation proof requires a later reachable transition from a parent that
  contains the receipt to a tree that does not.
- Local `HEAD`, feature refs, reflogs, commit messages, and embedded feature SHAs
  are not consulted.
- Missing or shallow canonical history includes the required fetch-and-retry
  instruction. Digest, evidence, graduation, and parent-blob diagnostics name
  the required test, digest, or deterministic receipt path.
- The Task 2 active-loader implementation body was not changed.

## Files changed

- `scripts/tests/lib/frozen-test-retirements.mjs`
- `scripts/tests/unit/meta/frozen-test-retirements.test.mjs`

The following immutable files remain byte-for-byte unchanged from
`da60e4176e2b070a95aed52708baf303651fa29b`:

- `scripts/tests/fixtures/test-corpus-pre-move.json`
- `scripts/tests/integration/meta/test-tree-layout.baseline.json`

## Verification

All commands exited 0:

```bash
node --test scripts/tests/unit/meta/frozen-test-retirements.test.mjs
npx prettier --check scripts/tests/lib/frozen-test-retirements.mjs scripts/tests/unit/meta/frozen-test-retirements.test.mjs
npx eslint scripts/tests/lib/frozen-test-retirements.mjs scripts/tests/unit/meta/frozen-test-retirements.test.mjs
npx cspell --no-progress scripts/tests/lib/frozen-test-retirements.mjs scripts/tests/unit/meta/frozen-test-retirements.test.mjs
npm run lint:test-layout
npm run lint:story-tags
npm run lint:line-cap
git diff --check
git diff --exit-code da60e4176e2b070a95aed52708baf303651fa29b -- scripts/tests/fixtures/test-corpus-pre-move.json scripts/tests/integration/meta/test-tree-layout.baseline.json
```

Notable results:

- Focused receipt suite: 26 passed, 0 failed.
- Prettier: both files matched repository style.
- CSpell: 2 files checked, 0 issues.
- Test layout: all 985 test files declared a canonical lane.
- Story tags: all 985 test files carried a story tag.
- Line cap: all tests remained within the 800-line hard limit; the modified
  test file is 665 code lines and was reported only by the existing soft-limit
  advisory.
- Immutable-file comparison: no diff.

## Commit

```text
01d368d5c149641d94ab7ab079e6ea4eb88dd4fa feat(test-corpus): hydrate historical retirements
```

The commit contains exactly the two planned Task 3 files.

## Self-review

- Confirmed candidate enumeration starts at `origin/trunk` and is path-bounded.
- Confirmed reachability checks are explicit for delivery and graduation.
- Confirmed direct-parent inspection supports fast-forward, rebase, squash, and
  merge shapes without relying on feature commit identity.
- Confirmed digest hashing preserves the parent blob's terminating newline.
- Confirmed active receipts bypass historical Git inspection.
- Confirmed active-loader diagnostics and ordering remain unchanged.
- Confirmed combined retirements and diagnostics are deterministically sorted.
- Confirmed the commit has no unrelated files and the worktree was clean after
  commit.

## Concerns

None within Task 3 scope. Full-history cost remains intentionally bounded to the
receipt and test paths and is an explicit pilot-review concern in the approved
design, not a blocker for this implementation.

---

## Task 3 review-finding fix

Two Important review findings were fixed in a focused follow-up commit:

1. Direct-parent test blobs now remain raw Buffers from `git show` through
   SHA-256 hashing. Only textual Git output and receipt JSON are decoded.
2. Canonical path probes, ancestry checks, and graduation enumeration now keep
   genuine absence distinct from missing/corrupt objects and command failure.
   Every incomplete-history outcome fails closed with
   `fetch complete canonical history for origin/trunk and retry`.

### Review-fix RED evidence

Raw-byte command:

```bash
node --test --test-name-pattern='hashes the raw direct-parent blob bytes' scripts/tests/unit/meta/frozen-test-retirements.test.mjs
```

Result: exit 1; 0 passed, 1 failed. The invalid/noncanonical UTF-8 fixture
failed with:

```text
frozen-test-retirements: test scripts/tests/unit/articles/historical.test.mjs does not match expected digest 6a0a0c7bda22214f07a676bc58775711435ce73f90ac857f1c0bb60898d48a5e
```

This proved the prior UTF-8 decode/re-encode path changed the hashed bytes.

History tri-state command:

```bash
node --test --test-name-pattern='required parent blob|receipt object is missing|graduation enumeration' scripts/tests/unit/meta/frozen-test-retirements.test.mjs
```

Result: exit 1; 0 passed, 3 failed. The failures proved:

- the missing-parent-blob diagnostic omitted the required fetch instruction;
- a missing receipt object during `cat-file` path inspection collapsed to
  ordinary “no delivered retirement”; and
- failed graduation enumeration collapsed to ordinary “graduation is not
  reachable.”

### Review-fix GREEN evidence

Raw-byte focused command:

```bash
node --test --test-name-pattern='hashes the raw direct-parent blob bytes' scripts/tests/unit/meta/frozen-test-retirements.test.mjs
```

Result: exit 0; 1 passed, 0 failed.

History tri-state focused command:

```bash
node --test --test-name-pattern='required parent blob|receipt object is missing|graduation enumeration' scripts/tests/unit/meta/frozen-test-retirements.test.mjs
```

Result: exit 0; 3 passed, 0 failed.

Final focused suite command:

```bash
node --test scripts/tests/unit/meta/frozen-test-retirements.test.mjs
```

Result: exit 0; 29 passed, 0 failed, 0 skipped, 0 todo.

The new coverage includes:

- a parent test blob containing bytes `ff fe 00 61 0a`, whose receipt digest is
  computed from and matched against the raw Git blob Buffer;
- an actual missing loose receipt object encountered during a canonical tree
  path probe;
- an actual missing direct-parent test blob with receipt/test naming and the
  exact recovery instruction; and
- a simulated Git object/enumeration failure at the graduation-only `rev-list`
  boundary, proving it cannot become an ordinary not-graduated result.

### Review-fix verification

All commands exited 0:

```bash
node --test scripts/tests/unit/meta/frozen-test-retirements.test.mjs
npx prettier --check scripts/tests/lib/frozen-test-retirements.mjs scripts/tests/unit/meta/frozen-test-retirements.test.mjs
npx eslint scripts/tests/lib/frozen-test-retirements.mjs scripts/tests/unit/meta/frozen-test-retirements.test.mjs
npx cspell --no-progress scripts/tests/lib/frozen-test-retirements.mjs scripts/tests/unit/meta/frozen-test-retirements.test.mjs
npm run lint:test-layout
npm run lint:story-tags
npm run lint:line-cap
git diff --check
git diff --exit-code 01d368d5c149641d94ab7ab079e6ea4eb88dd4fa -- scripts/tests/fixtures/test-corpus-pre-move.json scripts/tests/integration/meta/test-tree-layout.baseline.json
```

Notable results:

- Prettier and targeted ESLint passed.
- CSpell checked both files with 0 issues.
- Test layout and story-tag audits passed for all 985 tests.
- The focused test file is 739 code lines, below the enforced 800-line cap; the
  existing soft 400-line advisory remains.
- Both immutable files have zero diff from the original Task 3 commit.

### Review-fix self-review

- `execFileSync` still receives argument arrays and never a shell command.
- The default adapter requests Buffer output; raw test blobs are never decoded.
- Text decoding is limited to command metadata and receipt JSON.
- Tree probes use `ls-tree` to prove genuine absence, then `cat-file -e` to prove
  the referenced object is available. Failure in either operation is incomplete
  history, not absence.
- Candidate and graduation commit enumeration, direct-parent enumeration, and
  ancestry checks propagate incomplete-history diagnostics with recovery
  guidance.
- Candidate authority remains reachable `origin/trunk` history only.
- Active receipts still bypass every historical Git call.
- Task 2 active-loader behavior and both immutable files remain unchanged.

### Review-fix commit

```text
cee0081eb5cb47ef64d8fea5337dc0e3c3e6e37f fix(test-corpus): preserve exact historical authority
```

The commit contains exactly the same two Task 3 implementation/test files.

### Review-fix concerns

No correctness blockers remain. The focused test file now triggers the existing
soft 400-line review advisory at 739 lines but remains below the enforced
800-line limit.

---

## Task 3 historical object-type fix

The remaining Important review finding was fixed in a second focused follow-up:
every authority-bearing historical file path must resolve to an inspectable Git
`blob`. A `tree`, `commit`/gitlink, or any other object type cannot authorize a
retirement.

### Object-type RED evidence

Command:

```bash
node --test --test-name-pattern='directory at the historical evidence|non-blob direct-parent test|directory at the delivered historical receipt|non-blob receipt authority in a graduation parent' scripts/tests/unit/meta/frozen-test-retirements.test.mjs
```

Result: exit 1; 0 passed, 4 failed. The failures proved:

- a directory/tree at the historical evidence path was accepted as evidence;
- a directory/tree at the direct-parent test path degraded to an ordinary
  digest mismatch;
- a directory/tree at the historical receipt path degraded to JSON parsing of
  a Git tree listing; and
- a directory/tree at the receipt-present graduation parent was accepted as a
  graduation transition.

Representative RED output:

```text
Missing expected exception.
frozen-test-retirements: test scripts/tests/unit/articles/historical.test.mjs does not match expected digest 2d7a36f1e9fd9dc389600655a96fb63c779d5f0b0c1babc91ca0ed421210575c
frozen-test-retirements: invalid historical receipt at scripts/tests/fixtures/test-corpus-frozen-retirements/unit/articles/historical.test.mjs.json: Unexpected token 'e', "tree ce7d2c7"... is not valid JSON
```

### Object-type GREEN evidence

Focused command:

```bash
node --test --test-name-pattern='directory at the historical evidence|non-blob direct-parent test|directory at the delivered historical receipt|non-blob receipt authority in a graduation parent' scripts/tests/unit/meta/frozen-test-retirements.test.mjs
```

Result: exit 0; 4 passed, 0 failed.

Full focused-suite command:

```bash
node --test scripts/tests/unit/meta/frozen-test-retirements.test.mjs
```

Result: exit 0; 33 passed, 0 failed, 0 skipped, 0 todo.

### Object-type implementation

- Historical `ls-tree` output is parsed into explicit path presence, object
  type, and object ID.
- Receipt JSON requires `blob` before any textual decoding or JSON parsing.
- Same-tree Markdown evidence requires an inspectable `blob`.
- Direct-parent test content requires an inspectable `blob` before raw Buffer
  hashing.
- A receipt-present graduation parent requires an inspectable `blob` before it
  can prove the parent side of the transition.
- Non-blob types receive deterministic diagnostics naming the authority path,
  actual type, and expected `blob` type.
- A missing/corrupt blob or failed inspection remains incomplete history and
  includes `fetch complete canonical history for origin/trunk and retry`.
- Genuine path absence remains distinct from invalid type and incomplete
  history.

### Object-type verification

All final commands exited 0:

```bash
node --test scripts/tests/unit/meta/frozen-test-retirements.test.mjs
npx prettier --check scripts/tests/lib/frozen-test-retirements.mjs scripts/tests/unit/meta/frozen-test-retirements.test.mjs
npx eslint scripts/tests/lib/frozen-test-retirements.mjs scripts/tests/unit/meta/frozen-test-retirements.test.mjs
npx cspell --no-progress scripts/tests/lib/frozen-test-retirements.mjs scripts/tests/unit/meta/frozen-test-retirements.test.mjs
npm run lint:test-layout
npm run lint:story-tags
npm run lint:line-cap
git diff --check
git diff --exit-code cee0081eb5cb47ef64d8fea5337dc0e3c3e6e37f -- scripts/tests/fixtures/test-corpus-pre-move.json scripts/tests/integration/meta/test-tree-layout.baseline.json
```

The first line-cap run correctly failed at 832 code lines after adding the four
regressions. Repeated historical-error assertions were consolidated without
removing coverage. The final audit passed at 797 code lines, below the enforced
800-line limit. Formatting, targeted ESLint, spelling, layout, story-tag, diff,
and immutable-file checks all passed.

### Object-type self-review

- Non-blob receipt paths cannot reach JSON decoding.
- Non-blob evidence paths cannot satisfy same-tree evidence authority.
- Non-blob direct-parent test paths cannot reach SHA-256 hashing or degrade to a
  digest mismatch.
- Non-blob graduation-parent receipt paths cannot prove graduation.
- Merge histories may still use another direct parent with a valid blob; the
  non-blob parent itself never contributes authority.
- Raw Buffer hashing, tri-state incomplete-history handling, origin/trunk-only
  reachability, active-receipt Git bypass, deterministic sorting, Task 2 active
  behavior, and immutable files remain intact.

### Object-type fix commit

```text
ad436f78c458d41bc68bd5a979924908f710d00a fix(test-corpus): require blob retirement authority
```

The commit contains exactly the two Task 3 implementation/test files.

### Object-type concerns

No correctness blockers remain. The focused test file is now 797 code lines,
which passes the enforced 800-line cap but leaves little headroom and retains
the existing soft 400-line review advisory.
