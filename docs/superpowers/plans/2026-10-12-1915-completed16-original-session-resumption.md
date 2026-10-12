# #1915 Completed16 Original-Session Resumption Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `executing-plans` to implement this plan task-by-task in the approved owning session. Use `subagent-driven-development` only if the human selects it at the execution handoff. Steps use checkbox syntax; a reviewed plan does not authorize implementation.

**Goal:** An authentic original `moveState` restart at completed16 verifies the existing comment, executes only original dispatch17/cache18, preserves completed1–16 and returns the exact conservative step19-fenced result.

**Architecture:** Add one-use original-call custody, a separate private completed16 resume frame and genuine existing-comment GET custody. Reuse the existing tail programs and resource locks; advance an invocation-bound ordered progress cursor against independently reconstructed snapshots. Keep the resume frame and returned-value comparisons alive through partial reporting and policy finalization, with fresh unverified output on custody/final-comparison refusal.

**Tech Stack:** Existing Node.js ESM scripts, WeakMap/WeakSet custody, AsyncLocalStorage memory quarantine, `node:test`, the authentic native-stage continuation fixture and Markdown. No new package dependency or compiled code.

**Spec:** `docs/superpowers/specs/2026-10-11-1915-completed16-resumption-design.md`, human-approved SHA-256 `55d540975484f12c61c37d6488964d6104b2fb73eb074bcbe90edb5439e963ac`. Approval record: `docs/reviews/1915-completed16-plan-20261012/design-human-approval.md`.

## Scope and story authority

This is the completed16 increment of existing #1915, under #1918/#1855/#1847 and the recovered #1957 repair train. Source baseline is `6a6baf443ad72e58bd21b8e556536a7c3a88e6ad`. Earlier admission and cache-reporting repairs are reused; their historical passes are not new implementation evidence.

The full #1915 story still requires original actor/body/board/comment continuation for completed1–15. This plan deliberately preserves their admission-only frontier. Completed17–24, interrupted17/18 recovery and ambiguous outcomes remain owned by #1923/#1925; exact new event-body authorization remains #1922. Neither this increment nor its reviews complete #1915, #1928, #1957 or #1918.

Live #1915 is Ready for Planning with blocker #1920 and WIP admission still gating formal Plan entry. Prepare/review this source slice under the approved #1918 source-order decision in `2026-10-08-1918-delivery-execution.md`; do not bypass those lifecycle gates or claim a child Plan/Develop receipt. Keep native dependencies, verifiers and issue scope intact. Hydration first enumerates existing issues; this slice proposes four sequential tasks within #1915, with no duplicate issue merely to repeat them. Re-estimate the whole remaining story before lifecycle approval; the governed ≥24h decomposition gate still applies.

## Plan Metadata

- Issue: #1915; immediate parent #1918; ancestors #1855/#1847.
- Priority: P1; existing story size L, rank 6, recorded whole-story estimate 14 hours. That number is stale for approval because this12h slice alone would leave only2h for required1–15 continuation; do not use it to approve the plan or roll up the parent.
- Prospective completed16 slice: 12 joint human/agent hours, including incremental authoring, diagnosis, focused verification and review; excludes historical work and passive CI time. This is a forecast, not an elapsed-time claim or an automatic replacement of the whole-story estimate.
- Tasks: 2.5 + 3.5 + 3 + 3 hours, strictly sequential with one integration owner.
- No parallel fanout: Core, policy, store and fixture custody are one shared protocol.
- Parent/child estimates must be revalidated against actual remaining1–15 work before lifecycle approval; any story forecast at or above 24 hours requires governed decomposition.
- Proposed execution method: native interactive execution by the owning session; human plan approval and execution handoff remain due.

## Story Intent

- **Beneficiary:** delivery owner
- **Capability:** continue an authentic completed16 transition through its original remaining dispatch and active-task checkpoint without replaying prior effects
- **Need:** current original-entry admission recognizes the durable prefix but cannot execute the remaining work safely from historical result data
- **Value or failure prevented:** restarts produce one audited partial outcome while avoiding duplicate publication, stale authority and falsely completed recovery

## Global Constraints

- Admit exact completed16 only, target `test`, frozen empty `STATES.test.onEnter`; retain the sixteen completed readbacks, confirmed board outcome, original transaction and clock.
- Preserve actual source, executor, provider/sid, whole body/stage/resource equality, current guard pipeline and shared interlock. No authority/readiness cache or restored historical result membership.
- Resume admission, existing read and tail require the same `runMemoryContext` activity `stage-write` plus `withMemoryStageEffectQuarantine`; recheck `isMemoryStageEffectScope()` before every leaf/transport boundary. Outside scope refuse before host transport or any tail function.
- Use Node.js scripts and Markdown only; no compiled binaries/addons, dependency addition, generic policy exception, body grant or production activation.
- Keep every file/semantic-section budget at 600000 ms, focused 1200 s and sandbox 45 minutes; at most four isolated native processes. Never delete tests, shrink captures, increase budgets or manufacture receipts.
- Preserve all 253 original static registrations, complete discovery inventories and the captured1..16 map. Source-coordinate changes must retain those inventories.
- Lock order: shared revision interlock; existing-read timing/comment lock released before dispatch17 reacquires it; dispatch lock released before cache18 takes the `activeTask` checkpoint lock. Leaf locks expire in `finally`; comparison custody remains through reporting/finalization.
- All admitted terminal categories return `exit: 4`, `code: 'revision-authority-unavailable'`, `phase: 'native-stage-resume'`, `preparationReason: 'native-source-unavailable'`, `tail: { failures: [] }` without `total`.
- The partial fields describe verified facts through step16 only. New17/18 progress is evidenced by exact independent backend reconstruction and operation trace, never an invented success return or reason.
- Raw GET stdout and whole comment-census equality are memory-only constraints. Changed external metadata, reactions or third-party comments are not silently normalized. Future transports require a separately reviewed/qualified contract; #1923 cannot implicitly enable production transport.
- Every required exact-head Linux/aggregate, child Test/Review, delivery and closure gate remains required. A focused green source slice is not a whole-story or merge receipt.

## Review Focus

- Drift after admission at the actual existing-read boundary must exercise that reader; drift seeded before restart proves only admission refusal. Task1/4 pin this distinction.
- A valid historical actor sid with changed current provider/session/executor must never select the active-task sink. Task1/2 require a fresh actor check at admission and every cache boundary.
- Equal snapshots must not permit a skipped/reverted dispatch operation. Task2/4 require a strictly ordered cursor plus the exact operation trace.
- Leaf cleanup must not expire comparison evidence before reporting, and late accessors must cause zero getter calls and zero subsequent audited reads. Task3/4 pin this lifetime.
- A final policy conflict after verified partial reporting must discard that report and return fresh unverified fields. Task3/4 name and test the owner of this conversion.

