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
- **Review:** Draft for Astra 6/high SAR; acceptance is recorded in the review collateral, not invented here.

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

`Generation` contains immutable base observations, working payload references, dirty resource keys, local event ingestion/publication cursors, one optional frozen batch and a checksum. `Batch` freezes transition ID/from/to, candidates, baseline/expected vectors, approved input digests, resource effects and outcomes. States are prepared, dispatching, partial, uncertain, conflict and confirmed. The sole cache authority lives under the owning project/worktree `.tmp/gh`; a shared registry stores only ownership/path/claim identity.

Public interfaces are defined per task below. Throw typed errors with stable codes and retained diagnostic details; the implementation plan's codes are new story-cache codes, not fabricated existing AITM remediation IDs. Native action/Explain integration must register their actual remediation routes through existing command contracts.

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

**Interfaces:** Produce `observeContent({identity,node,body}) -> ResourceObservation`, `readStorySnapshot({identity,transport,budget}) -> Promise<Snapshot>`, and `compareSnapshots(base,current) -> {equal,changes}`. Transport supplies `query({document,variables})`; a budget records dispatches and enforces 10 sequential inventory/snapshot pages and 4 MiB aggregate returned UTF-8 bytes. Snapshot pages include current body/comment payloads, `userContentEdits(first:1)` metadata, title, assignment and required item fields; no edit diffs or history traversal.

- [ ] Add failing tests for complete zero-edit histories, inconsistent timestamps, latest tombstones, partial data, duplicate IDs, inventory replacement with equal counts, wrong host/repository and page/byte overflow. Model the retained probe's A/B/C IDs, no-op and deleted-B tombstone. Test current-content hashing independently of revision equality.
- [ ] Run the two exact verifiers below and confirm a meaningful missing-module/contract failure before implementation.
- [ ] Implement strict observations and a sequential bounded census. `digest-only` is allowed only by an explicit reconciled policy decision, never silent fallback after a native-token conflict. Any new/deleted/edited read-only comment changes the snapshot comparison. Record incomplete ordering/native-history shapes as unavailable.

```js
const base = observeContent({
  identity,
  node: {
    id: 'IC_test',
    lastEditedAt: null,
    includesCreatedEdit: false,
    userContentEdits: { totalCount: 0, nodes: [] },
  },
  body: 'A',
});
assert.equal(base.revision.mode, 'unedited');
assert.notEqual(observeContent({ identity, node: baseNode, body: 'B' }).digest, base.digest);
```

`identity` and `baseNode` in the test are explicit local fixture records from `createStoryFixture`; they perform no I/O. Add an assertion that a GraphQL error with `nodes:[]` refuses instead of passing as unedited.

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

**Interfaces:** Consume `ResourceObservation`/`Snapshot`. Produce `openStoryStore({projectRoot,identity,fs})`, `store.readGeneration()`, `store.commitGeneration(next,{expectedGeneration})`, and `cacheRetentionDecision({manifest,operation})`. `commitGeneration` writes payload files, checksum-protected generation, flushes required files/directories and atomically switches the manifest pointer; retain the prior valid generation. Startup verifies every referenced payload and fails closed on corrupt pointers.

- [ ] Add failing tests for traversal/symlink identity escape, unsafe root, interrupted rename/fsync, missing payload, wrong checksum, user-only mode and two writers racing expected generation. Inject failure before/after each atomic switch.
- [ ] Run the verifier, implement validated canonical storage under `<projectRoot>/.tmp/gh/<host>/<repository-key>/<issue>/`, then rerun. Keep `base/body.md`, base comment files, working files and conflict/journal data as separate payloads referenced by the manifest. Use content-addressed immutable generation payloads so a crash cannot overwrite a still-referenced base.

```js
await store.commitGeneration(
  { ...initial, dirtyKeys: ['issue:I_test'] },
  { expectedGeneration: 0 }
);
await assert.rejects(store.commitGeneration(initial, { expectedGeneration: 0 }), {
  code: 'STORY_CACHE_GENERATION_CONFLICT',
});
assert.equal(
  cacheRetentionDecision({ manifest: { dirtyKeys: ['issue:I_test'] }, operation: 'purge' }).allowed,
  false
);
```

The fixture's `initial` includes valid schema, resource payload references and checksum inputs. No test creates a fake cloud confirmation.

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

Create `story-cache/writer-claim.mjs`, `handoff.mjs`, `scripts/tests/unit/task-tracker/lib/story-cache/writer-claim.test.mjs` and `handoff.test.mjs`. Integrate `scripts/task-tracker/lib/ownership-policy.mjs`, `scripts/task-tracker/issue-mutator-lock.mjs`, `scripts/task-tracker/fleet-registry.mjs` and session binding APIs; preserve their unrelated read-only semantics.

