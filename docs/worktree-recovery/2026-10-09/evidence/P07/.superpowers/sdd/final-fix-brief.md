# Final Review Fix Brief: Remove Orphaned AC6 History Enforcement

## Finding

The broad branch review found that Task 1 removed the `#868 AC6` Git-rename
provenance test but left its supporting full-history CI subsystem live:

- `.github/workflows/ci.yml` still forces `fetch-depth: 0` in both jobs and
  carries AC6/#949 comments.
- `scripts/task-tracker/lib/ci-workflow-history.mjs` and
  `scripts/task-tracker/lib/git-provenance.mjs` have no remaining consumer
  except their own obsolete tests.
- `scripts/tests/unit/meta/ci-workflow-history.test.mjs` and
  `scripts/tests/unit/task-tracker/lib/git-provenance.test.mjs` enforce the
  deleted proof.
- The current baseline still records those two tests.
- `scripts/tests/unit/task-tracker/core/ci-745-trunk-ref.test.mjs` carries stale
  #949/#868 explanatory comments even though its live #745 local-trunk behavior
  remains required.

This violates the approved design requirement: no current test-corpus guard
reads historical commits or remote history, and no migration-era authority
remains in HEAD.

## Required change

1. Before editing, run a targeted residue command over `.github/workflows/ci.yml`
   and `scripts/**` for `ci-workflow-history`, `git-provenance`, `fetch-depth: 0`,
   `#949`, and the test-tree-specific `#868 AC6` wording. Record this RED output.
2. Verify read-only that no independent current test or runtime caller imports
   `auditCheckoutHistory`, `provenanceVerdict`, or `isShallowRepository`.
3. Delete exactly:
   - `scripts/task-tracker/lib/ci-workflow-history.mjs`
   - `scripts/task-tracker/lib/git-provenance.mjs`
   - `scripts/tests/unit/meta/ci-workflow-history.test.mjs`
   - `scripts/tests/unit/task-tracker/lib/git-provenance.test.mjs`
4. In `.github/workflows/ci.yml`, remove both `with: fetch-depth: 0` blocks and
   all AC6/#949/full-history commentary. Retain both #745 pull-request-only
   `Materialize local trunk ref for real-git tests (#745)` steps and their
   command `git fetch --no-tags origin trunk:trunk`.
5. In `scripts/tests/unit/task-tracker/core/ci-745-trunk-ref.test.mjs`, replace
   the stale #949/#868 comment above `MATERIALIZE_RUN` with a current #745-only
   explanation. Do not weaken its AC1, AC2, or AC4 assertions.
6. Regenerate `scripts/tests/integration/meta/test-tree-layout.baseline.json`
   with the approved deterministic `laneManifest()` generator. Expected final
   lane counts: 771 unit, 138 integration, 52 slow.
7. Run the residue command again. It must print no relevant live match. Do not
   treat unrelated acceptance-criterion labels such as other stories' `AC6` as
   residue.
8. Run focused tests:
   - `scripts/tests/integration/meta/test-tree-layout.test.mjs`
   - `scripts/tests/integration/meta/package-test-corpus.test.mjs`
   - `scripts/tests/integration/task-tracker/lib/test-impact-selector.test.mjs`
   - `scripts/tests/unit/task-tracker/core/ci-745-trunk-ref.test.mjs`
   - `scripts/tests/slow/task-tracker/core/ci-lane-wiring.test.mjs`
9. Run `npm run lint:test-layout`, `npm run lint:story-tags`,
   `npm run lint:line-cap`, `npm run lint:test-reach`, and one complete
   `npm run quality`.
10. Review the exact staged scope, run `git diff --cached --check`, and commit
    as `chore: remove obsolete test-history CI enforcement`.

## Global constraints

- Work only in the existing linked worktree and
  `claude/articles-book-publication-6a7dfe` branch.
- Do not touch the main checkout, #1367, or #1421.
- Do not create/bind an issue, branch, worktree, PR, or push.
- Do not add replacement history tooling, tombstones, receipts, or automation.
- Preserve historical specs/plans/reviews/research.
- Use `apply_patch` for hand edits and the approved deterministic Node command
  for the generated baseline.
