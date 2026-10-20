# Local estimation and transition cache — #2039 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Execution is not authorized by this planning/hydration request. Steps use checkbox syntax for tracking.

**Goal:** Eliminate cloud estimation scans and tiny issue/timing writes by staging one assigned writer's changes locally and publishing guarded, recoverable state-transition batches.

**Architecture:** A project-local `.tmp/gh` manifest stores exact base/working body and all comments with native revision tuples, content hashes and dirty tags. Pure estimation consumes retained local evidence; a transition coordinator freezes one batch, validates the complete target snapshot, publishes each dirty resource once and commits completion evidence in the final issue-body write.

**Tech Stack:** Existing Node.js ESM, Node test runner, GitHub GraphQL/REST adapters, native AITM issue locks, filesystem atomic-generation persistence and existing record/proof validators. No new production dependency.

**Spec:** `docs/superpowers/specs/2026-10-19-2039-local-estimation-guarded-publication-design.md` at `dafb1d276036ddc17490f76329f6aa2c09732a15`, SHA-256 `3cd8c28e437ea423ec791cf1b4fdeb47f13afbe5f05d3b116da171b823260429`.

## Scope

Implement the accepted specification without executing product changes during this session. This plan defines twelve independently reviewed child deliverables under #2039; hydration creates Backlog children with exact source sections and verifiers. Do not advance the parent to Develop, approve the plan, execute hydration against another parent, run live calibration or claim the proposal is already implemented.

## Plan Metadata

- **Priority:** P0
- **Size:** XL
- **Estimate:** 96 hours, local engineering decomposition; no cloud corpus/calibration used.
- **Labels:** bug
- **Governing-spec:** docs/superpowers/specs/2026-10-19-2039-local-estimation-guarded-publication-design.md
- **Source baseline:** a69f054c80394a9650469da6a7033791df19cd7f
- **Review:** Native Astra 6/high SAR; its exact input/response history and terminal verdict are in `docs/superpowers/reviews/2039/plan/SAR/README.md`.

**Lifecycle observation:** The parent reports #2039 remains in Refine. Plan entry is blocked by `plan-entry-fields-board` (missing board Start time); Explain requires human-operator investigation. See `docs/superpowers/reviews/2039/plan/plan-entry-blocker.md`. Authoring and reviewing this document is authorized; neither Plan entry, hydration nor implementation is claimed complete.

## Story Intent

- **Beneficiary:** delivery maintainer
- **Capability:** estimate locally and publish coherent cached issue and timing updates at state transitions
- **Need:** estimation scans and repeated small writes exhaust shared GitHub quota and permit stale publications
- **Value or failure prevented:** keep delivery usable while preserving external edits and recoverable workflow evidence

## Global Constraints

- Local estimates and cached observations are evidence, never permission to skip safeguards.
- Calculation remains local-only.
- The only routine automatic upsert event is a governed state transition along `Backlog → Refine → Ready for Planning → Plan → Develop → Test → Review → Done`, including supported demotions and existing governed special transitions.
- `.tmp/gh` is the owner's selected storage location; do not duplicate authority in a different durable store.
- Never use a count, timestamp order alone or arithmetic on opaque IDs as a cloud version.
- Body and comment writes remain separate non-atomic provider mutations.
- Protect dirty/conflict/uncertain entries from ordinary `.tmp` cleanup; they are not regenerable caches.
- Do not use `TT_SKIP_NETWORK`, remove telemetry or treat cached observations as fresh cloud authority.
- Preserve existing native proof, ownership, lifecycle, reviewed-scope, timing and Unknown semantics; no fabricated receipts, waiver or unchecked-box signoff.
- Node.js remains `>=24` as declared by this package; use its current lockfile and canonical test discovery. No directory-wide `node --test` command.
- Register every new test with `@story #2039` and the relevant hydrated child ID when implementation begins. Use exact discovered file paths and existing fixture patterns; keep production modules focused rather than extending an oversized adapter indefinitely.

## Review Focus

1. A complete unedited observation differs from inaccessible or partial history; Task 1 tests both and refuses unsupported shapes.
2. Power loss between data-file replacement and manifest replacement cannot acknowledge an unpersisted generation; Task 2 injects failures before and after every persistence boundary.
3. A delayed successful request can land after an unchanged recovery read; Task 8 refuses blind replay and retains uncertain intent.
4. A second transition must not erase the first transition's timing-completion proof; Task 9 tests two moves, reentry and a crash before the second completion.
5. A human adds a read-only comment while a writer is interrupted; Tasks 8 and 11 require an inventory diff and discussion before any resumed mutation.

## Contract and file ownership map

Create focused modules below `scripts/task-tracker/lib/story-cache/`. Schema strings are `aitm.story-cache-manifest/v1`, `aitm.story-cache-generation/v1`, `aitm.story-publication-batch/v1`, `aitm.story-writer-claim/v1`, `aitm.local-estimation-evidence/v1`, and successor forecast `aitm.estimation-forecast/v3`.

Shared identity is `{host, repository, issueNumber, issueNodeId, projectId, projectItemId}`. Persist canonical lowercase host/repository; never derive filesystem paths from unchecked issue text. A resource key is `issue:<nodeId>`, `comment:<nodeId>`, `comment:new:<intentId>` or `project-field:<itemId>:<fieldId>`; stored paths use a SHA-256 identity key, not a raw node ID. Exact body hashes use UTF-8 bytes; JSON digests use the existing `canonicalRecordJson` convention with an explicit canonicalization version.

`ResourceObservation` contains identity/key, `body`, `digest`, `revision:{mode:'unedited'|'edited'|'digest-only', editId, editedAt, lastEditedAt, deletedAt}`, owned/read-only classification and observation provenance. Missing/partial remote data is a typed unavailable result, never an empty observation. `Snapshot` contains the issue title/body, all current comments keyed by ID, canonical comment inventory, assignees, configured field values and completeness/transport coverage.

New cache digests are lowercase 64-character SHA-256 hex; native record `payloadHash` and scope identities retain their existing `sha256:` prefix. Convert only at explicitly typed comparison boundaries, never reinterpret a provider ID as a hash. Storage `generation` is a monotonically increasing local commit number for every persisted edit; `publicationGeneration` is a different counter allocated once per newly frozen transition batch. Neither is a native cloud revision or overwrite authority. `Generation` contains immutable base observations, working payload references, dirty resource keys, local event ingestion/publication cursors, one optional frozen batch and a checksum. `Batch` freezes transition ID/from/to, candidates, baseline/expected vectors, approved input digests, resource effects and outcomes. States are prepared, dispatching, partial, uncertain, conflict and confirmed. The sole cache authority lives under the owning project/worktree `.tmp/gh`; a shared registry stores only ownership/path/claim identity.

Public interfaces are defined per task below. Throw typed errors with stable codes and retained diagnostic details; the implementation plan's codes are new story-cache codes, not fabricated existing AITM remediation IDs. Native action/Explain integration must register their actual remediation routes through existing command contracts.

## Concrete persisted schemas and adapter contracts

These are new implementation contracts. Unknown required fields, missing referenced bytes and unsupported versions fail closed. The self-contained JavaScript seeds below belong in their named verifier files; they are starting assertions, not substitutes for each task's full scenario list. All fixtures and helpers named here are offline and must be implemented in the owning task before dependent tests use them.

- Manifest: `{schema,identity,identityKey,generation,payloadPath,payloadDigest,previousGeneration,claimId}`. Its contained relative payloadPath names an immutable generation file. Null previousGeneration is allowed only for initial hydration. Verify the digest before following any referenced payload.
- Generation: `{schema,identity,generation,publicationGeneration,baseSnapshot,working,dirtyKeys,timing,batch,conflicts}`. Working is a resource-key map of `{payloadPath,digest,kind,capabilityRef}`. Base snapshot is `{identity,title,titleDigest,resources,inventory,assignees,fields,fieldsDigest,complete,coverage}` with immutable exact payload references for all observed body/comments. Inventory is sorted current comment IDs; fields are sorted `{itemId,fieldId,type,value}` preserving null versus absent. Compare all resources/title/fields, including nondirty and foreign content. Capability references identify retained validated native authority, never serialized functions or caller-supplied permission booleans.
- Timing: `{events,ingestedCursor,publishedCursor,canonicalCommentKey}`. Events are `{eventId,actorId,transitionId,timestamp,event,activeSeconds,idleSeconds,sourceCursor}`. Transition ID may be null for ordinary native timer events; durations are measured nonnegative numbers or null for Unknown. Adapt the existing source clock/cursor; do not invent either. Identical event IDs deduplicate only if every field matches. Conflicting duplicates refuse. Preserve source ordering with deterministic event-ID tie-breaking. Normalized measured seconds are nonoverlapping native interval deltas, not cumulative timer totals; adapters must derive each interval once from native cursor semantics and retain backdated event identity. Test repeated cumulative snapshots and restart to prove no double counting. Cursor acknowledgement follows durable local ingestion or verified corresponding publication, respectively.
- Claim: `{schema,claimId,identityKey,human,sessionId,worktree,cachePath,status,transfer}`; status is owned/transferring/released. Acquisition checks the canonical identity/root and singleton assignment under the native issue lock. The synchronous local assert checks owning session/worktree; it does not prove current remote assignment. Transfer binds source, recipient, export digest and acknowledgement. Corrupt or missing claims refuse staging.
- Batch: `{schema,batchId,publicationGeneration,transition,baseline,approvedInputDigests,effects,bodyTemplate,status}`. Transition is `{id,from,to,actorId,visit}` using native state slugs. Effect kinds are issue-update, comment-update, comment-create and project-field-update. Each effect is `{key,kind,target,beforeDigest,intendedDigest,candidate,dependencies,attempted,outcome}`. Outcome records provider ID, observed revision/digest and confirmation state. New comments have no invented remote ID. Final-body template slots bind only declared verified creation IDs/effect digests. Persist the realized exact body before its single dispatch. Receipt effect digests exclude the final body to avoid a circular hash.
- Completion receipt: `{schema,transition,timing:{key,resourceDigest,eventIds,eventsDigest},effects:[{key,digest}]}`. Validate actor/visit, required effect set and all matching confirmed outcomes. Duplicate/missing/wrong-transition effects refuse. Timing authority returns `{completedVisits,measuredActiveSeconds,unknownActive,measuredIdleSeconds,unknownIdle}`; measured subtotals with Unknown flags are not complete duration estimates. Older visits require their own receipt or valid legacy evidence.
- Observation provenance: `{observedAt,source:'github-current',complete:true}` with transport coverage separate. Unedited requires observed null lastEditedAt, false includesCreatedEdit and a complete zero-count empty connection. Edited requires a usable latest ID/timestamp compatible with lastEditedAt; counts are diagnostic. Unknown/deleted latest state requires reconciliation and current bytes, never silent fallback to an older token. Digest-only policy must be explicitly recorded. Compare both token and exact UTF-8 hash.

