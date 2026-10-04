# #1861 runtime kernel implementation plan

**Goal:** Complete the preserved crash-safe runtime kernel without live migration.

**Architecture:** Existing physical roots, coordinator and whole-operation leases remain authority. Add exact-byte batch journaling, read fencing and observed bootstrap recovery, with real killed-process proof of the same kernel outcome.

**Tech stack:** Node ESM, node:test, disposable real Git fixtures, delivered lifecycle control, canonical test-impact analysis (TIA), GitHub PR CI.

## Story Intent

- **Beneficiary:** AITM operator recovering an interrupted command
- **Capability:** runtime changes expose one complete, recoverable outcome
- **Need:** a process can die between binding, timing and global record publications
- **Value or failure prevented:** contradictory authority is refused rather than silently consumed by ordinary commands

## Inputs

Existing #1861, accepted `docs/superpowers/plans/2026-10-01-1857-remaining-work-decomposition.md`, and JIT `docs/superpowers/specs/2026-10-02-1861-runtime-kernel-design.md`. Accepted historical artifacts remain unchanged. The user's current execution instruction supersedes older local full-suite assumptions: local lint, format and TIA; full lanes in PR/cloud.

## Global Constraints

Preserve unrelated WIP, staged rename, backups, private fixtures, equals file and protected snapshots. Exact-path commits after ownership admission. Actual cwd/branch/hooks remain bound to the isolated continuation worktree. Lifecycle uses the delivered scoped control. Candidate runtime commands use disposable roots only. No live migration, image/default replacement, destructive selection or invented receipts. Candidate discovery covers `scripts/`, excluding preserved source copies. Never run complete test lanes locally, including through an indirect sandbox action.

## Review Focus

Complete payload journals precede every member write. Check every conflict before replay. Readers fail closed on incomplete/malformed journals. Killed publishers/resumers and Promise misuse retain protection. A lease is not atomic publication. Completed retries never undo later writes. Broad compatibility evidence belongs to cloud; C1 still owns classification and repair of its regressions.

### Task 1: Complete the recoverable kernel and its crash contract

This is one implementation outcome. Batch implementation and real crash/replay tests are inseparable: neither constitutes an acceptable deliverable alone. The earlier second task mixed additional kernel contract tests with an incorrectly local full-unit run. Its substantive crash work remains below; complete-suite execution is a PR acceptance activity, not another local implementation task.

Files:

- Create `scripts/task-tracker/lib/runtime-batch.mjs` and `runtime-batch-admission.mjs`; low-level read admission avoids circular storage imports.
- Modify `scripts/task-tracker/lib/runtime-writer.mjs` and `runtime-storage.mjs` for supported raw-byte/JSON batch validation, deletion, expected-before assertions and pending read refusal.
- Modify migration admission, registered migrate-runtime handler and its shared catalog/routing/help hunks for batch-status/batch-resume only; the epic controller serializes these shared-file edits.
- Create `scripts/tests/integration/task-tracker/lib/runtime-batch-recovery.test.mjs`; extend publication-validation, bootstrap admission, migration transaction, coordinator/operation recovery, initialization crash and initialize tests.
- Repair only demonstrated C1 defects in migration input/plan/apply/lock, initialization-record/recovery and storage. C1 owns catalog/census/timing prerequisites as amended below; C2 owns production consumer adoption.
- Record fresh receipts and failure attribution in `docs/reviews/1857-remaining-work/1861-*` without replacing historical observations.

Steps:

1. Write failing owned contract tests for valid binding/actor/global batch, deletion, binary capture and proposed siblings, expected-before conflicts and complete prepublication validation. Use activated disposable Git roots. Observe the actual missing implementation failure before source edits.
2. Implement the protected schema-versioned journal, exact payload/identity capture, leases, coordinator serialization, ordinary-read fencing and publication. Follow the saved design; validate supported catalogs rather than trusting arbitrary callbacks.
3. Add actual SIGKILL tests after journal publication and each member, registered observed resume, changed journal/member refusal, live/foreign/unknown owner refusal, killed resumers and completed retry. Preserve every conflict set before writes. Exercise the real registered physical bootstrap route.
4. Complete real killed-process coverage for existing migration/initialization boundaries. Prove original bytes, controls, read refusal, exact ownership, competing recovery and eventual completion. Thrown faults remain supplemental.
5. Test successor/no-fence timing-only retry, retained-fence original census, new-root initialization, partial loss, explicit empty admission and synchronous Promise protection. Add regression tests before demonstrated source repairs.
6. During edits, use canonical TIA to explain and run the affected owned tests, including newly added contract tests. Preserve the exact selected census and actual outcomes. A selector fallback requesting a complete lane is a policy conflict to resolve, not permission to run it locally. At completion run local lint and format checks and record their actual evidence.
7. Commit only admitted owned paths/hunks, preserving unrelated WIP/index. Open the normal PR and obtain cloud acceptance below. Inspect every failure, repair C1 regressions locally with TIA, and rerun affected cloud checks after changes. Do not advance lifecycle using fabricated local or cloud receipts.

Run: `node node_modules/@kburson/ai-task-manager/bin/aitm.mjs verify-develop --mode iteration`

## Local verification

