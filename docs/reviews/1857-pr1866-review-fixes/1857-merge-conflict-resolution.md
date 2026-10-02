# #1857 / PR #1866 Merge-conflict Resolution

## Merge identity and boundary

This report describes the verified resolution prepared for the merge commit whose parents are PR repair head `2870d6312bd708ff905e56809a5b43fb14d5dd06` and `origin/trunk` at `120ed5ae6d0c8c8e9cb7d48623bec0a572ae430c`.

This report records only conflict resolution and its verification. It does not approve the whole PR, complete the #1857 epic or C1–C5, activate runtime defaults, migrate live state, or authorize cleanup.

## Resolutions

Five content conflicts were resolved by preserving the applicable behavior from both sides:

1. `scripts/task-tracker/lib/action-decision/legacy-refusals.json` was regenerated from the merged source so the derived refusal inventory matches both implementations.
2. `scripts/tests/fixtures/state-engine-policy-baseline.mjs` refreshed the policy-emitter line baseline without changing the assertions.
3. `scripts/tests/unit/task-tracker/core/package-boundary.test.mjs` combines the package-boundary allowances required by both branches.
4. `scripts/tests/unit/task-tracker/lib/guidance-candidate-measurement.test.mjs` retains trunk's historical/provenance assertions and supplies an explicit isolated test actor.
5. `scripts/tests/unit/task-tracker/lib/guidance-characterization.test.mjs` retains trunk's historical/provenance assertions and supplies an explicit isolated test actor.

Two new integration fixture files were also made independent of ambient identity:

- `scripts/tests/integration/task-tracker/lib/action-close-normalization.test.mjs`
- `scripts/tests/integration/task-tracker/lib/action-review-reviewed-scope.test.mjs`

Each now creates its own isolated actor state while exercising the existing Close and Review assertions unchanged. No production behavior was altered for those fixture conversions.

## Verification

| Lane | Result | Receipt |
| --- | ---: | --- |
| Conflict-focused regression batch | 42/42 passed | [1857-conflict-final-tests.log](merge-resolution-receipts/1857-conflict-final-tests.log) |
| Merged integration batch | 74/74 passed, exit 0 | [1857-merge-integration-final.log](merge-resolution-receipts/1857-merge-integration-final.log) |
| Merged fast/unit lane | 36 failed files of 936 | [1857-merge-final-unit.log](merge-resolution-receipts/1857-merge-final-unit.log) |
| Scoped ESLint and Prettier | Passed | final scoped command receipts |
| Refusal inventory | 36 guards passed | final inventory receipt |
| Resolution-path diff check | Passed | final scoped diff-check receipt |

The exact 36-file failure set in the merged 936-file lane equals the pre-merge candidate's 36-file failure set from `/private/tmp/1866-fixes-final-unit-frozen.log`; there are no new or removed failing files. The larger file census reflects the merged trunk additions. This establishes that conflict resolution preserved the known aggregate-failure boundary. It does not make the unit lane green.

The cached whole-merge diff check reports whitespace only in multiple incoming immutable #1859 historical red logs. Those historical captures were left byte-preserved. Resolution-path checks pass when scoped to the resolved paths, so immutable evidence is not rewritten to manufacture a clean global check.

## Preservation and remaining limits

The original dirty `1857-artifact-writes` worktree, index, staged rename, runtime state, and historical captures remain untouched. No manifest or accepted review record was edited. This documentation step performs no staging, commit, lifecycle action, runtime migration, cleanup, or remote mutation.

The merge resolves source coexistence between the PR repair branch and trunk. PR #1866 remains a broad incomplete candidate: 36 unit files still fail, the #1857 epic/runtime release remains unfinished, and C1–C5 verification, installation, live activation, cleanup, lifecycle approval, and operational admission remain outstanding.
