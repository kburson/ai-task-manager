# #2039 additional direct-sibling creation projection

> **For agentic workers:** This is a delivery-refinement overlay, not implementation approval. Read the accepted base implementation plan and governing specification. Implement only the assigned leaf slice through its normal governed test/review cycle.

**Goal:** Refine #2039 into flat, independently testable stories strictly below four hours and rank safe execution waves.

**Architecture:** The accepted architecture and interfaces remain authoritative in `docs/superpowers/plans/2026-10-19-2039-local-estimation-transition-cache.md` at `f2894455a97bb80f6afb82ce5ff722cad2a46c2b`. This overlay partitions its twelve broad tasks into 36 delivery slices; it does not replace technical safeguards or discard requirements.

**Tech Stack:** Existing Node ESM, native GitHub issue workflow and offline transport fixtures.

**Spec:** docs/superpowers/specs/2026-10-19-2039-local-estimation-guarded-publication-design.md at dafb1d276036ddc17490f76329f6aa2c09732a15.

## Global Constraints

All accepted base-plan schemas, API contracts, caller census, code seeds, failure scenarios and full-native budget fixtures remain required. Native revision tokens are opaque and non-atomic; exact hashes, complete inventories, local dirty manifests, one owner, preserved proof/Unknown, delayed-write uncertainty and transition-only routine publication remain unchanged. No product code is written during this refinement.

Estimates are bottom-up local engineering judgments from the accepted specification, checked-out source and per-story test/review boundaries. No previous task, historical corpus, rubric story or unrelated estimate may be retrieved from GitHub for estimation. Native reads of the current target and this active epic's children for ownership, freshness, dependencies and state transitions are permitted workflow authority, not estimation inputs. Use manual supplied-hour refinement only; do not run adaptive calibration or plan-estimate discovery. Do not disable native safeguards or alter estimation configuration.

Every leaf estimate is 2.5–3.5 hours, maximum 3.5; no exception to the under-four-hour target is needed. Total 119 hours supersedes the original provisional 96: independent test/review boundaries and explicit cross-cutting integration add 23 hours. Hours include implementation, targeted verification and ordinary review repair, not fake completed work or cloud-calibrated precision. Reassess materially changed scopes before work; a future 4–5h exception requires a specific reason, and above 5h must split.

Root Rank is 1. Child Rank equals the wave number below, starts at 2 and is identical for safe parallel peers. Dependencies must be completed before execution; same-wave permission requires disjoint file ownership and stable consumed contracts. Shared fixtures are created in an earlier wave and read-only thereafter. Public activation waits until the coordinator and all reader authority migrations are ready. Rank is ordering, not implementation authorization or waived wave admission.

The twelve existing issues retain their identity as the first slice of their original component; 24 direct siblings are added. None becomes an epic or an unrelated replacement story. Child source bindings point to the exact committed overlay section (or its byte-identical additional-story projection); the original technical plan remains referenced explicitly.

## Story Intent

- **Beneficiary:** delivery maintainer
- **Capability:** estimate locally and publish coherent cached issue and timing updates at state transitions
- **Need:** estimation scans and repeated small writes exhaust shared GitHub quota and permit stale publications
- **Value or failure prevented:** keep delivery usable while preserving external edits and recoverable workflow evidence

## Review Focus

1. No requirement disappears when an old broad issue is narrowed: the component coverage table assigns all three leaf slices.
2. Equal ranks never hide shared source-file writes or dependency edges; the schedule is checked mechanically.
3. Current-target authority reads must not become historical-task estimation inputs; manual refinement's source call chain is inspected before execution.
4. Estimates include distinct tests/review and remain below four hours without pretending the total stayed 96 hours.
5. Later slices must not activate unfinished writers; the coordinated activation slice depends on completed candidate/published migrations.

## Projection authority

This committed document contains only the 24 newly created siblings selected from `docs/superpowers/plans/2026-10-20-2039-refined-wave-plan.md`. Each selected task section is byte-identical to the master overlay; it is a creation projection, not a competing design. The 12 retained issue slices are omitted to prevent duplicate creation. Native source bindings can select these exact task numbers. Verify projection equality before creation.

## Leaf slices

### Task 2: Bounded current-story snapshot reader

#### Story Intent

- **Beneficiary:** delivery maintainer
- **Capability:** obtain a complete bounded current-story snapshot
- **Need:** partial target observations cannot authorize a publication
- **Value or failure prevented:** prevent incomplete inventories from authorizing cloud changes

#### Bounded delivery scope

Read the target body, title, all current comments, assignees and configured fields; enforce shared page/byte limits and no history-diff traversal.

**Original technical contract:** Task 1: Observe native issue and comment revisions in a bounded snapshot in `docs/superpowers/plans/2026-10-19-2039-local-estimation-transition-cache.md`, commit `f2894455a97bb80f6afb82ce5ff722cad2a46c2b`. Apply its exact shared schemas/interfaces and relevant concrete test seeds; all neighboring slices carry the remaining component requirements. This story delivers only the capability above, not the entire former component. No test is claimed already executed.

**Interfaces:** `readStorySnapshot({identity,transport,budget})`. Preserve accepted public exports/re-exports when extracting focused modules. Upstream inputs are the completed predecessor-task contracts, not unverified working cloud content.

**Owned files:** `scripts/task-tracker/lib/story-cache/snapshot-reader.mjs`. Each listed file is owned by this slice for its wave; do not modify parallel peers' files. New test deliverables are the exact paths below. Follow the accepted source-grounded caller census when a file family is migrated.

**Completion boundary:** Demonstrate the named normal behavior and refusal cases with targeted offline tests, preserve native invariants and obtain independent task review through the ordinary execution workflow. Start with the failing behavior test, implement only this slice, rerun its exact verifier, then commit with the actual child ID. This refinement is not permission to execute these steps now.

**Refinement allocation:** 3.5 hours; Size S; Priority P0; Rank 3; predecessor task numbers 1. Existing issue not yet created. Native dependencies are materialized only after issue IDs are known. Estimate basis: 1.5h implementation, 1h focused failure/compatibility tests, 1h review/integration repair; no cloud comparison tasks used.

**Verification Commands:**

```sh
node --test scripts/tests/unit/task-tracker/lib/story-cache/snapshot-reader.test.mjs
```

### Task 3: Full snapshot comparison and comment inventory drift

#### Story Intent

- **Beneficiary:** delivery maintainer
- **Capability:** detect drift across every cached resource
- **Need:** foreign edits and equal-count replacements can evade body-only checks
- **Value or failure prevented:** retain external changes and require an explainable three-way conflict

#### Bounded delivery scope

Compare nondirty and foreign comments, exact hashes, title and field inventory; detect equal-count replacements and equal-token/different-content observations.

**Original technical contract:** Task 1: Observe native issue and comment revisions in a bounded snapshot in `docs/superpowers/plans/2026-10-19-2039-local-estimation-transition-cache.md`, commit `f2894455a97bb80f6afb82ce5ff722cad2a46c2b`. Apply its exact shared schemas/interfaces and relevant concrete test seeds; all neighboring slices carry the remaining component requirements. This story delivers only the capability above, not the entire former component. No test is claimed already executed.

**Interfaces:** `compareSnapshots(base,current)`. Preserve accepted public exports/re-exports when extracting focused modules. Upstream inputs are the completed predecessor-task contracts, not unverified working cloud content.