**Estimate:** 8h; **Size:** M; **Sequence:** 3; **Dependencies:** Task 2.

**Interfaces:** Produce `acquireStoryWriter({identity,human,sessionId,worktree,cachePath,assignment,registry})`, `assertStoryWriter(claim,{sessionId,worktree})`, and `transferStoryWriter({claim,target,store,registry})`. The shared registry contains only claim identity and verified cache path; use native issue-lock ownership for acquire/flush/handoff and retain nested/sibling lock isolation. Remote assignment is checked at acquisition and transition; local staging checks the recorded claim without polling.

- [ ] Test zero/multiple/foreign assignees, two same-login sessions, sibling contexts, stale PIDs, missing shared registry, host changes and unauthorized exported-cache adoption. Verify existing team-unassigned read decisions still behave as before.
- [ ] Implement atomic claim acquisition and explicit handoff: freeze and hash all cache/journal payloads, export/transfer, verify the recipient, then release the old claim. A stale lease or crashed PID cannot authorize stealing dirty work.

```js
await acquireStoryWriter({ ...ownedInput, sessionId: 'author-A', registry });
await assert.rejects(acquireStoryWriter({ ...ownedInput, sessionId: 'author-B', registry }), {
  code: 'STORY_WRITER_OWNED',
});
```

`ownedInput` has exactly one matching assigned human and a complete cache identity; the fake registry is shared by both calls.

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

Create `story-cache/stage.mjs`, `scripts/tests/unit/task-tracker/lib/story-cache/stage.test.mjs`. Modify `scripts/task-tracker/lib/issue-body-mutate.mjs`, `versioned-issue-write.mjs`, `issue-body-push.mjs` if present in the final census, and supported owned-comment command adapters. Inventory actual direct body writers with `rg 'mutateIssueBody|versionedWriteBody|gh.*issue.*edit|updateIssueComment' scripts`; record exclusions for issue creation and the sole transition publisher. Reuse `body-invariants.mjs`, `reviewed-scope/record.mjs` and existing evidence capabilities.

**Estimate:** 6h; **Size:** M; **Sequence:** 4; **Dependencies:** Tasks 1–3.

**Interfaces:** Produce `stageStoryMutation({store,claim,key,mutate,capability}) -> Promise<{status:'staged'|'no-op',generation,dirtyKeys}>`. `mutate` sees the current working block; absent/foreign comments cannot acquire ownership from their heading or author login alone. Split pure invariant validation from provider publication so no legacy direct-write path remains available to routine callers. An explicit publisher-only capability reaches transport from Task 8.

- [ ] Pin marker/section-loss, fabricated proof, reviewed-scope, async mutate, non-string result and foreign-comment behavior before changing adapters. A no-op must not dirty the generation.
- [ ] Implement guarded composite local staging and atomic dirty-tag updates. Stop incrementing old `aitm-body-version` markers as authority; preserve legacy bytes unless a separately governed migration authorizes removal. Migrate callers that expect immediate `ok` to distinguish `staged` from verified published success.

```js
const transport = {
  query() {
    throw new Error('forbidden network');
  },
  write() {
    throw new Error('forbidden network');
  },
};
const result = await stageStoryMutation({
  store,
  claim,
  key: 'issue:I_test',
  mutate: (body) => body + '\nLocal note',
  capability,
});
assert.equal(result.status, 'staged');
assert.deepEqual((await store.readGeneration()).dirtyKeys, ['issue:I_test']);
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

Create `story-cache/timing-stage.mjs`, `scripts/tests/unit/task-tracker/lib/story-cache/timing-stage.test.mjs`. Modify `scripts/task-tracker/gh-timing-comment.mjs`, `lib/actor-timing-state.mjs`, native timing event emitter/queue consumers found by `rg 'postTimingEvent|updateTimingComment|readCanonicalTimingSource' scripts/task-tracker`, `scripts/gh/log-issue-time.mjs` and `lib/move-state/audit-timing.mjs`. Keep canonical row parsing in existing timing helpers; do not add a competing timer clock.

**Estimate:** 10h; **Size:** L; **Sequence:** 5; **Dependencies:** Tasks 2–4.

**Interfaces:** Produce `ingestTimingEvents({store,claim,events})`, `freezeTimingCandidate({generation,transition})`, and `confirmTimingPublication({store,batchId,observation})`. Native events retain event/actor/transition IDs and actual timestamps. Ingestion cursor advances only with persisted local log; publication cursor advances only after verified remote content. Frozen batch state remains independent of both.

- [ ] Test duplicate events, restart between cursor writes, Unknown values, actor changes, backdated rows, pause/resume, absent canonical comment and ambiguous creation. Exercise 1 and 1,000 events with all transports throwing.
- [ ] Route native event append, stage rollups and timing field projections into the local batch. Remove direct fallback body writes and per-row cloud append/retry. Only render the legitimate entry/exit pair for the frozen transition identity.

```js
await ingestTimingEvents({ store, claim, events: [event, event] });
const generation = await store.readGeneration();
assert.equal(generation.timing.ingestedEventIds.length, 1);
assert.equal(generation.timing.publishedCursor, null);
assert.equal(generation.timing.workingRows[0].active, 'Unknown');
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