Estimation evidence uses native durable runtime storage, separately from story content. Manifest `{schema,canonicalizationVersion,host,repository,issue,configuration,plan,refine,modelPolicy,inputs}` has schema `aitm.local-estimation-evidence/v1`. Name the existing `scripts/task-tracker/lib/github-records/canonical-json.mjs` algorithm `aitm.canonical-json/v1` for this contract. Configuration is `{estimationRubricIssue}`; plan `{path,section,commit,digest}`; refine `{size,humanHours,source:{kind,id,digest}}`; modelPolicy `{modelVersion,policyVersion}`. Ordered inputs contain `{recordId,recordType,schema,payloadDigest,payloadPath,predecessorRecordId,supersedesRecordId,provenance,sourceCommentId,observedAt,importedAt}`. Null values are explicit when inapplicable. Paths are contained relative content-addressed payloads. Preserve exact existing envelopes and validate their identity/lineage rules too. Only observed-cloud evidence may have a sourceCommentId. The referring forecast stores the digest; no manifest includes its own digest. Reject conflicting IDs, ambiguous active branches, wrong repository/host and missing ancestors.

Forecast v3 retains v2 fields/grid and adds `localEvidence:{schema,manifestDigest,canonicalizationVersion,plan,refine,rubric,outcomes,modelPolicy}`. Plan/refine/modelPolicy copy the manifest fields; rubric is `{recordId,version,payloadDigest,provenance,sourceCommentId}`; outcomes are ordered `{issue,recordId,payloadDigest,provenance,sourceCommentId}`. Correlate with the forecast's rubric/comparable IDs and retained payloads. Derived-local rubric IDs need no fictional cloud comment. Use the existing valid record-ID allocator and envelope validators, and persist a derived rubric before a forecast refers to it.

Historical timing receipts distinguish the full timing resource digest observed at that publication from the digest of the immutable transition event subset. Store sorted event IDs and the canonical event-subset digest in the receipt; validate those rows on later reads, not equality between an old full-comment digest and today's appended comment. A later append changes the full comment hash without invalidating prior completed visits. Removal/correction of a receipt's event subset requires explicit reconciliation and cannot silently remain completed. The final body preserves all prior receipts. Add a two-transition test with different full-comment digests and unchanged first-event subset, plus altered-first-row rejection. Measured work remains visible even when completion authority is rejected.

For derived-local rubric evidence, do not call `createAitmRecordEnvelope` with an invented GitHub authority grant. Observed/imported AITM envelopes retain their exact authority/predecessor/supersedes and use `parseAitmRecord`; local derivations use wrapper `{schema:'aitm.local-derived-record/v1',recordId,recordType,repository,issue,createdAt,predecessor,supersedes,payload,payloadHash,modelPolicy}` with `createRecordId` and `hashRecordPayload` from `lib/github-records/record-envelope.mjs`, plus the existing rubric/outcome semantic validators. Its input index maps predecessorRecordId/supersedesRecordId to the wrapper's predecessor/supersedes. It has no cloud grant/comment/verified status, cannot satisfy lifecycle authority, and is retained only in the local evidence store. This is an explicit local wrapper, not an incompatible rewrite of `aitm.record/v1`.

Pre-Status approval/forecast migration is part of Tasks 7/9/10, not an unspecified future exception. `lib/plan-approved-guard.mjs`, `plan-approval-audit.mjs`, `plan-exit-planned-estimate-guard.mjs`, `plan-transition-authority.mjs` and `verbs/plan-approve.mjs` must distinguish the authorized frozen candidate from `publishedSnapshot`. Stage human/Full-Auto approval only through the existing native stamp/provenance path and retain its capability, approved scope/plan digest, forecast ID and trunk evidence. A later changed scope invalidates it. The candidate's approval marker may be evaluated locally by native pure guards, but is never described as an already published marker. Existing gates requiring forecast/appendix/board evidence validate the candidate first, then the actual confirmed comment/field effects before Status; make those effects explicit dependencies of Status. A synthetic working marker cannot pass either phase.

The existing Plan-transition authority comment is created and read-back verified before Status, binding the same approved candidate scope, marker fingerprint and transition ID. Supply `verifyPlanTransitionAuthorityScope` an admitted frozen candidate and its retained baseline/current-snapshot equality proof rather than its old independent body fetch; preserve the ordinary legacy read path outside this coordinator. Recompute the same scope identity after final-body materialization. Do not change the v1 authority record into a claim that a local body was already on GitHub; it attests the real validated approval, and the final receipt commits actual completed effects. Test absent human approval, changed plan/trunk/forecast, staged-only forecast, pre-Status create uncertainty and final-body failure. Full-source guards still run; only their explicit observation sources/order change.

### Provider adapters and coordinated activation

The adapter table is explicit: issue-update uses GraphQL `updateIssue` with final body plus authorized dirty title; comment-update uses `updateIssueComment` and saved node ID; comment-create uses `addComment` and the issue node ID with a stable local intent correlation; project-field-update uses the existing typed ProjectV2 mutation and verified configured project/item/field IDs. Complete mutation output may confirm a resource, otherwise spend its single declared read-back. None has an expected-edit-ID precondition; the snapshot/write race remains and is not owner-approved atomic safety.

Adopt a valid existing canonical comment through its native marker/envelope validator and observed identity; heading/author alone cannot grant ownership. Initial unedited adoption needs no marker write. A genuinely absent timing/evidence comment gets a creation intent; ambiguous matches remain read-only/unavailable. A missed create response never permits an automatic second create. Persist verified returned node IDs before materializing final-body slots.

Retain each staged operation's proof/marker capabilities. Run pure invariants per operation and again on the whole base-to-candidate delta; give async native freshness validators the bounded transition snapshot/admission result. Never union broad override flags across unrelated edits. Routine body helpers return `{status:'staged'|'no-op',body,generation,publication:'unpublished'}`. Identity-mutate fetch callers must choose an explicit working view or bounded published observation; they cannot treat this result as cloud proof.

Tasks 1–8 build unexposed modules/adapters first. Switch public writers and reader-authority semantics together in Tasks 9–10. Do not release an intermediate writer change without its transition publisher and consumers; no new user-facing opt-in mode or permanent immediate-write fallback is introduced.

### Source-grounded integration census

Paths below are relative to `scripts/task-tracker/`; within a list, shortened names share the preceding directory. These are concrete source seams to route and test, not a claim that every text match performs I/O. Recheck at the implementation commit and assign any added supported path to an owning task/verifier.