**Owned files:** `scripts/task-tracker/lib/story-cache/snapshot-compare.mjs`, `scripts/task-tracker/lib/story-cache/native-observation.mjs`. Each listed file is owned by this slice for its wave; do not modify parallel peers' files. New test deliverables are the exact paths below. Follow the accepted source-grounded caller census when a file family is migrated.

**Completion boundary:** Demonstrate the named normal behavior and refusal cases with targeted offline tests, preserve native invariants and obtain independent task review through the ordinary execution workflow. Start with the failing behavior test, implement only this slice, rerun its exact verifier, then commit with the actual child ID. This refinement is not permission to execute these steps now.

**Refinement allocation:** 2.5 hours; Size S; Priority P0; Rank 4; predecessor task numbers 2. Existing issue not yet created. Native dependencies are materialized only after issue IDs are known. Estimate basis: 1h implementation, 0.75h focused verification, 0.75h review/repair; no cloud comparison tasks used.

**Verification Commands:**

```sh
node --test scripts/tests/unit/task-tracker/lib/story-cache/snapshot-compare.test.mjs
```

### Task 5: Crash-safe immutable cache generation storage

#### Story Intent

- **Beneficiary:** delivery maintainer
- **Capability:** persist crash-safe immutable cache generations
- **Need:** power loss or racing generations can lose unpublished changes
- **Value or failure prevented:** retain a verified prior generation after every persistence failure

#### Bounded delivery scope

Persist immutable body/comment payloads and atomic manifest pointers; retain the preceding valid generation; inject fsync/rename failure and generation races.

**Original technical contract:** Task 2: Persist manifest generations and protect unpublished cache data in `docs/superpowers/plans/2026-10-19-2039-local-estimation-transition-cache.md`, commit `f2894455a97bb80f6afb82ce5ff722cad2a46c2b`. Apply its exact shared schemas/interfaces and relevant concrete test seeds; all neighboring slices carry the remaining component requirements. This story delivers only the capability above, not the entire former component. No test is claimed already executed.

**Interfaces:** `openStoryStore({projectRoot,identity,fs}); store.commitGeneration(next,{expectedGeneration})`. Preserve accepted public exports/re-exports when extracting focused modules. Upstream inputs are the completed predecessor-task contracts, not unverified working cloud content.

**Owned files:** `scripts/task-tracker/lib/story-cache/store.mjs`. Each listed file is owned by this slice for its wave; do not modify parallel peers' files. New test deliverables are the exact paths below. Follow the accepted source-grounded caller census when a file family is migrated.

**Completion boundary:** Demonstrate the named normal behavior and refusal cases with targeted offline tests, preserve native invariants and obtain independent task review through the ordinary execution workflow. Start with the failing behavior test, implement only this slice, rerun its exact verifier, then commit with the actual child ID. This refinement is not permission to execute these steps now.

**Refinement allocation:** 3.5 hours; Size S; Priority P0; Rank 4; predecessor task numbers 2, 4. Existing issue not yet created. Native dependencies are materialized only after issue IDs are known. Estimate basis: 1.5h implementation, 1h focused failure/compatibility tests, 1h review/integration repair; no cloud comparison tasks used.

**Verification Commands:**

```sh
node --test scripts/tests/unit/task-tracker/lib/story-cache/store.test.mjs
```

### Task 6: Protect unpublished cache during cleanup and migration

#### Story Intent

- **Beneficiary:** delivery maintainer
- **Capability:** protect unpublished cache data during cleanup
- **Need:** ordinary temporary-file cleanup can destroy pending work
- **Value or failure prevented:** preserve pending story edits and recovery evidence

#### Bounded delivery scope

Keep dirty, conflict and uncertain cache generations during cleanup; resolve the consumer worktree root; reject symlink/traversal escape and package-root storage.

**Original technical contract:** Task 2: Persist manifest generations and protect unpublished cache data in `docs/superpowers/plans/2026-10-19-2039-local-estimation-transition-cache.md`, commit `f2894455a97bb80f6afb82ce5ff722cad2a46c2b`. Apply its exact shared schemas/interfaces and relevant concrete test seeds; all neighboring slices carry the remaining component requirements. This story delivers only the capability above, not the entire former component. No test is claimed already executed.

**Interfaces:** `cacheRetentionDecision({generation,operation}); storyCachePath({projectRoot,identity})`. Preserve accepted public exports/re-exports when extracting focused modules. Upstream inputs are the completed predecessor-task contracts, not unverified working cloud content.

**Owned files:** `scripts/task-tracker/lib/story-cache/retention.mjs`, `scripts/task-tracker/lib/runtime-storage.mjs`, `scripts/task-tracker/lib/runtime-migration-plan.mjs`, `scripts/task-tracker/lib/runtime-migration-apply.mjs`, `scripts/task-tracker/paths.mjs`. Each listed file is owned by this slice for its wave; do not modify parallel peers' files. New test deliverables are the exact paths below. Follow the accepted source-grounded caller census when a file family is migrated.

**Completion boundary:** Demonstrate the named normal behavior and refusal cases with targeted offline tests, preserve native invariants and obtain independent task review through the ordinary execution workflow. Start with the failing behavior test, implement only this slice, rerun its exact verifier, then commit with the actual child ID. This refinement is not permission to execute these steps now.

**Refinement allocation:** 3 hours; Size S; Priority P0; Rank 5; predecessor task numbers 5. Existing issue not yet created. Native dependencies are materialized only after issue IDs are known. Estimate basis: 1.5h implementation, 0.75h focused verification, 0.75h review/repair; no cloud comparison tasks used.

**Verification Commands:**

```sh
node --test scripts/tests/unit/task-tracker/lib/story-cache/retention.test.mjs
```

### Task 8: Shared writer registry with cache references only

#### Story Intent

- **Beneficiary:** delivery maintainer
- **Capability:** resolve the owning cache without copying its contents
- **Need:** a registry can point to stale work or duplicate content authority
- **Value or failure prevented:** keep one identifiable content authority per story

#### Bounded delivery scope

Store claim identity and verified cache path without duplicating story contents; reject stale, corrupt, ambiguous and mismatched registry references.

**Original technical contract:** Task 3: Enforce one assigned human and one owning agent cache in `docs/superpowers/plans/2026-10-19-2039-local-estimation-transition-cache.md`, commit `f2894455a97bb80f6afb82ce5ff722cad2a46c2b`. Apply its exact shared schemas/interfaces and relevant concrete test seeds; all neighboring slices carry the remaining component requirements. This story delivers only the capability above, not the entire former component. No test is claimed already executed.

**Interfaces:** `registerStoryWriter({claim,registry}); resolveStoryWriter({identity,registry})`. Preserve accepted public exports/re-exports when extracting focused modules. Upstream inputs are the completed predecessor-task contracts, not unverified working cloud content.

**Owned files:** `scripts/task-tracker/lib/story-cache/writer-registry.mjs`, `scripts/task-tracker/fleet-registry.mjs`. Each listed file is owned by this slice for its wave; do not modify parallel peers' files. New test deliverables are the exact paths below. Follow the accepted source-grounded caller census when a file family is migrated.

**Completion boundary:** Demonstrate the named normal behavior and refusal cases with targeted offline tests, preserve native invariants and obtain independent task review through the ordinary execution workflow. Start with the failing behavior test, implement only this slice, rerun its exact verifier, then commit with the actual child ID. This refinement is not permission to execute these steps now.

