### Deep-Dive Analysis: #1861 JIT kernel completion

#### Story Intent

As an AITM operator recovering an interrupted command, I want runtime changes to expose one complete, recoverable outcome so that a killed process cannot leave contradictory binding, timing, and global authority that ordinary commands silently consume.

The affected operator is recovering from real process death during an AITM command. The required outcome is complete journaled publication or protected typed recovery, rather than a mixed binding/actor/global authority accepted by ordinary reads. Trigger conditions include a killed original publisher, interrupted resumer, malformed pending journal or changed member bytes. Success means the original outcome is durably completed, all readers agree, and repeated exact recovery is harmless. Refusal preserves evidence and names the supported bootstrap recovery action. This child delivers the kernel; consumer adoption and operational admission remain separately owned children.

#### Actual source and preservation

The genuine session is bound to #1861 in /Users/kpburson/.codex/worktrees/8dae/ai-task-manager on codex/1857-continuation. HEAD171c7d93866f67b58effa635be5ae737f54ef9eb contains delivered PR1866; the recovered WIP is archived snapshot bec7e45429838dcc7123283dddb69001720dc2c1. Restoration verified all3720 snapshot file hashes,65 dirty tracked paths,50 nonignored untracked files and only the staged R100 actor-flush test rename. Preserve unrelated config dirt, backups, fixtures and the equals file. Protected historical refs and original draft remain intact. Native hooks and lifecycle use the delivered scoped control image; candidate runtime commands are restricted to disposable fixtures. No legacy migration or installation/default change is authorized to unblock source work.

#### Inspected implementation and remaining gap

runtime-writer.mjs validates closed catalog JSON publication and uses whole-operation leases plus a main-owner store coordinator. writeRuntimeJsonRecord remains a single-record operation. readRuntimeJsonRecord checks the migration fence, controls, root and record schema. runtime-storage.mjs validates physical Git identity, registered-root census, complete controls and migration manifest, including linked-root initialization records. runtime-migration-lock.mjs protects coordinator, writer and operation ownership and validates explicit owner death; sync Promise misuse retains evidence. The migration/apply and initialization modules already contain interruption fault boundaries and several real killed-process tests.

These primitives do not yet provide a complete binding/actor/global multi-record transaction: saveState publishes those members separately. A writer lease alone cannot prove atomic publication. The child adds a protected journal with all original before identities/bytes and exact after payloads before any member changes. Ordinary reads refuse unfinished or malformed batches. Recovery validates every member before replay and rejects external edits. The kernel must retain synchronous consumer contracts and avoid an import cycle when storage calls batch read-admission.

#### Exact interface and ownership

The child design at docs/superpowers/specs/2026-10-02-1861-runtime-kernel-design.md defines writeRuntimeJsonBatch(records,options), inspectRuntimeBatch and resumeRuntimeBatch, schemas, protected location, generation and owner identity, proposed-sibling catalog validation, typed incomplete/invalid/conflict outcomes and registered batch-status/batch-resume grammar. Recovery receives an exact observation digest, not caller authority or replacement payloads. Main-owner coordinator serialization remains the concurrency authority; recover its dead owner normally before batch replay. A killed resumer records its own genuine owner so a competing or later recovery follows the same confirmed-death rule.

C1 owns runtime-storage/writer/batch, migration input/plan/apply/admission/lock and initializer recovery primitives. C2 owns catalogs, censuses, timing and production state/question/capture call sites. Shared command registration/help hunks are serialized by the epic controller; no parallel editors are launched. C2/C3/C4 consume only frozen, verified candidate interfaces and reopen acceptance if those change. This is not live runtime admission.

#### Verification and budget

Six restored focused kernel suites ran in this session: transaction, coordinator recovery, operation recovery, initialization crash, initialize and publication validation. All24 tests passed with0 failures or skips. This is consolidation evidence, not final child or release proof. New runtime-batch-recovery.test.mjs must first demonstrate the missing implementation, then cover journal/member SIGKILL, read refusal, registered exact replay, conflicts, unknown records, symlinks, live/foreign owner refusal, killed resumers and idempotence. Existing crash suites expand to real kills at every migration and initialization boundary; thrown injection remains supplemental.

The first complete post-kernel npm run test:unit lane belongs to C1. Attribute every failure against the preserved baseline and current source; repair C1 regressions without silently charging C2. Inherited consumer fixtures remain C2's work and cannot be subtracted from old counts to claim green. Canonical discovery covers scripts/ only and excludes all scratch stable images. Current VCs, aggregate/slow/lint/format and normal exact-head review gates remain mandatory when admissible.

Refine allowance L/12h allocates5h kernel,3h kill verification,2h unit classification/attributable repair and2h plan/review repair. The registered estimation evidence is .scratch/1861-estimation.json and owns calibrated convergence. No telemetry, history, velocity or cost is invented. Reassess at12h or material interface expansion. The implementation plan is docs/superpowers/plans/2026-10-02-1861-runtime-kernel.md. Plan approval and complete deep-dive admission must precede source edits.
