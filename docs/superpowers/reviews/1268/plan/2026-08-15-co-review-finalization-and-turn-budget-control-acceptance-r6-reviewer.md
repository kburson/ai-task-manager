<!-- cspell:ignore ENOTEMPTY executability -->

# #1268 Implementation Plan — Reviewer Review R6

## Scope of review

- Plan under review: `docs/superpowers/plans/2026-08-15-co-review-finalization-and-turn-budget-control.md`
- Revised commit: `c52326b1f8decfee3a6ea506f666126e6a3fd743`
- Prior reviewed commits: `7af3f00b8f8af42de71f6e70bcfe780e73e8a9d9` (R2),
  `345cdb54a9caeae14ed70c4926d786bd9b09850d` (R4)
- Method: full `git diff 345cdb54..c52326b1` of the plan, re-verification of both R4 dispositions,
  and a whole-plan re-scan for executability, spec coverage, and WBS boundary defects.
- Reviewer: `reviewer-agent`
- Decision: `accepted`

## Disposition verification (R4 findings)

### [finding:F-007] — resolved

The plan now commits to a single machine-readable shape. Task 5 Step 8 names `availableActions` as
the JSON representation and states that when no two-sided author-completed pair exists the
good-enough action is **omitted from the array rather than emitted as a disabled entry**, with human
output explaining the two-sided-evidence requirement. Task 5 Step 3 asserts exactly that shape for the
opening zero-turn short circuit: `availableActions` omits good enough while retaining continue and
no-action. The disjunction is gone; the RED test is now writable without an arbitrary choice, and the
JSON contract is deterministic across implementations.

### [finding:F-008] — resolved

Task 2 Step 7 now states that its single post-intervention continuation command is an intentional
provisional surface and that Task 5 replaces the intervention rendering with the complete
available-action enumeration. The sequential dependency and the expected later status change are
explicit to both the Task 2 implementer and the Task 2 reviewer, so the child issues no longer carry
a silent contradiction.

No new defects are introduced by this revision. The diff is confined to the two corrections.

## Whole-plan re-verification

- **Executability.** Every command appearing in a Verification Commands or commit block resolves in
  this repository: `node --test scripts/tests/integration/review/co-review.test.mjs`,
  `node --test scripts/tests/unit/task-tracker/lib/command-catalog-policy.test.mjs`, and
  `node scripts/task-tracker/verify-develop.mjs` all exist on disk; `test`, `test:slow`, `lint`,
  `lint:spell`, and `format:check` are all defined in `package.json`. No undefined script name
  remains anywhere in the plan.
- **Repository process conformance.** All six tasks declare
  `node scripts/task-tracker/verify-develop.mjs` alongside their focused test, satisfying CLAUDE.md's
  Develop-phase gate at every commit boundary. Every commit subject carries the `[#1268]` attribution
  token.
- **Protocol integrity.** All three new event types (`budget-adjustment`, `supplement`,
  `human-good-enough`) are registered in `eventIntegrity`'s allowed set in Task 1 Step 7, with
  post-append `integrity.ok === true` assertions in Tasks 3 and 5. The asserted field exists in the
  real status projection (`protocol.mjs:470`, `status --json` → `integrity: {ok, errors}`).
- **Archive determinism.** The exact four-path output set (`README.md`,
  `artifact-<original-basename>`, reviewer document, owner response) is defined once and used
  consistently by filename tests, staged-tree enumeration, conflict classification, and retry
  idempotency. Manifest byte grammar matches the specification's marker/fence contract exactly.
- **TDD ordering.** Every task places its failing-test steps and an explicit RED verification step
  before implementation, including the containment refusals added in Task 1 Step 2.
- **Spec coverage.** Budget arithmetic and role-dependent floors, closing-owner turn preservation,
  supplement registration and acknowledgment, role-dependent continuation, consensus and
  human-good-enough finalization, the three-action intervention status contract, authenticated
  `gh api user --jq .login` identity with `--approved-by` deprecation, accepted-state immutability,
  atomic publication with `ENOTEMPTY` retry, exit code 4, and the nine-command help/self-doc surface
  are all covered with no remaining gap against the approved specification.
- **WBS boundaries.** The six tasks partition cleanly: each declares its own files, interfaces,
  failing tests, implementation steps, staged file list, commit, and self-contained verification.
  Cross-task dependencies are sequential and now explicitly stated where one task revises another's
  surface. Each is independently executable and independently verifiable as a backlog child issue.

## Decision rationale

All eight findings raised across R2 and R4 are resolved and verified against the working tree. No
correctness, safety, completeness, or executability gap remains. The plan is specification-complete
and ready for WBS decomposition.
