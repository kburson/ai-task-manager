## Task 1: Fresh guarded original-entry route

**Modify:** scripts/task-tracker/lib/move-state/move-state-core.mjs, scripts/task-tracker/lib/criteria-revision/policy.mjs.
**Extend:** scripts/tests/integration/task-tracker/lib/native-stage-continuation-fixture.mjs, preserving every existing mode.
**Create:** scripts/tests/integration/task-tracker/lib/criteria-revision-known-prefix-entry.test.mjs.

**Consumes:** actual captured1–16 snapshots, full independent reconstructNativeHistory and deriveRecordedNativeStageKnownPrefix, original native guard pipeline and physical source checks.
**Produces:** dedicated tryNativeStageOriginalEntry(ctx) usable only during the lexical original moveState call; assertOriginalNativeStageEntry(ctx) is no-return pointer/descriptor comparison; evaluateOriginalNativeStageRestart(ctx, capability, origin, known) consumes only privately registered current policy custody. No returned capability or public approval/readiness flag.

- [ ] Add known-prefix-entry fixture alias using the full existing known-prefix-inputs setup/capture and all original controls. Save fresh context before the first move. For each real captured ordinal invoke original moveState with a fresh memory instance, no saved transition identity or dependencies. The completed admission frontier is exit4/phase native-stage-resume/preparationReason known-prefix-continuation-unavailable; snapshot/effects/files remain identical.

```javascript
const backend = createRevisionMemory(selected);
const result = await moveState({ ...originalRetryContext, revisionBackend: backend });
assert.equal(result.phase, 'native-stage-resume');
assert.equal(result.preparationReason, 'known-prefix-continuation-unavailable');
assert.equal(result.exit, 4);
assert.deepEqual(backend.snapshot, selected);
assert.deepEqual(backend.effects, []);
```

- [ ] Run the new full fixture. Expected RED: actual original move still throws revision-pending at the first real completed prefix. No credit for setup/capture failure.
- [ ] Register ctx synchronously at actual moveState entry, comparing own DATA descriptors/config without reading getters after awaits. Invoke the dedicated boundary before generic admission only for native-stage histories; clean the registration synchronously in finally. Direct calls with unregistered ctx refuse.
- [ ] Under withMemoryInterlock, record exact snapshot/context; observeRevision and independently reconstructNativeHistory. Require pending-native-stage, exact latest stage membership, no pendingSource/Plan, and known completed1–16 whole vectors. Recheck snapshot and ctx after every await. Bind private held origin from the reconstructed original observation/current contract; keep held.state.status pending.

```javascript
const origin = await reconstructNativeHistory({
  history: readMemoryNativeHistory(backend),
  chain: state.chain,
  backend,
  observation: backend.observation,
});
if (origin.status !== 'pending-native-stage') refuse();
const known = await deriveRecordedNativeStageKnownPrefix({
  journal: origin.journal,
  resources: backend.snapshot.nativeStageResources,
  body: backend.observation.body,
  stage: backend.observation.stage,
  executor: context.executor,
});
```

- [ ] A private held origin supplies only original guard-body/definitions/evidence reads. The generic evaluateRevisionPolicy and withRevisionConsumer remain unchanged. Read-only evaluateRevisionAdmission may return ready only while this exact held origin/entry is live. Original native assignment validation uses origin; current raw observation still supplies all before/after drift comparisons.
- [ ] Core validates actual caller restrictions and obtains original defaultRunGuardExecution. Require real complete guard inventory, successful guard result, owned session and assignment reads. Compare original source capture using checkOriginalStageSources, checkOriginalFieldSources, checkOriginalLocalSources and exact current scope before returning the explicit unavailable continuation frontier. No journal, body, board or local write.
- [ ] Run the full new fixture. Expected all16 actual fresh guarded admissions reach the frontier with zero effects, generic pending callbacks0, all original input assertions intact. Commit1918/1915 source/tests.

