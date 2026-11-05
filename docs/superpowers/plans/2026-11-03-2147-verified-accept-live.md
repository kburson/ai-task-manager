# Verify accept-live before publishing reconciliation success

Use the executing-plans and test-driven-development skills for this leaf. Package B1 is this #2147 reconciliation leaf; the companion B2 draft consumer is #2149. The accepted specification is `docs/superpowers/specs/2026-11-03-2147-verified-accept-live.md`.

## Story Intent

- **Beneficiary:** Task operator reconciling an issue with its project board.
- **Capability:** Determine whether accepting the live state actually recorded the intended repair.
- **Need:** A rejected or dropped body write currently leaves the issue stale while reporting success.
- **Value or failure prevented:** The operator can investigate an incomplete write before relying on the cache or creating a branch.

## Global constraints

Use the existing issue lock, canonical body writer and failure-comment path. Preserve other reconcile modes and the soft-failure contract used by callers whose board move already committed. Keep the original frozen actor, branch, timing records and location history outside this change. Keep provider traffic in physical fixtures local and fail closed on unexpected requests.

## Review focus

Inspect repeated write attempts after a provider exception, the writer's three-way rebase, mixed modern and legacy representations, demotion of previously verified criteria and disagreement between a successful inner verification and the subsequent independent read. Compare changes in local state and audit evidence separately from the process exit.

## Implementation Tasks

### Current implementation and historical evidence

This is a continuation plan. The original test-first implementation has already been produced and is preserved uncommitted. Adopt the independently source-reviewed patch with SHA-256 `79142974beeb57dae02e61dbe99b44a64b99f349a13ed17da5531a98a0dc8a31`, after checking its manifest against the working files. Its patch, 14-file manifest and historical verification index are in `.scratch/plan/b1/candidate-79142974beeb57da/`. Its recorded source base is planning commit `c1ea98935debeff50d711f7a5ab143e312a7787e`, whose production files were unchanged from trunk `2fd89e1103a0ee1976e0e1a1210c2d4e1bb57de0`.

The initial public-entry red run already happened before production edits in this physical worktree. `.scratch/plan/b1/red.log` retains 11 failed behavioral assertions, including false exit 0 after rejected and dropped writes. Subsequent red/green review regressions and the final 39-case physical suite are retained alongside it. Preserve those files and their provenance. Do not reset the accepted patch, recreate red evidence or represent a run against today's modified source as a baseline run. Keep all existing physical tests and production changes; add the remaining qualification below. New tests of behavior already provided by the accepted patch may pass immediately and are qualification evidence, not a fabricated red phase. If a new case exposes a production defect, preserve its genuine failing result before correcting the implementation and rerun the affected suites.

### Task 1: Complete qualification of verified normalization

#### Story Intent

- **Beneficiary:** Task operator using accept-live.
- **Capability:** See a truthful confirmed, failed or partial result before trusting the session cache.
- **Need:** An acknowledged write or a soft retry failure can otherwise hide missing issue state.
- **Value or failure prevented:** The operator retains evidence and avoids continuing with a stale binding.

#### Files

- Retain `scripts/task-tracker/verbs/reconcile.mjs` and its narrow supporting changes in `gh-timing-comment.mjs` and `lib/{marker-grammar,stage-entry-grammar,stage-entry-markers,state-recording,issue-body-mutate,versioned-issue-write}.mjs`. The accepted patch implements fresh-body writes, complete evidence inspection, observed-conflict latching, returned-outcome handling and independent readback. Change production only if remaining qualification finds a real defect.
- Extend `scripts/tests/integration/task-tracker/reconcile-accept-live.test.mjs` and its bounded provider `scripts/tests/fixtures/reconcile-accept-live-provider.mjs`. Keep `createRuntimeRootFixture`, real public CLI execution and fail-closed provider requests. Observe remote evidence, command status and local binding independently.
- Retain the stateful fixture corrections in `scripts/tests/unit/task-tracker/verbs/reconcile-verb.test.mjs`, `scripts/tests/unit/task-tracker/lib/coverage-reconcile.test.mjs` and `scripts/tests/slow/task-tracker/verbs/deadlock-regression.test.mjs`. Preserve the unchanged `reconcile-sentinel-drift.test.mjs` and `reconcile-no-drift-seed.test.mjs` as adjacent regressions. Keep the narrow GraphQL inventory location updates aligned if source lines move.