| Source family                                                                                                                                                                                                                                                                                                                                                                                                                                                        | Route and tests                                                                                                                                                                                                                                                         |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `lib/issue-body-mutate.mjs`, `versioned-issue-write.mjs`, `issue-body-push.mjs`; `verbs/issue-body.mjs`                                                                                                                                                                                                                                                                                                                                                              | Task 4 stage, Task 8 sole transport, Task 10 result/readback consumers; native invariant plus stage/publisher tests.                                                                                                                                                    |
| `lib/owned-comment.mjs`, `refine-estimate-comment.mjs`, `github-records/github-comment-store.mjs`, `github-records/contract-write.mjs`; `commit-trail-handler.mjs`                                                                                                                                                                                                                                                                                                   | Tasks 4/8 owned updates/creation intents, Task 10 confirmation. Commit notes stage without claiming publication.                                                                                                                                                        |
| `verbs/refine.mjs`, `promote.mjs`, `demote.mjs`, `test.mjs`, `review.mjs`, `approve.mjs`, `close.mjs`, `plan-approve.mjs`, `cancel-plan.mjs`, `supersede.mjs`; `lib/shelve-transaction.mjs`, `close-disposition.mjs`, `state-recording.mjs`, `markers.mjs`, `blocked-marker.mjs`                                                                                                                                                                                     | Tasks 4/9/10 one composite body, true native gates. Approval may stage validated evidence; a gate requiring published proof verifies it in the transition before Status.                                                                                                |
| `verbs/ac-stamp.mjs`, `dod-stamp.mjs`, `evidence-markers.mjs`, `check.mjs`; `lib/stamp-verify.mjs`, `auto-tick-verified.mjs`, `apply-review-delta.mjs`, `reviewed-scope/record.mjs`, `evidence-v2/runtime-adapter.mjs`, `verification-receipt-retirement.mjs`, `no-new-tests-declaration.mjs`                                                                                                                                                                        | Tasks 4/10 operation-specific capabilities, composite invariant validation, explicit published authority.                                                                                                                                                               |
| `verbs/user-story.mjs`, `kind.mjs`, `reconcile.mjs`, `epic-reconcile.mjs`, `inflate-estimate.mjs`; `lib/user-story-author.mjs`, `deep-dive.mjs`, `functional-dod-derive.mjs`, `discuss-marker.mjs`, `discuss-label.mjs`, `apply-refinement-estimate.mjs`, `resident-action-ledger-write.mjs`, `session-ref.mjs`                                                                                                                                                      | Tasks 4/8/10 stage body/comments. Labels/assignment remain separate native guarded operations, never hidden body writes.                                                                                                                                                |
| `lib/estimate-writer-publication.mjs`, `decomposition-writer-registry.mjs`, `decomposition-adaptive-writer.mjs`, `decomposition-field-writer.mjs`, `decomposition-projection.mjs`, `epic-rank-wave-runtime.mjs`; `lib/estimation/runtime-adapter.mjs`, `plan-estimate-authority.mjs`                                                                                                                                                                                 | Tasks 6–10 no estimate-only full graph discovery or per-effect authority read; target-specific adapters, actual lifecycle admission separately counted.                                                                                                                 |
| `gh-timing-comment.mjs`, `gh-timing-comment.internals.mjs`, `runtime.mjs`, `hook-handler.mjs`; `lib/actor-hook-timing.mjs`, `actor-timing-state.mjs`, `timing-post-outcome.mjs`, `review-approval-timing.mjs`; `scripts/gh/log-issue-time.mjs`, `scripts/gh/dispatch-prep.mjs`, `scripts/gh/ensure-wave-parent.mjs`                                                                                                                                                  | Task 5 local event/rollup staging, Task 9 one timing write. Creation orchestrators' subsequent existing-issue timing also stages.                                                                                                                                       |
| All Task 9 native saga files plus `lib/plan-transition-authority.mjs` and the native guard-execution module                                                                                                                                                                                                                                                                                                                                                          | Tasks 8–10 actual pre-Status authority publication, journal-aware partial recovery, receipts, no direct timing fallback or compensating body overwrite.                                                                                                                 |
| `activity-guard.mjs`, `source-edit-gate.mjs`, `lib/verb-preflight.mjs`, `decomposition-hook-authority.mjs`, `action-decision/session.mjs`, `verbs/explain.mjs`, `lib/plan-exit-planned-estimate-guard.mjs`                                                                                                                                                                                                                                                           | Tasks 6/7/10 purpose selection before authority construction; keep source/edit/commit/lifecycle checks.                                                                                                                                                                 |
| `timing-rollup.mjs`, `lib/timing-ladder.mjs`, `timing-row-reader.mjs`, `review-approval-timing.mjs`, `plan-approval-evidence-repair.mjs`; `verbs/stop.mjs`, `resume.mjs`, `switch.mjs`, `hooks/stop-audit-pause-resume.mjs`; `scripts/reports/lib/daily-activity.mjs`, `scripts/gh/update-event-fields.mjs`                                                                                                                                                          | Tasks 5/10 measured work survives provisional pairs; each visit needs receipt/legacy proof for completion; field projections stage.                                                                                                                                     |
| `backfill-timing-logs.mjs`, `heal-timing-starts.mjs`, `heal-timing-interval.mjs`, `heal-timing-log.mjs`, `heal-timing-departure.mjs`; `lib/heal-timing-continuity.mjs`, `heal-timing-rebaseline.mjs`, `heal-actor-opener-replays.mjs`, `heal-actor-evidence-recovery.mjs`, `timing-slug-rename.mjs`                                                                                                                                                                  | Tasks 5/12 validated local repair candidates; no read/status auto-repair or direct timing fallback.                                                                                                                                                                     |
| `backfill-vc-sections.mjs`, `heal-functional-dod.mjs`, `heal-vc-refs.mjs`, `backfill-plan-metadata.mjs`, `migrate-plan-approved.mjs`, `heal-backlog.mjs`, `heal-lifecycle-dod.mjs`; `verbs/adopt-github-records.mjs`, `migrate-dependencies.mjs`; `lib/decomposition-migration-writer.mjs`, `heal-vc-refs.mjs`; `scripts/gh/migrate-project.mjs`, `scripts/gh/verify-open-issue-bodies.mjs`, `scripts/gh/scaffold-web-issue.mjs`, `scripts/gh/lib/epic-metadata.mjs` | Task 12 explicit creation/administrative classification. New issue creation is excluded from existing-body upsert. Existing-issue repair defaults to staging; separately authorized one-off migration refuses any pending cache/claim and cannot be a routine fallback. |
| `lib/ownership-policy.mjs`, `assignee-guard.mjs`, `issue-mutator-lock.mjs`, `fleet-registry.mjs`, `lib/worktree-binding-lifecycle.mjs`, `worktree-relocation-guard.mjs`, `cleanup-base-aware.mjs`, `runtime-storage.mjs`, `runtime-migration-plan.mjs`, `runtime-migration-apply.mjs`                                                                                                                                                                                | Tasks 2/3/12 consumer-root ownership, cleanup/export protection and explicit handoff. Preserve team-unassigned read-only decisions.                                                                                                                                     |

Detection/contracts in `lib/body-invariants.mjs`, `lib/gh-edit-guard.mjs`, `bash-guard.mjs`, `lib/checklist-command-lint.mjs`, `lib/entrypoint-guard-lint.mjs`, `lib/runtime-capabilities.mjs`, `lib/command-surface/catalog.mjs`, `lib/action-decision/normalization.mjs` and `lib/governed-plan-policy.mjs` need matching classifications, not fictitious provider-write counts. CLI routing is `bin/aitm.mjs` → `scripts/task-tracker/task-tracker.mjs` → `runVerbPreflight`/verb, plus installed hook entrypoints. A late runtime-only disabled check does not cover these entrypoints.

### Fixed offline native workflow fixtures

Acceptance ceilings are chosen here before implementation, not measured results. Full-native tests execute the real collector, dispatch/preflight, guards and saga, replacing transport/filesystem seams only. A fake always-passing guard is insufficient. Failure to fit produces a design finding, not an allowance increased to match the observed count.

| Fixture and independently declared effects                                                                                                                                                                                    |   S |   G |   D |   V |   U |                                                                              Ceiling |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --: | --: | --: | --: | --: | -----------------------------------------------------------------------------------: |
| Owned solo Refine→Ready for Planning: `issue:I_test`, `comment:IC_timing`, `project-field:PI_test:STATUS`; no changed ancillary fields or remote prerequisite                                                                 |   1 |   0 |   3 |   1 |   0 |                                                                                    8 |
| Native epic Refine→Ready for Planning: those three plus `project-field:PI_test:ESTIMATE` and `project-field:PI_test:SIZE`; exactly two native assigned children, each with one membership and complete first-page nested data |   1 |   1 |   5 |   1 |   0 |                                                                                   13 |
| Native solo Plan→Develop: body/timing/Status plus `comment:new:plan-authority-move-1`; valid recorded Plan inputs/approval, no other pending fields                                                                           |   1 |   0 |   4 |   1 |   0 |                                                                                   10 |
| Epic interrupted after uncertain timing write, other effects unattempted                                                                                                                                                      |   1 |   1 |   5 |   1 |   1 | 14 including one uncertainty observation; explicitly resumed boundary adds at most 2 |

S=1 is complete target body/all-comments/title/ownership/fields. Epic G=1 is one real `collectHookDecompositionSnapshot` graph-admission query containing exactly two children with complete nested connections; reuse that admitted observation across cooperating transition hooks/guards with its purpose/freshness provenance. Graph evidence cannot feed estimation. No predecessor repair is needed in these fixtures. Solo native target admission uses S; repository/Plan evidence checks are local, and the Plan-authority comment's actual create/readback is counted in D. V=1 is the complete final target inventory/field check. D permits one mutation and at most one readback per exact declared resource. Complete mutation data may reduce counts. IDs come from the verified snapshot, not per-effect discovery.

The recovery fixture retains the same batch and never retries the uncertain timing effect automatically. One direct observation may confirm exact intended bytes; old baseline remains uncertain. Explicitly reconciled remaining mutations require another complete S+G=2 boundary. All snapshot inventory pages in one invocation share the 10-page/4-MiB aggregate cap; G for this native epic fixture is separately fixed at one complete query. An unexpected continuation/refusal is a failing fixture, not a new allowance. Add pagination fixtures with independently fixed resources/S/V before running them; always refuse page 11.