## File and interface ownership

No architectural extraction of the large existing modules belongs to this repair. Follow their established private maps, descriptor comparisons and fixed lexical programs.

| File                                                                                  | Exact responsibility                                                                                                                                                                                       |
| ------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `scripts/task-tracker/lib/move-state/move-state-core.mjs`                             | One-use actual restart call, private resume/saga frame, fresh actor checks, read/leaf/report comparison custody, reuse of original tail and pure conservative return construction                          |
| `scripts/task-tracker/lib/criteria-revision/policy.mjs`                               | Original-call admission, ordered execution comparison/final observation under the existing interlock, and conversion of admitted final-policy refusal to a fresh unverified result                         |
| `scripts/task-tracker/lib/criteria-revision/store.mjs`                                | Distinct locked read of completed16 comment/census/resources, genuine read response custody, original17/18 stores accepting only live resume custody, strengthened resume partial-fact resource comparison |
| `scripts/task-tracker/lib/move-state/transition-commit.mjs`                           | New existing-read/parser/result path; original POST/GET and creation-result requirements unchanged                                                                                                         |
| `scripts/tests/integration/task-tracker/lib/native-stage-continuation-fixture.mjs`    | Retain authentic capture1..16; change only ordinal16 expectation; invoke new completed16 controls against real captured state                                                                              |
| `scripts/tests/helpers/native-stage-completed16-resume-controls.mjs`                  | New fixture-only assertions, post-admission fault observers and exact interrupted snapshots/traces; cannot grant production custody                                                                        |
| `scripts/tests/helpers/criteria-revision-transition-profiles.mjs`                     | Additive static classification and original-set inventory for the24 planned wrappers; preserve all existing launch/profile contracts                                                                       |
| `scripts/tests/integration/task-tracker/lib/criteria-revision-completed16-*.test.mjs` | Create only the24 exact wrappers enumerated below, one genuine original capture per file and no substituted adapter                                                                                        |
| `scripts/tests/helpers/native-stage-original-entry-controls.mjs`                      | Preserve the existing pre-admission refusal predicate and all controls unchanged                                                                                                                           |

New interface names below are proposed implementation contracts; they are not already available source APIs. All registration is lexical and private. Exported assertions only compare existing live membership; none registers or returns execution authority from DATA.

- `tryNativeStageOriginalEntry(ctx, restartCall)`: policy boundary additionally validates/consumes the one-use object privately registered by that actual `moveState` call. A call without it cannot execute; direct/overlapping callers cannot steal the live ctx.
- `readExistingTransitionCommit(ctx, input)`: transition module performs the genuine completed-comment GET/parser path; its own private invocation/result maps are distinct from `nativeTransitionCalls`/`nativeTransitionResults`.
- `assertExistingNativeTransitionResult(input, ctx, result)`: comparison-only validation of the actual read/result and retained descriptors.
- `evaluateOriginalNativeStageRestart(ctx, capability, origin, known, handoff)`: policy alone constructs the private handoff; Core validates the actual one-use restart and invokes its no-return `onFrameAdmitted` callback once, exactly at private frame registration. No caller/deps hook or exported frame registrar is introduced.
- `acquireMemoryExistingNativeStageTransition(input)` / `releaseMemoryExistingNativeStageTransition(input)`: proposed distinct store wrappers for the new reader. Acquire validates actual resume/read membership and current authority, then uses existing private `acquireTimingResourceLock`; release validates the same real owner with `releaseTimingResourceLock` in `finally`. Do not call first-entry `stageTimingAuthority` or register a first-entry preparation. Release input is exactly `{backend, token, invocation}`.
- `readMemoryExistingNativeStageTransition(input)`: store's fixed internal completed16 GET/census reader. Exact input is `{backend, capability, context, token, invocation}`; token/invocation must be in the actual resume/read custody, not merely equal DATA.
- Core private `assertCompleted16ResumeCurrent(frame)` checks caller/source/actor/scope/capability/current cursor and actual read/leaf descriptors synchronously. Policy's execution branch calls it before any audited final read.
- Core private `advanceCompleted16ResumeCursor(frame, operationName, expectedBefore, expectedAfter)` binds only the next genuine operation to its reconstructed before/after state. Store's existing lexical operations consume this comparison, not caller-provided snapshots.
- `readMemoryNativeStagePartialFacts(input)` gains a separately branded resume-holder branch. Original preparation-holder branch remains unchanged. Resume branch independently reconstructs the complete history and compares current whole resources/body/stage to the exact landed cursor before deriving/binding partial facts.
- `qualifyCompleted16Resume({t, originalContext, snapshots, captureFiles})` is fixture-only. It consumes actual captured snapshots and calls actual `moveState`; it never creates a production token/frame or replaces the tail/transport.

## Admission, comparison-mode and tail-gate contracts

### Exact admission point and policy handoff

`originalNativeStageEntries` remains the ctx-keyed comparison entry created by
`moveState`. The new one-use call object supplements it specifically to deny an
overlapping same-ctx policy call. It is never exposed on caller ctx, backend,
returned DATA or a public getter.

Admission is the single synchronous registration of the completed16 frame in
Core's new private `completed16ResumeFrames` WeakMap, after: actual-call/policy
membership, independent reconstruction, every existing current guard/source check,
exact16/confirmed-board eligibility, target `test` and frozen empty actions,
fresh actor/provider/sid/executor equality and positive stage scope. No required
check is deferred until after registration. A failed check before this point
uses the unchanged pre-admission exception/refusal contract. Registration occurs
before the existing read. A refusal after this point is caught by the admitted
execution boundary and returns the exact conservative resume record.

Policy creates a frozen, unexported lexical handoff `{restartCall, onFrameAdmitted}`
inside its actual original-entry invocation and stores its identity in the private
`originalStageEntry` record. It passes that handoff as the fifth argument to
`evaluateOriginalNativeStageRestart`. Core compares actual call membership and
policy compares the exact stored handoff pointer; a caller-created callback or
copied tuple cannot qualify. The callback is not a caller ctx/deps override, tail
adapter or public registration API. It returns no authority. Immediately after
Core's private frame registration, Core invokes this actual callback once; policy
first calls Core's no-return frame assertion, then switches its private comparison
mode. Neither module exports a registration function or installs DATA in old maps.