**Refinement allocation:** 3 hours; Size S; Priority P0; Rank 6; predecessor task numbers 7. Existing issue not yet created. Native dependencies are materialized only after issue IDs are known. Estimate basis: 1.5h implementation, 0.75h focused verification, 0.75h review/repair; no cloud comparison tasks used.

**Verification Commands:**

```sh
node --test scripts/tests/unit/task-tracker/lib/story-cache/writer-registry.test.mjs
```

### Task 9: Explicit cache handoff and acknowledged export

#### Story Intent

- **Beneficiary:** delivery maintainer
- **Capability:** transfer unpublished work through acknowledged handoff
- **Need:** dirty work cannot safely be recovered by stealing a stale lock
- **Value or failure prevented:** avoid handoff loss and uncertain double ownership

#### Bounded delivery scope

Freeze pending generations, export with a digest and acknowledge the recipient before release; interrupted transfers retain ownership and never steal a dirty stale lock.

**Original technical contract:** Task 3: Enforce one assigned human and one owning agent cache in `docs/superpowers/plans/2026-10-19-2039-local-estimation-transition-cache.md`, commit `f2894455a97bb80f6afb82ce5ff722cad2a46c2b`. Apply its exact shared schemas/interfaces and relevant concrete test seeds; all neighboring slices carry the remaining component requirements. This story delivers only the capability above, not the entire former component. No test is claimed already executed.

**Interfaces:** `transferStoryWriter({claim,target,store,registry})`. Preserve accepted public exports/re-exports when extracting focused modules. Upstream inputs are the completed predecessor-task contracts, not unverified working cloud content.

**Owned files:** `scripts/task-tracker/lib/story-cache/writer-handoff.mjs`, `scripts/task-tracker/lib/worktree-binding-lifecycle.mjs`, `scripts/task-tracker/lib/worktree-relocation-guard.mjs`. Each listed file is owned by this slice for its wave; do not modify parallel peers' files. New test deliverables are the exact paths below. Follow the accepted source-grounded caller census when a file family is migrated.

**Completion boundary:** Demonstrate the named normal behavior and refusal cases with targeted offline tests, preserve native invariants and obtain independent task review through the ordinary execution workflow. Start with the failing behavior test, implement only this slice, rerun its exact verifier, then commit with the actual child ID. This refinement is not permission to execute these steps now.

**Refinement allocation:** 3.5 hours; Size S; Priority P0; Rank 7; predecessor task numbers 6, 8. Existing issue not yet created. Native dependencies are materialized only after issue IDs are known. Estimate basis: 1.5h implementation, 1h focused failure/compatibility tests, 1h review/integration repair; no cloud comparison tasks used.

**Verification Commands:**

```sh
node --test scripts/tests/unit/task-tracker/lib/story-cache/handoff.test.mjs
```

### Task 11: Local owned-comment intents and adoption

#### Story Intent

- **Beneficiary:** delivery maintainer
- **Capability:** stage owned comments with stable creation intents
- **Need:** comment headings and missed create replies do not prove ownership
- **Value or failure prevented:** prevent duplicate comments and unauthorized foreign edits

#### Bounded delivery scope

Adopt comments through existing native marker/envelope validation; retain stable creation intent IDs; keep foreign content read-only and perform zero staging transport.

**Original technical contract:** Task 4: Stage body and owned-comment mutations without network calls in `docs/superpowers/plans/2026-10-19-2039-local-estimation-transition-cache.md`, commit `f2894455a97bb80f6afb82ce5ff722cad2a46c2b`. Apply its exact shared schemas/interfaces and relevant concrete test seeds; all neighboring slices carry the remaining component requirements. This story delivers only the capability above, not the entire former component. No test is claimed already executed.

**Interfaces:** `stageOwnedComment({store,claim,key,body,capability})`. Preserve accepted public exports/re-exports when extracting focused modules. Upstream inputs are the completed predecessor-task contracts, not unverified working cloud content.

**Owned files:** `scripts/task-tracker/lib/story-cache/stage-comment.mjs`. Each listed file is owned by this slice for its wave; do not modify parallel peers' files. New test deliverables are the exact paths below. Follow the accepted source-grounded caller census when a file family is migrated.

**Completion boundary:** Demonstrate the named normal behavior and refusal cases with targeted offline tests, preserve native invariants and obtain independent task review through the ordinary execution workflow. Start with the failing behavior test, implement only this slice, rerun its exact verifier, then commit with the actual child ID. This refinement is not permission to execute these steps now.

**Refinement allocation:** 3 hours; Size S; Priority P0; Rank 9; predecessor task numbers 10. Existing issue not yet created. Native dependencies are materialized only after issue IDs are known. Estimate basis: 1.5h implementation, 0.75h focused verification, 0.75h review/repair; no cloud comparison tasks used.

**Verification Commands:**

```sh
node --test scripts/tests/unit/task-tracker/lib/story-cache/stage-comment.test.mjs
```

### Task 12: Operation-specific proof capabilities and composite invariants

#### Story Intent

- **Beneficiary:** delivery maintainer
- **Capability:** preserve proof authority across staged mutations
- **Need:** synthetic markers and combined override flags can fabricate approval
- **Value or failure prevented:** prevent false verification and preserve reviewed scope

#### Bounded delivery scope

Retain each operation's genuine proof capability; validate local operations and the composite delta; reject marker loss, synthetic evidence and broad override unions.

**Original technical contract:** Task 4: Stage body and owned-comment mutations without network calls in `docs/superpowers/plans/2026-10-19-2039-local-estimation-transition-cache.md`, commit `f2894455a97bb80f6afb82ce5ff722cad2a46c2b`. Apply its exact shared schemas/interfaces and relevant concrete test seeds; all neighboring slices carry the remaining component requirements. This story delivers only the capability above, not the entire former component. No test is claimed already executed.

**Interfaces:** `validateStagedComposite({base,candidate,operations})`. Preserve accepted public exports/re-exports when extracting focused modules. Upstream inputs are the completed predecessor-task contracts, not unverified working cloud content.

**Owned files:** `scripts/task-tracker/lib/story-cache/stage-capabilities.mjs`, `scripts/task-tracker/lib/body-invariants.mjs`. Each listed file is owned by this slice for its wave; do not modify parallel peers' files. New test deliverables are the exact paths below. Follow the accepted source-grounded caller census when a file family is migrated.

**Completion boundary:** Demonstrate the named normal behavior and refusal cases with targeted offline tests, preserve native invariants and obtain independent task review through the ordinary execution workflow. Start with the failing behavior test, implement only this slice, rerun its exact verifier, then commit with the actual child ID. This refinement is not permission to execute these steps now.

**Refinement allocation:** 3.5 hours; Size S; Priority P0; Rank 10; predecessor task numbers 11. Existing issue not yet created. Native dependencies are materialized only after issue IDs are known. Estimate basis: 1.5h implementation, 1h focused failure/compatibility tests, 1h review/integration repair; no cloud comparison tasks used.

**Verification Commands:**

```sh
node --test scripts/tests/unit/task-tracker/lib/story-cache/stage-capabilities.test.mjs
```

### Task 14: Durable timing ingestion and independent cursors

#### Story Intent

- **Beneficiary:** delivery maintainer
- **Capability:** ingest timing events durably without remote writes
- **Need:** ingestion acknowledgement and publication acknowledgement have different durability boundaries
- **Value or failure prevented:** avoid lost events and incorrect publication success

