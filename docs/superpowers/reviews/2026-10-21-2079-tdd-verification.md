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