The existing `originalStageEntry.check` closure remains the one check used by
`assertNativeStageOriginalEntryPolicy` (policy243), `originalStageReadState`
(policy250) and the post-evaluate call (policy327). Before admission it compares
the unchanged entry snapshot/authority as today. At frame registration it switches
to Core's exact current invocation/cursor comparison plus unchanged authority;
it must no longer compare new17/18 work to admission snapshot bytes. All three
callers use this same switched closure, including calls during source/leaf checks.

### Resume frame storage and every existing tail gate

Register the opaque new `stageToken` only in `completed16ResumeFrames`, with
`header`, `backend`, `capability`, `context`, cross-checked `actorIdentity`, private
`sagaContext`, original caller/source captures, origin/known comparison inputs,
ordered cursor, and actual `existingReadReturned` input/result/descriptors. Tail
window/running/index/source/leaf fields also belong to this frame. Use a distinct
private `completed16ResumeExecution` AsyncLocalStorage during the lexical resume
execution, and distinct `completed16TailInputs`/`completed16TailLeaves` WeakMaps for
new actual sequence/leaf invocations. Do not put this frame/token into
`nativeStagePreparations`, `nativeStageIntents` or the `nativeStagePreparation`
store. Never set `entryReturned`, `sentinelReturned`, `consistencyReturned`,
`consistencyRead` or `transitionCommentReturned` on a first-entry record.

A private Core resolver selects actual first-entry or completed16 membership;
there is no exported getter that supplies a frame or execution capability. Every
existing gate below gets an explicit discriminated resume branch, with the current
first-entry branch retained unchanged:

| Existing gate                                                                                          | Required completed16 branch                                                                                                                                                                                                               |
| ------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `runNativeStageTail` entry                                                                             | Resolve actual resume execution/frame/saga ctx; require exact16 and genuine `existingReadReturned`, unused sequence window and frozen original function/steps. Do not require first-entry preparation/creation returns.                   |
| `assertNativeStageTransitionContext`, at tail entry and inside `tailCurrent`                           | Recognize only the distinct live resume ALS/frame with matching ctx/token, current caller/source/actor/scope/cursor and genuine existing-read custody. Never call `checkPreparation` or board-result membership for this branch.          |
| `tailCurrent` creation assertion                                                                       | For resume call `assertExistingNativeTransitionResult` and retained result descriptors; for first-entry keep `assertOriginalNativeTransitionResult`. Preserve no-deps/no-repair, task-owner profile and exact original tail-entry checks. |
| `beginNativeStageTailSequence` / `assertNativeStageTailSequenceCurrent`                                | Resolve actual `completed16TailInputs` membership, consume its one-use sequence window and require exact `DEFAULT_TAIL_STEPS`; do not register a copied original sequence.                                                                |
| `tailLeafCurrent`, `beginNativeStageTailDispatch`, `assertNativeStageTailDispatchModule`               | Resolve actual new leaf in `completed16TailLeaves`, compare frame/sequence/ctx/phase and frozen target/actions; keep original leaves in their existing map.                                                                               |
| `runNativeStageTailStep` / `runNativeStageCache`                                                       | Register genuinely invoked new leaf records in the resume map, then execute the existing lexical programs, store operations and cleanup. Original order and step19 host fence remain.                                                     |
| `readNativeStageTailDispatchIntent` / `readNativeStageTailCacheIntent`                                 | Resolve the actual resume leaf, require its frame's new token/backend/context, return only detached header/phase DATA, and retain real operation/result checks.                                                                           |
| `beginNativeStageTailCache` / `assertNativeStageTailCacheCurrent` / private `cacheLeaf`                | Select the actual resume leaf from its distinct map and enforce its unused→running phase, current frame and exact original cache function; retain original leaf lookup for first-entry.                                                   |
| private `currentCacheOperation` / `executeNativeStageCacheOperation`                                   | Resolve the actual resume leaf and its live lexical operation, preserve operation-kind/in-flight/reentry checks and original returned-value custody; never fall back to `originalTailLeaves` for a resume invocation.                     |
| `readNativeStageTailCacheSource`                                                                       | Read the actual resume leaf/frame sources and cross-checked original actor/worktree; recheck before/after current source reads, without any first-entry preparation lookup.                                                               |
| `assertNativeStageTailCacheRead` / `assertNativeStageTailCacheWrite` / `assertNativeStageTailCacheSet` | Resolve actual resume leaf, require exact phase/intent, live current provider/sid/executor and actual frame sink; keep all existing sid/worktree/operation checks.                                                                        |

`session-state.mjs`, `cache-unpark.mjs` and `post-commit-tail.mjs` are read-only
reused leaf/transport contracts in this plan: their actual source programs need no
change because their Core assertion/source rendezvous above receive explicit resume
branches. Verify their original return custody still executes. If implementation
would require a new leaf algorithm or a bypass in those modules, stop for a plan
revision and review rather than widening ownership silently.

### Fixed refusal classification

The outcome below is decided by the registration event, never learned by pinning
whatever the new implementation happens to return:

| Control and injection point                                                                                                                      | Fixed expected class                                                                                                                                                                                        |
| ------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Direct/overlapping exported policy call, copied/absent actual-call object                                                                        | Pre-admission existing refusal; no resume phase/new effect.                                                                                                                                                 |
| Source/caller/guard-pipeline failure, actor/provider/sid/executor mismatch before frame registration                                             | Pre-admission existing refusal; old helper predicate unchanged.                                                                                                                                             |
| Completed16 wrong target/changed actions; missing stage scope at registration                                                                    | Pre-admission existing refusal before read/intent; no resume phase.                                                                                                                                         |
| Completed17–24, incomplete/unknown/compensated or otherwise ineligible input                                                                     | Pre-admission refusal; valid1–15 positive admission-only results are separately unchanged.                                                                                                                  |
| Envelope-only drift, duplicate/changed/missing comment, census/whole resources injected at the genuine existing-read boundary after registration | Admitted exact resume result, fresh unverified partial when read/report custody is unavailable; no17 intent.                                                                                                |
| Actor/provider/sid/executor, source/caller or scope drift after registration, including cache boundaries                                         | Admitted exact resume result; precise landed snapshot/trace and conservative current facts only.                                                                                                            |
| Late request/response/result/cache accessor after registration or leaf cleanup                                                                   | Admitted exact unverified record, getter count0 and no subsequent audited report/final reads.                                                                                                               |
| Skipped/reverted/duplicate execution cursor inside actual resumed call                                                                           | Admitted exact refusal; retain precise landed state, no next unauthorized operation.                                                                                                                        |
| Any failBefore/failAfter existing-read or17/18 operation                                                                                         | Admitted exact record; read faults have no17 intent, later faults preserve their exact landed vector.                                                                                                       |
| Post-evaluate check, final full comparison or final source assertion refusal                                                                     | Admitted fresh unverified record even if a verified partial was computed.                                                                                                                                   |
| Direct external reader/leaf/result assertion with copied/expired token/result or outside scope                                                   | That API throws its existing typed refusal before effects; it is not an actual admitted `moveState` result. The equivalent in-flight substitution inside an admitted call is caught as the admitted record. |