#### Steps

1. Verify and adopt the preserved patch and historical red/green evidence as described above. Do not repeat completed baseline work or borrow its results for new code.
2. Add separate public-entry audit cases: a rejected audit write with independently reverified primary evidence returns success, publishes the bound cache and leaves no audit; a lost audit acknowledgement makes exactly one audit attempt and cannot duplicate a landed audit; an audit-time state or visit conflict stays partial with the old cache even if a later read appears restored. Retain the existing audit overlap, prose, unavailable-read and board-drift cases. Assert attempt counts, audit counts, final body evidence, exit and cache separately.
3. Add the partial-result continuation in the same bound physical fixture. Force the primary write to land and the independent readback to fail, assert nonzero partial and unchanged cache, then restore authoritative reads. Capture the partial command's stdout, stderr and exit status as the diagnostic; issue-side diagnostics remain best-effort and must not be assumed to exist. Run public `aitm pause` then public `aitm start 71 --role agent`. Assert the resulting cache equals the actual recorded/live state, the existing stage visits remain byte-for-byte and no reconciliation audit was added. Also exercise a cache-seeding read warning during continuation: Start's successful process exit alone is insufficient, the warning means recovery is incomplete, and the operator resolves the read failure and repeats Pause/Start rather than replaying accept-live. Do not forge an actor or claim: preserve genuine native session identity in host-qualified tests, and report skips honestly in hosts without it.
4. Preserve and name the legacy regressions: the retired `validate` to Develop case strips stale proof and retains old visits; the legacy `development` representation normalizes to Develop without losing history. Preserve the no-drift behavior of modes outside this leaf. If any new test fails due to a real production gap, retain the failure and correct only that gap before rerunning it and the related writer/grammar/reconcile tests.
5. Run the Develop checks below and obtain independent source-review disposition for any production correction. Preserve a new manifest when test or source bytes change, with an explicit relationship to the original accepted candidate. After ordered spec/plan review is finalized, commit the scoped implementation with `[#2147]`, record its actual commit trail and complete exact-head verification through AITM. Follow current Explain decisions and the Test/Review/delivery gates; historical green logs are supplemental evidence and do not substitute for new exact-head receipts.

**Develop verification:**

```sh
node --test scripts/tests/integration/task-tracker/reconcile-accept-live.test.mjs
node --test scripts/tests/unit/task-tracker/verbs/reconcile-verb.test.mjs scripts/tests/unit/task-tracker/lib/reconcile-sentinel-drift.test.mjs scripts/tests/unit/task-tracker/lib/reconcile-no-drift-seed.test.mjs
npx --no-install aitm verify-develop --mode iteration --issue 2147
```

The first command includes the new continuation and audit cases. The second protects existing mode behavior. Use the registered `verify-develop` owner, which selects the current project provider; do not assume the older lint-fix pipeline described in `CLAUDE.md` still matches the current source. Run the affected iteration check on the final source before the implementation commit. After committing clean source, run `npx --no-install aitm verify-develop --mode final --issue 2147` when its live guidance admits it, and retain the exact-head receipt.

**Test-stage verification and delivery:**

Use `npx --no-install aitm promote 2147` only when fresh Explain admits it. The current project Test provider checks complete cloud CI receipts through `scripts/maintenance/verify-ci-receipts.mjs`. Require the exact implementation HEAD to pass the configured fast and slow regression lanes (`npm test`, `npm run test:slow`) and lint/format checks in the governed Test/CI flow. Do not rerun both full lanes during Develop. The earlier full local lane logs remain historical supplemental evidence, not Test-stage authority. Follow the configured provider's returned remediation if remote receipts are unavailable; do not replace it with a custom local green stamp. After independent Review and approved Full-Auto gates, use governed delivery and its exact expected-head provider action, then close only from the live-verified delivery receipt. Keep #2149 separately attributed and bound.
