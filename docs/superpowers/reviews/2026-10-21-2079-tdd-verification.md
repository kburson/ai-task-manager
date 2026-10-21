# #2079 TDD and focused verification

## Observed red/green cycle

Before production changes, the four new tests failed on the intended behaviors: no root launch inspection (0 versus 1), an inherited diagnostic writer sweeping history (1 versus 0), absent advisory-failure warning, and repeated opted-out writer sweeps (3 versus 0). No syntax/import failures were used as regression evidence.

The minimal correction changes 16 production lines across collection.mjs and storage.mjs. Every collection-owned writer opts out of startup and periodic retention inspection. Root prepareUsageEnv performs one explicit advisory inspection before native command deadlines; advisory failure is caught independently of available collection. Direct writer defaults, explicit retention, raw records and native authority budgets remain unchanged.

After the correction, the four behavior tests passed. Two additional real captured offline epic cases also passed: all three successful authority observations were retained, and ownership drift still refused with all four reads retained. Their provider binaries accept only fixture queries; no live GitHub call was made. These temporary collector roots are distinct from the live worktree capture store.

## Commands and results

`node --test scripts/tests/unit/task-tracker/lib/decomposition-snapshot-deadline.test.mjs`

Observed initial result: 0/4 passed, 4 intended assertion failures. Observed post-correction result: 6/6 passed, zero failures after captured cases were added.

`node --test scripts/tests/unit/task-tracker/lib/decomposition-snapshot-deadline.test.mjs scripts/tests/unit/task-tracker/lib/graphql-usage-storage.test.mjs scripts/tests/integration/task-tracker/graphql-usage-storage.test.mjs scripts/tests/integration/task-tracker/graphql-usage-collection.test.mjs scripts/tests/integration/task-tracker/lib/decomposition-hook-traffic.integration.test.mjs`

Observed result: 96 tests passed, zero failures, approximately 15.5 seconds. Existing malformed pagination, root/body/owner/field/child drift, native source/activity hooks, permission-context transitions, multi-process capture and storage containment cases remain green.

Targeted ESLint for both production files and the new test passed. Prettier left production and plan bytes unchanged and formatted the new test. Repository diff whitespace check passed before commit preparation.

## Limits and pending work

These are observed focused results, not full-suite completion, code-review acceptance, native delivery, or proof that the live #2039 operation now fits its deadline. Independent exact-commit code review, ordinary repository delivery checks and a single captured native #2039 confirmation remain required. No historical-cloud estimation lookup, capture suppression, raw-record cleanup, timeout increase or admission waiver was used.

## Final acceptance characterization after orchestration collateral commit

The separate #2039 governance/refinement/quota collateral was committed as 9dc824cc9, restoring a clean verification boundary. Native #2079 Plan Metadata was then updated at body version 45 to reference the committed follow-up plan and both code reviews, while explicitly preserving the original approval history rather than claiming a new native approval.

Added one offline sequential-read characterization to the integration deadline file. It exercises the real collector with the complete existing two-page-comments fixture and a monotonic fake clock: each response consumes 3 seconds, two sequential responses consume 6 seconds against the unchanged shared 5-second remote allowance, and the collector refuses remote-deadline after exactly two requests without a fence, retry or write. Later requests receive a smaller remaining timeout. Resetting the allowance per request would break the refusal assertion. The existing real hung-transport test separately exercises the real finite five-second timer.

This characterizes a pre-existing unchanged safeguard and passed on its first run; it is not represented as a newly observed production RED/GREEN fix. The production fixes' actual red/green evidence remains above and in the retained follow-up report. No production deadline, permission, transport fallback or authority cache changed for this test.

The exact three-file acceptance verifier passed 46/46, including malformed pagination, mixed identities, body/owner/child drift, captured offline epic authority, unedited leaf traffic, hung transport, aggregate exhaustion and 32-child local parsing/isolation. Targeted ESLint, Prettier and git diff checks passed. Full native exact-head Test/Review/delivery remain pending; the earlier complete suites are not substituted for that receipt.