Test 1 versus 1,000 local edits/events with the same resulting effects: zero local remote operations and equal transition writes. Initial drift has one S and zero mutations. Cover foreign additions after final-body dispatch, equal-count inventory swaps, equal-token/different-hash content, later local edits after freeze, failed journal persistence and every crash prefix. Known cost zero and unknown/null remain distinct. These bounds are not yet empirically proven.

## Delivery order and estimates

| Task | Deliverable                                         | Hours | Size | Dependencies | Sequence |
| ---- | --------------------------------------------------- | ----: | ---- | ------------ | -------: |
| 1    | Native snapshot and revision contract               |     8 | M    | none         |        1 |
| 2    | Cache manifest and crash-safe storage               |     6 | M    | 1            |        2 |
| 3    | Single writer and cache handoff                     |     8 | M    | 2            |        3 |
| 4    | Local body/comment mutation staging                 |     6 | M    | 1,2,3        |        4 |
| 5    | Cached timing event ingestion                       |    10 | L    | 2,3,4        |        5 |
| 6    | Local-only estimation inputs and dispatch           |     8 | M    | 2            |        6 |
| 7    | Forecast v3 and legacy read compatibility           |     8 | M    | 6            |        7 |
| 8    | Resource batch publisher and recovery               |    10 | L    | 1,2,3,4,5,7  |        8 |
| 9    | Transition saga and completion receipts             |     8 | M    | 8            |        9 |
| 10   | Guard/read/report integration                       |     6 | M    | 4,5,7,9      |       10 |
| 11   | Whole-workflow budgets and adversarial integration  |    10 | L    | 10           |       11 |
| 12   | Migration, operator guidance and final verification |     8 | M    | 11           |       12 |

The serial sequence deliberately avoids concurrent edits to shared runtime/timing/guard modules. Dependency numbers refer to plan tasks until hydration supplies real issue IDs. Children remain in Backlog after creation; planned hours are not a fabricated refinement snapshot or automatic acceptance. The parent is orchestration/integration scope after conversion to epic, not a 96-hour implementation story.

## Implementation Tasks

### Task 1: Observe native issue and comment revisions in a bounded snapshot

#### Story Intent

- **Beneficiary:** delivery maintainer
- **Capability:** detect changes to the cached issue body and every comment using complete native observations
- **Need:** edit counts omit a stable version contract and unedited or deleted history can lack a usable edit token
- **Value or failure prevented:** prevent stale or incomplete cloud observations from authorizing a publication

#### Files

Create `scripts/task-tracker/lib/story-cache/native-observation.mjs`, `snapshot-reader.mjs` and `scripts/tests/unit/task-tracker/lib/story-cache/native-observation.test.mjs`, `snapshot-reader.test.mjs`. Reuse target query conventions from `scripts/task-tracker/lib/decomposition-hook-authority.mjs` without child/project enumeration. Create offline fixture helper `scripts/tests/helpers/story-cache-fixtures.mjs` with `createStoryFixture({comments,assignees,fields})` returning deterministic provider-shaped observations and a dispatch ledger.

**Estimate:** 8h; **Size:** M; **Sequence:** 1; **Dependencies:** none.

**Interfaces:** Produce `observeContent({identity,node,body}) -> ResourceObservation`, `readStorySnapshot({identity,transport,budget}) -> Promise<Snapshot>`, and `compareSnapshots(base,current) -> {equal,changes}`. Transport supplies `query({document,variables})`; one invocation-scoped budget is shared by preflight, final census and recovery inventory readers, records dispatches and enforces 10 sequential inventory/snapshot pages and 4 MiB aggregate returned UTF-8 bytes. Snapshot pages include current body/comment payloads, `userContentEdits(first:1)` metadata, title, assignment and required item fields; no edit diffs or history traversal.

- [ ] Add failing tests for complete zero-edit histories, inconsistent timestamps, latest tombstones, partial data, duplicate IDs, inventory replacement with equal counts, wrong host/repository and page/byte overflow. Model the retained probe's A/B/C IDs, no-op and deleted-B tombstone. Test current-content hashing independently of revision equality.
- [ ] Run the two exact verifiers below and confirm a meaningful missing-module/contract failure before implementation.
- [ ] Implement strict observations and a sequential bounded census. `digest-only` is allowed only by an explicit reconciled policy decision, never silent fallback after a native-token conflict. Any new/deleted/edited read-only comment changes the snapshot comparison. Record incomplete ordering/native-history shapes as unavailable.

```js
import assert from 'node:assert/strict';
import { observeContent } from '../../../../../task-tracker/lib/story-cache/native-observation.mjs';
const identity = {
  host: 'github.com',
  repository: 'owner/repo',
  issueNumber: 2039,
  issueNodeId: 'I_test',
  projectId: 'P_test',
  projectItemId: 'PI_test',
};
const node = {
  id: 'IC_test',
  lastEditedAt: null,
  includesCreatedEdit: false,
  userContentEdits: { totalCount: 0, nodes: [] },
};
const base = observeContent({ identity, node, body: 'A' });
assert.equal(base.revision.mode, 'unedited');
assert.notEqual(observeContent({ identity, node, body: 'B' }).digest, base.digest);
assert.throws(
  () => observeContent({ identity, node: { ...node, userContentEdits: undefined }, body: 'A' }),
  { code: 'STORY_OBSERVATION_UNAVAILABLE' }
);
```

This seed is complete and performs no I/O; expand it with provider-shaped transport fixtures for the snapshot tests. Add an assertion that a GraphQL error with `nodes:[]` refuses instead of passing as unedited.

- [ ] Re-run both verifiers; inspect the request ledger to prove no child/history/backlog query was attempted. Commit only these files with the actual hydrated child issue attribution.

**Verification Commands:**

```sh
node --test scripts/tests/unit/task-tracker/lib/story-cache/native-observation.test.mjs scripts/tests/unit/task-tracker/lib/story-cache/snapshot-reader.test.mjs
```

### Task 2: Persist manifest generations and protect unpublished cache data

#### Story Intent

- **Beneficiary:** delivery maintainer
- **Capability:** retain exact base and working story blocks with crash-safe dirty manifests
- **Need:** unpublished body and comment changes cannot be reconstructed after cache loss or partial persistence
- **Value or failure prevented:** preserve pending work and refuse false publication success after a crash

#### Files

Create `story-cache/manifest.mjs`, `store.mjs`, `retention.mjs` below `scripts/task-tracker/lib/`; create `scripts/tests/unit/task-tracker/lib/story-cache/store.test.mjs` and `retention.test.mjs`. Modify `scripts/task-tracker/lib/runtime-storage.mjs`, relevant runtime migration inventories in `runtime-migration-plan.mjs`/`runtime-migration-apply.mjs`, and `scripts/task-tracker/paths.mjs` only where existing cleanup/root resolution must recognize `.tmp/gh` as protected data. Audit actual cleanup entrypoints before changing their inventories; do not register a second body authority.

**Estimate:** 6h; **Size:** M; **Sequence:** 2; **Dependencies:** Task 1.

**Interfaces:** Consume `ResourceObservation`/`Snapshot`. Produce `storyCachePath({projectRoot,identity}) -> absolutePath`, `openStoryStore({projectRoot,identity,fs})`, `store.readGeneration()`, `store.commitGeneration(next,{expectedGeneration})`, and `cacheRetentionDecision({generation,operation})`. `commitGeneration` writes payload files, checksum-protected generation, flushes required files/directories and atomically switches the manifest pointer; retain the prior valid generation. Startup verifies every referenced payload and fails closed on corrupt pointers.

- [ ] Add failing tests for traversal/symlink identity escape, unsafe root, interrupted rename/fsync, missing payload, wrong checksum, user-only mode and two writers racing expected generation. Inject failure before/after each atomic switch.
- [ ] Run the verifier, implement validated canonical storage under `<projectRoot>/.tmp/gh/<host>/<repository-key>/<issue>/`, then rerun. Keep `base/body.md`, base comment files, working files and conflict/journal data as separate payloads referenced by the manifest. Use content-addressed immutable generation payloads so a crash cannot overwrite a still-referenced base.

```js
import assert from 'node:assert/strict';
import { cacheRetentionDecision } from '../../../../../task-tracker/lib/story-cache/retention.mjs';
// Minimal policy input; the store validates the complete generation before cleanup.
for (const generation of [
  { dirtyKeys: ['issue:I_test'], batch: null },
  { dirtyKeys: [], batch: { status: 'uncertain' } },
  { dirtyKeys: [], batch: { status: 'conflict' } },
])
  assert.equal(cacheRetentionDecision({ generation, operation: 'purge' }).allowed, false);
assert.equal(cacheRetentionDecision({ generation: null, operation: 'purge' }).allowed, false);
```

Storage crash tests use the exact manifest records above and actual project-local temporary files; the retention policy deliberately fails closed for missing generation data. No test creates a fake cloud confirmation.

- [ ] Prove dirty/conflict/uncertain entries cannot be purged, reassigned or silently rehydrated. Clean caches may refresh only with no unresolved intent. Commit the tested storage/retention surface.

**Verification Commands:**

```sh
node --test scripts/tests/unit/task-tracker/lib/story-cache/store.test.mjs scripts/tests/unit/task-tracker/lib/story-cache/retention.test.mjs
```

### Task 3: Enforce one assigned human and one owning agent cache

#### Story Intent

