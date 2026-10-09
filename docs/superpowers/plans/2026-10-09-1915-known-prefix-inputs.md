# #1915 Known Early Prefix Inputs Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans inline with one fresh final reviewer. Continue the accepted #1918 parent source execution in the existing worktree.

**Goal:** Independently recognize the exact completed early1–16 resource/body/stage prefixes needed by genuine original-entry recovery.

**Architecture:** Reuse every original native prefix codec and immutable header. Detach closed input DATA before awaiting reconstruction, derive the exact whole resource/body/stage vector, and reject incomplete, compensated, mismatched or later-tail prefixes. This first source delta creates no runtime membership or pending-policy exception; genuine fresh admission and original remaining-effect resumption are still required within existing #1915 before its ACs can qualify.

**Tech Stack:** Node.js, node:test, complete original native transition fixture, Markdown.

**Spec:** docs/superpowers/specs/2026-09-30-1847-governed-criteria-revisions-design.md; original Task5; live #1915 Scope and parent delivery continuation.

## Current diagnosis and source boundary

Input bf37623bb includes reviewed/fixed1924. The full original recovery-from-comment regression fails after actual durable16 with RevisionPolicyError revision-pending at policy.mjs's generic mutation boundary. Its current preserved failed log is .scratch/1918-1915-current-original-baseline.log. That failure remains visible; no scoped DATA test can claim the actual reentry AC or whole original completion passes.

Fresh admission must revalidate original executor, approval/source, current prefix and common lock. Current native guard evaluation consumes the exact held body, lifecycle sources and current evidence binding; substituting a constructed ready state is forbidden. The actual actor runtime allocates a fresh clock and counts the transcript, while retained recovery must preserve original clock/actor effects. These admission/runtime bridges remain the subsequent implementation work of1915, with no new issues, defects or prerequisite chain.

This plan owns only the independently testable prefix-input delta, estimated2 of the existing14 prospective human hours, excluding passive tests/CI and prior implementation. Remaining original-entry admission/resumption stays on1915 and is not completed by this plan. Normal child lifecycle, full/cloud and complete-tail checks remain pending; known17–24 stays1923 and unknown effects1925.

## Global Constraints

- Native1847→1855→1918→1915, existing feature/epic/1918/parent and active parent source sequencing exception; preserve ordinary states/edges.
- Preserve all original algorithms, fixtures/assertions/tests, proof/approval/source guards and lock order. No authority cache, runtime brand from DATA, caller callbacks/after bytes, activation or lifecycle receipt.
- Node/Markdown only; unchanged600000ms per file/semantic section,1200s focused command,45-minute sandbox, maximum four isolated native processes.
- Reassess/split if prospective remaining effort reaches24h. No historical or passive wall time charged as productive estimate.
- Retain the workspace while actual reentry and aggregate obligations remain pending; parent source integration is not child completion.

## Review Focus

- A completed resource may not disappear or revert to its before value while still qualifying as a known completed prefix.
- Caller input mutated after the first await must not change the detached recognized prefix or execute a getter.
- Incomplete readbacks and compensation must remain fenced even if some physical effects landed.
- Later-tail, foreign executor, body/version or unrelated-resource substitutions cannot qualify early-prefix inputs.
- Recognized DATA must never mint current approval, runtime membership or generic pending-writer/retry authority.

## Task 1: Recognize exact original completed prefixes

**Modify:** scripts/task-tracker/lib/criteria-revision/stage-execution.mjs.
**Extend:** scripts/tests/integration/task-tracker/lib/native-stage-continuation-fixture.mjs with a new known-prefix-inputs mode under the complete original transition setup.
**Create:** scripts/tests/integration/task-tracker/lib/criteria-revision-known-prefix-inputs.test.mjs and scripts/tests/unit/task-tracker/lib/criteria-revision/native-stage-known-prefix-boundary.test.mjs.

**Consumes:** closed {journal,resources,body,stage,executor} DATA from actual retained snapshots, existing actor/checkpoint/phase/entry/board/sentinel/comment codecs.
**Produces:** deriveRecordedNativeStageKnownPrefix(input) returning frozen {ordinal,nextOrdinal,transitionId,actorClock}; no capability, callback, admission boolean or current-verification flag.

