# Squash-Delivered Lane-Correction Provenance Design

**Issue:** #1419  
**Status:** Proposed for human approval  
**Delivery dependency:** #1413 / PR #1418  
**Blocks:** writing-studio AITM cleanup Task 4

## Problem

The frozen test-corpus manifest records 97 intentional lane corrections introduced by #1413. Their `provenance.baseCommit` and `provenance.correctionCommit` fields name intermediate commits from the PR source branch. PR #1418 was squash-delivered as canonical trunk commit `b4e952d11c62ba3978a4dee46d47d53051516d2e`, whose parent is `28b28babe6c7d3044dad3c0ea04103ce120d0004`. The source-branch commits are therefore not ancestors of canonical trunk.

`scripts/tests/integration/meta/package-test-corpus.test.mjs` correctly fails closed by requiring every provenance commit to be reachable from `HEAD`. Canonical scheduled CI consequently fails even though all 97 lane moves exist in the delivered tree. The defect is in the recorded authority, not in the reachability assertion or the lane moves.

## Decision

The canonical squash delivery boundary becomes the authority for all 97 #1413 lane corrections:

- `baseCommit`: `28b28babe6c7d3044dad3c0ea04103ce120d0004`
- `correctionCommit`: `b4e952d11c62ba3978a4dee46d47d53051516d2e`
- `renameStatus`: the exact status produced for that path pair by the canonical `baseCommit..correctionCommit` diff at the recorded similarity threshold

The authority test continues to require both commits to be ancestors of the tested `HEAD` and continues to compare Git's exact rename status, migration path, and final path output with each manifest record. The test will expect exactly 97 #1413 records to name the canonical delivery commit and its parent.

This is a historical manifest amendment with a narrow authority boundary. It does not redefine the frozen census or authorize later cleanup changes to the manifest.

## Canonical Evidence

The canonical diff proves all 97 moves as renames. Ninety-four records retain their source-branch similarity score. Three scores change because the squash combines the move with later file edits:

| Migration path                                                         | Final path                                                                    | Old score | Canonical score |
| ---------------------------------------------------------------------- | ----------------------------------------------------------------------------- | --------: | --------------: |
| `scripts/tests/unit/meta/test-tree-layout.test.mjs`                    | `scripts/tests/integration/meta/test-tree-layout.test.mjs`                    |    `R098` |          `R096` |
| `scripts/tests/unit/task-tracker/core/assigned-state-residue.test.mjs` | `scripts/tests/integration/task-tracker/core/assigned-state-residue.test.mjs` |    `R097` |          `R095` |
| `scripts/tests/unit/task-tracker/lib/test-impact-selector.test.mjs`    | `scripts/tests/integration/task-tracker/lib/test-impact-selector.test.mjs`    |    `R098` |          `R094` |

No other score, path pair, lane, or reason changes.

## Data and Invariants

The repair may modify only:

1. The four obsolete SHA literals used by the 97 #1413 records, replacing them with the canonical parent and delivery SHA.
2. The three `renameStatus` values listed above.
3. The focused test's #1413 story tag and canonical authority constants/assertions.

The following remain unchanged:

- manifest `schema`, `sourceCommit`, and `{ all: 915, unit: 837, integration: 27, slow: 51 }` counts;
- every entry in `manifest.tests`, including path mapping, basename, lane, and SHA-256 digest;
- all 98 lane-correction `oldPath`, `migrationPath`, `finalPath`, `fromLane`, `toLane`, and `reason` fields;
- the pre-#1413 correction for `trunk-ref.integration.test.mjs` and its provenance;
- `assertCommitReachable` and the exact per-correction Git diff assertion;
- all live test membership, retirement, and cleanup authority.

## Test and Repair Flow

The focused test first changes its expected #1413 authority from the two source-branch correction commits to the single canonical delivery pair. Against the unmodified fixture, this produces the intended RED result: zero records satisfy the canonical expectation while the existing exact-rename test still reports unreachable source provenance.

The fixture is then rewritten mechanically with guarded occurrence counts:

- one imported-suite base and correction pair;
- 96 test-support-reach base and correction pairs;
- exactly three named score changes.

The GREEN focused run must prove:

1. exactly 97 #1413 records name the canonical pair;
2. the canonical parent and delivery commit are reachable from `HEAD`;
3. every one of the 97 recorded path pairs produces its exact rename-status line from Git;
4. the pre-#1413 correction remains unchanged; and
5. the frozen census and source-digest checks still pass.

The repository's fast, slow, lint, and formatting gates then run at the exact implementation SHA. No source-branch ref is fetched or preserved to make verification pass.

## Failure Handling

The repair fails closed if:

- either canonical commit is missing or not an ancestor of `HEAD`;
- the canonical diff does not produce an exact rename for any recorded path pair;
- the mechanical rewrite finds anything other than the expected 1/96 SHA occurrence split or the three named score entries;
- any frozen test entry, count, source commit, reason, or unrelated correction changes; or
- verification requires merging, fetching, or retaining the #1413 source branch.

A failure in any of those conditions stops #1419. It is not handled by weakening ancestry, lowering rename thresholds generically, or modifying the blocked cleanup branch.

## Alternatives Considered

### Merge the #1413 source branch into trunk

Rejected. This would make the old SHAs reachable but would repair repository topology rather than the manifest's authority. It adds unnecessary history, keeps provenance dependent on delivery mechanics, and does not prevent the same defect after another squash merge.

### Resolve the PR `Source:` trailer or a remote source-branch ref

Rejected. A trailer describes origin but does not make its SHA a canonical ancestor. Remote branch refs are deletable and may not exist in a fresh clone. Either approach weakens reproducibility.

### Add a new provenance schema retaining both source and delivery commits

Rejected for this repair. The source commits add no required verification authority once the canonical delivery diff proves every rename. A schema migration would expand code and compatibility scope without improving the package-corpus invariant.

## Delivery Boundary

Issue #1419 must be implemented and independently reviewed on its isolated branch, then delivered to trunk through the normal governed workflow. The writing-studio cleanup remains paused at commit `e15d5fbc1c8d05f4082764673d1381a9f167233b`. Only after #1419 is present and green on canonical trunk may that cleanup branch sync trunk and rerun its Task 4 verification.