## Implementation Tasks

### Task 1: Establish exact original-call and existing-read custody

#### Story Intent

- **Beneficiary:** delivery owner
- **Capability:** authenticate the current existing transition comment without republishing it
- **Need:** the current POST/GET result requires a fresh creation capture and historical parsed data has no live custody
- **Value or failure prevented:** a restart cannot duplicate publication or select a sink using fabricated historical membership

**Files:** Core around `moveState`/`evaluateOriginalNativeStageRestart` (430–549); policy `tryNativeStageOriginalEntry` (257–340); store transition section (3568–3769); transition module read/result sections (121–240, 434–490); fixture known-prefix section (3175–3374); create the new helper above. Verify coordinates against the execution HEAD before editing.

**Consumes:** Real completed16 from the existing captured map, live caller descriptors, fresh guard evaluation, reconstructed original header/operation, held capability and private stage scope.
**Produces:** One-use call validation; separate live resume/read custody; verified current GET result or conservative admitted refusal; no17/18 effect release yet.

- [ ] **Step 1: Write the genuine RED and exact-result assertions.** In the existing known-prefix-entry case retain the loop and every1–15 assertion, but branch only ordinal16 to the final expected contract. Keep the old ordinal16 unavailable/unchanged/fixed-read assertions as recorded RED evidence. Keep `qualifyOriginalEntryRefusals` and the complete map unchanged. Define these fixture-only assertion helpers:

```js
function assertResumeResult(actual, partial) {
  assert.deepEqual(actual, {
    exit: 4,
    code: 'revision-authority-unavailable',
    phase: 'native-stage-resume',
    preparationReason: 'native-source-unavailable',
    tail: { failures: [] },
    ...partial,
  });
}
function unverifiedPartial() {
  return {
    itemId: '',
    boardMoved: false,
    sentinelPresent: false,
    transitionCommitPresent: false,
    transitionCommitId: null,
    progressVerified: false,
  };
}
const selected = snapshots.get(16);
const backend = createRevisionMemory(selected);
const result = await moveState({ ...originalContext, revisionBackend: backend });
assertResumeResult(result, unverifiedPartial());
assert.deepEqual(
  backend.snapshot.nativeStageRecords.at(-1).steps.slice(0, 16),
  selected.nativeStageRecords.at(-1).steps
);
assert.deepEqual(captureFiles(), beforeFiles);
```

`beforeFiles` is captured immediately before this actual call. At this first checkpoint the result may remain unverified because tail/report release is not yet complete; Task3/4 replace only that new positive expectation with verified facts. Do not replace final design assertions with a permanently unverified shortcut.

- [ ] **Step 2: Run RED.** `node --test --test-concurrency=4 scripts/tests/integration/task-tracker/lib/criteria-revision-known-prefix-entry.test.mjs`. Current source must fail on the new return contract/remaining execution requirement; retain the original observed fields and snapshot/trace. This is a future implementation command, not a passing receipt asserted by this plan.
- [ ] **Step 3: Implement private one-use call custody and the distinct reader.** Register the call object inside `moveState`, pass it only to the lexical policy call, consume it once, and remove it in the same call's `finally`. Run existing source/guard checks before creating a separate frame. Refuse non16, changed target/actions, actor mismatch or missing scope before the read. Derive a private saga context from reconstructed operation fields; never assign generated fields to captured caller ctx. Bind the expected original identity to fresh `currentSessionId()`/`aiAppName()` and executor at frame admission. Do not populate first-entry or creation maps.

For the store reader, retain exact descriptors and lock ownership, reconstruct completed16 with `reconstructNativeStageTransitionComment`, select exactly one current native comment, and compare this concrete envelope plus entire census/resources before registering its genuine returned result:

```js
const response = { stdout: actual.bytes, stderr: '', exitCode: 0 };
if (
  canonicalRecordJson(response) !== canonicalRecordJson(step.readback.read.response) ||
  canonicalRecordJson(currentCensus) !== canonicalRecordJson(step.readback.census) ||
  canonicalRecordJson(currentResources) !== canonicalRecordJson(reconstructed.afterResources) ||
  canonicalRecordJson(currentBody) !== canonicalRecordJson(reconstructed.body) ||
  currentStage !== reconstructed.stage
) {
  throw new TypeError('completed16-existing-read-current');
}
```

Here `actual`, `currentCensus`, `currentResources`, `currentBody` and `currentStage` are current private-store values under the timing lock; `step` is journal index15, `reconstructed` is the independently derived completed16 record. This comparison is not a transport adapter or a public authorization predicate. Invoke the actual fixed GET/parser route and retain its actual response/result descriptors. Use a new read-only audit label `native-stage-existing-transition-read`, never the old step16 mutation/readback label. Release the timing lock in its own `finally`, while retaining comparison custody under the shared interlock. Do not POST, persist a new step16 intent or change its readback.

- [ ] **Step 4: Add post-admission read controls.** Refuse envelope-only drift with identical body, duplicate/changed/missing comment and incompatible census/resources at the new reader boundary. The fixture uses its existing isolated-process descriptor/clone/AsyncLocalStorage observation patterns to observe the genuine internal read invocation after admission, then arm a one-shot fault against the actual response or live resource capture. A cloned `backend.snapshot` cannot mutate the private store: do not claim such an edit exercises the reader. Capture current resources only from a genuine in-flight store clone boundary and mutate only after the observer proves the existing-read invocation. Restore every global observer in `finally`; no production fault hook, injected tail or fabricated membership is added. Assert the observer fired, admitted `native-stage-resume`, no step17 intent, no POST and zero getter invocations. Keep pre-admission cases under their original predicate.
- [ ] **Step 5: Run focused custody/first-entry checks.** Run the known-prefix-entry file plus `node --test --test-concurrency=4 scripts/tests/integration/task-tracker/lib/native-stage-transition-native.test.mjs scripts/tests/integration/task-tracker/lib/native-stage-transition-result-custody.test.mjs scripts/tests/integration/task-tracker/lib/native-stage-transition-request-accessor.test.mjs scripts/tests/integration/task-tracker/lib/criteria-revision-transition-custody.test.mjs`. These are the actual existing original transition/custody verifiers; retain their complete cases.
- [ ] **Step 6: Commit this independently checked checkpoint.** Stage only the owned files changed in this task; use `[#1915]` subject. Report read custody established with tail continuation still unfinished. Do not mark an issue AC/DoD or delivery receipt.