#### Bounded delivery scope

Advance ingestion only after local persistence; keep publication and frozen-batch state independent; retain backdated native events and restart identity without API calls.

**Original technical contract:** Task 5: Accumulate timing events with separate ingestion and publication cursors in `docs/superpowers/plans/2026-10-19-2039-local-estimation-transition-cache.md`, commit `f2894455a97bb80f6afb82ce5ff722cad2a46c2b`. Apply its exact shared schemas/interfaces and relevant concrete test seeds; all neighboring slices carry the remaining component requirements. This story delivers only the capability above, not the entire former component. No test is claimed already executed.

**Interfaces:** `ingestTimingEvents({store,claim,events})`. Preserve accepted public exports/re-exports when extracting focused modules. Upstream inputs are the completed predecessor-task contracts, not unverified working cloud content.

**Owned files:** `scripts/task-tracker/lib/story-cache/timing-stage.mjs`, `scripts/task-tracker/lib/actor-hook-timing.mjs`, `scripts/task-tracker/lib/actor-timing-state.mjs`. Each listed file is owned by this slice for its wave; do not modify parallel peers' files. New test deliverables are the exact paths below. Follow the accepted source-grounded caller census when a file family is migrated.

**Completion boundary:** Demonstrate the named normal behavior and refusal cases with targeted offline tests, preserve native invariants and obtain independent task review through the ordinary execution workflow. Start with the failing behavior test, implement only this slice, rerun its exact verifier, then commit with the actual child ID. This refinement is not permission to execute these steps now.

**Refinement allocation:** 3 hours; Size S; Priority P0; Rank 9; predecessor task numbers 10, 13. Existing issue not yet created. Native dependencies are materialized only after issue IDs are known. Estimate basis: 1.5h implementation, 0.75h focused verification, 0.75h review/repair; no cloud comparison tasks used.

**Verification Commands:**

```sh
node --test scripts/tests/unit/task-tracker/lib/story-cache/timing-stage.test.mjs
```

### Task 15: Freeze and confirm one timing candidate per transition

#### Story Intent

- **Beneficiary:** delivery maintainer
- **Capability:** publish one frozen timing candidate per transition
- **Need:** per-event timing updates amplify writes and can advance cursors prematurely
- **Value or failure prevented:** prevent duplicate timing rows and unjustified cursor advancement

#### Bounded delivery scope

Render one canonical owned timing-comment candidate; confirm publication cursor from verified content only; preserve Unknown and prove 1000 local events cause no extra remote writes.

**Original technical contract:** Task 5: Accumulate timing events with separate ingestion and publication cursors in `docs/superpowers/plans/2026-10-19-2039-local-estimation-transition-cache.md`, commit `f2894455a97bb80f6afb82ce5ff722cad2a46c2b`. Apply its exact shared schemas/interfaces and relevant concrete test seeds; all neighboring slices carry the remaining component requirements. This story delivers only the capability above, not the entire former component. No test is claimed already executed.

**Interfaces:** `freezeTimingCandidate({generation,transition}); confirmTimingPublication({store,batchId,observation})`. Preserve accepted public exports/re-exports when extracting focused modules. Upstream inputs are the completed predecessor-task contracts, not unverified working cloud content.

**Owned files:** `scripts/task-tracker/lib/story-cache/timing-candidate.mjs`, `scripts/task-tracker/gh-timing-comment.internals.mjs`. Each listed file is owned by this slice for its wave; do not modify parallel peers' files. New test deliverables are the exact paths below. Follow the accepted source-grounded caller census when a file family is migrated.

**Completion boundary:** Demonstrate the named normal behavior and refusal cases with targeted offline tests, preserve native invariants and obtain independent task review through the ordinary execution workflow. Start with the failing behavior test, implement only this slice, rerun its exact verifier, then commit with the actual child ID. This refinement is not permission to execute these steps now.

**Refinement allocation:** 3.5 hours; Size S; Priority P0; Rank 11; predecessor task numbers 12, 14. Existing issue not yet created. Native dependencies are materialized only after issue IDs are known. Estimate basis: 1.5h implementation, 1h focused failure/compatibility tests, 1h review/integration repair; no cloud comparison tasks used.

**Verification Commands:**

```sh
node --test scripts/tests/unit/task-tracker/lib/story-cache/timing-candidate.test.mjs
```

### Task 17: Pure local estimate calculation and rubric derivation

#### Story Intent

- **Beneficiary:** delivery maintainer
- **Capability:** calculate estimates and rubrics from local evidence
- **Need:** historical cloud calibration exhausts shared quota and missing inputs cannot be invented
- **Value or failure prevented:** keep estimation available without cloud history scans

#### Bounded delivery scope

Calculate reproducibly from retained local inputs; missing evidence is unavailable; derive and persist local rubric records with valid lineage and explicit provenance.

**Original technical contract:** Task 6: Calculate estimates and refresh rubrics from retained local evidence only in `docs/superpowers/plans/2026-10-19-2039-local-estimation-transition-cache.md`, commit `f2894455a97bb80f6afb82ce5ff722cad2a46c2b`. Apply its exact shared schemas/interfaces and relevant concrete test seeds; all neighboring slices carry the remaining component requirements. This story delivers only the capability above, not the entire former component. No test is claimed already executed.

**Interfaces:** `calculateLocalEstimate({mode,evidence,planInput,model})`. Preserve accepted public exports/re-exports when extracting focused modules. Upstream inputs are the completed predecessor-task contracts, not unverified working cloud content.

**Owned files:** `scripts/task-tracker/lib/estimation/local-runtime.mjs`, `scripts/task-tracker/lib/estimation/rubric-refresh.mjs`. Each listed file is owned by this slice for its wave; do not modify parallel peers' files. New test deliverables are the exact paths below. Follow the accepted source-grounded caller census when a file family is migrated.

**Completion boundary:** Demonstrate the named normal behavior and refusal cases with targeted offline tests, preserve native invariants and obtain independent task review through the ordinary execution workflow. Start with the failing behavior test, implement only this slice, rerun its exact verifier, then commit with the actual child ID. This refinement is not permission to execute these steps now.

**Refinement allocation:** 3.5 hours; Size S; Priority P0; Rank 7; predecessor task numbers 16. Existing issue not yet created. Native dependencies are materialized only after issue IDs are known. Estimate basis: 1.5h implementation, 1h focused failure/compatibility tests, 1h review/integration repair; no cloud comparison tasks used.

**Verification Commands:**

```sh
node --test scripts/tests/unit/task-tracker/lib/estimation/local-runtime.test.mjs scripts/tests/unit/task-tracker/lib/estimation/rubric-refresh.test.mjs
```

### Task 18: Disable cloud estimation before CLI and hook dispatch

#### Story Intent

- **Beneficiary:** delivery maintainer
- **Capability:** stop prohibited estimation transport before dispatch
- **Need:** a late disabled-mode check still permits indirect cloud scans
- **Value or failure prevented:** guarantee disabled estimation cannot consume historical-task quota

#### Bounded delivery scope

Intercept disabled/local mode before preflight, corpus, decomposition and indirect estimator dispatch; use fail-on-transport fixtures; retain unrelated native source/lifecycle guards.

