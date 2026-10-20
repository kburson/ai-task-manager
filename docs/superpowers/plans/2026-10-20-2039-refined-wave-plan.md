# #2039 refined leaf stories and execution waves

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

## Schedule and coverage

| Task | Existing issue     | Hours | Rank/wave | Predecessor tasks | Deliverable                                                    |
| ---- | ------------------ | ----: | --------: | ----------------- | -------------------------------------------------------------- |
| 1    | #2040              |     3 |         2 | none              | Native body and comment revision observations                  |
| 2    | new direct sibling |   3.5 |         3 | 1                 | Bounded current-story snapshot reader                          |
| 3    | new direct sibling |   2.5 |         4 | 2                 | Full snapshot comparison and comment inventory drift           |
| 4    | #2041              |     3 |         3 | 1                 | Cache manifest and generation validation                       |
| 5    | new direct sibling |   3.5 |         4 | 2, 4              | Crash-safe immutable cache generation storage                  |
| 6    | new direct sibling |     3 |         5 | 5                 | Protect unpublished cache during cleanup and migration         |
| 7    | #2042              |     3 |         5 | 5                 | Singleton writer claim validation and native locks             |
| 8    | new direct sibling |     3 |         6 | 7                 | Shared writer registry with cache references only              |
| 9    | new direct sibling |   3.5 |         7 | 6, 8              | Explicit cache handoff and acknowledged export                 |
| 10   | #2043              |   3.5 |         8 | 3, 9              | Local issue-body and title staging adapter                     |
| 11   | new direct sibling |     3 |         9 | 10                | Local owned-comment intents and adoption                       |
| 12   | new direct sibling |   3.5 |        10 | 11                | Operation-specific proof capabilities and composite invariants |
| 13   | #2044              |   3.5 |         4 | 4                 | Canonical timing event normalization and interval deltas       |
| 14   | new direct sibling |     3 |         9 | 10, 13            | Durable timing ingestion and independent cursors               |
| 15   | new direct sibling |   3.5 |        11 | 12, 14            | Freeze and confirm one timing candidate per transition         |
| 16   | #2045              |   3.5 |         6 | 5, 6              | Durable local estimation evidence and lineage                  |
| 17   | new direct sibling |   3.5 |         7 | 16                | Pure local estimate calculation and rubric derivation          |
| 18   | new direct sibling |   3.5 |         8 | 17                | Disable cloud estimation before CLI and hook dispatch          |
| 19   | #2046              |   3.5 |         8 | 17                | Strict forecast v3 schema and local provenance                 |
| 20   | new direct sibling |   3.5 |         9 | 18, 19            | Forecast lineage resolution and local read projections         |
| 21   | new direct sibling |     3 |        10 | 20                | Legacy forecast readers and v2 half-hour compatibility         |
| 22   | #2047              |   3.5 |        12 | 12, 15, 21        | Freeze publication effects and final-body substitution slots   |
| 23   | new direct sibling |   3.5 |        13 | 22                | Single-attempt resource publisher and exact read-back          |
| 24   | new direct sibling |   3.5 |        14 | 23                | Partial and uncertain publication recovery                     |
| 25   | #2048              |     3 |        12 | 15                | Immutable transition receipts and historical event subsets     |
| 26   | new direct sibling |   3.5 |        15 | 24, 25            | Transition coordinator with one final issue-body write         |
| 27   | new direct sibling |   3.5 |        16 | 21, 26            | Plan approval and forecast candidate/published authority       |
| 28   | #2049              |   3.5 |        17 | 12, 18, 27        | Working versus published views for guards and Explain          |
| 29   | new direct sibling |     3 |        16 | 15, 25, 26        | Timing reports and field projections preserve real work        |
| 30   | new direct sibling |   3.5 |        18 | 28, 29            | Coordinated public writer and reader activation                |
| 31   | #2050              |   3.5 |        19 | 30                | Fixed whole-native workflow operation budgets                  |
| 32   | new direct sibling |   3.5 |        20 | 31                | Adversarial full-saga recovery and inventory scenarios         |
| 33   | new direct sibling |     3 |        20 | 31                | Installed CLI and hook zero-network staging budgets            |
| 34   | #2051              |   3.5 |        19 | 6, 30             | Legacy writer adoption and safe administrative migration       |
| 35   | new direct sibling |     3 |        20 | 34                | Operator guidance and supported recovery workflow              |
| 36   | new direct sibling |   3.5 |        21 | 32, 33, 35        | Downstream package adoption and final integrated verification  |

All twelve components map to three distinct slices; earlier tasks provide the interfaces consumed later. No same-wave pair shares an owned source file or a direct/transitive predecessor. Parent remains Plan; target for all 36 children is Ready for Planning.

## Leaf slices

### Task 1: Native body and comment revision observations

#### Story Intent

- **Beneficiary:** delivery maintainer
- **Capability:** identify native revision states for body and comments
- **Need:** edit counts cannot distinguish unedited and unavailable history
- **Value or failure prevented:** prevent unsupported native observations from permitting stale writes

#### Bounded delivery scope

Recognize complete unedited histories; validate edited native IDs and exact body hashes; refuse partial data, inconsistent timestamps and latest tombstones.

**Original technical contract:** Task 1: Observe native issue and comment revisions in a bounded snapshot in `docs/superpowers/plans/2026-10-19-2039-local-estimation-transition-cache.md`, commit `f2894455a97bb80f6afb82ce5ff722cad2a46c2b`. Apply its exact shared schemas/interfaces and relevant concrete test seeds; all neighboring slices carry the remaining component requirements. This story delivers only the capability above, not the entire former component. No test is claimed already executed.

**Interfaces:** `observeContent({identity,node,body})`. Preserve accepted public exports/re-exports when extracting focused modules. Upstream inputs are the completed predecessor-task contracts, not unverified working cloud content.

**Owned files:** `scripts/task-tracker/lib/story-cache/native-observation.mjs`. Each listed file is owned by this slice for its wave; do not modify parallel peers' files. New test deliverables are the exact paths below. Follow the accepted source-grounded caller census when a file family is migrated.

**Completion boundary:** Demonstrate the named normal behavior and refusal cases with targeted offline tests, preserve native invariants and obtain independent task review through the ordinary execution workflow. Start with the failing behavior test, implement only this slice, rerun its exact verifier, then commit with the actual child ID. This refinement is not permission to execute these steps now.

**Refinement allocation:** 3 hours; Size S; Priority P0; Rank 2; predecessor task numbers none. Existing issue #2040. Native dependencies are materialized only after issue IDs are known. Estimate basis: 1.5h implementation, 0.75h focused verification, 0.75h review/repair; no cloud comparison tasks used.

**Verification Commands:**

```sh
node --test scripts/tests/unit/task-tracker/lib/story-cache/native-observation.test.mjs
```

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

### Task 4: Cache manifest and generation validation

#### Story Intent

- **Beneficiary:** delivery maintainer
- **Capability:** validate cache identities and generation pointers
- **Need:** corrupt paths and conflated counters can acknowledge invalid cache data
- **Value or failure prevented:** refuse corrupt or mismatched cache authority before work is lost

#### Bounded delivery scope

Validate identity, relative payload containment, schema and checksums; distinguish every-edit storage generations from once-per-batch publication generations.

**Original technical contract:** Task 2: Persist manifest generations and protect unpublished cache data in `docs/superpowers/plans/2026-10-19-2039-local-estimation-transition-cache.md`, commit `f2894455a97bb80f6afb82ce5ff722cad2a46c2b`. Apply its exact shared schemas/interfaces and relevant concrete test seeds; all neighboring slices carry the remaining component requirements. This story delivers only the capability above, not the entire former component. No test is claimed already executed.

**Interfaces:** `validateManifest(manifest,{identity,payloads})`. Preserve accepted public exports/re-exports when extracting focused modules. Upstream inputs are the completed predecessor-task contracts, not unverified working cloud content.

**Owned files:** `scripts/task-tracker/lib/story-cache/manifest.mjs`. Each listed file is owned by this slice for its wave; do not modify parallel peers' files. New test deliverables are the exact paths below. Follow the accepted source-grounded caller census when a file family is migrated.

**Completion boundary:** Demonstrate the named normal behavior and refusal cases with targeted offline tests, preserve native invariants and obtain independent task review through the ordinary execution workflow. Start with the failing behavior test, implement only this slice, rerun its exact verifier, then commit with the actual child ID. This refinement is not permission to execute these steps now.

**Refinement allocation:** 3 hours; Size S; Priority P0; Rank 3; predecessor task numbers 1. Existing issue #2041. Native dependencies are materialized only after issue IDs are known. Estimate basis: 1.5h implementation, 0.75h focused verification, 0.75h review/repair; no cloud comparison tasks used.

**Verification Commands:**