- **Beneficiary:** delivery coordinator
- **Capability:** keep one attributable agent session responsible for unpublished issue changes
- **Need:** a single GitHub assignee can still have competing same-login sessions and worktrees
- **Value or failure prevented:** prevent cache takeover and loss of unpublished work during handoff

#### Files

Create `story-cache/writer-claim.mjs`, `handoff.mjs`, `scripts/tests/unit/task-tracker/lib/story-cache/writer-claim.test.mjs` and `handoff.test.mjs`. Integrate `scripts/task-tracker/lib/ownership-policy.mjs`, `scripts/task-tracker/issue-mutator-lock.mjs`, `scripts/task-tracker/fleet-registry.mjs`, `scripts/task-tracker/lib/session-store.mjs`, `lib/session-ref.mjs`, `lib/bind-context.mjs` and `lib/worktree-binding-lifecycle.mjs`; preserve their unrelated read-only semantics.

**Estimate:** 8h; **Size:** M; **Sequence:** 3; **Dependencies:** Task 2.

**Interfaces:** Produce `acquireStoryWriter({identity,human,sessionId,worktree,cachePath,assignment,registry})`, `assertStoryWriter(claim,{sessionId,worktree})`, and `transferStoryWriter({claim,target,store,registry})`. The shared registry contains only claim identity and verified cache path; use native issue-lock ownership for acquire/flush/handoff and retain nested/sibling lock isolation. Remote assignment is checked at acquisition and transition; local staging checks the recorded claim without polling.

- [ ] Test zero/multiple/foreign assignees, two same-login sessions, sibling contexts, stale PIDs, missing shared registry, host changes and unauthorized exported-cache adoption. Verify existing team-unassigned read decisions still behave as before.
- [ ] Implement atomic claim acquisition and explicit handoff: freeze and hash all cache/journal payloads, export/transfer, verify the recipient, then release the old claim. A stale lease or crashed PID cannot authorize stealing dirty work.

```js
import assert from 'node:assert/strict';
import { assertStoryWriter } from '../../../../../task-tracker/lib/story-cache/writer-claim.mjs';
const claim = {
  schema: 'aitm.story-writer-claim/v1',
  claimId: 'claim-A',
  identityKey: 'a'.repeat(64),
  human: 'tester',
  sessionId: 'author-A',
  worktree: '/project',
  cachePath: '/project/.tmp/gh/github.com/repo/2039',
  status: 'owned',
  transfer: null,
};
assert.doesNotThrow(() =>
  assertStoryWriter(claim, { sessionId: 'author-A', worktree: '/project' })
);
assert.throws(() => assertStoryWriter(claim, { sessionId: 'author-B', worktree: '/project' }), {
  code: 'STORY_WRITER_OWNED',
});
```

Extend this local identity seed with acquisition tests sharing one actual test registry file and exactly one matching assigned human; use two distinct session IDs against the same identity.

- [ ] Run red/green tests, inspect handoff rollback/recovery evidence, and commit. Do not claim this registry locks arbitrary GitHub editors or independent machines.

**Verification Commands:**

```sh
node --test scripts/tests/unit/task-tracker/lib/story-cache/writer-claim.test.mjs scripts/tests/unit/task-tracker/lib/story-cache/handoff.test.mjs
```

### Task 4: Stage body and owned-comment mutations without network calls

#### Story Intent

- **Beneficiary:** delivery maintainer
- **Capability:** accumulate validated story edits locally until a transition publishes them
- **Need:** immediate marker and checkbox writes amplify GitHub requests for every small update
- **Value or failure prevented:** reduce update traffic while preserving proof and reviewed-scope safeguards

#### Files

Create `story-cache/stage.mjs`, `scripts/tests/unit/task-tracker/lib/story-cache/stage.test.mjs`. Modify `scripts/task-tracker/lib/issue-body-mutate.mjs`, `versioned-issue-write.mjs`, `issue-body-push.mjs`, and owned-comment adapters `lib/owned-comment.mjs`, `lib/refine-estimate-comment.mjs`, `lib/github-records/github-comment-store.mjs` and `lib/github-records/contract-write.mjs`. Inventory actual direct body writers with `rg 'mutateIssueBody|versionedWriteBody|gh.*issue.*edit|updateIssueComment' scripts`; record exclusions for issue creation and the sole transition publisher. Reuse `body-invariants.mjs`, `reviewed-scope/record.mjs` and existing evidence capabilities.

**Estimate:** 6h; **Size:** M; **Sequence:** 4; **Dependencies:** Tasks 1–3.

**Interfaces:** Produce `stageStoryTitle({store,claim,title})` with the same staged result contract and `stageStoryMutation({store,claim,key,mutate,capability}) -> Promise<{status:'staged'|'no-op',body,generation,dirtyKeys,publication:'unpublished'}>`. `mutate` sees the current working block; absent/foreign comments cannot acquire ownership from their heading or author login alone. Split pure invariant validation from provider publication so no legacy direct-write path remains available to routine callers. An explicit publisher-only capability reaches transport from Task 8.

- [ ] Pin marker/section-loss, fabricated proof, reviewed-scope, async mutate, non-string result and foreign-comment behavior before changing adapters. A no-op must not dirty the generation. Test title staging independently: exact cloud title baseline remains immutable, the working issue-update payload holds the authorized new title, and the publisher sends body plus title in its one final issue mutation.
- [ ] Implement guarded composite local staging and atomic dirty-tag updates. Stop incrementing old `aitm-body-version` markers as authority; preserve legacy bytes unless a separately governed migration authorizes removal. Migrate callers that expect immediate `ok` to distinguish `staged` from verified published success.

```js
import assert from 'node:assert/strict';
import { stageStoryMutation } from '../../../../../task-tracker/lib/story-cache/stage.mjs';
let writes = 0;
const store = {
  async commitGeneration() {
    writes++;
  },
};
// Argument shape must be checked before claim/store/transport access.
await assert.rejects(
  stageStoryMutation({
    store,
    claim: null,
    key: 'issue:I_test',
    mutate: 'captured body',
    capability: null,
  }),
  { code: 'STORY_MUTATION_INVALID' }
);
assert.equal(writes, 0);
```

Inject the fail-on-dispatch transport at real adapter construction seams and spawn the public `issue-body` path in an offline harness; unused local variables alone are not transport coverage.

- [ ] Run new and existing mutation invariant tests through red/green. Commit the complete staged-result caller changes together so no intermediate shipped caller treats staging as cloud confirmation.

**Verification Commands:**

```sh
node --test scripts/tests/unit/task-tracker/lib/story-cache/stage.test.mjs scripts/tests/unit/task-tracker/lib/mutate-issue-body.test.mjs scripts/tests/unit/task-tracker/lib/mutate-issue-body-marker-loss.test.mjs
```

### Task 5: Accumulate timing events with separate ingestion and publication cursors

#### Story Intent

- **Beneficiary:** delivery operator
- **Capability:** retain accurate local timing events and publish one timing log per transition
- **Need:** per-event cloud appends consume quota and uncertain retries can duplicate timing rows
- **Value or failure prevented:** preserve attributable work time without duplicate or fabricated durations

#### Files

Create `story-cache/timing-stage.mjs`, `scripts/tests/unit/task-tracker/lib/story-cache/timing-stage.test.mjs`. Modify `scripts/task-tracker/gh-timing-comment.mjs`, `lib/actor-timing-state.mjs`, `hook-handler.mjs`, `runtime.mjs`, `lib/actor-hook-timing.mjs`, `lib/timing-post-outcome.mjs`, `hooks/stop-audit-pause-resume.mjs`, and the concrete timing caller/reader census above, `scripts/gh/log-issue-time.mjs` and `lib/move-state/audit-timing.mjs`. Keep canonical row parsing in existing timing helpers; do not add a competing timer clock.

**Estimate:** 10h; **Size:** L; **Sequence:** 5; **Dependencies:** Tasks 2–4.

**Interfaces:** Produce pure `mergeTimingEvents(existing,incoming) -> events`, `ingestTimingEvents({store,claim,events})`, `freezeTimingCandidate({generation,transition})`, and `confirmTimingPublication({store,batchId,observation})`. Native events retain event/actor/transition IDs and actual timestamps. Ingestion cursor advances only with persisted local log; publication cursor advances only after verified remote content. Frozen batch state remains independent of both.

- [ ] Test duplicate events, restart between cursor writes, Unknown values, actor changes, backdated rows, pause/resume, absent canonical comment and ambiguous creation. Exercise 1 and 1,000 events with all transports throwing.
- [ ] Route native event append, stage rollups and timing field projections into the local batch. Remove direct fallback body writes and per-row cloud append/retry. Only render the legitimate entry/exit pair for the frozen transition identity.

```js
import assert from 'node:assert/strict';
import { mergeTimingEvents } from '../../../../../task-tracker/lib/story-cache/timing-stage.mjs';
const event = {
  eventId: 'evt-1',
  actorId: 'author-A',
  transitionId: null,
  timestamp: '2026-10-19T12:00:00.000Z',
  event: 'paused',
  activeSeconds: null,
  idleSeconds: null,
  sourceCursor: 'native-1',
};
const merged = mergeTimingEvents([], [event, structuredClone(event)]);
assert.deepEqual(merged, [event]);
assert.equal(merged[0].activeSeconds, null);
assert.throws(() => mergeTimingEvents([event], [{ ...event, activeSeconds: 0 }]), {
  code: 'STORY_TIMING_EVENT_CONFLICT',
});
```