**Original technical contract:** Task 6: Calculate estimates and refresh rubrics from retained local evidence only in `docs/superpowers/plans/2026-10-19-2039-local-estimation-transition-cache.md`, commit `f2894455a97bb80f6afb82ce5ff722cad2a46c2b`. Apply its exact shared schemas/interfaces and relevant concrete test seeds; all neighboring slices carry the remaining component requirements. This story delivers only the capability above, not the entire former component. No test is claimed already executed.

**Interfaces:** `resolveEstimationMode(cfg)`. Preserve accepted public exports/re-exports when extracting focused modules. Upstream inputs are the completed predecessor-task contracts, not unverified working cloud content.

**Owned files:** `scripts/task-tracker/lib/estimation/runtime-adapter.mjs`, `scripts/task-tracker/lib/verb-preflight.mjs`, `scripts/task-tracker/activity-guard.mjs`, `scripts/task-tracker/source-edit-gate.mjs`. Each listed file is owned by this slice for its wave; do not modify parallel peers' files. New test deliverables are the exact paths below. Follow the accepted source-grounded caller census when a file family is migrated.

**Completion boundary:** Demonstrate the named normal behavior and refusal cases with targeted offline tests, preserve native invariants and obtain independent task review through the ordinary execution workflow. Start with the failing behavior test, implement only this slice, rerun its exact verifier, then commit with the actual child ID. This refinement is not permission to execute these steps now.

**Refinement allocation:** 3.5 hours; Size S; Priority P0; Rank 8; predecessor task numbers 17. Existing issue not yet created. Native dependencies are materialized only after issue IDs are known. Estimate basis: 1.5h implementation, 1h focused failure/compatibility tests, 1h review/integration repair; no cloud comparison tasks used.

**Verification Commands:**

```sh
node --test scripts/tests/unit/task-tracker/lib/estimation/local-dispatch.test.mjs
```

### Task 20: Forecast lineage resolution and local read projections

#### Story Intent

- **Beneficiary:** delivery maintainer
- **Capability:** resolve forecast ancestry entirely from local evidence
- **Need:** missing or ambiguous evidence ancestry makes forecasts unreproducible
- **Value or failure prevented:** refuse unverifiable forecasts without a hidden network fallback

#### Bounded delivery scope

Resolve all retained payloads and active ancestry locally; reject ambiguous branches, missing ancestors and mismatched provenance; preserve unavailable outcomes.

**Original technical contract:** Task 7: Publish forecast v3 provenance while retaining legacy forecast reads in `docs/superpowers/plans/2026-10-19-2039-local-estimation-transition-cache.md`, commit `f2894455a97bb80f6afb82ce5ff722cad2a46c2b`. Apply its exact shared schemas/interfaces and relevant concrete test seeds; all neighboring slices carry the remaining component requirements. This story delivers only the capability above, not the entire former component. No test is claimed already executed.

**Interfaces:** `resolveLocalForecast({forecast,evidenceStore,identity})`. Preserve accepted public exports/re-exports when extracting focused modules. Upstream inputs are the completed predecessor-task contracts, not unverified working cloud content.

**Owned files:** `scripts/task-tracker/lib/estimation/forecast-lineage.mjs`, `scripts/task-tracker/lib/estimation/forecast-reader.mjs`. Each listed file is owned by this slice for its wave; do not modify parallel peers' files. New test deliverables are the exact paths below. Follow the accepted source-grounded caller census when a file family is migrated.

**Completion boundary:** Demonstrate the named normal behavior and refusal cases with targeted offline tests, preserve native invariants and obtain independent task review through the ordinary execution workflow. Start with the failing behavior test, implement only this slice, rerun its exact verifier, then commit with the actual child ID. This refinement is not permission to execute these steps now.

**Refinement allocation:** 3.5 hours; Size S; Priority P0; Rank 9; predecessor task numbers 18, 19. Existing issue not yet created. Native dependencies are materialized only after issue IDs are known. Estimate basis: 1.5h implementation, 1h focused failure/compatibility tests, 1h review/integration repair; no cloud comparison tasks used.

**Verification Commands:**

```sh
node --test scripts/tests/unit/task-tracker/lib/estimation/forecast-lineage.test.mjs
```

### Task 21: Legacy forecast readers and v2 half-hour compatibility

#### Story Intent

- **Beneficiary:** delivery maintainer
- **Capability:** read legacy forecasts without changing their grids
- **Need:** changing the current schema can silently change v2 half-hour validation
- **Value or failure prevented:** preserve compatibility while current output gains provenance

#### Bounded delivery scope

Preserve exact v1/v2 read behavior and the v2 half-hour grid while v3 becomes current; reject stale/missing current provenance without weakening legacy validators.

**Original technical contract:** Task 7: Publish forecast v3 provenance while retaining legacy forecast reads in `docs/superpowers/plans/2026-10-19-2039-local-estimation-transition-cache.md`, commit `f2894455a97bb80f6afb82ce5ff722cad2a46c2b`. Apply its exact shared schemas/interfaces and relevant concrete test seeds; all neighboring slices carry the remaining component requirements. This story delivers only the capability above, not the entire former component. No test is claimed already executed.

**Interfaces:** `readForecastVersioned(value); requireCurrentSchema(value)`. Preserve accepted public exports/re-exports when extracting focused modules. Upstream inputs are the completed predecessor-task contracts, not unverified working cloud content.

**Owned files:** `scripts/task-tracker/lib/estimation/plan-estimate-authority.mjs`, `scripts/task-tracker/lib/estimation/forecast-legacy.mjs`. Each listed file is owned by this slice for its wave; do not modify parallel peers' files. New test deliverables are the exact paths below. Follow the accepted source-grounded caller census when a file family is migrated.

**Completion boundary:** Demonstrate the named normal behavior and refusal cases with targeted offline tests, preserve native invariants and obtain independent task review through the ordinary execution workflow. Start with the failing behavior test, implement only this slice, rerun its exact verifier, then commit with the actual child ID. This refinement is not permission to execute these steps now.

**Refinement allocation:** 3 hours; Size S; Priority P0; Rank 10; predecessor task numbers 20. Existing issue not yet created. Native dependencies are materialized only after issue IDs are known. Estimate basis: 1.5h implementation, 0.75h focused verification, 0.75h review/repair; no cloud comparison tasks used.

**Verification Commands:**

```sh
node --test scripts/tests/unit/task-tracker/lib/estimation/forecast-compatibility.test.mjs scripts/tests/unit/task-tracker/lib/estimation/forecast-model.test.mjs
```

### Task 23: Single-attempt resource publisher and exact read-back

#### Story Intent

- **Beneficiary:** delivery maintainer
- **Capability:** publish each declared resource at most once
- **Need:** independent provider writes can partially succeed or overwrite external edits
- **Value or failure prevented:** retain truthful per-resource outcomes with bounded writes

#### Bounded delivery scope

Revalidate full target equality before any mutation; dispatch one attempt per dirty declared resource; verify outcomes and newly created IDs; disclose non-atomic provider races.

**Original technical contract:** Task 8: Publish one frozen resource batch and recover uncertain effects in `docs/superpowers/plans/2026-10-19-2039-local-estimation-transition-cache.md`, commit `f2894455a97bb80f6afb82ce5ff722cad2a46c2b`. Apply its exact shared schemas/interfaces and relevant concrete test seeds; all neighboring slices carry the remaining component requirements. This story delivers only the capability above, not the entire former component. No test is claimed already executed.