```sh
node --test scripts/tests/unit/task-tracker/lib/story-cache/manifest.test.mjs
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

### Task 7: Singleton writer claim validation and native locks

#### Story Intent

- **Beneficiary:** delivery maintainer
- **Capability:** enforce one assigned owner and one agent writer
- **Need:** several sessions can use the same human login
- **Value or failure prevented:** prevent competing sessions from overwriting unpublished work

#### Bounded delivery scope

Require singleton human assignment at acquisition and transition and the owning agent/session locally; distinguish another session using the same login; retain native lock isolation.

**Original technical contract:** Task 3: Enforce one assigned human and one owning agent cache in `docs/superpowers/plans/2026-10-19-2039-local-estimation-transition-cache.md`, commit `f2894455a97bb80f6afb82ce5ff722cad2a46c2b`. Apply its exact shared schemas/interfaces and relevant concrete test seeds; all neighboring slices carry the remaining component requirements. This story delivers only the capability above, not the entire former component. No test is claimed already executed.

**Interfaces:** `acquireStoryWriter({identity,human,sessionId,worktree,cachePath,assignment,registry}); assertStoryWriter(claim,{sessionId,worktree})`. Preserve accepted public exports/re-exports when extracting focused modules. Upstream inputs are the completed predecessor-task contracts, not unverified working cloud content.

**Owned files:** `scripts/task-tracker/lib/story-cache/writer-claim.mjs`, `scripts/task-tracker/lib/ownership-policy.mjs`, `scripts/task-tracker/issue-mutator-lock.mjs`. Each listed file is owned by this slice for its wave; do not modify parallel peers' files. New test deliverables are the exact paths below. Follow the accepted source-grounded caller census when a file family is migrated.

**Completion boundary:** Demonstrate the named normal behavior and refusal cases with targeted offline tests, preserve native invariants and obtain independent task review through the ordinary execution workflow. Start with the failing behavior test, implement only this slice, rerun its exact verifier, then commit with the actual child ID. This refinement is not permission to execute these steps now.

**Refinement allocation:** 3 hours; Size S; Priority P0; Rank 5; predecessor task numbers 5. Existing issue #2042. Native dependencies are materialized only after issue IDs are known. Estimate basis: 1.5h implementation, 0.75h focused verification, 0.75h review/repair; no cloud comparison tasks used.

**Verification Commands:**

```sh
node --test scripts/tests/unit/task-tracker/lib/story-cache/writer-claim.test.mjs
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

### Task 10: Local issue-body and title staging adapter

#### Story Intent

- **Beneficiary:** delivery maintainer
- **Capability:** accumulate body and title changes locally
- **Need:** per-marker body writes consume shared provider allowance
- **Value or failure prevented:** reduce remote traffic while preserving validated local intent

#### Bounded delivery scope

Stage validated body/title deltas and dirty tags without remote calls; return unpublished results explicitly; leave public legacy callers unactivated until the integration story.

**Original technical contract:** Task 4: Stage body and owned-comment mutations without network calls in `docs/superpowers/plans/2026-10-19-2039-local-estimation-transition-cache.md`, commit `f2894455a97bb80f6afb82ce5ff722cad2a46c2b`. Apply its exact shared schemas/interfaces and relevant concrete test seeds; all neighboring slices carry the remaining component requirements. This story delivers only the capability above, not the entire former component. No test is claimed already executed.

**Interfaces:** `stageStoryMutation({store,claim,key,mutate,capability}); stageStoryTitle({store,claim,title,capability})`. Preserve accepted public exports/re-exports when extracting focused modules. Upstream inputs are the completed predecessor-task contracts, not unverified working cloud content.

**Owned files:** `scripts/task-tracker/lib/story-cache/stage-body.mjs`. Each listed file is owned by this slice for its wave; do not modify parallel peers' files. New test deliverables are the exact paths below. Follow the accepted source-grounded caller census when a file family is migrated.

**Completion boundary:** Demonstrate the named normal behavior and refusal cases with targeted offline tests, preserve native invariants and obtain independent task review through the ordinary execution workflow. Start with the failing behavior test, implement only this slice, rerun its exact verifier, then commit with the actual child ID. This refinement is not permission to execute these steps now.

**Refinement allocation:** 3.5 hours; Size S; Priority P0; Rank 8; predecessor task numbers 3, 9. Existing issue #2043. Native dependencies are materialized only after issue IDs are known. Estimate basis: 1.5h implementation, 1h focused failure/compatibility tests, 1h review/integration repair; no cloud comparison tasks used.

**Verification Commands:**

```sh
node --test scripts/tests/unit/task-tracker/lib/story-cache/stage-body.test.mjs
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

### Task 13: Canonical timing event normalization and interval deltas

#### Story Intent

- **Beneficiary:** delivery maintainer
- **Capability:** normalize attributable nonoverlapping timing events
- **Need:** cumulative snapshots and conflicting event IDs can double count work
- **Value or failure prevented:** retain truthful measured time and Unknown values

#### Bounded delivery scope

Preserve native actor/event/transition identities, nonoverlapping measured interval deltas and Unknown; deduplicate identical IDs and refuse conflicting duplicates or cumulative double counts.

**Original technical contract:** Task 5: Accumulate timing events with separate ingestion and publication cursors in `docs/superpowers/plans/2026-10-19-2039-local-estimation-transition-cache.md`, commit `f2894455a97bb80f6afb82ce5ff722cad2a46c2b`. Apply its exact shared schemas/interfaces and relevant concrete test seeds; all neighboring slices carry the remaining component requirements. This story delivers only the capability above, not the entire former component. No test is claimed already executed.

**Interfaces:** `mergeTimingEvents(existing,incoming)`. Preserve accepted public exports/re-exports when extracting focused modules. Upstream inputs are the completed predecessor-task contracts, not unverified working cloud content.

**Owned files:** `scripts/task-tracker/lib/story-cache/timing-events.mjs`. Each listed file is owned by this slice for its wave; do not modify parallel peers' files. New test deliverables are the exact paths below. Follow the accepted source-grounded caller census when a file family is migrated.

**Completion boundary:** Demonstrate the named normal behavior and refusal cases with targeted offline tests, preserve native invariants and obtain independent task review through the ordinary execution workflow. Start with the failing behavior test, implement only this slice, rerun its exact verifier, then commit with the actual child ID. This refinement is not permission to execute these steps now.

**Refinement allocation:** 3.5 hours; Size S; Priority P0; Rank 4; predecessor task numbers 4. Existing issue #2044. Native dependencies are materialized only after issue IDs are known. Estimate basis: 1.5h implementation, 1h focused failure/compatibility tests, 1h review/integration repair; no cloud comparison tasks used.

**Verification Commands:**

```sh
node --test scripts/tests/unit/task-tracker/lib/story-cache/timing-events.test.mjs
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

### Task 16: Durable local estimation evidence and lineage

#### Story Intent

- **Beneficiary:** delivery maintainer
- **Capability:** retain local estimation evidence with truthful lineage
- **Need:** derived local data must not masquerade as cloud-authorized evidence
- **Value or failure prevented:** make local estimation reproducible without fictional cloud grants

#### Bounded delivery scope

Use native durable evidence storage separate from story content; validate exact envelopes, hashes and ancestry; give derived-local records no invented cloud grant.

**Original technical contract:** Task 6: Calculate estimates and refresh rubrics from retained local evidence only in `docs/superpowers/plans/2026-10-19-2039-local-estimation-transition-cache.md`, commit `f2894455a97bb80f6afb82ce5ff722cad2a46c2b`. Apply its exact shared schemas/interfaces and relevant concrete test seeds; all neighboring slices carry the remaining component requirements. This story delivers only the capability above, not the entire former component. No test is claimed already executed.

**Interfaces:** `validateLocalEvidence(bundle); importLocalEvidence({evidenceStore,bundle})`. Preserve accepted public exports/re-exports when extracting focused modules. Upstream inputs are the completed predecessor-task contracts, not unverified working cloud content.

**Owned files:** `scripts/task-tracker/lib/estimation/local-evidence.mjs`, `scripts/task-tracker/lib/estimation/local-evidence-store.mjs`. Each listed file is owned by this slice for its wave; do not modify parallel peers' files. New test deliverables are the exact paths below. Follow the accepted source-grounded caller census when a file family is migrated.

**Completion boundary:** Demonstrate the named normal behavior and refusal cases with targeted offline tests, preserve native invariants and obtain independent task review through the ordinary execution workflow. Start with the failing behavior test, implement only this slice, rerun its exact verifier, then commit with the actual child ID. This refinement is not permission to execute these steps now.

**Refinement allocation:** 3.5 hours; Size S; Priority P0; Rank 6; predecessor task numbers 5, 6. Existing issue #2045. Native dependencies are materialized only after issue IDs are known. Estimate basis: 1.5h implementation, 1h focused failure/compatibility tests, 1h review/integration repair; no cloud comparison tasks used.

**Verification Commands:**