- [ ] Capture all actual completed1–16 snapshots from the original running Node transition, using a reentrancy-safe read-only descriptor observer. Confirm every ordinal is present and its final readback non-null before calling the new decoder; no manufactured effect history is credited as native execution.
- [ ] Call the missing decoder on each actual snapshot. Expected RED at the missing recognition implementation after actual complete16 setup/capture, not an observer miss.

```javascript
assert.deepEqual(
  [...captured.keys()].sort((a, b) => a - b),
  Array.from({ length: 16 }, (_, i) => i + 1)
);
for (const [ordinal, snapshot] of captured) {
  const input = {
    journal: snapshot.nativeStageRecords.at(-1),
    resources: snapshot.nativeStageResources,
    body: snapshot.observation.body,
    stage: snapshot.observation.stage,
    executor: snapshot.observation.executor,
  };
  const known = await codec.deriveRecordedNativeStageKnownPrefix(input);
  assert.equal(known.ordinal, ordinal);
  assert.equal(known.nextOrdinal, ordinal + 1);
  assert.equal(known.transitionId, input.journal.header.intent.transitionId);
  assert.equal(known.actorClock, input.journal.header.original.actor.capture.ts);
}
```

- [ ] Detach canonical DATA synchronously; reject any compensation, ordinal>16, incomplete readback or executor mismatch. Derive expected resources/body/stage using the original codecs below; compare the whole vectors, including untouched local and remote resources.

```javascript
const { journal, resources, body, stage, executor } = JSON.parse(canonicalRecordJson(input));
validateNativeStageJournal(journal);
const { header, steps } = journal,
  ordinal = steps.length;
if (
  ordinal > 16 ||
  Object.hasOwn(journal, 'compensation') ||
  steps.some((step) => step.readback === null) ||
  canonicalRecordJson(executor) !== canonicalRecordJson(header.scope.executor)
)
  revisionError('native-stage-known-prefix');
```

Fixed derivation map:1 uses original resources with actorFlush equal to first.intent.journalBytes;2 reconstructNativeStageActorTiming;3 reconstructNativeStageActorCursor;4–6 reconstructNativeStageCheckpointSteps;7 reconstructNativeStageActorRemoval;8–10 reconstructNativeStageCheckpointSteps;11–12 reconstructNativeStagePhaseTiming;13 reconstructNativeStageEntryBody;14 reconstructNativeStageBoard (requires confirmed);15 reconstructNativeStageSentinel;16 reconstructNativeStageTransitionComment. Before13 body/stage stay header.original.observation;13 uses afterBody;14 uses body/afterStage;15 uses afterBody/stage;16 uses body/stage. Each existing helper receives its exact original prefix. Resources for13 are entry.resources,14 afterResources,15 resources,16 afterResources; preceding helpers expose afterResources. No new serializer or execution loop is introduced.

- [ ] Return only the four scalar facts after exact whole-vector equality. Run the actual16 capture/positive profiles and public boundary tests. Expected: all recognized exact prefixes, no authority or effects. Commit source under1918/1915.

## Task 2: Refusal, mutation and original regression qualification

- [ ] For every actual captured prefix, independently change one completed resource, body/version, stage or executor and assert refusal. Set the final readback null and assert refusal. A later genuine17/18 projection stays outside this decoder; no tail registration is added.
- [ ] Insert a getter into caller input after recognition starts; original detached facts remain unchanged with getter0. Public getter/prototype/symbol/hidden/extra/missing/null and incomplete shapes refuse without effects or getters.
- [ ] Verify original pending ordinary body/stage writers still deny after DATA recognition and actual fresh recovery-from-comment remains an explicitly failed preserved regression until genuine admission/resumption and later tails compose. Do not modify that original assertion.
- [ ] Run focused actual input file, owned public/DATA profiles, original ordinary regression, package/import and full lint/format. Preserve all cases and budgets, record real outputs and aggregate cloud obligation.
- [ ] One fresh final reviewer sees exact full-plan range/spec/ledger and Review Focus. Re-grade by actual effect; one Important/Critical RED→GREEN fix pass and owned full GREEN, no re-review. Record all declines/rulings/costs and deferred minors. This plan's local-source readiness never claims1915 AC completion.