### Task 2: Execute original17/18 with ordered progress and lock handoffs

#### Story Intent

- **Beneficiary:** delivery owner
- **Capability:** execute the remaining original dispatch and checkpoint once under current authority
- **Need:** an admission-only snapshot check rejects valid landed progress and historical actor data cannot authorize the checkpoint sink
- **Value or failure prevented:** genuine continuation cannot skip operations, replay completed writes or update another session's checkpoint

**Files:** Core `tailCurrent`/`runNativeStageTailStep`/`runNativeStageTail`/`runNativeStageCache`; policy execution branch; store original dispatch/cache sections (3769–3945, 4385–4581); existing fixture/new helper. Consume Task1's private frame/read result; produce original17/18 landed history and a comparison cursor retained through reporting.

- [ ] **Step 1: Add full positive snapshot and trace RED.** From authentic captured16 run actual `moveState`, require exactly18 read-back steps, identical first16 records/header/original clock/comment identity, expected active-task memory bytes and no19 intent. Derive expected17/18 using the existing `reconstructNativeStageTailDispatch` and `reconstructNativeStageTailCache` codecs from the actual lexical original program captures; never mint tokens from that expected DATA. Assert original leaf execution in addition to decoded state.

The mutating/readback operation trace must contain exactly this ordered sequence once; independently retain the complete audited trace too:

```js
const newStageOperations = [
  'native-stage-tail-dispatch-intent-write',
  'native-stage-tail-dispatch-intent-readback',
  'native-stage-tail-dispatch-execution',
  'native-stage-tail-dispatch-readback',
  'native-stage-cache-intent-write',
  'native-stage-cache-intent-readback',
  'native-stage-cache-effect-write',
  'native-stage-cache-effect-readback',
];
assert.deepEqual(
  backend.effects.filter((name) => newStageOperations.includes(name)),
  newStageOperations
);
assert.equal(
  backend.effects.filter((name) => name === 'native-stage-existing-transition-read').length,
  1
);
```

Filtering this one ordered subsequence is not the complete trace check: separately compare the entire read/audit sequence, reject every undeclared write/POST and compare the whole backend snapshot. Expected audit ordering is pinned from the reviewed lexical program and genuine clean execution, then fixed in the test; do not derive expected output from the same run under test.

- [ ] **Step 2: Run RED through the original known-prefix-entry verifier.** Task1 must not already release tail effects. Verify failure is lack of actual17/18 execution, not a fabricated header/custody mismatch.
- [ ] **Step 3: Add every discriminated resume gate in the contract table above.** `tailCurrent` accepts either its current first-entry frame or the separate completed16 frame; leave first-entry creation/board/sentinel checks unchanged. Reuse `runPostCommitTail`, frozen `DEFAULT_TAIL_STEPS`, original dispatch/cache programs, current operation/result comparison and existing lexical cancellation. Recheck positive memory scope before any tail function; never fall through to the host repair branch. Read lock is already released; dispatch releases its timing lock before cache takes `activeTask`. Keep expected actor bound to fresh provider/sid/executor at every cache boundary. Original sid/root/read/set operations continue selecting only that cross-checked memory sink.
- [ ] **Step 4: Switch the single policy check closure at the exact registration event and implement the ordered cursor.** The policy's `originalStageEntry` record gains a private execution branch, registered only from the actual completed16 frame after guards. Before each genuine operation derive and seal its exact expected before/after journal/body/stage/resource vector. A private cursor stores invocation, index, expected next operation and last genuine landed vector. Existing store lexical operations advance it only on their actual intent/effect/readback boundaries. Assert authority, descriptors, scope and exact current state before accepting that advancement; identical snapshots at two dispatch boundaries do not remove the index/name check. Fail-before leaves the prior cursor; fail-after retains the actually landed vector because mutation precedes the injected throw. No caller-selected index/baseline, unordered snapshot set or public register function is allowed.
- [ ] **Step 5: Exercise actor/scope/order/lock RED-to-GREEN controls.** Changed provider/sid/executor before cache and at its boundaries must refuse before the checkpoint mutation. Direct/overlapping policy calls, missing/expired/copy tokens and outside-scope reader/tail calls must not reach a leaf or host transport. Require skipped/reverted/duplicate cursor refusal. Use the fixture-only lock observer defined below to record actual acquire/release call ordering on the same live backend. Clean dispatch17 reacquisition proves the read lock was released. Do not claim a later restart can reacquire locks after an interrupted prefix, or use a new backend/constructed token as proof.
- [ ] **Step 6: Run the exact known-prefix-entry, dispatch/cache-boundary and original cache/native-tail commands in the ledger; commit only the task's exact changed files with `[#1915]`.** At this checkpoint report genuine17/18 source continuation with final partial/report qualification still due; no success or whole-story completion claim.

### Task 3: Bind current partial facts and own final-policy refusal output

#### Story Intent

- **Beneficiary:** delivery owner
- **Capability:** receive only currently verified partial facts after resumed work or a refused final comparison
- **Need:** existing partial reads derive journal facts without comparing landed current resources, and old policy finalization throws on legitimate progress
- **Value or failure prevented:** stale verified reports and late substitutions cannot conceal a conflict or trigger extra audited reads

**Files:** Core partial-holder/result cleanup/reporting sections; store `readMemoryNativeStagePartialFacts` (4583–4675); policy finalization (315–338); fixture/new helper. Consume the live Task2 frame/cursor and genuine read/cache returns; produce the exact four-category result with complete current resource proof.