The fixture event explicitly has unmeasured active duration; no arithmetic may coerce it to zero.

- [ ] Re-run timing characterization tests and new tests, confirm old historical multi-actor rows remain byte-preserved where semantic normalization is unnecessary, and commit.

**Verification Commands:**

```sh
node --test scripts/tests/unit/task-tracker/lib/story-cache/timing-stage.test.mjs scripts/tests/unit/task-tracker/core/gh-timing-comment.test.mjs scripts/tests/unit/task-tracker/core/timing-unknown-projection.test.mjs
```

### Task 6: Calculate estimates and refresh rubrics from retained local evidence only

#### Story Intent

- **Beneficiary:** delivery maintainer
- **Capability:** generate reproducible estimates from local plan and outcome evidence
- **Need:** cloud corpus discovery and rubric calibration exhaust the shared GraphQL allowance
- **Value or failure prevented:** keep estimation available without scanning project history or inventing missing inputs

#### Files

Create `scripts/task-tracker/lib/estimation/local-evidence.mjs`, `local-runtime.mjs`, `mode.mjs`, `scripts/tests/unit/task-tracker/lib/estimation/local-evidence.test.mjs` and `local-runtime.test.mjs`. Modify `runtime-adapter.mjs`, `rubric-refresh.mjs`, `plan-estimate-authority.mjs`, `scripts/task-tracker/verbs/plan-estimate.mjs` and dispatch seams `scripts/task-tracker/task-tracker.mjs` (before `preflightVerb`), `bin/aitm.mjs`, `activity-guard.mjs`, `source-edit-gate.mjs`, `lib/verb-preflight.mjs`, `lib/decomposition-hook-authority.mjs` and `lib/action-decision/session.mjs`. These changes intercept estimation purposes only; native source-edit/commit/lifecycle admission remains enabled.

**Estimate:** 8h; **Size:** M; **Sequence:** 6; **Dependencies:** Task 2.

**Interfaces:** Produce `resolveEstimationMode(cfg) -> {mode:'disabled'|'local'|'unavailable',reason}`, `validateLocalEvidence(bundle)`, `importLocalEvidence({evidenceStore,bundle})`, and `calculateLocalEstimate({mode,evidence,planInput,model}) -> {status:'disabled'|'unavailable'|'estimated',...}`. Bundle schema is concretized above. Its immutable estimation inputs use native durable runtime storage, resolved through `runtime-storage.mjs`; they do not use the story content `store` or duplicate its body/comment authority. `.tmp/gh` holds only the selected-input references/digests needed by pending story publication. For the bundle, preserve record envelopes, identity, lineage and provenance values `observed-cloud`, `imported-local`, `derived-local`. Use existing rubric/outcome semantic validators and canonical digesting.

- [ ] Add failing tests for rubric zero/defaulted zero, invalid config, missing/local corrupt lineage, changed selected-plan digest, wrong repository, missing ancestors, empty supported comparables and incomplete outcome timing. Intercept GraphQL/REST/gh/subprocess dispatch before any preflight loader.
- [ ] Implement the pure resolver before transport construction; replace cloud corpus loading in estimate/rubric/comparable call chains with retained payloads. A positive configured rubric ID selects local mode, never a remote fetch. A valid locally derived rubric gets a real valid record ID and retained payload before any forecast references it.

```js
import assert from 'node:assert/strict';
import { resolveEstimationMode } from '../../../../../task-tracker/lib/estimation/mode.mjs';
import { calculateLocalEstimate } from '../../../../../task-tracker/lib/estimation/local-runtime.mjs';
assert.equal(resolveEstimationMode({ estimationRubricIssue: 0 }).mode, 'disabled');
assert.equal(resolveEstimationMode({ estimationRubricIssue: -1 }).mode, 'unavailable');
let modelCalls = 0;
const result = calculateLocalEstimate({
  mode: { mode: 'local' },
  evidence: null,
  planInput: null,
  model() {
    modelCalls++;
    throw new Error('must not calculate');
  },
});
assert.equal(result.status, 'unavailable');
assert.equal(result.estimate, undefined);
assert.equal(modelCalls, 0);
```

The missing-input seed proves refusal occurs before calculation. Positive fixtures load `scripts/tests/fixtures/estimation/plan-input.json` through the existing `parsePlanEstimationInput` and use retained rubric/outcome envelopes.

- [ ] Prove direct/packaged evidence-file and manual compatibility routes distinguish disabled/unavailable from staged/publication success. Preserve explicitly supplied human estimates without generating an automatic forecast. Commit local calculation and all entrypoint dispatch changes together.

**Verification Commands:**

```sh
node --test scripts/tests/unit/task-tracker/lib/estimation/local-evidence.test.mjs scripts/tests/unit/task-tracker/lib/estimation/local-runtime.test.mjs scripts/tests/unit/task-tracker/lib/estimation/rubric-refresh.test.mjs
```

### Task 7: Publish forecast v3 provenance while retaining legacy forecast reads

#### Story Intent

- **Beneficiary:** planning reviewer
- **Capability:** interpret a forecast's local rubric and plan provenance without fetching historical cloud records
- **Need:** existing forecasts reference cloud rubric IDs without a self-contained local-input provenance contract
- **Value or failure prevented:** prevent unverifiable forecasts and compatibility failures during local estimation rollout

#### Files

Modify `scripts/task-tracker/lib/estimation/forecast-record.mjs`, `forecast-model.mjs`, `renderers.mjs`, `outcome-builder.mjs`, `plan-estimate-authority.mjs`, `scripts/task-tracker/lib/plan-exit-planned-estimate-guard.mjs` and `scripts/task-tracker/verbs/plan-approve.mjs`. Create focused `estimation/forecast-provenance.mjs` and `scripts/tests/unit/task-tracker/lib/estimation/forecast-v3.test.mjs`.

**Estimate:** 8h; **Size:** M; **Sequence:** 7; **Dependencies:** Task 6.

**Interfaces:** New writes use `aitm.estimation-forecast/v3`; preserve exact v1/v2 readers. Add `localEvidence:{schema:'aitm.forecast-local-evidence/v1',manifestDigest,canonicalizationVersion,plan,refine,rubric,outcomes,modelPolicy}` to v3's strict root schema, with plan commit/section/digest, retained source identities and input origins/hashes. `validateForecastProvenance(value,{expectedIssue,repository})` verifies correlation. `requireCurrentSchema` means v3 only; v2 retains its half-hour validation even after the current-schema constant changes.

- [ ] Add fixtures for valid v1, v2 and v3, corrupt provenance, fractional grid rejection and a legacy approval/read path. Ensure changing the `FORECAST_SCHEMA` constant does not accidentally apply the old v1 arbitrary-hour validator to v2.
- [ ] Implement strict version-specific key lists/validators and v3 model output. Snapshot provenance contains only needed input identities and hashes, not historical issue bodies. Staging a v3 forecast still does not grant lifecycle approval or a verified cloud ready marker.

```js
import assert from 'node:assert/strict';
import { validateEstimationForecast } from '../../../../../task-tracker/lib/estimation/forecast-record.mjs';
const legacyV2 = {
  schema: 'aitm.estimation-forecast/v2',
  issue: 2039,
  lifecycleState: 'plan',
  refine: { size: 'S', humanHours: 1 },
  plan: { size: 'S', humanHours: 1, deltaHours: 0, rationale: 'One bounded change' },
  ai: {
    p50EngagedHours: 1,
    p80EngagedHours: 1.5,
    stages: { plan: 0.5, develop: 0.5, test: 0, review: 0 },
  },
  wbs: [{ id: 'change', description: 'Implement bounded change', humanHours: 1, signals: [] }],
  comparableIssues: [],
  rubric: { recordId: '01J00000000000000000000500', version: 1, cohortSize: 0, confidence: 0 },
  testPlan: { expectedMinutes: 1, impactedLanes: ['unit'], isolation: 'offline' },
  risks: [],
  recommendation: { action: 'proceed', reason: 'Bounded scope' },
  supersedesForecastRecordId: null,
};
assert.doesNotThrow(() => validateEstimationForecast(legacyV2));
assert.throws(() => validateEstimationForecast(legacyV2, { requireCurrentSchema: true }));
const offGrid = structuredClone(legacyV2);
offGrid.ai.p80EngagedHours = 1.1;
assert.throws(() => validateEstimationForecast(offGrid));
```

Construct the valid v3 fixture by adding the exact provenance record above to the valid v2 payload and changing its schema. Its retained hashes must match real fixture payload bytes; mutate one field per negative case.

- [ ] Run all forecast/model/authority compatibility tests, trace every forecast schema consumer with `rg 'FORECAST_SCHEMA|estimation-forecast/v[12]|requireCurrentSchema' scripts`, and commit the complete read/write migration.

**Verification Commands:**

```sh
node --test scripts/tests/unit/task-tracker/lib/estimation/forecast-v3.test.mjs scripts/tests/unit/task-tracker/lib/estimation/forecast-model.test.mjs scripts/tests/unit/task-tracker/lib/estimation/plan-estimate-authority.test.mjs
```

### Task 8: Publish one frozen resource batch and recover uncertain effects

#### Story Intent

