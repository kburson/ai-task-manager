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