- [ ] **Step 1: Add exact fourth-category RED.** Cause final policy authority/resource refusal after a genuinely verified partial report and require `assertResumeResult(result, unverifiedPartial())`. Confirm no stale item/comment/progress value survives. Observe the final boundary rather than pre-admission drift. Add late existing-read/cache result accessor substitutions after leaf cleanup and before reporting; assert getter count0 and no subsequent reporting/final-policy audited read.
- [ ] **Step 2: Introduce distinct resume report membership.** Core registers only its actual lexical partial-report invocation in a separate private map. It cancels/joins all running work first, retains frame/read/leaf comparisons, checks all descriptors synchronously before the first audited reporting read and expires report membership after the returned facts are consumed. The original preparation-holder map/assertion is unchanged. No restored original holder or journal DATA grants current report authority.
- [ ] **Step 3: Strengthen the store's resume branch.** Independently `observeRevision` and reconstruct the complete native history under the held capability, accepting only `pending-native-stage` and the exact actual last cursor, including incomplete17 and legitimate before/after-cache18 states. Compare current whole body/stage/resource vector with that reconstruction and retained cursor before `deriveRecordedNativeStagePartialFacts({journal})`; snapshot stability alone is insufficient. Bind the genuine returned facts to this actual input/current check and recheck before Core consumes them. Retain the existing original branch intact.
- [ ] **Step 4: Give policy finalization explicit output ownership.** For this admitted execution branch only, policy synchronously asks Core to recheck retained caller/read/leaf descriptors before any final observation. If custody is already refused, skip further audited reads. The admitted catch boundary includes the post-evaluate switched `check()` at policy327, the full-final-observation comparison at policy330 and `core.assertOriginalNativeStageEntrySources(ctx)` at policy332. Otherwise re-observe/reconstruct full history and compare pending status, unchanged authority and the exact last landed cursor. Do not use the known1–16 decoder or arbitrary current bytes as baseline. If that final comparison refuses, policy discards the computed verified partial and returns a newly allocated pure DATA unverified result via a Core helper; it does not propagate the original admission-only `revision-conflict` throw for this admitted category. Pre-admission and1–15 throwing behavior remains unchanged. Core's fresh failure constructor is:

```js
function freshCompleted16UnverifiedResult() {
  return {
    exit: 4,
    code: 'revision-authority-unavailable',
    phase: 'native-stage-resume',
    preparationReason: 'native-source-unavailable',
    tail: { failures: [] },
    itemId: '',
    boardMoved: false,
    sentinelPresent: false,
    transitionCommitPresent: false,
    transitionCommitId: null,
    progressVerified: false,
  };
}
```

Policy may call an exported pure DATA factory of this exact shape; it is not an authority API. Establish the admitted branch before its catch boundary and catch without reading any thrown object's property/accessor. Final synchronous cleanup expires call/frame/read/leaf/report membership only after cancellation and policy finalization have finished. Cleanup performs no new audited policy/report reads.

- [ ] **Step 5: Qualify all four terminal categories and each of those three final throw sites.** Clean completed18 then fence19; admitted refusal before17; each interrupted17/18 boundary; and report/final-policy refusal. Verified prior16 facts are allowed only if current report reconstruction and final comparison pass. Derive expected prior facts from the authentic retained journal using the existing pure partial-fact codec; assert all fields and exact current snapshot/trace. Unverified cases use a fresh object; never a previously computed partial reused after refusal.
- [ ] **Step 6: Run known-prefix-entry, the exact partial-report command below and cache-late-read, then commit the exact task files with `[#1915]`.** Do not weaken their fixed-read/getter assertions or emit lifecycle evidence from scoped passes.

### Task 4: Complete authentic fault qualification and delivery evidence

#### Story Intent

- **Beneficiary:** delivery owner
- **Capability:** distinguish real continuation from admission-only or incomplete recovery through exhaustive genuine boundary checks
- **Need:** the same conservative return record can otherwise hide missing work or a wrongly advanced cursor
- **Value or failure prevented:** independently observed snapshots, traces and preserved cases prevent false green delivery

**Files:** Existing known-prefix fixture, new completed16 helper, existing discovery/source-coordinate verifiers if coordinates change, and review/evidence Markdown. No source feature beyond the accepted contract is added here.

- [ ] **Step 1: Complete the existing ordinal16 expectation transition.** Require verified prior16 facts on the clean positive, exact18 snapshot/resources and full trace. Retain unchanged1–15 expectations, `1..16` completeness, all original refusal controls/full map, and physical `captureFiles()` equality for every ordinal. The active-task byte delta is in `nativeStageResources.local.activeTask`; real physical files remain unchanged.
- [ ] **Step 2: Use the existing backend fault setters for all18 interruptions: the16 listed17/18 boundaries plus failBefore/failAfter on `native-stage-existing-transition-read`.** Do not add fault keys to `createRevisionMemory` input or edit its opaque cloned snapshot as if it were live state:

```js
const newStageOperations = [
  'native-stage-tail-dispatch-intent-write',
  'native-stage-tail-dispatch-intent-readback',
  'native-stage-tail-dispatch-execution',
  'native-stage-tail-dispatch-readback',
  'native-stage-cache-intent-write',
  'native-stage-cache-intent-readback',
  'native-stage-cache-effect-write',
  'native-stage-cache-effect-readback',
];
for (const when of ['failBefore', 'failAfter']) {
  for (const operation of ['native-stage-existing-transition-read', ...newStageOperations]) {
    await t.test(`${when}:${operation}`, async () => {
      const backend = createRevisionMemory(snapshots.get(16));
      backend[when] = operation;
      const beforeFiles = captureFiles();
      const result = await moveState({ ...originalContext, revisionBackend: backend });
      assert.equal(result.phase, 'native-stage-resume');
      assert.equal(result.exit, 4);
      assert.deepEqual(captureFiles(), beforeFiles);
    });
  }
}
```

Extend each concrete test with the complete exact return assertion, full snapshot and complete trace expected for that boundary. Pin the expected prefix independently from actual journal codec/program semantics: fail-before intent leaves16; fail-after dispatch intent leaves pending17; readback completion yields completed17; cache intent leaves pending18; effect-write changes only active-task bytes; effect-readback completes18. Preserve landed mutation before a fail-after exception, original clock/header/first16 and pending status. Subsequent execution from completed17/18 or incomplete/unknown states must remain excluded. Verify actual release call ordering and in-call read-lock reacquisition through the observer below; verify report custody retained/expired. No private lock-state or post-interruption reacquisition claim is inferred from a fresh backend.

- [ ] **Step 3: Complete the negative matrix.** Post-admission envelope/census/resource refusals from Task1; current actor/provider/sid/executor at Task2 boundaries; late request/response/result/cache accessors after lexical leaf cleanup; source/caller drift; direct/overlapping policy calls; copied/expired inputs; non-`test` target/changed actions; skipped/reverted cursor; unknown/compensated prefixes; missing stage scope. Distinguish pre-admission exception controls from admitted exact-return controls. Assert no new unauthorized intent/write/POST, no getters and precise landed snapshot/trace in every admitted case.
- [ ] **Step 4: Run the original verification set without increasing budgets.** First the named known-prefix-entry test, then the source-owned dispatch/cache/partial and ordinary regressions in the command table below. Run original full recovery/vertical cases too and record inherited failures with #1923/#1925/#1918 ownership; do not filter them out or count them as passes. Maintain the253 original registration set and complete GraphQL/timing inventories when refreshing coordinates. Stop on a budget breach and correct the regression; do not extend timeouts.
- [ ] **Step 5: Commit and push exact reviewed implementation/evidence, then get one fresh final source review at the exact HEAD.** Resolve required findings and rerun affected verification. Required full Linux/aggregate checks and normal AITM Test/Review/delivery/close remain gates. If later repairs still make those checks red, preserve the branch/PR and truthful pending lifecycle state; do not merge or close this whole story.