Create `scripts/task-tracker/lib/estimation/local-evidence.mjs`, `local-runtime.mjs`, `mode.mjs`, `scripts/tests/unit/task-tracker/lib/estimation/local-evidence.test.mjs` and `local-runtime.test.mjs`. Modify `runtime-adapter.mjs`, `rubric-refresh.mjs`, `plan-estimate-authority.mjs`, `scripts/task-tracker/verbs/plan-estimate.mjs` and actual CLI/hook mode dispatch seams.

**Estimate:** 8h; **Size:** M; **Sequence:** 6; **Dependencies:** Task 2.

**Interfaces:** Produce `resolveEstimationMode(cfg) -> {mode:'disabled'|'local'|'unavailable',reason}`, `validateLocalEvidence(bundle)`, `importLocalEvidence({store,bundle})`, and `calculateLocalEstimate({mode,evidence,planInput,model}) -> {status:'disabled'|'unavailable'|'estimated',...}`. Bundle schema is the exact manifest contract in the spec; preserve record envelopes, identity, lineage and provenance values `observed-cloud`, `imported-local`, `derived-local`. Use existing rubric/outcome semantic validators and canonical digesting.

- [ ] Add failing tests for rubric zero/defaulted zero, invalid config, missing/local corrupt lineage, changed selected-plan digest, wrong repository, missing ancestors, empty supported comparables and incomplete outcome timing. Intercept GraphQL/REST/gh/subprocess dispatch before any preflight loader.
- [ ] Implement the pure resolver before transport construction; replace cloud corpus loading in estimate/rubric/comparable call chains with retained payloads. A positive configured rubric ID selects local mode, never a remote fetch. A valid locally derived rubric gets a real valid record ID and retained payload before any forecast references it.

```js
assert.equal(resolveEstimationMode({ estimationRubricIssue: 0 }).mode, 'disabled');
const result = calculateLocalEstimate({
  mode: { mode: 'local' },
  evidence: null,
  planInput,
  model,
});
assert.equal(result.status, 'unavailable');
assert.equal(result.estimate, undefined);
```

`planInput` is parsed using the existing strict WBS schema; missing evidence must refuse before calling `model`.

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
assert.doesNotThrow(() => validateEstimationForecast(legacyV2));
assert.throws(() => validateEstimationForecast(legacyV2, { requireCurrentSchema: true }));
assert.doesNotThrow(() => validateEstimationForecast(localV3, { requireCurrentSchema: true }));
```

Define `legacyV2`/`localV3` from exact versioned fixture envelopes in the test file; mutate only the field under test in each negative case.

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

**Interfaces:** Produce `freezeStoryBatch({generation,transition,effects,capabilities}) -> Batch`, `publishResourceEffects({store,claim,batch,snapshot,ports})`, and `recoverStoryBatch({store,claim,ports,allowMutation:false})`. Each effect has `{key,kind,beforeDigest,intendedDigest,candidate,dependencies,attempted,outcome}` and exact target identity. No counter derived from observed traffic may enlarge the effect manifest. Effects expose `apply(candidate)` and `observe()`; only this publisher has transport capability for routine cached issue writes.

- [ ] Add failing tests for equal ID/different bytes, external comment addition/deletion, ownership drift, before-dispatch persistence failure, timeouts before/after landing, duplicate creation, mutation response missing required fields and confirmed-resource replay. Persist `dispatching` before transport.
- [ ] Implement one complete preflight comparison, one attempted write per declared dirty resource and one bounded read-back only when a complete mutation result cannot supply confirmation. Unknown creation matches remain uncertain. Reject any resource not in the frozen manifest.

```js
await assert.rejects(
  publishResourceEffects({ store, claim, batch, snapshot: withNewForeignComment, ports }),
  { code: 'STORY_SNAPSHOT_CONFLICT' }
);
assert.equal(ports.ledger.mutations.length, 0);
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
const result = await runTransitionBatch({ ctx, store, claim, ports });
assert.equal(result.status, 'confirmed');
assert.equal(ports.ledger.issueBodyWrites.length, 1);
assert.equal(ports.ledger.timingWrites.length, 1);
assert.ok(ports.ledger.statusVerifiedBeforeFinalBody);
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

- [ ] Test staged reviewed-scope changes, absent proof, local edit after approval, same-login competing session, missing cache, remote consumer without local journal and historical rows without completion evidence. Validate async native guard reads before the one complete transition snapshot, not once per marker.
- [ ] Implement mode interception in every real CLI/hook process. Reuse immutable local observations for routine staging; retain independently required native source/edit/commit/lifecycle guards. Source edits are not exempt because estimation is disabled.