```sh
node --test scripts/tests/unit/task-tracker/lib/estimation/local-evidence.test.mjs
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

### Task 19: Strict forecast v3 schema and local provenance

#### Story Intent

- **Beneficiary:** delivery maintainer
- **Capability:** validate forecasts with explicit local provenance
- **Need:** legacy forecast references do not describe retained local calculation inputs
- **Value or failure prevented:** make current forecast inputs auditable without cloud discovery

#### Bounded delivery scope

Define strict successor schema and local-evidence manifest references; correlate plan/refine/rubric/outcome identities and exact hashes without fictional comment IDs.

**Original technical contract:** Task 7: Publish forecast v3 provenance while retaining legacy forecast reads in `docs/superpowers/plans/2026-10-19-2039-local-estimation-transition-cache.md`, commit `f2894455a97bb80f6afb82ce5ff722cad2a46c2b`. Apply its exact shared schemas/interfaces and relevant concrete test seeds; all neighboring slices carry the remaining component requirements. This story delivers only the capability above, not the entire former component. No test is claimed already executed.

**Interfaces:** `validateForecastProvenance(value,{expectedIssue,repository})`. Preserve accepted public exports/re-exports when extracting focused modules. Upstream inputs are the completed predecessor-task contracts, not unverified working cloud content.

**Owned files:** `scripts/task-tracker/lib/estimation/forecast-model.mjs`, `scripts/task-tracker/lib/estimation/forecast-v3.mjs`. Each listed file is owned by this slice for its wave; do not modify parallel peers' files. New test deliverables are the exact paths below. Follow the accepted source-grounded caller census when a file family is migrated.

**Completion boundary:** Demonstrate the named normal behavior and refusal cases with targeted offline tests, preserve native invariants and obtain independent task review through the ordinary execution workflow. Start with the failing behavior test, implement only this slice, rerun its exact verifier, then commit with the actual child ID. This refinement is not permission to execute these steps now.

**Refinement allocation:** 3.5 hours; Size S; Priority P0; Rank 8; predecessor task numbers 17. Existing issue #2046. Native dependencies are materialized only after issue IDs are known. Estimate basis: 1.5h implementation, 1h focused failure/compatibility tests, 1h review/integration repair; no cloud comparison tasks used.

**Verification Commands:**

```sh
node --test scripts/tests/unit/task-tracker/lib/estimation/forecast-v3.test.mjs
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

### Task 22: Freeze publication effects and final-body substitution slots

#### Story Intent

- **Beneficiary:** delivery maintainer
- **Capability:** freeze declared publication effects and body slots
- **Need:** late body edits and unknown creation IDs can invalidate a frozen batch
- **Value or failure prevented:** prevent discretionary edits or circular proof from entering publication

#### Bounded delivery scope

Freeze exact inputs, resource identities, dependencies and permitted verified-ID slots; allocate one publication generation; exclude circular final-body hashing and late discretionary edits.

**Original technical contract:** Task 8: Publish one frozen resource batch and recover uncertain effects in `docs/superpowers/plans/2026-10-19-2039-local-estimation-transition-cache.md`, commit `f2894455a97bb80f6afb82ce5ff722cad2a46c2b`. Apply its exact shared schemas/interfaces and relevant concrete test seeds; all neighboring slices carry the remaining component requirements. This story delivers only the capability above, not the entire former component. No test is claimed already executed.

**Interfaces:** `freezeStoryBatch({generation,transition,effects,capabilities})`. Preserve accepted public exports/re-exports when extracting focused modules. Upstream inputs are the completed predecessor-task contracts, not unverified working cloud content.

**Owned files:** `scripts/task-tracker/lib/story-cache/batch.mjs`, `scripts/task-tracker/lib/story-cache/body-template.mjs`. Each listed file is owned by this slice for its wave; do not modify parallel peers' files. New test deliverables are the exact paths below. Follow the accepted source-grounded caller census when a file family is migrated.

**Completion boundary:** Demonstrate the named normal behavior and refusal cases with targeted offline tests, preserve native invariants and obtain independent task review through the ordinary execution workflow. Start with the failing behavior test, implement only this slice, rerun its exact verifier, then commit with the actual child ID. This refinement is not permission to execute these steps now.

**Refinement allocation:** 3.5 hours; Size S; Priority P0; Rank 12; predecessor task numbers 12, 15, 21. Existing issue #2047. Native dependencies are materialized only after issue IDs are known. Estimate basis: 1.5h implementation, 1h focused failure/compatibility tests, 1h review/integration repair; no cloud comparison tasks used.

**Verification Commands:**

```sh
node --test scripts/tests/unit/task-tracker/lib/story-cache/batch.test.mjs
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

### Task 25: Immutable transition receipts and historical event subsets

#### Story Intent

- **Beneficiary:** delivery maintainer
- **Capability:** retain trustworthy completion evidence across log appends
- **Need:** later timing appends change a full-comment hash without changing older completed events
- **Value or failure prevented:** preserve older completed visits while exposing altered history

#### Bounded delivery scope

Bind native transition/actor/visit and confirmed effects; retain timing event IDs and subset digest independently of changing full-comment hashes; reject altered prior rows and synthetic legacy proof.

**Original technical contract:** Task 9: Commit state transitions with one final issue write in `docs/superpowers/plans/2026-10-19-2039-local-estimation-transition-cache.md`, commit `f2894455a97bb80f6afb82ce5ff722cad2a46c2b`. Apply its exact shared schemas/interfaces and relevant concrete test seeds; all neighboring slices carry the remaining component requirements. This story delivers only the capability above, not the entire former component. No test is claimed already executed.

**Interfaces:** `validateCompletionReceipt(receipt,{transition,confirmedEffects})`. Preserve accepted public exports/re-exports when extracting focused modules. Upstream inputs are the completed predecessor-task contracts, not unverified working cloud content.

**Owned files:** `scripts/task-tracker/lib/story-cache/completion-receipt.mjs`. Each listed file is owned by this slice for its wave; do not modify parallel peers' files. New test deliverables are the exact paths below. Follow the accepted source-grounded caller census when a file family is migrated.

**Completion boundary:** Demonstrate the named normal behavior and refusal cases with targeted offline tests, preserve native invariants and obtain independent task review through the ordinary execution workflow. Start with the failing behavior test, implement only this slice, rerun its exact verifier, then commit with the actual child ID. This refinement is not permission to execute these steps now.

**Refinement allocation:** 3 hours; Size S; Priority P0; Rank 12; predecessor task numbers 15. Existing issue #2048. Native dependencies are materialized only after issue IDs are known. Estimate basis: 1.5h implementation, 0.75h focused verification, 0.75h review/repair; no cloud comparison tasks used.

**Verification Commands:**

```sh
node --test scripts/tests/unit/task-tracker/lib/story-cache/completion-receipt.test.mjs
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

### Task 28: Working versus published views for guards and Explain

#### Story Intent

- **Beneficiary:** delivery maintainer
- **Capability:** distinguish working content from published authority
- **Need:** legacy identity-mutation readers can mistake staged content for verified publication
- **Value or failure prevented:** prevent false guard success and expose actionable unpublished state

#### Bounded delivery scope

Route every identity-mutate reader to an explicit authority view; expose dirty/conflict/uncertain states and real recovery routes; preserve source/edit/commit/proof guards.

**Original technical contract:** Task 10: Integrate cached views with guards and timing reports in `docs/superpowers/plans/2026-10-19-2039-local-estimation-transition-cache.md`, commit `f2894455a97bb80f6afb82ce5ff722cad2a46c2b`. Apply its exact shared schemas/interfaces and relevant concrete test seeds; all neighboring slices carry the remaining component requirements. This story delivers only the capability above, not the entire former component. No test is claimed already executed.

**Interfaces:** `storyView({generation,authority:'working'|'published'})`. Preserve accepted public exports/re-exports when extracting focused modules. Upstream inputs are the completed predecessor-task contracts, not unverified working cloud content.

**Owned files:** `scripts/task-tracker/lib/story-cache/views.mjs`, `scripts/task-tracker/lib/action-decision/session.mjs`, `scripts/task-tracker/verbs/explain.mjs`, `scripts/task-tracker/lib/decomposition-hook-authority.mjs`. Each listed file is owned by this slice for its wave; do not modify parallel peers' files. New test deliverables are the exact paths below. Follow the accepted source-grounded caller census when a file family is migrated.

**Completion boundary:** Demonstrate the named normal behavior and refusal cases with targeted offline tests, preserve native invariants and obtain independent task review through the ordinary execution workflow. Start with the failing behavior test, implement only this slice, rerun its exact verifier, then commit with the actual child ID. This refinement is not permission to execute these steps now.

**Refinement allocation:** 3.5 hours; Size S; Priority P0; Rank 17; predecessor task numbers 12, 18, 27. Existing issue #2049. Native dependencies are materialized only after issue IDs are known. Estimate basis: 1.5h implementation, 1h focused failure/compatibility tests, 1h review/integration repair; no cloud comparison tasks used.

**Verification Commands:**