**Interfaces:** `publishResourceEffects({store,claim,batch,snapshot,ports})`. Preserve accepted public exports/re-exports when extracting focused modules. Upstream inputs are the completed predecessor-task contracts, not unverified working cloud content.

**Owned files:** `scripts/task-tracker/lib/story-cache/publisher.mjs`, `scripts/task-tracker/lib/story-cache/provider-adapters.mjs`. Each listed file is owned by this slice for its wave; do not modify parallel peers' files. New test deliverables are the exact paths below. Follow the accepted source-grounded caller census when a file family is migrated.

**Completion boundary:** Demonstrate the named normal behavior and refusal cases with targeted offline tests, preserve native invariants and obtain independent task review through the ordinary execution workflow. Start with the failing behavior test, implement only this slice, rerun its exact verifier, then commit with the actual child ID. This refinement is not permission to execute these steps now.

**Refinement allocation:** 3.5 hours; Size S; Priority P0; Rank 13; predecessor task numbers 22. Existing issue not yet created. Native dependencies are materialized only after issue IDs are known. Estimate basis: 1.5h implementation, 1h focused failure/compatibility tests, 1h review/integration repair; no cloud comparison tasks used.

**Verification Commands:**

```sh
node --test scripts/tests/unit/task-tracker/lib/story-cache/publisher.test.mjs
```

### Task 24: Partial and uncertain publication recovery

#### Story Intent

- **Beneficiary:** delivery maintainer
- **Capability:** recover interrupted publication without blind replay
- **Need:** delayed successful requests can arrive after an unchanged recovery read
- **Value or failure prevented:** avoid duplicate effects and compensating overwrites

#### Bounded delivery scope

Retain every crash prefix and three-way conflict evidence; unchanged recovery reads do not permit replay; handle delayed writes and uncertain creates without duplicate or compensating writes.

**Original technical contract:** Task 8: Publish one frozen resource batch and recover uncertain effects in `docs/superpowers/plans/2026-10-19-2039-local-estimation-transition-cache.md`, commit `f2894455a97bb80f6afb82ce5ff722cad2a46c2b`. Apply its exact shared schemas/interfaces and relevant concrete test seeds; all neighboring slices carry the remaining component requirements. This story delivers only the capability above, not the entire former component. No test is claimed already executed.

**Interfaces:** `recoverStoryBatch({store,claim,ports,allowMutation:false})`. Preserve accepted public exports/re-exports when extracting focused modules. Upstream inputs are the completed predecessor-task contracts, not unverified working cloud content.

**Owned files:** `scripts/task-tracker/lib/story-cache/recovery.mjs`, `scripts/task-tracker/lib/story-cache/journal.mjs`. Each listed file is owned by this slice for its wave; do not modify parallel peers' files. New test deliverables are the exact paths below. Follow the accepted source-grounded caller census when a file family is migrated.

**Completion boundary:** Demonstrate the named normal behavior and refusal cases with targeted offline tests, preserve native invariants and obtain independent task review through the ordinary execution workflow. Start with the failing behavior test, implement only this slice, rerun its exact verifier, then commit with the actual child ID. This refinement is not permission to execute these steps now.

**Refinement allocation:** 3.5 hours; Size S; Priority P0; Rank 14; predecessor task numbers 23. Existing issue not yet created. Native dependencies are materialized only after issue IDs are known. Estimate basis: 1.5h implementation, 1h focused failure/compatibility tests, 1h review/integration repair; no cloud comparison tasks used.

**Verification Commands:**

```sh
node --test scripts/tests/unit/task-tracker/lib/story-cache/recovery.test.mjs
```

### Task 26: Transition coordinator with one final issue-body write

#### Story Intent

- **Beneficiary:** delivery maintainer
- **Capability:** commit transitions with one final issue-body write
- **Need:** a pre-Status body or a second sentinel write can misrepresent completion
- **Value or failure prevented:** distinguish completed transitions from partially published effects

#### Bounded delivery scope

Order frozen prerequisite effects, actual Status and final body/sentinel/receipt once; preserve native exit/entry checks; leave incomplete transitions explicitly provisional after crashes.

**Original technical contract:** Task 9: Commit state transitions with one final issue write in `docs/superpowers/plans/2026-10-19-2039-local-estimation-transition-cache.md`, commit `f2894455a97bb80f6afb82ce5ff722cad2a46c2b`. Apply its exact shared schemas/interfaces and relevant concrete test seeds; all neighboring slices carry the remaining component requirements. This story delivers only the capability above, not the entire former component. No test is claimed already executed.

**Interfaces:** `runTransitionBatch({ctx,store,claim,ports})`. Preserve accepted public exports/re-exports when extracting focused modules. Upstream inputs are the completed predecessor-task contracts, not unverified working cloud content.

**Owned files:** `scripts/task-tracker/lib/story-cache/transition-batch.mjs`, `scripts/task-tracker/lib/move-state/move-state-core.mjs`. Each listed file is owned by this slice for its wave; do not modify parallel peers' files. New test deliverables are the exact paths below. Follow the accepted source-grounded caller census when a file family is migrated.

**Completion boundary:** Demonstrate the named normal behavior and refusal cases with targeted offline tests, preserve native invariants and obtain independent task review through the ordinary execution workflow. Start with the failing behavior test, implement only this slice, rerun its exact verifier, then commit with the actual child ID. This refinement is not permission to execute these steps now.

**Refinement allocation:** 3.5 hours; Size S; Priority P0; Rank 15; predecessor task numbers 24, 25. Existing issue not yet created. Native dependencies are materialized only after issue IDs are known. Estimate basis: 1.5h implementation, 1h focused failure/compatibility tests, 1h review/integration repair; no cloud comparison tasks used.

**Verification Commands:**

```sh
node --test scripts/tests/unit/task-tracker/lib/story-cache/transition-batch.test.mjs
```

### Task 27: Plan approval and forecast candidate/published authority

#### Story Intent

- **Beneficiary:** delivery maintainer
- **Capability:** validate real Plan approval before Status changes
- **Need:** a staged approval must not be treated as an already published cloud marker
- **Value or failure prevented:** preserve genuine approval, scope and forecast freshness

#### Bounded delivery scope

Retain real human/Full-Auto provenance and exact scope/trunk/forecast identity; verify required effects before Status; revalidate materialized scope without presenting staged markers as published.

**Original technical contract:** Task 9: Commit state transitions with one final issue write in `docs/superpowers/plans/2026-10-19-2039-local-estimation-transition-cache.md`, commit `f2894455a97bb80f6afb82ce5ff722cad2a46c2b`. Apply its exact shared schemas/interfaces and relevant concrete test seeds; all neighboring slices carry the remaining component requirements. This story delivers only the capability above, not the entire former component. No test is claimed already executed.

**Interfaces:** `verifyPlanTransitionAuthorityScope({candidate,baselineEquality,confirmedEffects})`. Preserve accepted public exports/re-exports when extracting focused modules. Upstream inputs are the completed predecessor-task contracts, not unverified working cloud content.

**Owned files:** `scripts/task-tracker/lib/plan-approved-guard.mjs`, `scripts/task-tracker/lib/plan-approval-audit.mjs`, `scripts/task-tracker/lib/plan-exit-planned-estimate-guard.mjs`, `scripts/task-tracker/lib/plan-transition-authority.mjs`, `scripts/task-tracker/verbs/plan-approve.mjs`. Each listed file is owned by this slice for its wave; do not modify parallel peers' files. New test deliverables are the exact paths below. Follow the accepted source-grounded caller census when a file family is migrated.