```js
assert.equal(
  storyView({ generation: dirtyGeneration, authority: 'working' }).publication,
  'unpublished'
);
assert.equal(storyView({ generation: dirtyGeneration, authority: 'published' }).body, baseBody);
assert.equal(
  timingAuthority({ events: provisionalPair, receipts: [], legacyEvidence: [] }).completedVisits
    .length,
  0
);
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

**Interfaces:** The test ledger captures `{operationId,phase,purpose,resource,target,attempt,outcome,returnedCost,coverage}` at GraphQL, REST, gh and spawned entrypoints. Count layers separately when overlapping; fail any unclassified dispatch. Fixtures fix resource identities and allowances before the first mutation.

- [ ] Write a failing source-shaped regression for the existing child-graph/projection amplification. Baseline only with fully stubbed transport; no live expensive estimate. Report synthetic returned costs separately from the incident's reported observations.
- [ ] Implement the complete matrix with fixed numeric fixtures: minimal owned body+timing+Status has `S=1,G=0,D=3,V=1`, at most eight operations; initial conflict has one snapshot and zero writes; recovery adds at most one observation per uncertain resource plus a fresh declared snapshot/admission boundary before resumed writes.

```js
assert.ok(minimal.ledger.operations.length <= 8);
assert.equal(minimal.ledger.issueBodyWrites.length, 1);
assert.equal(minimal.ledger.timingWrites.length, 1);
assert.deepEqual(runWith1000LocalEdits.resourceWriteCounts, runWith1LocalEdit.resourceWriteCounts);
assert.equal(minimal.ledger.prohibitedHistoryOrChildQueries.length, 0);
```

Each run in these assertions executes the actual offline entrypoint tree. Add full epic fixtures whose independently enumerated `S,G,D,V,U` values and exact effect identities are frozen in test data; do not choose `D` from the observed mutation count. Test one too many inventory pages, oversized streams, new comments during recovery, changed local forecast inputs, delayed writes, partial final vectors and known versus missing costs.

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
assert.equal(consumer.cachePath.startsWith(consumer.projectRoot + '/.tmp/gh/'), true);
assert.equal(consumer.cachePath.startsWith(consumer.packageRoot + '/.tmp/gh/'), false);
assert.equal(consumer.offlineRun('stage-note').remoteOperations, 0);
```

The fixture unpacks the actual package into an isolated consumer and keeps all provider responses offline; use the repository's existing packaging fixture utilities. Do not run `npm publish`.

- [ ] Execute the exact package integration verifier, then the normal fast/slow test, lint and format lanes once for the integrated parent delivery. Childs' targeted tests remain their own evidence; no repeated full suite per grandchild. Record actual clean SHA, outcomes and limitations through native Test/review workflow. Commit docs/help/package assertions with the actual child ID; do not close or merge without separate authority.

**Verification Commands:**

```sh
node --test scripts/tests/integration/task-tracker/lib/story-cache-package.integration.test.mjs
```

## Plan self-review and hydration contract

The specification-to-task map is: native revisions/inventory→1; local cache/retention→2; ownership/handoff→3; local body/comments/invariants→4; timing→5; pure local evidence/rubric→6; forecast lineage/schema→7; publication/conflict/recovery→8; one-body transition/receipts→9; guards/readers/reporting→10; full budgets/adversarial proofs→11; operator adoption/package verification→12. Review Focus items map to the named tests above. Source-level adapter census must be completed in the owning tasks before code changes; every discovered supported writer/consumer receives an explicit route and verifier, not an undocumented exclusion.

Use `npx aitm split-plan 2039 --dry-run --plan docs/superpowers/plans/2026-10-19-2039-local-estimation-transition-cache.md --json` only after the reviewed plan is committed and linked through governed Plan Metadata. Verify all twelve source-grounded Story Intent blocks and their seven semantic questions before the first create. Inspect current native children again immediately before confirmed hydration. `split-plan --confirm` uses sanctioned `create-issue --shape sub-issue`; never use raw issue creation.

Retain confirmed child numbers after any partial creation; inspect before resuming and never rerun the entire set blindly. After creation, record an exact task→child map, source plan commit/section, planned dependency numbers and sequence. Materialize native dependencies/rank through their sanctioned verbs where needed; do not fabricate child refinement, reviewer approval or completed verifiers. Convert #2039 to epic through the governed path when children are attached and keep its planning/orchestration role explicit.

The parent remains in Plan after hydration. SAR acceptance validates this plan's document readiness; it does not approve implementation, satisfy ACs, create Test evidence or authorize Develop. No XPR acceptance is claimed: the separately recorded XPR startup remains blocked.
