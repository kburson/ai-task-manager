# #1861 crash-safe runtime kernel design

JIT C1 design under the accepted #1857 decomposition and R1–R9 contracts. It completes inherited candidate primitives, without live migration or claiming C2 adoption.

## Story Intent

- **Beneficiary:** AITM operator recovering an interrupted command
- **Capability:** runtime changes expose one complete, recoverable outcome
- **Need:** a process can die between binding, timing and global record publications
- **Value or failure prevented:** contradictory authority is refused rather than silently consumed by ordinary commands

The operator runs the registered bootstrap recovery route from the physical Git worktree. Complete payloads and exact identities permit the original outcome to finish. Changed bytes, malformed journals or uncertain death refuse and preserve evidence. Completion admits ordinary reads; installation, migration, delivery and issue closure remain separate gates.

## Candidate and authority

Actual cwd `/Users/kpburson/.codex/worktrees/8dae/ai-task-manager`, branch `codex/1857-continuation`. HEAD `171c7d93866f67b58effa635be5ae737f54ef9eb`; inherited snapshot `bec7e45429838dcc7123283dddb69001720dc2c1`. All 3,720 snapshot files matched after restoration. Preserve the staged R100 actor-flush rename and all unrelated WIP. Lifecycle and hooks use the delivered scoped control image; candidate commands operate only disposable fixtures.

## Batch interface

`writeRuntimeRecordBatch(records, options)` is synchronous. Ordered records are `{ target, bytes, actorIdentity?, expectedDigest? }`. bytes is a Buffer for publication or null for deletion. expectedDigest, if supplied, is the exact before-byte digest or null for required absence. `writeRuntimeJsonBatch` serializes JSON `{ target, value, actorIdentity?, expectedDigest? }` entries and delegates. No async callback is accepted.

Targets must resolve to physically registered roots with the same main Git owner and supported durable-store records, including capture binary payloads. Validate the whole batch before publication. Duplicate targets, unknown schemas, scope mismatches, symlinks and expected-before conflicts refuse. Capture validation sees proposed sibling bytes where supplied; deletion validates the original supported record and refuses removal of mandatory state, queue, fleet or occupancy. Optional bindings and complete capture bundles remain deletable. No arbitrary caller validator grants authority.

The protected journal is under the physical main owner's durable runtime at `batches/<operationId>/journal.json`. Its versioned schema records operation ID, genuine owner, physical roots, activation generation and every member's exact before identity/bytes or absence and after bytes/digest or deletion. Publish and fsync the complete journal before changing any member. Existing whole-operation leases for all roots plus main-owner store coordination serialize against migration and other batches. Ordinary readers refuse unfinished/malformed batches and pending publication artifacts. Completed receipts remain audit evidence.

`inspectRuntimeBatch({ projectRoot, mainRoot, operationId })` returns validated status and exact journal observation digest without ordinary authority reads. `resumeRuntimeBatch({ projectRoot, mainRoot, operationId, observedDigest, adapters })` requires that exact observation, unchanged roots/generations and genuine original ownership or confirmed exact prior-owner death. Check every member before replay: it must still be original before identity/bytes or exact after bytes/absence. Replay only original payloads/deletions. Conflicts preserve all records and journals; replay is idempotent.

Recovery uses the existing protected main coordinator. Recover a dead coordinator through its observed route before batch resume. A killed resumer leaves its own genuine owner and original payloads recoverable by the same rules. Sync Promise misuse in existing wrappers retains protection and typed refusal. Complete receipts do not authorize undoing later valid writes.

Registered bootstrap grammar: `migrate-runtime batch-status --operation <UUID>` and `migrate-runtime batch-resume --operation <UUID> --observed sha256:<64hex>`. Existing physical registered-executable admission applies. No argv payload/file/PID/override grants authority. Status may lack actor identity; resume requires it.

Refusals: `RUNTIME_BATCH_INCOMPLETE` ordinary reads, `RUNTIME_BATCH_CONFLICT` changed journal/member/root identity, `RUNTIME_BATCH_INVALID` unsupported journal/arguments. Existing coordinator-busy, identity-required and owner-unconfirmed meanings remain. C2 adopts this interface for state/question/capture after verification. Changes reopen dependent acceptance.

