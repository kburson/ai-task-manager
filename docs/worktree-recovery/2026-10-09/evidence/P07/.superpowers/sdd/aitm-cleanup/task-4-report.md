# Task 4 report: reconcile active membership without changing frozen data

## Scope and files

Implemented only the four planned Task 4 files:

- `scripts/tests/lib/test-corpus-membership.mjs`
- `scripts/tests/integration/meta/test-corpus-membership.test.mjs`
- `scripts/tests/integration/meta/package-test-corpus.test.mjs`
- `scripts/tests/integration/meta/test-tree-layout.test.mjs`

The immutable frozen manifest and tree-layout baseline were neither edited nor regenerated.

## TDD evidence

### RED

Added five reconciliation cases before changing production code, then ran:

```text
node --test scripts/tests/integration/meta/test-corpus-membership.test.mjs
```

The run failed exactly in the five new cases because the previous reconciler ignored
retirements: an absent retired path still appeared missing, live receipt overlap was
accepted, and the new retirement diagnostic collections were absent.

### GREEN

The reconciler now accepts optional `retirements`, `retirementErrors`, and
`misplacedRetirements`. It derives active membership from frozen paths minus only
single, valid, absent retirement paths. Duplicate, non-frozen, post-snapshot, or
live-overlapping retirement authority stays active and is reported. Retirement-loader
errors and misplaced receipts also remain errors and never subtract membership.

The test coverage proves:

- an absent validated retired frozen path is allowed;
- a live test plus receipt is rejected;
- non-frozen and post-snapshot retirement overlap is rejected;
- duplicate authority is sorted deterministically and does not subtract membership;
- malformed and misplaced retirement diagnostics are formatted; and
- existing post-snapshot reconciliation remains green.

Repository-root membership now loads retirement authority before reconciling. The
package frozen-corpus assertion requires each frozen path to be live or validated
retired while preserving the immutable census, hash, lane, and rename assertions.
The tree-layout AC3/AC4 check subtracts only validated retired basenames in their
original lanes.

## Verification

Passed:

```text
node --test scripts/tests/unit/meta/frozen-test-retirements.test.mjs scripts/tests/integration/meta/test-corpus-membership.test.mjs scripts/tests/integration/meta/test-tree-layout.test.mjs
```

Result: 69 passing, 0 failing.

Passed:

```text
node --test --test-name-pattern='live discovery realizes every frozen destination' scripts/tests/integration/meta/package-test-corpus.test.mjs
```

Result: 1 passing, 0 failing.

Passed:

```text
npx prettier --check scripts/tests/lib/test-corpus-membership.mjs scripts/tests/integration/meta/test-corpus-membership.test.mjs scripts/tests/integration/meta/package-test-corpus.test.mjs scripts/tests/integration/meta/test-tree-layout.test.mjs
git diff --check
git diff --exit-code -- scripts/tests/fixtures/test-corpus-pre-move.json scripts/tests/integration/meta/test-tree-layout.baseline.json
```

The exact immutable-file comparison exited zero, establishing byte-for-byte no
change to either frozen artifact.

The prescribed four-file authority command was also run fresh. It produced 76
passing and one unrelated failure in the existing immutable lane-correction Git
rename assertion: required base `662c49b7129d795b62e3b62f74b76dab5f10055f` is not
reachable from this supplied Task 3 base or from `origin/trunk`. The changed package
live-realization test passed in that same run. No attempt was made to weaken the
immutable assertion or rewrite/rebase history.

## Self-review

Reviewed the staged four-file diff after formatting. The subtraction uses the full
frozen set for overlap diagnostics but only `activeFrozen` for declared membership
and missing-path checks. This preserves the rule that post-snapshot records cannot
overlap either active or retired frozen paths, while unvalidated retirement input
cannot hide an absent frozen test. Tree-layout subtraction uses loader-returned paths
only, grouped by their parsed original lanes.

## Commit

`e15d5fbc1c8d05f4082764673d1381a9f167233b feat(test-corpus): reconcile retired frozen tests`

## Concern

The exact all-four-file authority command cannot be fully green at the mandated
base because its pre-existing lane-correction provenance commit is unavailable from
both `HEAD` and `origin/trunk`. This is outside Task 4 and intentionally left
unchanged.