```sh
node --test scripts/tests/unit/task-tracker/lib/story-cache/views.test.mjs
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

### Task 31: Fixed whole-native workflow operation budgets

#### Story Intent

- **Beneficiary:** delivery maintainer
- **Capability:** detect whole-workflow request-budget regressions
- **Need:** helper-only tests hide collector, guard and subprocess amplification
- **Value or failure prevented:** catch quota regressions against independently fixed ceilings

#### Bounded delivery scope

Freeze independent S/G/D/V fixture manifests and 8/13/10-call ceilings before dispatch; exercise actual native collector/guards/saga and account for unclassified and unknown costs.

**Original technical contract:** Task 11: Enforce offline whole-transition budgets and adversarial recovery in `docs/superpowers/plans/2026-10-19-2039-local-estimation-transition-cache.md`, commit `f2894455a97bb80f6afb82ce5ff722cad2a46c2b`. Apply its exact shared schemas/interfaces and relevant concrete test seeds; all neighboring slices carry the remaining component requirements. This story delivers only the capability above, not the entire former component. No test is claimed already executed.

**Interfaces:** `assertOperationBudget(ledger,budget)`. Preserve accepted public exports/re-exports when extracting focused modules. Upstream inputs are the completed predecessor-task contracts, not unverified working cloud content.

**Owned files:** `scripts/tests/helpers/story-cache-ledger.mjs`, `scripts/tests/integration/task-tracker/lib/story-cache-transition-budget.integration.test.mjs`. Each listed file is owned by this slice for its wave; do not modify parallel peers' files. New test deliverables are the exact paths below. Follow the accepted source-grounded caller census when a file family is migrated.

**Completion boundary:** Demonstrate the named normal behavior and refusal cases with targeted offline tests, preserve native invariants and obtain independent task review through the ordinary execution workflow. Start with the failing behavior test, implement only this slice, rerun its exact verifier, then commit with the actual child ID. This refinement is not permission to execute these steps now.

**Refinement allocation:** 3.5 hours; Size S; Priority P0; Rank 19; predecessor task numbers 30. Existing issue #2050. Native dependencies are materialized only after issue IDs are known. Estimate basis: 1.5h implementation, 1h focused failure/compatibility tests, 1h review/integration repair; no cloud comparison tasks used.

**Verification Commands:**

```sh
node --test scripts/tests/integration/task-tracker/lib/story-cache-transition-budget.integration.test.mjs
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

### Task 34: Legacy writer adoption and safe administrative migration

#### Story Intent

- **Beneficiary:** delivery maintainer
- **Capability:** adopt legacy writers without losing pending work
- **Need:** repair and cleanup entrypoints can retain unsafe immediate-write behavior
- **Value or failure prevented:** preserve pending data during safe adoption and migration

#### Bounded delivery scope

Inventory every accepted legacy writer/repair path; stage existing-issue changes by default; refuse one-off migration with pending cache/claim; protect dirty exports and no automatic history hydration.

**Original technical contract:** Task 12: Document adoption and validate the integrated delivery in `docs/superpowers/plans/2026-10-19-2039-local-estimation-transition-cache.md`, commit `f2894455a97bb80f6afb82ce5ff722cad2a46c2b`. Apply its exact shared schemas/interfaces and relevant concrete test seeds; all neighboring slices carry the remaining component requirements. This story delivers only the capability above, not the entire former component. No test is claimed already executed.

**Interfaces:** `classify migration as staging or separately authorized one-off repair`. Preserve accepted public exports/re-exports when extracting focused modules. Upstream inputs are the completed predecessor-task contracts, not unverified working cloud content.

**Owned files:** `scripts/task-tracker/lib/runtime-migration-plan.mjs`, `scripts/task-tracker/lib/runtime-migration-apply.mjs`, `scripts/task-tracker/heal-timing-log.mjs`, `scripts/task-tracker/backfill-plan-metadata.mjs`, `scripts/task-tracker/migrate-plan-approved.mjs`, `scripts/task-tracker/verbs/adopt-github-records.mjs`. Each listed file is owned by this slice for its wave; do not modify parallel peers' files. New test deliverables are the exact paths below. Follow the accepted source-grounded caller census when a file family is migrated.

**Completion boundary:** Demonstrate the named normal behavior and refusal cases with targeted offline tests, preserve native invariants and obtain independent task review through the ordinary execution workflow. Start with the failing behavior test, implement only this slice, rerun its exact verifier, then commit with the actual child ID. This refinement is not permission to execute these steps now.

**Refinement allocation:** 3.5 hours; Size S; Priority P0; Rank 19; predecessor task numbers 6, 30. Existing issue #2051. Native dependencies are materialized only after issue IDs are known. Estimate basis: 1.5h implementation, 1h focused failure/compatibility tests, 1h review/integration repair; no cloud comparison tasks used.

**Verification Commands:**