## Recovery inventory

Real SIGKILL cases cover migration bootstrap journal, fence, staged root, each root publication, control activation, complete manifest, timing publication and fence release. Initialization covers claim, stage, publication, completed journal and competing recovery claim. Verify original source/record bytes, controls, read refusal, exact owner observations, supported recovery and eventual completion. Thrown fault injection is supplemental.

Completed/no-fence migration permits timing-only retry against proven successor generations/census without republishing stores. Retained fences require original roots. New linked roots initialize explicitly. Partial loss refuses. Proven empty total absence is an accepted requirement; PR review found that the fresh-main admission route is missing and remains an acceptance blocker. Linked-root empty initialization refuses protected durable or historical legacy evidence at planning and apply-time recheck.

## Budget and acceptance

L/12h allocates kernel 5h, killed recovery 3h, first full-unit classification/attributable repair 2h and plan/review repair 2h. These are allowances, not measured telemetry or calibrated forecasts. Registered estimation owns convergence. Reassess at 12h or material new contract; no nested defect graph hides overruns.

Acceptance requires the five existing ACs, fresh focused results and first complete post-kernel unit lane with failure attribution. C1 owns regressions; C2 owns inherited consumer incompatibilities; C5 owns joint exact-SHA verification, final independent review and operational disposition.

## Execution locality amendment

The user's current instruction is authoritative: local checks are lint, format and canonical TIA-selected tests only. Complete unit, integration and required slow lanes execute in PR/cloud CI. C1 retains ownership of the first post-kernel full-unit classification and attributable repair from that cloud evidence; the earlier acceptance wording never authorizes local complete-suite execution. Real crash contract tests remain affected tests of the kernel. The corrected child plan specifies exact local/cloud boundaries and the remaining lifecycle evidence-path check.

## Ownership amendment — 2026-10-03 (#1861 / #1862)

The user authorized reassignment of already-preserved prerequisites from #1862 to #1861. This corrects the delivery dependency split and adds no implementation. Inherited Astra WIP retains its original provenance; historical approval/digest, estimates and timing are not rewritten as approval or measurements of this amendment.

C1 (#1861) owns the existing kernel prerequisites: runtime-record-catalog.mjs, runtime-capture-catalog.mjs, runtime-migration-catalog.mjs, runtime-process-census.mjs, runtime-writer-census.mjs, runtime-migration-timing.mjs, pending-ask-record.mjs. It also owns only the catalog-required validateReadyForPlanMigrationJournal, validateClosedBindingLedger and validateActorFlushJournal exports and their supporting validator hunks in ready-for-plan-migration.mjs, worktree-binding-lifecycle.mjs and actor-flush-journal.mjs. C2 (#1862) retains production consumer adoption, call-graph closure, historical compatibility, timing transport integration and affected fixture conversion; these validator transfers do not transfer entire consumer files.

C1 owns the existing prerequisite contract tests: scripts/tests/integration/task-tracker/lib/runtime-migration-catalog.test.mjs, scripts/tests/unit/task-tracker/lib/runtime-migration-timing.test.mjs, scripts/tests/unit/task-tracker/lib/runtime-process-census.test.mjs, scripts/tests/unit/task-tracker/lib/runtime-record-catalog.test.mjs, scripts/tests/unit/task-tracker/lib/runtime-capture-catalog.test.mjs, scripts/tests/unit/task-tracker/lib/runtime-writer-census.test.mjs. In shared actor-flush, Ready-for-Plan and worktree-binding suites, only validator-contract assertions transfer; adoption/fixture-conversion assertions and the staged actor-flush test rename remain C2. C2 consumes these accepted interfaces rather than re-delivering them. C1 must include the prerequisite closure in its isolated PR; joint runtime release and operational admission remain gated on the later children. No test stamp or completed story is inferred from this ownership amendment.

Local verification remains lint, format and canonical TIA only; complete lanes run in cloud CI. After CI is green, the user requires GPT-6.1 Sol at Extra High effort for the #1861 PR code review. Scope amendment review and any governed estimate/approval reconciliation precede additional implementation; existing approvals remain historical.