**Completion boundary:** Demonstrate the named normal behavior and refusal cases with targeted offline tests, preserve native invariants and obtain independent task review through the ordinary execution workflow. Start with the failing behavior test, implement only this slice, rerun its exact verifier, then commit with the actual child ID. This refinement is not permission to execute these steps now.

**Refinement allocation:** 3.5 hours; Size S; Priority P0; Rank 16; predecessor task numbers 21, 26. Existing issue not yet created. Native dependencies are materialized only after issue IDs are known. Estimate basis: 1.5h implementation, 1h focused failure/compatibility tests, 1h review/integration repair; no cloud comparison tasks used.

**Verification Commands:**

```sh
node --test scripts/tests/unit/task-tracker/lib/story-cache/plan-transition-candidate.test.mjs
```

### Task 29: Timing reports and field projections preserve real work

#### Story Intent

- **Beneficiary:** delivery maintainer
- **Capability:** report measured work despite provisional completion
- **Need:** incomplete completion proof does not erase real measured work
- **Value or failure prevented:** preserve attributable work without pretending provisional visits completed

#### Bounded delivery scope

Keep measured work when completion proof is provisional; preserve Unknown and historical actors; validate old event subsets across consecutive transitions and demotion/reentry.

**Original technical contract:** Task 10: Integrate cached views with guards and timing reports in `docs/superpowers/plans/2026-10-19-2039-local-estimation-transition-cache.md`, commit `f2894455a97bb80f6afb82ce5ff722cad2a46c2b`. Apply its exact shared schemas/interfaces and relevant concrete test seeds; all neighboring slices carry the remaining component requirements. This story delivers only the capability above, not the entire former component. No test is claimed already executed.

**Interfaces:** `timingAuthority({events,receipts,legacyEvidence})`. Preserve accepted public exports/re-exports when extracting focused modules. Upstream inputs are the completed predecessor-task contracts, not unverified working cloud content.

**Owned files:** `scripts/task-tracker/timing-rollup.mjs`, `scripts/task-tracker/lib/timing-ladder.mjs`, `scripts/task-tracker/lib/timing-row-reader.mjs`, `scripts/task-tracker/lib/review-approval-timing.mjs`, `scripts/reports/lib/daily-activity.mjs`. Each listed file is owned by this slice for its wave; do not modify parallel peers' files. New test deliverables are the exact paths below. Follow the accepted source-grounded caller census when a file family is migrated.

**Completion boundary:** Demonstrate the named normal behavior and refusal cases with targeted offline tests, preserve native invariants and obtain independent task review through the ordinary execution workflow. Start with the failing behavior test, implement only this slice, rerun its exact verifier, then commit with the actual child ID. This refinement is not permission to execute these steps now.

**Refinement allocation:** 3 hours; Size S; Priority P0; Rank 16; predecessor task numbers 15, 25, 26. Existing issue not yet created. Native dependencies are materialized only after issue IDs are known. Estimate basis: 1.5h implementation, 0.75h focused verification, 0.75h review/repair; no cloud comparison tasks used.

**Verification Commands:**

```sh
node --test scripts/tests/unit/task-tracker/lib/story-cache/timing-authority.test.mjs
```

### Task 30: Coordinated public writer and reader activation

#### Story Intent

- **Beneficiary:** delivery maintainer
- **Capability:** activate cached writers and readers together
- **Need:** switching only writers can leave callers relying on incompatible result authority
- **Value or failure prevented:** deliver a coherent public contract without unsafe fallback writers

#### Bounded delivery scope

Switch public writer results and every caller family together using the accepted caller census; prevent legacy immediate-write fallback; keep creation and explicit administrative migration separately classified.

**Original technical contract:** Task 10: Integrate cached views with guards and timing reports in `docs/superpowers/plans/2026-10-19-2039-local-estimation-transition-cache.md`, commit `f2894455a97bb80f6afb82ce5ff722cad2a46c2b`. Apply its exact shared schemas/interfaces and relevant concrete test seeds; all neighboring slices carry the remaining component requirements. This story delivers only the capability above, not the entire former component. No test is claimed already executed.

**Interfaces:** `activate routine writers through stageStoryMutation and transition transport capabilities`. Preserve accepted public exports/re-exports when extracting focused modules. Upstream inputs are the completed predecessor-task contracts, not unverified working cloud content.

**Owned files:** `scripts/task-tracker/lib/issue-body-mutate.mjs`, `scripts/task-tracker/lib/issue-body-push.mjs`, `scripts/task-tracker/lib/owned-comment.mjs`, `scripts/task-tracker/lib/github-records/github-comment-store.mjs`, `scripts/task-tracker/runtime.mjs`, `scripts/task-tracker/hook-handler.mjs`, `scripts/task-tracker/verbs/issue-body.mjs`. Each listed file is owned by this slice for its wave; do not modify parallel peers' files. New test deliverables are the exact paths below. Follow the accepted source-grounded caller census when a file family is migrated.

**Completion boundary:** Demonstrate the named normal behavior and refusal cases with targeted offline tests, preserve native invariants and obtain independent task review through the ordinary execution workflow. Start with the failing behavior test, implement only this slice, rerun its exact verifier, then commit with the actual child ID. This refinement is not permission to execute these steps now.

**Refinement allocation:** 3.5 hours; Size S; Priority P0; Rank 18; predecessor task numbers 28, 29. Existing issue not yet created. Native dependencies are materialized only after issue IDs are known. Estimate basis: 1.5h implementation, 1h focused failure/compatibility tests, 1h review/integration repair; no cloud comparison tasks used.

**Verification Commands:**

```sh
node --test scripts/tests/unit/task-tracker/lib/story-cache/public-activation.test.mjs
```

### Task 32: Adversarial full-saga recovery and inventory scenarios

#### Story Intent

- **Beneficiary:** delivery maintainer
- **Capability:** detect false recovery success across crash prefixes
- **Need:** isolated happy-path tests miss partial writes and external inventory changes
- **Value or failure prevented:** preserve recovery truth under every interrupted workflow

#### Bounded delivery scope

Cover every crash prefix, delayed successful writes, uncertain create, foreign comments, inventory swaps, post-freeze edits and failed persistence without false-green guard stubs.

**Original technical contract:** Task 11: Enforce offline whole-transition budgets and adversarial recovery in `docs/superpowers/plans/2026-10-19-2039-local-estimation-transition-cache.md`, commit `f2894455a97bb80f6afb82ce5ff722cad2a46c2b`. Apply its exact shared schemas/interfaces and relevant concrete test seeds; all neighboring slices carry the remaining component requirements. This story delivers only the capability above, not the entire former component. No test is claimed already executed.

**Interfaces:** `exercise native coordinator with injected transport and journal failures`. Preserve accepted public exports/re-exports when extracting focused modules. Upstream inputs are the completed predecessor-task contracts, not unverified working cloud content.

**Owned files:** `scripts/tests/integration/task-tracker/lib/story-cache-recovery.integration.test.mjs`. Each listed file is owned by this slice for its wave; do not modify parallel peers' files. New test deliverables are the exact paths below. Follow the accepted source-grounded caller census when a file family is migrated.

**Completion boundary:** Demonstrate the named normal behavior and refusal cases with targeted offline tests, preserve native invariants and obtain independent task review through the ordinary execution workflow. Start with the failing behavior test, implement only this slice, rerun its exact verifier, then commit with the actual child ID. This refinement is not permission to execute these steps now.