```sh
node --test scripts/tests/unit/task-tracker/lib/story-cache/migration.test.mjs
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

## Machine-readable schedule

The following data is an execution crosswalk for native issue commands, not product code or completion evidence. Existing IDs are retained; new IDs must be journaled after confirmed creation. This table is not a native refinement stamp.

```json
[
  {
    "n": 1,
    "component": 1,
    "existing": 2040,
    "title": "Native body and comment revision observations",
    "hours": 3,
    "deps": [],
    "files": "native-observation.mjs",
    "tests": "native-observation.test.mjs",
    "api": "observeContent({identity,node,body})",
    "scope": "Recognize complete unedited histories; validate edited native IDs and exact body hashes; refuse partial data, inconsistent timestamps and latest tombstones.",
    "rank": 2,
    "intent": {
      "beneficiary": "delivery maintainer",
      "capability": "identify native revision states for body and comments",
      "need": "edit counts cannot distinguish unedited and unavailable history",
      "value": "prevent unsupported native observations from permitting stale writes"
    },
    "paths": ["scripts/task-tracker/lib/story-cache/native-observation.mjs"],
    "verifiers": [
      "node --test scripts/tests/unit/task-tracker/lib/story-cache/native-observation.test.mjs"
    ]
  },
  {
    "n": 2,
    "component": 1,
    "existing": null,
    "title": "Bounded current-story snapshot reader",
    "hours": 3.5,
    "deps": [1],
    "files": "snapshot-reader.mjs",
    "tests": "snapshot-reader.test.mjs",
    "api": "readStorySnapshot({identity,transport,budget})",
    "scope": "Read the target body, title, all current comments, assignees and configured fields; enforce shared page/byte limits and no history-diff traversal.",
    "rank": 3,
    "intent": {
      "beneficiary": "delivery maintainer",
      "capability": "obtain a complete bounded current-story snapshot",
      "need": "partial target observations cannot authorize a publication",
      "value": "prevent incomplete inventories from authorizing cloud changes"
    },
    "paths": ["scripts/task-tracker/lib/story-cache/snapshot-reader.mjs"],
    "verifiers": [
      "node --test scripts/tests/unit/task-tracker/lib/story-cache/snapshot-reader.test.mjs"
    ]
  },
  {
    "n": 3,
    "component": 1,
    "existing": null,
    "title": "Full snapshot comparison and comment inventory drift",
    "hours": 2.5,
    "deps": [2],
    "files": "snapshot-compare.mjs;native-observation.mjs",
    "tests": "snapshot-compare.test.mjs",
    "api": "compareSnapshots(base,current)",
    "scope": "Compare nondirty and foreign comments, exact hashes, title and field inventory; detect equal-count replacements and equal-token/different-content observations.",
    "rank": 4,
    "intent": {
      "beneficiary": "delivery maintainer",
      "capability": "detect drift across every cached resource",
      "need": "foreign edits and equal-count replacements can evade body-only checks",
      "value": "retain external changes and require an explainable three-way conflict"
    },
    "paths": [
      "scripts/task-tracker/lib/story-cache/snapshot-compare.mjs",
      "scripts/task-tracker/lib/story-cache/native-observation.mjs"
    ],
    "verifiers": [
      "node --test scripts/tests/unit/task-tracker/lib/story-cache/snapshot-compare.test.mjs"
    ]
  },
  {
    "n": 4,
    "component": 2,
    "existing": 2041,
    "title": "Cache manifest and generation validation",
    "hours": 3,
    "deps": [1],
    "files": "manifest.mjs",
    "tests": "manifest.test.mjs",
    "api": "validateManifest(manifest,{identity,payloads})",
    "scope": "Validate identity, relative payload containment, schema and checksums; distinguish every-edit storage generations from once-per-batch publication generations.",
    "rank": 3,
    "intent": {
      "beneficiary": "delivery maintainer",
      "capability": "validate cache identities and generation pointers",
      "need": "corrupt paths and conflated counters can acknowledge invalid cache data",
      "value": "refuse corrupt or mismatched cache authority before work is lost"
    },
    "paths": ["scripts/task-tracker/lib/story-cache/manifest.mjs"],
    "verifiers": ["node --test scripts/tests/unit/task-tracker/lib/story-cache/manifest.test.mjs"]
  },
  {
    "n": 5,
    "component": 2,
    "existing": null,
    "title": "Crash-safe immutable cache generation storage",
    "hours": 3.5,
    "deps": [2, 4],
    "files": "store.mjs",
    "tests": "store.test.mjs",
    "api": "openStoryStore({projectRoot,identity,fs}); store.commitGeneration(next,{expectedGeneration})",
    "scope": "Persist immutable body/comment payloads and atomic manifest pointers; retain the preceding valid generation; inject fsync/rename failure and generation races.",
    "rank": 4,
    "intent": {
      "beneficiary": "delivery maintainer",
      "capability": "persist crash-safe immutable cache generations",
      "need": "power loss or racing generations can lose unpublished changes",
      "value": "retain a verified prior generation after every persistence failure"
    },
    "paths": ["scripts/task-tracker/lib/story-cache/store.mjs"],
    "verifiers": ["node --test scripts/tests/unit/task-tracker/lib/story-cache/store.test.mjs"]
  },
  {
    "n": 6,
    "component": 2,
    "existing": null,
    "title": "Protect unpublished cache during cleanup and migration",
    "hours": 3,
    "deps": [5],
    "files": "retention.mjs;runtime-storage.mjs;runtime-migration-plan.mjs;runtime-migration-apply.mjs;paths.mjs",
    "tests": "retention.test.mjs",
    "api": "cacheRetentionDecision({generation,operation}); storyCachePath({projectRoot,identity})",
    "scope": "Keep dirty, conflict and uncertain cache generations during cleanup; resolve the consumer worktree root; reject symlink/traversal escape and package-root storage.",
    "rank": 5,
    "intent": {
      "beneficiary": "delivery maintainer",
      "capability": "protect unpublished cache data during cleanup",
      "need": "ordinary temporary-file cleanup can destroy pending work",
      "value": "preserve pending story edits and recovery evidence"
    },
    "paths": [
      "scripts/task-tracker/lib/story-cache/retention.mjs",
      "scripts/task-tracker/lib/runtime-storage.mjs",
      "scripts/task-tracker/lib/runtime-migration-plan.mjs",
      "scripts/task-tracker/lib/runtime-migration-apply.mjs",
      "scripts/task-tracker/paths.mjs"
    ],
    "verifiers": ["node --test scripts/tests/unit/task-tracker/lib/story-cache/retention.test.mjs"]
  },
  {
    "n": 7,
    "component": 3,
    "existing": 2042,
    "title": "Singleton writer claim validation and native locks",
    "hours": 3,
    "deps": [5],
    "files": "writer-claim.mjs;ownership-policy.mjs;issue-mutator-lock.mjs",
    "tests": "writer-claim.test.mjs",
    "api": "acquireStoryWriter({identity,human,sessionId,worktree,cachePath,assignment,registry}); assertStoryWriter(claim,{sessionId,worktree})",
    "scope": "Require singleton human assignment at acquisition and transition and the owning agent/session locally; distinguish another session using the same login; retain native lock isolation.",
    "rank": 5,
    "intent": {
      "beneficiary": "delivery maintainer",
      "capability": "enforce one assigned owner and one agent writer",
      "need": "several sessions can use the same human login",
      "value": "prevent competing sessions from overwriting unpublished work"
    },
    "paths": [
      "scripts/task-tracker/lib/story-cache/writer-claim.mjs",
      "scripts/task-tracker/lib/ownership-policy.mjs",
      "scripts/task-tracker/issue-mutator-lock.mjs"
    ],
    "verifiers": [
      "node --test scripts/tests/unit/task-tracker/lib/story-cache/writer-claim.test.mjs"
    ]
  },
  {
    "n": 8,
    "component": 3,
    "existing": null,
    "title": "Shared writer registry with cache references only",
    "hours": 3,
    "deps": [7],
    "files": "writer-registry.mjs;fleet-registry.mjs",
    "tests": "writer-registry.test.mjs",
    "api": "registerStoryWriter({claim,registry}); resolveStoryWriter({identity,registry})",
    "scope": "Store claim identity and verified cache path without duplicating story contents; reject stale, corrupt, ambiguous and mismatched registry references.",
    "rank": 6,
    "intent": {
      "beneficiary": "delivery maintainer",
      "capability": "resolve the owning cache without copying its contents",
      "need": "a registry can point to stale work or duplicate content authority",
      "value": "keep one identifiable content authority per story"
    },
    "paths": [
      "scripts/task-tracker/lib/story-cache/writer-registry.mjs",
      "scripts/task-tracker/fleet-registry.mjs"
    ],
    "verifiers": [
      "node --test scripts/tests/unit/task-tracker/lib/story-cache/writer-registry.test.mjs"
    ]
  },
  {
    "n": 9,
    "component": 3,
    "existing": null,
    "title": "Explicit cache handoff and acknowledged export",
    "hours": 3.5,
    "deps": [6, 8],
    "files": "writer-handoff.mjs;worktree-binding-lifecycle.mjs;worktree-relocation-guard.mjs",
    "tests": "handoff.test.mjs",
    "api": "transferStoryWriter({claim,target,store,registry})",
    "scope": "Freeze pending generations, export with a digest and acknowledge the recipient before release; interrupted transfers retain ownership and never steal a dirty stale lock.",
    "rank": 7,
    "intent": {
      "beneficiary": "delivery maintainer",
      "capability": "transfer unpublished work through acknowledged handoff",
      "need": "dirty work cannot safely be recovered by stealing a stale lock",
      "value": "avoid handoff loss and uncertain double ownership"
    },
    "paths": [
      "scripts/task-tracker/lib/story-cache/writer-handoff.mjs",
      "scripts/task-tracker/lib/worktree-binding-lifecycle.mjs",
      "scripts/task-tracker/lib/worktree-relocation-guard.mjs"
    ],
    "verifiers": ["node --test scripts/tests/unit/task-tracker/lib/story-cache/handoff.test.mjs"]
  },
  {
    "n": 10,
    "component": 4,
    "existing": 2043,
    "title": "Local issue-body and title staging adapter",
    "hours": 3.5,
    "deps": [3, 9],
    "files": "stage-body.mjs",
    "tests": "stage-body.test.mjs",
    "api": "stageStoryMutation({store,claim,key,mutate,capability}); stageStoryTitle({store,claim,title,capability})",
    "scope": "Stage validated body/title deltas and dirty tags without remote calls; return unpublished results explicitly; leave public legacy callers unactivated until the integration story.",
    "rank": 8,
    "intent": {
      "beneficiary": "delivery maintainer",
      "capability": "accumulate body and title changes locally",
      "need": "per-marker body writes consume shared provider allowance",
      "value": "reduce remote traffic while preserving validated local intent"
    },
    "paths": ["scripts/task-tracker/lib/story-cache/stage-body.mjs"],
    "verifiers": ["node --test scripts/tests/unit/task-tracker/lib/story-cache/stage-body.test.mjs"]
  },
  {
    "n": 11,
    "component": 4,
    "existing": null,
    "title": "Local owned-comment intents and adoption",
    "hours": 3,
    "deps": [10],
    "files": "stage-comment.mjs",
    "tests": "stage-comment.test.mjs",
    "api": "stageOwnedComment({store,claim,key,body,capability})",
    "scope": "Adopt comments through existing native marker/envelope validation; retain stable creation intent IDs; keep foreign content read-only and perform zero staging transport.",
    "rank": 9,
    "intent": {
      "beneficiary": "delivery maintainer",
      "capability": "stage owned comments with stable creation intents",
      "need": "comment headings and missed create replies do not prove ownership",
      "value": "prevent duplicate comments and unauthorized foreign edits"
    },
    "paths": ["scripts/task-tracker/lib/story-cache/stage-comment.mjs"],
    "verifiers": [
      "node --test scripts/tests/unit/task-tracker/lib/story-cache/stage-comment.test.mjs"
    ]
  },
  {
    "n": 12,
    "component": 4,
    "existing": null,
    "title": "Operation-specific proof capabilities and composite invariants",
    "hours": 3.5,
    "deps": [11],
    "files": "stage-capabilities.mjs;body-invariants.mjs",
    "tests": "stage-capabilities.test.mjs",
    "api": "validateStagedComposite({base,candidate,operations})",
    "scope": "Retain each operation's genuine proof capability; validate local operations and the composite delta; reject marker loss, synthetic evidence and broad override unions.",
    "rank": 10,
    "intent": {
      "beneficiary": "delivery maintainer",
      "capability": "preserve proof authority across staged mutations",
      "need": "synthetic markers and combined override flags can fabricate approval",
      "value": "prevent false verification and preserve reviewed scope"
    },
    "paths": [
      "scripts/task-tracker/lib/story-cache/stage-capabilities.mjs",
      "scripts/task-tracker/lib/body-invariants.mjs"
    ],
    "verifiers": [
      "node --test scripts/tests/unit/task-tracker/lib/story-cache/stage-capabilities.test.mjs"
    ]
  },
  {
    "n": 13,
    "component": 5,
    "existing": 2044,
    "title": "Canonical timing event normalization and interval deltas",
    "hours": 3.5,
    "deps": [4],
    "files": "timing-events.mjs",
    "tests": "timing-events.test.mjs",
    "api": "mergeTimingEvents(existing,incoming)",
    "scope": "Preserve native actor/event/transition identities, nonoverlapping measured interval deltas and Unknown; deduplicate identical IDs and refuse conflicting duplicates or cumulative double counts.",
    "rank": 4,
    "intent": {
      "beneficiary": "delivery maintainer",
      "capability": "normalize attributable nonoverlapping timing events",
      "need": "cumulative snapshots and conflicting event IDs can double count work",
      "value": "retain truthful measured time and Unknown values"
    },
    "paths": ["scripts/task-tracker/lib/story-cache/timing-events.mjs"],
    "verifiers": [
      "node --test scripts/tests/unit/task-tracker/lib/story-cache/timing-events.test.mjs"
    ]
  },
  {
    "n": 14,
    "component": 5,
    "existing": null,
    "title": "Durable timing ingestion and independent cursors",
    "hours": 3,
    "deps": [10, 13],
    "files": "timing-stage.mjs;actor-hook-timing.mjs;actor-timing-state.mjs",
    "tests": "timing-stage.test.mjs",
    "api": "ingestTimingEvents({store,claim,events})",
    "scope": "Advance ingestion only after local persistence; keep publication and frozen-batch state independent; retain backdated native events and restart identity without API calls.",
    "rank": 9,
    "intent": {
      "beneficiary": "delivery maintainer",
      "capability": "ingest timing events durably without remote writes",
      "need": "ingestion acknowledgement and publication acknowledgement have different durability boundaries",
      "value": "avoid lost events and incorrect publication success"
    },
    "paths": [
      "scripts/task-tracker/lib/story-cache/timing-stage.mjs",
      "scripts/task-tracker/lib/actor-hook-timing.mjs",
      "scripts/task-tracker/lib/actor-timing-state.mjs"
    ],
    "verifiers": [
      "node --test scripts/tests/unit/task-tracker/lib/story-cache/timing-stage.test.mjs"
    ]
  },
  {
    "n": 15,
    "component": 5,
    "existing": null,
    "title": "Freeze and confirm one timing candidate per transition",
    "hours": 3.5,
    "deps": [12, 14],
    "files": "timing-candidate.mjs;gh-timing-comment.internals.mjs",
    "tests": "timing-candidate.test.mjs",
    "api": "freezeTimingCandidate({generation,transition}); confirmTimingPublication({store,batchId,observation})",
    "scope": "Render one canonical owned timing-comment candidate; confirm publication cursor from verified content only; preserve Unknown and prove 1000 local events cause no extra remote writes.",
    "rank": 11,
    "intent": {
      "beneficiary": "delivery maintainer",
      "capability": "publish one frozen timing candidate per transition",
      "need": "per-event timing updates amplify writes and can advance cursors prematurely",
      "value": "prevent duplicate timing rows and unjustified cursor advancement"
    },
    "paths": [
      "scripts/task-tracker/lib/story-cache/timing-candidate.mjs",
      "scripts/task-tracker/gh-timing-comment.internals.mjs"
    ],
    "verifiers": [
      "node --test scripts/tests/unit/task-tracker/lib/story-cache/timing-candidate.test.mjs"
    ]
  },
  {
    "n": 16,
    "component": 6,
    "existing": 2045,
    "title": "Durable local estimation evidence and lineage",
    "hours": 3.5,
    "deps": [5, 6],
    "files": "estimation/local-evidence.mjs;estimation/local-evidence-store.mjs",
    "tests": "estimation/local-evidence.test.mjs",
    "api": "validateLocalEvidence(bundle); importLocalEvidence({evidenceStore,bundle})",
    "scope": "Use native durable evidence storage separate from story content; validate exact envelopes, hashes and ancestry; give derived-local records no invented cloud grant.",
    "rank": 6,
    "intent": {
      "beneficiary": "delivery maintainer",
      "capability": "retain local estimation evidence with truthful lineage",
      "need": "derived local data must not masquerade as cloud-authorized evidence",
      "value": "make local estimation reproducible without fictional cloud grants"
    },
    "paths": [
      "scripts/task-tracker/lib/estimation/local-evidence.mjs",
      "scripts/task-tracker/lib/estimation/local-evidence-store.mjs"
    ],
    "verifiers": [
      "node --test scripts/tests/unit/task-tracker/lib/estimation/local-evidence.test.mjs"
    ]
  },
  {
    "n": 17,
    "component": 6,
    "existing": null,
    "title": "Pure local estimate calculation and rubric derivation",
    "hours": 3.5,
    "deps": [16],
    "files": "estimation/local-runtime.mjs;estimation/rubric-refresh.mjs",
    "tests": "estimation/local-runtime.test.mjs;estimation/rubric-refresh.test.mjs",
    "api": "calculateLocalEstimate({mode,evidence,planInput,model})",
    "scope": "Calculate reproducibly from retained local inputs; missing evidence is unavailable; derive and persist local rubric records with valid lineage and explicit provenance.",
    "rank": 7,
    "intent": {
      "beneficiary": "delivery maintainer",
      "capability": "calculate estimates and rubrics from local evidence",
      "need": "historical cloud calibration exhausts shared quota and missing inputs cannot be invented",
      "value": "keep estimation available without cloud history scans"
    },
    "paths": [
      "scripts/task-tracker/lib/estimation/local-runtime.mjs",
      "scripts/task-tracker/lib/estimation/rubric-refresh.mjs"
    ],
    "verifiers": [
      "node --test scripts/tests/unit/task-tracker/lib/estimation/local-runtime.test.mjs scripts/tests/unit/task-tracker/lib/estimation/rubric-refresh.test.mjs"
    ]
  },
  {
    "n": 18,
    "component": 6,
    "existing": null,
    "title": "Disable cloud estimation before CLI and hook dispatch",
    "hours": 3.5,
    "deps": [17],
    "files": "estimation/runtime-adapter.mjs;verb-preflight.mjs;activity-guard.mjs;source-edit-gate.mjs",
    "tests": "estimation/local-dispatch.test.mjs",
    "api": "resolveEstimationMode(cfg)",
    "scope": "Intercept disabled/local mode before preflight, corpus, decomposition and indirect estimator dispatch; use fail-on-transport fixtures; retain unrelated native source/lifecycle guards.",
    "rank": 8,
    "intent": {
      "beneficiary": "delivery maintainer",
      "capability": "stop prohibited estimation transport before dispatch",
      "need": "a late disabled-mode check still permits indirect cloud scans",
      "value": "guarantee disabled estimation cannot consume historical-task quota"
    },
    "paths": [
      "scripts/task-tracker/lib/estimation/runtime-adapter.mjs",
      "scripts/task-tracker/lib/verb-preflight.mjs",
      "scripts/task-tracker/activity-guard.mjs",
      "scripts/task-tracker/source-edit-gate.mjs"
    ],
    "verifiers": [
      "node --test scripts/tests/unit/task-tracker/lib/estimation/local-dispatch.test.mjs"
    ]
  },
  {
    "n": 19,
    "component": 7,
    "existing": 2046,
    "title": "Strict forecast v3 schema and local provenance",
    "hours": 3.5,
    "deps": [17],
    "files": "estimation/forecast-model.mjs;estimation/forecast-v3.mjs",
    "tests": "estimation/forecast-v3.test.mjs",
    "api": "validateForecastProvenance(value,{expectedIssue,repository})",
    "scope": "Define strict successor schema and local-evidence manifest references; correlate plan/refine/rubric/outcome identities and exact hashes without fictional comment IDs.",
    "rank": 8,
    "intent": {
      "beneficiary": "delivery maintainer",
      "capability": "validate forecasts with explicit local provenance",
      "need": "legacy forecast references do not describe retained local calculation inputs",
      "value": "make current forecast inputs auditable without cloud discovery"
    },
    "paths": [
      "scripts/task-tracker/lib/estimation/forecast-model.mjs",
      "scripts/task-tracker/lib/estimation/forecast-v3.mjs"
    ],
    "verifiers": ["node --test scripts/tests/unit/task-tracker/lib/estimation/forecast-v3.test.mjs"]
  },
  {
    "n": 20,
    "component": 7,
    "existing": null,
    "title": "Forecast lineage resolution and local read projections",
    "hours": 3.5,
    "deps": [18, 19],
    "files": "estimation/forecast-lineage.mjs;estimation/forecast-reader.mjs",
    "tests": "estimation/forecast-lineage.test.mjs",
    "api": "resolveLocalForecast({forecast,evidenceStore,identity})",
    "scope": "Resolve all retained payloads and active ancestry locally; reject ambiguous branches, missing ancestors and mismatched provenance; preserve unavailable outcomes.",
    "rank": 9,
    "intent": {
      "beneficiary": "delivery maintainer",
      "capability": "resolve forecast ancestry entirely from local evidence",
      "need": "missing or ambiguous evidence ancestry makes forecasts unreproducible",
      "value": "refuse unverifiable forecasts without a hidden network fallback"
    },
    "paths": [
      "scripts/task-tracker/lib/estimation/forecast-lineage.mjs",
      "scripts/task-tracker/lib/estimation/forecast-reader.mjs"
    ],
    "verifiers": [
      "node --test scripts/tests/unit/task-tracker/lib/estimation/forecast-lineage.test.mjs"
    ]
  },
  {
    "n": 21,
    "component": 7,
    "existing": null,
    "title": "Legacy forecast readers and v2 half-hour compatibility",
    "hours": 3,
    "deps": [20],
    "files": "estimation/plan-estimate-authority.mjs;estimation/forecast-legacy.mjs",
    "tests": "estimation/forecast-compatibility.test.mjs;estimation/forecast-model.test.mjs",
    "api": "readForecastVersioned(value); requireCurrentSchema(value)",
    "scope": "Preserve exact v1/v2 read behavior and the v2 half-hour grid while v3 becomes current; reject stale/missing current provenance without weakening legacy validators.",
    "rank": 10,
    "intent": {
      "beneficiary": "delivery maintainer",
      "capability": "read legacy forecasts without changing their grids",
      "need": "changing the current schema can silently change v2 half-hour validation",
      "value": "preserve compatibility while current output gains provenance"
    },
    "paths": [
      "scripts/task-tracker/lib/estimation/plan-estimate-authority.mjs",
      "scripts/task-tracker/lib/estimation/forecast-legacy.mjs"
    ],
    "verifiers": [
      "node --test scripts/tests/unit/task-tracker/lib/estimation/forecast-compatibility.test.mjs scripts/tests/unit/task-tracker/lib/estimation/forecast-model.test.mjs"
    ]
  },
  {
    "n": 22,
    "component": 8,
    "existing": 2047,
    "title": "Freeze publication effects and final-body substitution slots",
    "hours": 3.5,
    "deps": [12, 15, 21],
    "files": "batch.mjs;body-template.mjs",
    "tests": "batch.test.mjs",
    "api": "freezeStoryBatch({generation,transition,effects,capabilities})",
    "scope": "Freeze exact inputs, resource identities, dependencies and permitted verified-ID slots; allocate one publication generation; exclude circular final-body hashing and late discretionary edits.",
    "rank": 12,
    "intent": {
      "beneficiary": "delivery maintainer",
      "capability": "freeze declared publication effects and body slots",
      "need": "late body edits and unknown creation IDs can invalidate a frozen batch",
      "value": "prevent discretionary edits or circular proof from entering publication"
    },
    "paths": [
      "scripts/task-tracker/lib/story-cache/batch.mjs",
      "scripts/task-tracker/lib/story-cache/body-template.mjs"
    ],
    "verifiers": ["node --test scripts/tests/unit/task-tracker/lib/story-cache/batch.test.mjs"]
  },
  {
    "n": 23,
    "component": 8,
    "existing": null,
    "title": "Single-attempt resource publisher and exact read-back",
    "hours": 3.5,
    "deps": [22],
    "files": "publisher.mjs;provider-adapters.mjs",
    "tests": "publisher.test.mjs",
    "api": "publishResourceEffects({store,claim,batch,snapshot,ports})",
    "scope": "Revalidate full target equality before any mutation; dispatch one attempt per dirty declared resource; verify outcomes and newly created IDs; disclose non-atomic provider races.",
    "rank": 13,
    "intent": {
      "beneficiary": "delivery maintainer",
      "capability": "publish each declared resource at most once",
      "need": "independent provider writes can partially succeed or overwrite external edits",
      "value": "retain truthful per-resource outcomes with bounded writes"
    },
    "paths": [
      "scripts/task-tracker/lib/story-cache/publisher.mjs",
      "scripts/task-tracker/lib/story-cache/provider-adapters.mjs"
    ],
    "verifiers": ["node --test scripts/tests/unit/task-tracker/lib/story-cache/publisher.test.mjs"]
  },
  {
    "n": 24,
    "component": 8,
    "existing": null,
    "title": "Partial and uncertain publication recovery",
    "hours": 3.5,
    "deps": [23],
    "files": "recovery.mjs;journal.mjs",
    "tests": "recovery.test.mjs",
    "api": "recoverStoryBatch({store,claim,ports,allowMutation:false})",
    "scope": "Retain every crash prefix and three-way conflict evidence; unchanged recovery reads do not permit replay; handle delayed writes and uncertain creates without duplicate or compensating writes.",
    "rank": 14,
    "intent": {
      "beneficiary": "delivery maintainer",
      "capability": "recover interrupted publication without blind replay",
      "need": "delayed successful requests can arrive after an unchanged recovery read",
      "value": "avoid duplicate effects and compensating overwrites"
    },
    "paths": [
      "scripts/task-tracker/lib/story-cache/recovery.mjs",
      "scripts/task-tracker/lib/story-cache/journal.mjs"
    ],
    "verifiers": ["node --test scripts/tests/unit/task-tracker/lib/story-cache/recovery.test.mjs"]
  },
  {
    "n": 25,
    "component": 9,
    "existing": 2048,
    "title": "Immutable transition receipts and historical event subsets",
    "hours": 3,
    "deps": [15],
    "files": "completion-receipt.mjs",
    "tests": "completion-receipt.test.mjs",
    "api": "validateCompletionReceipt(receipt,{transition,confirmedEffects})",
    "scope": "Bind native transition/actor/visit and confirmed effects; retain timing event IDs and subset digest independently of changing full-comment hashes; reject altered prior rows and synthetic legacy proof.",
    "rank": 12,
    "intent": {
      "beneficiary": "delivery maintainer",
      "capability": "retain trustworthy completion evidence across log appends",
      "need": "later timing appends change a full-comment hash without changing older completed events",
      "value": "preserve older completed visits while exposing altered history"
    },
    "paths": ["scripts/task-tracker/lib/story-cache/completion-receipt.mjs"],
    "verifiers": [
      "node --test scripts/tests/unit/task-tracker/lib/story-cache/completion-receipt.test.mjs"
    ]
  },
  {
    "n": 26,
    "component": 9,
    "existing": null,
    "title": "Transition coordinator with one final issue-body write",
    "hours": 3.5,
    "deps": [24, 25],
    "files": "transition-batch.mjs;move-state-core.mjs",
    "tests": "transition-batch.test.mjs",
    "api": "runTransitionBatch({ctx,store,claim,ports})",
    "scope": "Order frozen prerequisite effects, actual Status and final body/sentinel/receipt once; preserve native exit/entry checks; leave incomplete transitions explicitly provisional after crashes.",
    "rank": 15,
    "intent": {
      "beneficiary": "delivery maintainer",
      "capability": "commit transitions with one final issue-body write",
      "need": "a pre-Status body or a second sentinel write can misrepresent completion",
      "value": "distinguish completed transitions from partially published effects"
    },
    "paths": [
      "scripts/task-tracker/lib/story-cache/transition-batch.mjs",
      "scripts/task-tracker/lib/move-state/move-state-core.mjs"
    ],
    "verifiers": [
      "node --test scripts/tests/unit/task-tracker/lib/story-cache/transition-batch.test.mjs"
    ]
  },
  {
    "n": 27,
    "component": 9,
    "existing": null,
    "title": "Plan approval and forecast candidate/published authority",
    "hours": 3.5,
    "deps": [21, 26],
    "files": "plan-approved-guard.mjs;plan-approval-audit.mjs;plan-exit-planned-estimate-guard.mjs;plan-transition-authority.mjs;verbs/plan-approve.mjs",
    "tests": "plan-transition-candidate.test.mjs",
    "api": "verifyPlanTransitionAuthorityScope({candidate,baselineEquality,confirmedEffects})",
    "scope": "Retain real human/Full-Auto provenance and exact scope/trunk/forecast identity; verify required effects before Status; revalidate materialized scope without presenting staged markers as published.",
    "rank": 16,
    "intent": {
      "beneficiary": "delivery maintainer",
      "capability": "validate real Plan approval before Status changes",
      "need": "a staged approval must not be treated as an already published cloud marker",
      "value": "preserve genuine approval, scope and forecast freshness"
    },
    "paths": [
      "scripts/task-tracker/lib/plan-approved-guard.mjs",
      "scripts/task-tracker/lib/plan-approval-audit.mjs",
      "scripts/task-tracker/lib/plan-exit-planned-estimate-guard.mjs",
      "scripts/task-tracker/lib/plan-transition-authority.mjs",
      "scripts/task-tracker/verbs/plan-approve.mjs"
    ],
    "verifiers": [
      "node --test scripts/tests/unit/task-tracker/lib/story-cache/plan-transition-candidate.test.mjs"
    ]
  },
  {
    "n": 28,
    "component": 10,
    "existing": 2049,
    "title": "Working versus published views for guards and Explain",
    "hours": 3.5,
    "deps": [12, 18, 27],
    "files": "views.mjs;action-decision/session.mjs;verbs/explain.mjs;decomposition-hook-authority.mjs",
    "tests": "views.test.mjs",
    "api": "storyView({generation,authority:'working'|'published'})",
    "scope": "Route every identity-mutate reader to an explicit authority view; expose dirty/conflict/uncertain states and real recovery routes; preserve source/edit/commit/proof guards.",
    "rank": 17,
    "intent": {
      "beneficiary": "delivery maintainer",
      "capability": "distinguish working content from published authority",
      "need": "legacy identity-mutation readers can mistake staged content for verified publication",
      "value": "prevent false guard success and expose actionable unpublished state"
    },
    "paths": [
      "scripts/task-tracker/lib/story-cache/views.mjs",
      "scripts/task-tracker/lib/action-decision/session.mjs",
      "scripts/task-tracker/verbs/explain.mjs",
      "scripts/task-tracker/lib/decomposition-hook-authority.mjs"
    ],
    "verifiers": ["node --test scripts/tests/unit/task-tracker/lib/story-cache/views.test.mjs"]
  },
  {
    "n": 29,
    "component": 10,
    "existing": null,
    "title": "Timing reports and field projections preserve real work",
    "hours": 3,
    "deps": [15, 25, 26],
    "files": "timing-rollup.mjs;timing-ladder.mjs;timing-row-reader.mjs;review-approval-timing.mjs;reports/lib/daily-activity.mjs",
    "tests": "timing-authority.test.mjs",
    "api": "timingAuthority({events,receipts,legacyEvidence})",
    "scope": "Keep measured work when completion proof is provisional; preserve Unknown and historical actors; validate old event subsets across consecutive transitions and demotion/reentry.",
    "rank": 16,
    "intent": {
      "beneficiary": "delivery maintainer",
      "capability": "report measured work despite provisional completion",
      "need": "incomplete completion proof does not erase real measured work",
      "value": "preserve attributable work without pretending provisional visits completed"
    },
    "paths": [
      "scripts/task-tracker/timing-rollup.mjs",
      "scripts/task-tracker/lib/timing-ladder.mjs",
      "scripts/task-tracker/lib/timing-row-reader.mjs",
      "scripts/task-tracker/lib/review-approval-timing.mjs",
      "scripts/reports/lib/daily-activity.mjs"
    ],
    "verifiers": [
      "node --test scripts/tests/unit/task-tracker/lib/story-cache/timing-authority.test.mjs"
    ]
  },
  {
    "n": 30,
    "component": 10,
    "existing": null,
    "title": "Coordinated public writer and reader activation",
    "hours": 3.5,
    "deps": [28, 29],
    "files": "issue-body-mutate.mjs;issue-body-push.mjs;owned-comment.mjs;github-records/github-comment-store.mjs;runtime.mjs;hook-handler.mjs;verbs/issue-body.mjs",
    "tests": "public-activation.test.mjs",
    "api": "activate routine writers through stageStoryMutation and transition transport capabilities",
    "scope": "Switch public writer results and every caller family together using the accepted caller census; prevent legacy immediate-write fallback; keep creation and explicit administrative migration separately classified.",
    "rank": 18,
    "intent": {
      "beneficiary": "delivery maintainer",
      "capability": "activate cached writers and readers together",
      "need": "switching only writers can leave callers relying on incompatible result authority",
      "value": "deliver a coherent public contract without unsafe fallback writers"
    },
    "paths": [
      "scripts/task-tracker/lib/issue-body-mutate.mjs",
      "scripts/task-tracker/lib/issue-body-push.mjs",
      "scripts/task-tracker/lib/owned-comment.mjs",
      "scripts/task-tracker/lib/github-records/github-comment-store.mjs",
      "scripts/task-tracker/runtime.mjs",
      "scripts/task-tracker/hook-handler.mjs",
      "scripts/task-tracker/verbs/issue-body.mjs"
    ],
    "verifiers": [
      "node --test scripts/tests/unit/task-tracker/lib/story-cache/public-activation.test.mjs"
    ]
  },
  {
    "n": 31,
    "component": 11,
    "existing": 2050,
    "title": "Fixed whole-native workflow operation budgets",
    "hours": 3.5,
    "deps": [30],
    "files": "tests/helpers/story-cache-ledger.mjs;tests/integration/task-tracker/lib/story-cache-transition-budget.integration.test.mjs",
    "tests": "integration:story-cache-transition-budget.integration.test.mjs",
    "api": "assertOperationBudget(ledger,budget)",
    "scope": "Freeze independent S/G/D/V fixture manifests and 8/13/10-call ceilings before dispatch; exercise actual native collector/guards/saga and account for unclassified and unknown costs.",
    "rank": 19,
    "intent": {
      "beneficiary": "delivery maintainer",
      "capability": "detect whole-workflow request-budget regressions",
      "need": "helper-only tests hide collector, guard and subprocess amplification",
      "value": "catch quota regressions against independently fixed ceilings"
    },
    "paths": [
      "scripts/tests/helpers/story-cache-ledger.mjs",
      "scripts/tests/integration/task-tracker/lib/story-cache-transition-budget.integration.test.mjs"
    ],
    "verifiers": [
      "node --test scripts/tests/integration/task-tracker/lib/story-cache-transition-budget.integration.test.mjs"
    ]
  },
  {
    "n": 32,
    "component": 11,
    "existing": null,
    "title": "Adversarial full-saga recovery and inventory scenarios",
    "hours": 3.5,
    "deps": [31],
    "files": "tests/integration/task-tracker/lib/story-cache-recovery.integration.test.mjs",
    "tests": "integration:story-cache-recovery.integration.test.mjs",
    "api": "exercise native coordinator with injected transport and journal failures",
    "scope": "Cover every crash prefix, delayed successful writes, uncertain create, foreign comments, inventory swaps, post-freeze edits and failed persistence without false-green guard stubs.",
    "rank": 20,
    "intent": {
      "beneficiary": "delivery maintainer",
      "capability": "detect false recovery success across crash prefixes",
      "need": "isolated happy-path tests miss partial writes and external inventory changes",
      "value": "preserve recovery truth under every interrupted workflow"
    },
    "paths": [
      "scripts/tests/integration/task-tracker/lib/story-cache-recovery.integration.test.mjs"
    ],
    "verifiers": [
      "node --test scripts/tests/integration/task-tracker/lib/story-cache-recovery.integration.test.mjs"
    ]
  },
  {
    "n": 33,
    "component": 11,
    "existing": null,
    "title": "Installed CLI and hook zero-network staging budgets",
    "hours": 3,
    "deps": [31],
    "files": "tests/integration/task-tracker/lib/story-cache-entrypoint.integration.test.mjs",
    "tests": "integration:story-cache-entrypoint.integration.test.mjs",
    "api": "spawn actual installed CLI and hooks with deny-by-default provider fixtures",
    "scope": "Prove one and 1000 local edits/events have zero staging transport and equal transition writes; capture GraphQL, REST, gh and subprocess boundaries without calibration scans.",
    "rank": 20,
    "intent": {
      "beneficiary": "delivery maintainer",
      "capability": "prove installed staging entrypoints perform no remote work",
      "need": "installed hooks and CLI preflight may bypass local staging interception",
      "value": "prevent packaging or hook integration from reintroducing minor-update calls"
    },
    "paths": [
      "scripts/tests/integration/task-tracker/lib/story-cache-entrypoint.integration.test.mjs"
    ],
    "verifiers": [
      "node --test scripts/tests/integration/task-tracker/lib/story-cache-entrypoint.integration.test.mjs"
    ]
  },
  {
    "n": 34,
    "component": 12,
    "existing": 2051,
    "title": "Legacy writer adoption and safe administrative migration",
    "hours": 3.5,
    "deps": [6, 30],
    "files": "runtime-migration-plan.mjs;runtime-migration-apply.mjs;heal-timing-log.mjs;backfill-plan-metadata.mjs;migrate-plan-approved.mjs;verbs/adopt-github-records.mjs",
    "tests": "migration.test.mjs",
    "api": "classify migration as staging or separately authorized one-off repair",
    "scope": "Inventory every accepted legacy writer/repair path; stage existing-issue changes by default; refuse one-off migration with pending cache/claim; protect dirty exports and no automatic history hydration.",
    "rank": 19,
    "intent": {
      "beneficiary": "delivery maintainer",
      "capability": "adopt legacy writers without losing pending work",
      "need": "repair and cleanup entrypoints can retain unsafe immediate-write behavior",
      "value": "preserve pending data during safe adoption and migration"
    },
    "paths": [
      "scripts/task-tracker/lib/runtime-migration-plan.mjs",
      "scripts/task-tracker/lib/runtime-migration-apply.mjs",
      "scripts/task-tracker/heal-timing-log.mjs",
      "scripts/task-tracker/backfill-plan-metadata.mjs",
      "scripts/task-tracker/migrate-plan-approved.mjs",
      "scripts/task-tracker/verbs/adopt-github-records.mjs"
    ],
    "verifiers": ["node --test scripts/tests/unit/task-tracker/lib/story-cache/migration.test.mjs"]
  },
  {
    "n": 35,
    "component": 12,
    "existing": null,
    "title": "Operator guidance and supported recovery workflow",
    "hours": 3,
    "deps": [34],
    "files": "skill/shared/rules/issue-records.md;skill/shared/rules/state-walk.md;docs/guides/story-cache.md",
    "tests": "operator-contract.test.mjs",
    "api": "document acquire, edit, transition, conflict discussion and handoff through actual supported commands",
    "scope": "Explain unpublished changes and read-only views; document native-token limits and delayed-write uncertainty; update installed guidance without new mode flags or unsupported recovery commands.",
    "rank": 20,
    "intent": {
      "beneficiary": "delivery maintainer",
      "capability": "recover and hand off stories using supported commands",
      "need": "operators need explicit conflict discussion and cache-transfer procedures",
      "value": "make operational recovery auditable and repeatable"
    },
    "paths": [
      "skill/shared/rules/issue-records.md",
      "skill/shared/rules/state-walk.md",
      "docs/guides/story-cache.md"
    ],
    "verifiers": [
      "node --test scripts/tests/unit/task-tracker/lib/story-cache/operator-contract.test.mjs"
    ]
  },
  {
    "n": 36,
    "component": 12,
    "existing": null,
    "title": "Downstream package adoption and final integrated verification",
    "hours": 3.5,
    "deps": [32, 33, 35],
    "files": "tests/integration/task-tracker/lib/story-cache-package.integration.test.mjs;package.json;bin/aitm.mjs;verbs/help-data.mjs",
    "tests": "integration:story-cache-package.integration.test.mjs",
    "api": "pack/install isolated consumer and invoke actual installed issue-body route",
    "scope": "Verify consumer-root cache placement and coordinated activation in the packed artifact; run the integrated normal test/lint/format lanes once with exact-head receipts and record real outcomes.",
    "rank": 21,
    "intent": {
      "beneficiary": "delivery maintainer",
      "capability": "adopt the packaged workflow in a separate consumer",
      "need": "package-root assumptions can place consumer data in the installed dependency",
      "value": "prove downstream installation uses the consumer cache and supported delivery lanes"
    },
    "paths": [
      "scripts/tests/integration/task-tracker/lib/story-cache-package.integration.test.mjs",
      "package.json",
      "bin/aitm.mjs",
      "scripts/task-tracker/verbs/help-data.mjs"
    ],
    "verifiers": [
      "node --test scripts/tests/integration/task-tracker/lib/story-cache-package.integration.test.mjs"
    ]
  }
]
```