## Fixture observations and budgeted file layout

### Lock observation without fabricated authority

The new fixture helper wraps `Object.getOwnPropertyDescriptors` using the existing
fixture probe pattern, delegates unchanged to the original intrinsic, and observes
only actual store acquire/release validation stacks. Capture the actual DATA
`backend`, `token`, `invocation` identities from returned descriptors without
reading getters. Filter stack frames to the exact current store file and functions
`acquireMemoryExistingNativeStageTransition`, `acquireMemoryNativeStageTailDispatch`,
`acquireMemoryNativeStageCache` and their actual release counterparts; the distinct
existing-read wrapper must reuse the private timing-lock mechanism without the first-entry `stageTimingAuthority` predicate. The reader acquires through its new wrapper; the wrapper itself uses the unchanged private lock function. Record each unique
actual validation input/function pair and compare token/invocation pairs; do not
mint or invoke a lock input. Restore the intrinsic in `finally`.

Assert observed read release precedes dispatch acquire, dispatch release precedes
cache acquire, and each actually acquired resource has its own release call before
resume frame teardown, including refused reads and interrupted leaves. Clean
in-call dispatch acquisition is the behavioral read-lock reacquisition oracle.
Observe only real acquired locks: refusal before acquisition must not manufacture
a release. The observer proves call ordering on real runtime inputs, not private
lock contents or successful reacquisition after an excluded interrupted restart.
Review the unchanged synchronous store release implementation, which validates the
same owner then clears its slot. Retain its existing unit release tests. Do not
claim a fresh `createRevisionMemory` proves release; do not add a production lock
inspection/fault export. This narrows the old impossible follow-up-reacquisition
claim while preserving lock ordering/cleanup obligations.

### Exact final-policy fault observations

Use fixture-only descriptor/structuredClone probes as already used for source and
late result controls. Arm only after the actual resume partial return is produced:
recognize its getter-free result with progressVerified/step16 facts at the real
clone/freeze boundary and retain the original return identity. Do not construct a
replacement member. Then independently exercise: (a) post-evaluate policy327 by a
one-shot `replaceAuthority` update on the same actual backend after that boundary;
(b) policy330 by a fixture-only substitution of the genuine final observation/history read DATA after the switched snapshot/authority check passes, without changing backend.snapshot or authority: the independent final reconstruction differs while the cursor check remains valid; and (c) policy332 by a physical config-source change armed at that final Core source-assertion descriptor boundary, after the policy330 comparison. Filter the exact source-file/call-site stack to distinguish this assertion from earlier repeated checks; do not inject at a generic earlier clone. Existing physical-file
probe patterns save and restore exact bytes in `finally`. Every control must prove
its named observer fired and that no earlier gate short-circuited it. Assert fresh
unverified output and complete exact trace; a pre-admission mutation is not proof.
Late result accessors instead fire at the retained actual return descriptor after
leaf cleanup; the getter must not run and no subsequent audited reads run.

### Preselected native-process layout

Keep `criteria-revision-known-prefix-entry.test.mjs` as the complete existing1..16
capture/control plus single clean completed16 positive. Move new faults/negative
clusters into new statically registered #1915 wrapper files, using an additive
`completed16-resume` mode in the existing fixture. That mode retains the complete
authentic capture1..16 and invokes only its declared new control, rather than
stacking the entire new matrix inside the existing file. At the top of `registerNativeStageCase`, save the third argument as `resumeVariant` when mode is `completed16-resume`, set `fault = null` for the authentic original capture, and map this mode to `known-prefix-inputs`. After capturing the genuine1..16 map, pass only `resumeVariant` to the new controls helper. Thus the requested resume fault cannot interrupt the original capture. No old case/capture or
assertion is removed. The third registration argument is a flat literal descriptor
with `when` and `suffix`, following existing fault registration/discovery shape.

Create18 interruption wrappers named
`criteria-revision-completed16-{read|dispatch|cache}-{boundary}-{failBefore|failAfter}.test.mjs`:
read has boundary `read`; dispatch has `intent-write`, `intent-readback`,
`execution`, `readback`; cache has `intent-write`, `intent-readback`, `effect-write`,
`effect-readback`. Their static mode is `completed16-resume`; suffix is the exact
operation name above, and when is the literal fault setter. Create six negative
cluster wrappers `criteria-revision-completed16-{read-controls|entry-controls|actor-scope-controls|cursor-controls|late-report-controls|final-policy-controls}.test.mjs`,
using the same static mode, `when: 'control'` and a literal `suffix` selecting that fixture-only
control group. All wrappers/helpers carry `// @story #1915` and use the existing
`registerNativeStageCase` import. The registration passes no callback/capability.

Extend the original AST classifier/profile inventory additively for these24 fixed
registrations and the new helper; retain the complete original253 filename set and
all existing GraphQL/timing site inventories. Expected additive total is277, with
explicit original-set inclusion and24 descriptor matches; changing a count alone
is not qualification. `criteria-revision-transition-profiles.mjs` continues to
launch genuine original cases, not replacement adapters.

Run the new wrappers in these two fixed12-file batches, each with
`node --test --test-concurrency=4` and the integration directory prefixed to every
filename. Expand both `failBefore` and `failAfter` for each fault pair; the lists
are a closed filename specification, not a glob that can silently miss a case:

- Batch A: `criteria-revision-completed16-read-read-{failBefore|failAfter}.test.mjs`;
  `criteria-revision-completed16-dispatch-{intent-write|intent-readback}-{failBefore|failAfter}.test.mjs`;
  `criteria-revision-completed16-cache-{intent-write|intent-readback}-{failBefore|failAfter}.test.mjs`;
  `criteria-revision-completed16-read-controls.test.mjs`;
  `criteria-revision-completed16-entry-controls.test.mjs`.
