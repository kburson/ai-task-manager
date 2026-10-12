The failure occurs before any project tests run. In a `pull_request` job, `actions/checkout` checks out the synthetic merge ref. With `fetch-depth: 2`, the runner has the merge commit and its two direct parents, but the epic-base parent is itself several commits beyond `trunk` and is marked shallow. The later `git fetch --no-tags origin trunk:trunk` creates the local ref required by #745 without connecting that ref to the shallow epic-base parent. Consequently `git diff --name-only trunk...HEAD` cannot discover a merge base and exits 128.

### Files to edit

- `.github/workflows/ci.yml`: make the fast checkout history-complete and update its rationale.
- `scripts/tests/unit/task-tracker/core/ci-745-trunk-ref.test.mjs`: replace the direct-to-trunk depth-2 assumption with the stacked-PR ancestry contract while retaining all #745 assertions.
- `docs/superpowers/plans/2026-09-17-1685-stacked-pr-ci-merge-base.md`: record the test-first implementation and verification sequence.

### Implementation sequence

1. Change the existing workflow contract test to require one fast-job `fetch-depth: 0`, reject `fetch-depth: 2`, and retain the local-trunk and three-dot-diff assertions.
2. Run that focused test and confirm it fails against the current workflow for the expected depth mismatch.
3. Change only the fast checkout to `fetch-depth: 0` and explain that full ancestry is required for stacked epic-child merge-base discovery.
4. Run the focused test, fast and slow suites, lint, format, and diff checks.

### Test addition

The existing `scripts/tests/unit/task-tracker/core/ci-745-trunk-ref.test.mjs` AC3 case will become the regression test. It will fail if CI returns to depth 2, if the fast job loses complete ancestry, if the slow job gains an unintended explicit depth, if the `trunk...HEAD` classifier changes, or if either #745 materialization step disappears.

### Risks

- Full history increases checkout transfer size, but provides deterministic correctness for arbitrarily deep governed epic stacks; a fixed larger shallow depth would only move the failure threshold.
- The #745 local `trunk` ref remains necessary even with full ancestry because real-git close-gate tests resolve a local branch name.
- Slow-lane and npm compatibility checkout behavior must remain unchanged.

### Sibling work

No sibling issues are required. This standalone defect blocks #1658 and is intentionally isolated from epic #1558.

## Dependency Map

Depends on: none

Blocks: #1658 (PR #1684 required CI cannot classify its stacked epic-child diff)