Local execution is limited to lint, format and TIA-selected tests. Focused RED/GREEN contract runs belong to that affected set. Develop finalization owns lint-full and format-full; it must not add complete unit/integration/slow suites. Existing broad recovered WIP may enlarge TIA selection; record the selection honestly rather than disguising a complete suite as targeted verification.

## PR/cloud acceptance

PR CI owns complete unit and integration lanes at the exact candidate head. Required slow coverage uses `ci-slow` or the supported cloud dispatch; ordinary PR CI does not run it automatically. C1 owns the first post-kernel complete-unit result and attribution using actual cloud output. Classify against preserved baseline/current source, repair C1 regressions and retain inherited C2 failures as remaining joint-release work. Never infer green by subtracting historical counts.

The issue's full-suite verification requirements remain required cloud evidence. Preserve job URLs, exact tested SHA, selected lane/census, actual exit/conclusion and output. The current local `/task test` adds complete lanes independently; do not invoke it on this machine merely to obtain a receipt. Resolve the supported cloud execution/evidence path before the Test transition, without waiving required verification or inventing an import mechanism.

## Estimate and handoff

Planning allowance: kernel 5h, crash contract proof 3h, cloud-result attribution/repair 2h and plan/review repair 2h. Registered convergence previously returned XL/20.5h; the 12h allowance never replaces that field. Reassess at 12h actual child engagement or material contract expansion. Full-suite durations are cloud work and are not charged as duplicate local runs.

C2 receives the verified batch API/schema and recovery; C3 physical owner/read-refusal/generation identities; C4 bootstrap grammar. Changes reopen dependent acceptance. C1/C2 jointly gate runtime, C3/C4 usable cleanup and C5 joint exact-head verification and operational admission.

## TIA preflight ruling for the recovered candidate

Fresh preflight against all restored HEAD dirt selected all 1,248 tests and escalated unit/integration/slow because inherited `runtime-scratch-dir` work changes `scripts/task-tracker/lib/scratch-dir.mjs`. It was not executed. Therefore the Task 1 iteration command is a documented normal route, not an instruction to execute its whole recovered-diff escalation locally.

For continuation RED/GREEN, call the same canonical `selectAffectedTests` library using the actual C1 continuation changes relative to the byte-verified recovered snapshot `bec7e45429838dcc7123283dddb69001720dc2c1`, including new owned test paths. Compare filesystem Git blob identities with that tree; do not assume the working index tracks the snapshot's original untracked files. Retain the base, changed-path census, selected test paths/reasons and actual run results in an ignored local TIA receipt. This is iteration coverage for new C1 changes only; it grants no whole-candidate acceptance or clean-HEAD receipt. The complete restored candidate remains covered by PR/cloud lanes. Any full-lane escalation in this continuation selection is also deferred to cloud; do not change the manifest, conceal exclusions or call a complete local run targeted verification. Local lint/format still check the actual candidate as appropriate.

## Ownership amendment — 2026-10-03 (#1861 / #1862)

The user authorized reassignment of already-preserved prerequisites from #1862 to #1861. This corrects the delivery dependency split and adds no implementation. Inherited Astra WIP retains its original provenance; historical approval/digest, estimates and timing are not rewritten as approval or measurements of this amendment.

C1 (#1861) owns the existing kernel prerequisites: runtime-record-catalog.mjs, runtime-capture-catalog.mjs, runtime-migration-catalog.mjs, runtime-process-census.mjs, runtime-writer-census.mjs, runtime-migration-timing.mjs, pending-ask-record.mjs. It also owns only the catalog-required validateReadyForPlanMigrationJournal, validateClosedBindingLedger and validateActorFlushJournal exports and their supporting validator hunks in ready-for-plan-migration.mjs, worktree-binding-lifecycle.mjs and actor-flush-journal.mjs. C2 (#1862) retains production consumer adoption, call-graph closure, historical compatibility, timing transport integration and affected fixture conversion; these validator transfers do not transfer entire consumer files.

C1 owns the existing prerequisite contract tests: scripts/tests/integration/task-tracker/lib/runtime-migration-catalog.test.mjs, scripts/tests/unit/task-tracker/lib/runtime-migration-timing.test.mjs, scripts/tests/unit/task-tracker/lib/runtime-process-census.test.mjs, scripts/tests/unit/task-tracker/lib/runtime-record-catalog.test.mjs, scripts/tests/unit/task-tracker/lib/runtime-capture-catalog.test.mjs, scripts/tests/unit/task-tracker/lib/runtime-writer-census.test.mjs. In shared actor-flush, Ready-for-Plan and worktree-binding suites, only validator-contract assertions transfer; adoption/fixture-conversion assertions and the staged actor-flush test rename remain C2. C2 consumes these accepted interfaces rather than re-delivering them. C1 must include the prerequisite closure in its isolated PR; joint runtime release and operational admission remain gated on the later children. No test stamp or completed story is inferred from this ownership amendment.

Local verification remains lint, format and canonical TIA only; complete lanes run in cloud CI. After CI is green, the user requires GPT-6.1 Sol at Extra High effort for the #1861 PR code review. Scope amendment review and any governed estimate/approval reconciliation precede additional implementation; existing approvals remain historical.