- Batch B: `criteria-revision-completed16-dispatch-{execution|readback}-{failBefore|failAfter}.test.mjs`;
  `criteria-revision-completed16-cache-{effect-write|effect-readback}-{failBefore|failAfter}.test.mjs`;
  `criteria-revision-completed16-actor-scope-controls.test.mjs`;
  `criteria-revision-completed16-cursor-controls.test.mjs`;
  `criteria-revision-completed16-late-report-controls.test.mjs`;
  `criteria-revision-completed16-final-policy-controls.test.mjs`.

Each wrapper/file retains600000ms, each batch1200s and the overall sandbox45min.
Capture timing for both batches; never raise those values. If full authentic
capture plus a cluster exceeds the existing file budget, split that cluster into
more genuine wrappers and re-review its inventory/batch partition before code
continues. This is a plan revision, not case filtering or a budget increase.

## Verification command ledger

The existing filenames below were inspected during plan generation. No command result here is an implementation receipt. Each future verifier must run against the exact clean implementation HEAD, with actual counts/failures recorded.

| Purpose                                            | Command and expected disposition                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| -------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Genuine captured1..16 and new completed16 behavior | `node --test --test-concurrency=4 scripts/tests/integration/task-tracker/lib/criteria-revision-known-prefix-entry.test.mjs` — RED at current admission-only source; GREEN only after all new exact snapshot/trace/return cases and unchanged old controls pass                                                                                                                                                                                                                                                                         |
| Original dispatch/cache and lock/data boundaries   | `node --test --test-concurrency=4 scripts/tests/unit/task-tracker/lib/criteria-revision/native-stage-known-prefix-boundary.test.mjs scripts/tests/unit/task-tracker/lib/criteria-revision/native-stage-cache-boundary.test.mjs scripts/tests/unit/task-tracker/lib/criteria-revision/interlock.test.mjs` — retain all original cases                                                                                                                                                                                                   |
| Existing original cache and late-custody paths     | `node --test --test-concurrency=4 scripts/tests/integration/task-tracker/lib/criteria-revision-cache-native.test.mjs scripts/tests/integration/task-tracker/lib/criteria-revision-cache-late-read.test.mjs scripts/tests/integration/task-tracker/lib/criteria-revision-cache-late-config.test.mjs` — no regression/extra late reads                                                                                                                                                                                                   |
| Original-entry/transition/policy regressions       | `node --test --test-concurrency=4 scripts/tests/unit/task-tracker/lib/move-state/move-state-core.test.mjs scripts/tests/unit/task-tracker/lib/criteria-revision/policy.test.mjs scripts/tests/integration/task-tracker/lib/criteria-revision-transition-custody.test.mjs scripts/tests/integration/task-tracker/lib/criteria-revision-local-transition-tail.test.mjs` — no weakened pending/host fences                                                                                                                                |
| Current partial/report/final-policy regressions    | `node --test --test-concurrency=4 scripts/tests/integration/task-tracker/lib/criteria-revision-partial-reporting.test.mjs scripts/tests/integration/task-tracker/lib/criteria-revision-partial-16.test.mjs scripts/tests/integration/task-tracker/lib/criteria-revision-partial-late-input.test.mjs scripts/tests/integration/task-tracker/lib/criteria-revision-partial-final-source.test.mjs scripts/tests/integration/task-tracker/lib/criteria-revision-partial-final-authority.test.mjs` — preserve old fixed-read/custody checks |
| Required live issue recovery verifiers             | `node --test --test-concurrency=4 scripts/tests/integration/task-tracker/lib/native-stage-recovery-from-comment.test.mjs scripts/tests/integration/task-tracker/lib/native-stage-complete-saga.test.mjs` — preserve complete cases; inherited unfinished tail/ambiguous failures stay explicit                                                                                                                                                                                                                                         |
| Full repository gates                              | `npm run lint`; `npm run format:check`; `npm test`; `npm run test:slow`; `node scripts/maintenance/verify-ci-receipts.mjs` — required exact-head CI and normal workflow receipts, not replaced by the focused ledger                                                                                                                                                                                                                                                                                                                   |
| Independent original case inventory                | `node --input-type=module -e "import {discoverOriginalCases} from './scripts/tests/helpers/criteria-revision-transition-profiles.mjs'; console.log(discoverOriginalCases().length)"` — retain every baseline registration, not just a count; baseline253                                                                                                                                                                                                                                                                               |

The live issue's vc:1 additionally names `criteria-revision-transition-recovery.test.mjs`, which does not exist at this source HEAD. This is an inherited declaration gap, not a test pass. Before any lifecycle evidence stamp, repair that declaration through the sanctioned issue-body transaction to name the genuine known-prefix-entry, recovery-from-comment and native-complete-saga cases; preserve all full-suite and later-recovery obligations. Do not create a replacement empty file, silently skip the command or weaken its intended coverage. The existing child's binding/dependency gates must permit that transaction; this source-preparation plan does not fabricate it.

## Four design-XPR suggestions: plan coverage

| Suggestion from review27134                 | Concrete plan obligation                                                                                                                                                          |
| ------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Inject comment-read refusal after admission | Task1 Step4 and Task4 Step3 require observed genuine existing-read boundary, real underlying response/resource mutation and admitted exact return; old refusal helper unchanged   |
| Name final-policy refusal output owner      | Task3 Step4 makes the private policy execution final validation branch discard verified partial and return the fresh unverified Core DATA factory; pre-admission throws unchanged |
| Strengthen current partial-fact resources   | Task3 Step3 independently reconstructs full landed history/resources and compares actual current vector before binding facts; journal-only stability is insufficient              |
| Preserve memory-only equality constraint    | Global Constraints retain exact raw envelope/whole census; no production or future-transport relaxation under this plan                                                           |

## Reviews, deep dive, hydration and execution stop

The invoking Codex session writes and self-checks this plan, then remains author for a genuine distinct-session Astra6 HIGH SPR and a genuine Claude Opus5.5 HIGH XPR. Record every finding, author disposition, revision, genuine acceptance/finalization and phase timing. Commit all collateral and link immutable accepted plan/reviews to the correct story through sanctioned issue operations only when its binding/lifecycle gates permit.

After accepted plan reviews, independently deep-dive plan plus approved spec and current source/issue tree. Material divergence requires revising and re-reviewing. Enumerate #1915's existing children/dependencies and the existing #1918 repair train before hydration. This completed16 contract has no safe parallel sub-project: keep tasks sequential, rank6 native ownership and one integration owner; no new issue is justified solely to repeat these tasks. Update forecasts using joint effort and actual remaining scope, without copying historical time or passive CI into productive estimates.

Human plan approval and normal formal Plan/Develop preparation remain required, followed by the selected execution-method handoff. Stop before implementation. Design approval, agent review consensus, source preparation under #1918 and child lifecycle approval are distinct records.