- **Beneficiary:** delivery operator
- **Capability:** publish each changed issue resource once and retain exact partial outcomes
- **Need:** immediate independent updates and retries can overwrite conflicts or duplicate comments
- **Value or failure prevented:** reduce requests while keeping interrupted publications recoverable and truthful

#### Files

Create `story-cache/batch.mjs`, `publisher.mjs`, `recovery.mjs`, `effect-adapters.mjs`, and `scripts/tests/unit/task-tracker/lib/story-cache/publisher.test.mjs`, `recovery.test.mjs`. Integrate `estimate-writer-publication.mjs`, `decomposition-writer-registry.mjs` and `decomposition-adaptive-writer.mjs`; replace complete-authority per-effect readers with current target-specific adapters.

**Estimate:** 10h; **Size:** L; **Sequence:** 8; **Dependencies:** Tasks 1–5 and 7.

**Interfaces:** Produce `freezeStoryBatch({generation,transition,effects,capabilities}) -> Batch`, `publishResourceEffects({store,claim,batch,snapshot,ports})`, and `recoverStoryBatch({store,claim,ports,allowMutation:false})`. Each effect has `{key,kind,beforeDigest,intendedDigest,candidate,dependencies,attempted,outcome}` and exact target identity. The final body is a frozen deterministic template plus declared substitution slots for confirmed newly created comment IDs and effect digests. Freeze all other bytes and input hashes at batch creation; materialize these slots only from verified outcomes, validate the composite, persist its exact intended digest before its single dispatch, and reuse it unchanged during recovery. No late discretionary edits may enter that template. No counter derived from observed traffic may enlarge the effect manifest. Effects expose `apply(candidate)` and `observe()`; only this publisher has transport capability for routine cached issue writes.

- [ ] Add failing tests for equal ID/different bytes, external comment addition/deletion, ownership drift, before-dispatch persistence failure, timeouts before/after landing, duplicate creation, mutation response missing required fields and confirmed-resource replay. Persist `dispatching` before transport.
- [ ] Implement one complete preflight comparison, one attempted write per declared dirty resource and one bounded read-back only when a complete mutation result cannot supply confirmation. Unknown creation matches remain uncertain. Reject any resource not in the frozen manifest.

```js
import assert from 'node:assert/strict';
import { publishResourceEffects } from '../../../../../task-tracker/lib/story-cache/publisher.mjs';
let dispatched = 0;
const ports = {
  apply() {
    dispatched++;
    throw new Error('must not dispatch');
  },
};
await assert.rejects(
  publishResourceEffects({
    store: null,
    claim: null,
    batch: null,
    snapshot: { complete: false },
    ports,
  }),
  { code: 'STORY_OBSERVATION_UNAVAILABLE' }
);
assert.equal(dispatched, 0);
```

A separate delayed-write test returns the old baseline during recovery, then lands the timed-out write; assert no automatic second `apply` occurred. Read-only recovery may confirm exact intended bytes but must not invent provider idempotency.

- [ ] Before an explicitly authorized resumed mutation, recollect the whole current vector/ownership and compare original baselines plus confirmed effects. Retain three-way conflict packages and forbid automatic rebase/generation bump. Commit complete publisher/recovery and caller routing.

**Verification Commands:**

```sh
node --test scripts/tests/unit/task-tracker/lib/story-cache/publisher.test.mjs scripts/tests/unit/task-tracker/lib/story-cache/recovery.test.mjs
```

### Task 9: Commit state transitions with one final issue write

#### Story Intent

- **Beneficiary:** delivery coordinator
- **Capability:** distinguish completed state transitions from partially published timing and board changes
- **Need:** the current saga writes body evidence before Status and a separate completion sentinel afterward
- **Value or failure prevented:** prevent false lifecycle completion while meeting the one-body-write transition boundary

#### Files

Create `story-cache/transition-batch.mjs`, `completion-receipt.mjs`, `scripts/tests/unit/task-tracker/lib/story-cache/transition-batch.test.mjs`. Modify `scripts/task-tracker/lib/move-state/move-state-core.mjs`, `github-mutation.mjs`, `audit-timing.mjs`, `sentinel.mjs`, `transition-commit.mjs`, `post-commit-tail.mjs`, `readout.mjs` and `scripts/gh/move-state.mjs` through their native injected seams.

**Estimate:** 8h; **Size:** M; **Sequence:** 9; **Dependencies:** Task 8.

**Interfaces:** Produce `runTransitionBatch({ctx,store,claim,ports})` and `validateCompletionReceipt(receipt,{transition,confirmedEffects})`. Receipt schema `aitm.story-transition-completion/v1` binds transition/from/to, actor/visit, timing comment identity/digest and confirmed prerequisite effect digests. Persist receipts in the final body alongside the latest sentinel; do not add a counter-only metadata comment or a post-sentinel cloud write.

- [ ] Start with source-shaped saga tests proving current before-Status body writes and post-sentinel writes violate the fixed one-write expectation. Inject every crash prefix and each native prerequisite refusal.
- [ ] Implement the spec's six-step saga: freeze/persist, complete snapshot/native checks, required comment/timing effects and verified pre-Status proof, Status/required fields, final body with actual confirmed IDs and immutable receipt, final complete-vector verification/local commit. Optional tails stage for a later transition; required effects are part of this batch.

```js
import assert from 'node:assert/strict';
import { validateCompletionReceipt } from '../../../../../task-tracker/lib/story-cache/completion-receipt.mjs';
const transition = {
  id: 'move:00000000-0000-4000-8000-000000000001',
  from: 'refine',
  to: 'ready-for-plan',
  actorId: 'author-A',
  visit: 1,
};
const receipt = {
  schema: 'aitm.story-transition-completion/v1',
  transition,
  timing: {
    key: 'comment:IC_timing',
    resourceDigest: 'a'.repeat(64),
    eventIds: ['event-enter-1', 'event-exit-1'],
    eventsDigest: 'c'.repeat(64),
  },
  effects: [{ key: 'project-field:PI_test:STATUS', digest: 'b'.repeat(64) }],
};
assert.throws(() => validateCompletionReceipt(receipt, { transition, confirmedEffects: [] }), {
  code: 'STORY_COMPLETION_UNCONFIRMED',
});
```

Add two consecutive transitions and demotion/reentry: the first receipt still proves its completed timing pair after the latest sentinel changes. A crash before the second body's final write leaves only its pair provisional; actual accrued work stays counted.

- [ ] Preserve legacy transition-commit evidence reads without fabricating missing receipts. Remove compensating body overwrite and blind write retries. Run new and native saga tests; commit only after all crash-prefix outcomes are explicit.

**Verification Commands:**

```sh
node --test scripts/tests/unit/task-tracker/lib/story-cache/transition-batch.test.mjs scripts/tests/unit/task-tracker/lib/move-state/move-state-core.test.mjs
```

### Task 10: Integrate cached views with guards and timing reports

#### Story Intent

- **Beneficiary:** delivery reviewer
- **Capability:** see unpublished local work separately from verified cloud lifecycle authority
- **Need:** cached mutation results and provisional timing pairs can otherwise appear already published or completed
- **Value or failure prevented:** prevent false approval and reporting while preserving real work evidence

#### Files

Create `story-cache/views.mjs`, `scripts/tests/unit/task-tracker/lib/story-cache/views.test.mjs`. Modify `activity-guard.mjs`, `source-edit-gate.mjs`, `lib/verb-preflight.mjs`, `lib/decomposition-hook-authority.mjs`, `lib/action-decision/session.mjs`, `verbs/explain.mjs`, `timing-rollup.mjs`, `lib/timing-ladder.mjs`, report/field projection consumers and remaining body/comment readers identified in the census.

**Estimate:** 6h; **Size:** M; **Sequence:** 10; **Dependencies:** Tasks 4,5,7,9.

**Interfaces:** Produce `storyView({generation,authority:'working'|'published'})` and `timingAuthority({events,receipts,legacyEvidence})`. Native guard adapters explicitly choose candidate validation versus verified published authority; a generic environment flag never changes that choice. Explain returns dirty/conflict/uncertain/pending effects and the exact supported recovery action.

- [ ] Test staged reviewed-scope changes, absent proof, local edit after approval, same-login competing session, missing cache, remote consumer without local journal and historical rows without completion evidence. Validate async native guards from the complete transition snapshot and separately declared admission results at that boundary, not once per marker; independently necessary proof observations retain their declared effect/read allowances.
- [ ] Implement mode interception in every real CLI/hook process. Reuse immutable local observations for routine staging; retain independently required native source/edit/commit/lifecycle guards. Source edits are not exempt because estimation is disabled.

```js
import assert from 'node:assert/strict';
import { timingAuthority } from '../../../../../task-tracker/lib/story-cache/views.mjs';
const events = [
  {
    eventId: 'evt-1',
    actorId: 'author-A',
    transitionId: 'move:00000000-0000-4000-8000-000000000001',
    timestamp: '2026-10-19T12:00:00.000Z',
    event: 'refine:completed',
    activeSeconds: 30,
    idleSeconds: null,
    sourceCursor: 'native-1',
  },
];
const result = timingAuthority({ events, receipts: [], legacyEvidence: [] });
assert.equal(result.completedVisits.length, 0);
assert.equal(result.measuredActiveSeconds, 30);
assert.equal(result.unknownIdle, true);
```

Also assert accrued measured work survives that last case, and Unknown remains Unknown. Do not derive completed visits merely from a pair's presence or only from the latest sentinel.