**Refinement allocation:** 3.5 hours; Size S; Priority P0; Rank 20; predecessor task numbers 31. Existing issue not yet created. Native dependencies are materialized only after issue IDs are known. Estimate basis: 1.5h implementation, 1h focused failure/compatibility tests, 1h review/integration repair; no cloud comparison tasks used.

**Verification Commands:**

```sh
node --test scripts/tests/integration/task-tracker/lib/story-cache-recovery.integration.test.mjs
```

### Task 33: Installed CLI and hook zero-network staging budgets

#### Story Intent

- **Beneficiary:** delivery maintainer
- **Capability:** prove installed staging entrypoints perform no remote work
- **Need:** installed hooks and CLI preflight may bypass local staging interception
- **Value or failure prevented:** prevent packaging or hook integration from reintroducing minor-update calls

#### Bounded delivery scope

Prove one and 1000 local edits/events have zero staging transport and equal transition writes; capture GraphQL, REST, gh and subprocess boundaries without calibration scans.

**Original technical contract:** Task 11: Enforce offline whole-transition budgets and adversarial recovery in `docs/superpowers/plans/2026-10-19-2039-local-estimation-transition-cache.md`, commit `f2894455a97bb80f6afb82ce5ff722cad2a46c2b`. Apply its exact shared schemas/interfaces and relevant concrete test seeds; all neighboring slices carry the remaining component requirements. This story delivers only the capability above, not the entire former component. No test is claimed already executed.

**Interfaces:** `spawn actual installed CLI and hooks with deny-by-default provider fixtures`. Preserve accepted public exports/re-exports when extracting focused modules. Upstream inputs are the completed predecessor-task contracts, not unverified working cloud content.

**Owned files:** `scripts/tests/integration/task-tracker/lib/story-cache-entrypoint.integration.test.mjs`. Each listed file is owned by this slice for its wave; do not modify parallel peers' files. New test deliverables are the exact paths below. Follow the accepted source-grounded caller census when a file family is migrated.

**Completion boundary:** Demonstrate the named normal behavior and refusal cases with targeted offline tests, preserve native invariants and obtain independent task review through the ordinary execution workflow. Start with the failing behavior test, implement only this slice, rerun its exact verifier, then commit with the actual child ID. This refinement is not permission to execute these steps now.

**Refinement allocation:** 3 hours; Size S; Priority P0; Rank 20; predecessor task numbers 31. Existing issue not yet created. Native dependencies are materialized only after issue IDs are known. Estimate basis: 1.5h implementation, 0.75h focused verification, 0.75h review/repair; no cloud comparison tasks used.

**Verification Commands:**

```sh
node --test scripts/tests/integration/task-tracker/lib/story-cache-entrypoint.integration.test.mjs
```

### Task 35: Operator guidance and supported recovery workflow

#### Story Intent

- **Beneficiary:** delivery maintainer
- **Capability:** recover and hand off stories using supported commands
- **Need:** operators need explicit conflict discussion and cache-transfer procedures
- **Value or failure prevented:** make operational recovery auditable and repeatable

#### Bounded delivery scope

Explain unpublished changes and read-only views; document native-token limits and delayed-write uncertainty; update installed guidance without new mode flags or unsupported recovery commands.

**Original technical contract:** Task 12: Document adoption and validate the integrated delivery in `docs/superpowers/plans/2026-10-19-2039-local-estimation-transition-cache.md`, commit `f2894455a97bb80f6afb82ce5ff722cad2a46c2b`. Apply its exact shared schemas/interfaces and relevant concrete test seeds; all neighboring slices carry the remaining component requirements. This story delivers only the capability above, not the entire former component. No test is claimed already executed.

**Interfaces:** `document acquire, edit, transition, conflict discussion and handoff through actual supported commands`. Preserve accepted public exports/re-exports when extracting focused modules. Upstream inputs are the completed predecessor-task contracts, not unverified working cloud content.

**Owned files:** `skill/shared/rules/issue-records.md`, `skill/shared/rules/state-walk.md`, `docs/guides/story-cache.md`. Each listed file is owned by this slice for its wave; do not modify parallel peers' files. New test deliverables are the exact paths below. Follow the accepted source-grounded caller census when a file family is migrated.

**Completion boundary:** Demonstrate the named normal behavior and refusal cases with targeted offline tests, preserve native invariants and obtain independent task review through the ordinary execution workflow. Start with the failing behavior test, implement only this slice, rerun its exact verifier, then commit with the actual child ID. This refinement is not permission to execute these steps now.

**Refinement allocation:** 3 hours; Size S; Priority P0; Rank 20; predecessor task numbers 34. Existing issue not yet created. Native dependencies are materialized only after issue IDs are known. Estimate basis: 1.5h implementation, 0.75h focused verification, 0.75h review/repair; no cloud comparison tasks used.

**Verification Commands:**

```sh
node --test scripts/tests/unit/task-tracker/lib/story-cache/operator-contract.test.mjs
```

### Task 36: Downstream package adoption and final integrated verification

#### Story Intent

- **Beneficiary:** delivery maintainer
- **Capability:** adopt the packaged workflow in a separate consumer
- **Need:** package-root assumptions can place consumer data in the installed dependency
- **Value or failure prevented:** prove downstream installation uses the consumer cache and supported delivery lanes

#### Bounded delivery scope

Verify consumer-root cache placement and coordinated activation in the packed artifact; run the integrated normal test/lint/format lanes once with exact-head receipts and record real outcomes.

**Original technical contract:** Task 12: Document adoption and validate the integrated delivery in `docs/superpowers/plans/2026-10-19-2039-local-estimation-transition-cache.md`, commit `f2894455a97bb80f6afb82ce5ff722cad2a46c2b`. Apply its exact shared schemas/interfaces and relevant concrete test seeds; all neighboring slices carry the remaining component requirements. This story delivers only the capability above, not the entire former component. No test is claimed already executed.

**Interfaces:** `pack/install isolated consumer and invoke actual installed issue-body route`. Preserve accepted public exports/re-exports when extracting focused modules. Upstream inputs are the completed predecessor-task contracts, not unverified working cloud content.

**Owned files:** `scripts/tests/integration/task-tracker/lib/story-cache-package.integration.test.mjs`, `package.json`, `bin/aitm.mjs`, `scripts/task-tracker/verbs/help-data.mjs`. Each listed file is owned by this slice for its wave; do not modify parallel peers' files. New test deliverables are the exact paths below. Follow the accepted source-grounded caller census when a file family is migrated.

**Completion boundary:** Demonstrate the named normal behavior and refusal cases with targeted offline tests, preserve native invariants and obtain independent task review through the ordinary execution workflow. Start with the failing behavior test, implement only this slice, rerun its exact verifier, then commit with the actual child ID. This refinement is not permission to execute these steps now.

**Refinement allocation:** 3.5 hours; Size S; Priority P0; Rank 21; predecessor task numbers 32, 33, 35. Existing issue not yet created. Native dependencies are materialized only after issue IDs are known. Estimate basis: 1.5h implementation, 1h focused failure/compatibility tests, 1h review/integration repair; no cloud comparison tasks used.

**Verification Commands:**

```sh
node --test scripts/tests/integration/task-tracker/lib/story-cache-package.integration.test.mjs
```