- [ ] Run the new view/report tests plus existing timing/guard targeted regressions, and commit the complete consumer matrix. No action may interpret `staged` as a verified remote result.

**Verification Commands:**

```sh
node --test scripts/tests/unit/task-tracker/lib/story-cache/views.test.mjs scripts/tests/unit/task-tracker/core/timing-rollup.test.mjs scripts/tests/unit/task-tracker/core/timing-unknown-projection.test.mjs
```

### Task 11: Enforce offline whole-transition budgets and adversarial recovery

#### Story Intent

- **Beneficiary:** delivery maintainer
- **Capability:** detect transport amplification across real hooks and state-transition publishers before release
- **Need:** isolated helper tests can miss nested subprocess, predecessor and admission reads
- **Value or failure prevented:** prevent renewed shared-quota exhaustion and hidden false-green budget claims

#### Files

Create `scripts/tests/integration/task-tracker/lib/story-cache-transition-budget.integration.test.mjs`, `story-cache-recovery.integration.test.mjs`, and extend the Task 1 fixture/transport ledger helper. Add source-shaped adapter fixtures for the actual parent epic route, preflight/hooks and predecessor recovery; do not replace them with a pure calculator mock.

**Estimate:** 10h; **Size:** L; **Sequence:** 11; **Dependencies:** Task 10.

**Interfaces:** Create test-only `assertOperationBudget(ledger,budget)` in `scripts/tests/helpers/story-cache-ledger.mjs`, refusing unclassified operations, undeclared resources and counts above the independently declared phase/resource limits. The test ledger captures `{operationId,phase,purpose,resource,target,attempt,outcome,returnedCost,coverage}` at GraphQL, REST, gh and spawned entrypoints. Count layers separately when overlapping; fail any unclassified dispatch. Fixtures fix resource identities and allowances before the first mutation.

- [ ] Write a failing source-shaped regression for the existing child-graph/projection amplification. Baseline only with fully stubbed transport; no live expensive estimate. Report synthetic returned costs separately from the incident's reported observations.
- [ ] Implement the complete matrix with fixed numeric fixtures: minimal owned body+timing+Status has `S=1,G=0,D=3,V=1`, at most eight operations; initial conflict has one snapshot and zero writes; recovery adds at most one observation per uncertain resource plus a fresh declared snapshot/admission boundary before resumed writes.

```js
import assert from 'node:assert/strict';
import { assertOperationBudget } from '../../../helpers/story-cache-ledger.mjs';
const budget = {
  S: 1,
  G: 0,
  D: 3,
  V: 1,
  U: 0,
  resources: ['issue:I_test', 'comment:IC_timing', 'project-field:PI_test:STATUS'],
};
const ledger = [
  {
    operationId: 'op-1',
    phase: 'write',
    purpose: 'publication',
    resource: 'comment:IC_foreign',
    target: 'IC_foreign',
    attempt: 1,
    outcome: 'success',
    returnedCost: null,
    coverage: 'offline-provider',
  },
];
assert.throws(() => assertOperationBudget(ledger, budget), { code: 'TEST_UNDECLARED_RESOURCE' });
```

The ledger seed checks an undeclared-resource rejection; it is not the workflow budget proof. Full workflow runs must execute the actual offline entrypoint tree with the numeric fixtures above. Do not choose `D` from the observed mutation count. Test one too many inventory pages, oversized streams, new comments during recovery, changed local forecast inputs, delayed writes, partial final vectors and known versus missing costs.

- [ ] Run integration verifiers red/green, preserve before/after source-fixture counts in test documentation, and commit. Do not loosen a guard or move calls outside the counted invocation to satisfy a ceiling.

**Verification Commands:**

```sh
node --test scripts/tests/integration/task-tracker/lib/story-cache-transition-budget.integration.test.mjs scripts/tests/integration/task-tracker/lib/story-cache-recovery.integration.test.mjs
```

### Task 12: Document adoption and validate the integrated delivery

#### Story Intent

- **Beneficiary:** AITM operator
- **Capability:** adopt the cached workflow and recover conflicts without losing unpublished work
- **Need:** legacy direct-write paths and cleanup assumptions can invalidate the new publication contract
- **Value or failure prevented:** make rollout auditable and prevent unsafe fallback to immediate cloud writes

#### Files

Create `docs/guides/story-cache-publication.md` and `scripts/tests/integration/task-tracker/lib/story-cache-package.integration.test.mjs`. Update `docs/guides/workflow.md`, `docs/guides/decomposition-recovery.md`, applicable CLI help and runtime retention documentation. Retain a final writer/reader-to-verifier census under `docs/superpowers/reviews/2039/implementation/` when actual implementation supplies it.

**Estimate:** 8h; **Size:** M; **Sequence:** 12; **Dependencies:** Task 11.

**Interfaces:** No new mode switch. Package entrypoints always use the new staging/transition contract for supported existing-issue body and owned-comment writes. Existing legacy body-version markers remain readable compatibility data; acquiring an unedited issue needs no initialization write. No automatic history hydration, default cloud calibration or fallback immediate writer is shipped.

- [ ] Add offline consumer-package tests for initial bounded hydration, zero-network tiny edits/timing, one-transition flush, missing cache, explicit handoff/export and conflict refusal. Exercise consumer root resolution rather than resolving cache paths into the installed package.
- [ ] Document exact operators' actions through registered help: acquire/bind owner, inspect working/published views, transition, inspect conflict diff, discuss and explicitly reconcile, export/handoff, and recover uncertain effects. Document external-edit race, history-deletion limits, stale cloud views and cache-loss limits without promising atomicity.

```js
import assert from 'node:assert/strict';
import path from 'node:path';
import { storyCachePath } from '../../../../task-tracker/lib/story-cache/store.mjs';
const projectRoot = path.resolve('.tmp/story-cache-consumer');
const packageRoot = path.join(projectRoot, 'node_modules/@kburson/ai-task-manager');
const identity = {
  host: 'github.com',
  repository: 'owner/repo',
  issueNumber: 2039,
  issueNodeId: 'I_test',
  projectId: 'P_test',
  projectItemId: 'PI_test',
};
const cachePath = storyCachePath({ projectRoot, identity });
assert.equal(cachePath.startsWith(path.join(projectRoot, '.tmp/gh') + path.sep), true);
assert.equal(cachePath.startsWith(packageRoot + path.sep), false);
```

The package fixture follows `scripts/tests/integration/task-tracker/lib/downstream-package-boundary.test.mjs`: `projectScratchDir` from `lib/scratch-dir.mjs`, `parseNpmPackReport` from `scripts/tests/helpers/npm-pack-report.mjs`, isolated pack/install and `spawnSync` with explicit timeout/status/stdout/stderr checks. Spawn the installed `bin/aitm.mjs issue-body` route with the documented local operation and fixture claim; there is no invented `stage-note` command. All provider processes use a deny-by-default offline `gh` executable based on `scripts/tests/helpers/native-decomposition-hook-fixture.mjs`. Do not run `npm publish`.

- [ ] Execute the exact package integration verifier, then the normal `npm test`, `npm run test:slow`, `npm run lint` and `npm run format:check` lanes once for the integrated parent delivery. Children's targeted tests remain their own evidence; no repeated full suite per grandchild. Record actual clean SHA, outcomes and limitations through native Test/review workflow. Commit docs/help/package assertions with the actual child ID; do not close or merge without separate authority.

**Verification Commands:**

```sh
node --test scripts/tests/integration/task-tracker/lib/story-cache-package.integration.test.mjs
```

## Plan self-review and hydration contract

The specification-to-task map is: native revisions/inventory→1; local cache/retention→2; ownership/handoff→3; local body/comments/invariants→4; timing→5; pure local evidence/rubric→6; forecast lineage/schema→7; publication/conflict/recovery→8; one-body transition/receipts→9; guards/readers/reporting→10; full budgets/adversarial proofs→11; operator adoption/package verification→12. Review Focus items map to the named tests above. Source-level adapter census must be completed in the owning tasks before code changes; every discovered supported writer/consumer receives an explicit route and verifier, not an undocumented exclusion.

Use `npx aitm split-plan 2039 --dry-run --plan docs/superpowers/plans/2026-10-19-2039-local-estimation-transition-cache.md --json` only after the reviewed plan is committed and linked through governed Plan Metadata. Verify all twelve source-grounded Story Intent blocks and their seven semantic questions before the first create. Inspect current native children again immediately before confirmed hydration. `split-plan --confirm` uses sanctioned `create-issue --shape sub-issue`; never use raw issue creation.

Retain confirmed child numbers after any partial creation; inspect before resuming and never rerun the entire set blindly. After creation, record an exact task→child map, source plan commit/section, planned dependency numbers and sequence. Materialize native dependencies/rank through their sanctioned verbs where needed; do not fabricate child refinement, reviewer approval or completed verifiers. Convert #2039 to epic through the governed path when children are attached and keep its planning/orchestration role explicit.

After the recorded field blocker is resolved and native Plan entry succeeds, the intended post-hydration state is Plan. Do not hydrate while the actual lifecycle/linkage prerequisites remain blocked. SAR acceptance validates this plan's document readiness; it does not approve implementation, satisfy ACs, create Test evidence or authorize Develop. No XPR acceptance is claimed: the separately recorded XPR startup remains blocked.
