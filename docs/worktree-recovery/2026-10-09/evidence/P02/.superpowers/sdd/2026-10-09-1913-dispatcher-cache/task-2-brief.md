## Task 2: Execute original cache18 under private custody

**Modify:** cache-unpark.mjs, move-state-core.mjs, session-state.mjs, criteria-revision/stage-execution.mjs, store.mjs, source-correction.mjs.
**Extend:** original native-stage-continuation-fixture.mjs with cache-specific modes preserving existing registrations/fixtures/assertions.

**Interfaces:**

- refreshKanbanStateCache(ctx,nativeInput) recognizes memory scope before ctx reads, enters beginNativeStageTailCache(nativeInput,ctx), and runs the existing private kanbanRefreshProgram. Ordinary callers retain the existing switch and stable behavior.
- Private nativeCacheOperations membership is born only on actual yielded operations. assertOriginalNativeCacheOperation(input,ctx,operation) compares actual identity/descriptors/bytes and returns no capability. executeNativeStageCacheOperation(input,ctx,operation) admits only that actual frame, current source and original selected module functions.
- Native modules/sid/root operations import/call the actual session-state, word-counter and getProjectDir collaborators; compare actual identity/root before using results. No caller deps or replacement functions are selected.
- getNativeStageCachedTask(input,operation) selects the actual locked memory activeTask bytes through Core and reuses the original tolerant JSON read and normalizeCachedKanbanState algorithm. Keep getActiveTask's host path unchanged; share its private parser rather than use DATA projection as execution.
- setNativeStageKanbanState(input,operation) uses the same original sessionKanbanPayload and JSON serialization as setSessionKanbanState. Private nativeStageKanbanWrites membership binds its actual derived intent/return; no caller after bytes are accepted.
- Core beginNativeStageTailCache/readNativeStageTailCacheOperation/readNativeStageTailCacheSource/persistNativeStageTailCache/writeNativeStageTailCache/completeNativeStageTailCache/endNativeStageTailCache validate the actual frame before/after awaits and effects. Extend only tailNext1 with the fixed original cache function; tailNext2 still refuses downstream owners.
- Store acquireMemoryNativeStageCache/persistMemoryNativeStageCache/readMemoryNativeStageCache/writeMemoryNativeStageCache/completeMemoryNativeStageCache/releaseMemoryNativeStageCache consume closed own-DATA {backend,capability,context,token,invocation} (release uses owned three-field tuple), private original operation/write membership and the shared activeTask resource lock. Intent-read membership remains private; current approval/source/resource observations are freshly checked.
- Step18 is closed {ordinal:18,kind:'tail-cache',previous,intent,readback}, with previous equal to the independently hashed completed dispatcher17. intent contains the actual session file, sid, original before bytes, actual program operations and original after bytes; readback contains the exact current activeTask resource plus full unchanged resource vector/body/stage.
- reconstructNativeStageTailCache({header,steps}) detaches closed DATA before any await, independently derives17, replays deriveRecordedNativeLocalTail only for comparison, and verifies exact before/after resources. The ordered source fold admits before only while readback is absent, after only when verified; all cache histories remain pending and never brand execution.

- [ ] Add a genuine original cache positive: full original proof/Plan/guard/actor/phase/entry/board/sentinel/comment/dispatcher initialization followed by actual cache read/set. Expected RED at missing cache bridge; no manufactured token/header or projection-selected effect.

```javascript
assert.equal(journal.steps.length, 18);
assert.equal(journal.steps[17].kind, 'tail-cache');
assert.equal(JSON.parse(snapshot.nativeStageResources.local.activeTask.bytes).kanbanState, 'test');
assert.equal(result.exit, 4); // next original owner remains fenced
assert.equal(observed.status, 'pending-native-stage');
assert.equal(observed.nativeHistoryApproved, false);
```

- [ ] Add exact before/after faults for intent-write, intent-readback, effect-write and effect-readback, preserving actual original operations, landed effect/resource facts and host bytes. Add actual private-window reentry/lock probes to the genuine positive case.
- [ ] Add real post-await operation/module/context/configuration/resource changes; getters remain unread, copied inputs do not authorize fixed effects, foreign identity/current vectors stop. DATA mutation across reconstruction awaits must not affect initial snapshot or invoke getters.
- [ ] Implement the interfaces above through original algorithm leaves and fixed memory sinks. Keep the public host path, every ordinary branch and all unrelated local resources unchanged. The actual native setter uses the original payload algorithm; private membership is created here, never by a public registration function:

```javascript
const source = await native.readNativeStageTailCacheSource(input, operation);
const rawExisting = source.beforeBytes === null ? null : JSON.parse(source.beforeBytes);
const { payload, changed } = sessionKanbanPayload(rawExisting, operation.stateArg);
const intent = {
  file: source.file,
  beforeBytes: source.beforeBytes,
  bytes: changed ? JSON.stringify(payload, null, 2) + '\n' : source.beforeBytes,
};
nativeStageKanbanWrites.set(input, {
  intent,
  descriptors: Object.getOwnPropertyDescriptors(intent),
});
await native.persistNativeStageTailCache(input, intent);
if (changed) await native.writeNativeStageTailCache(input);
await native.completeNativeStageTailCache(input);
return payload;
```

`readNativeStageTailCacheSource(input,operation)` produces only `{beforeBytes,file,sid,projectDir}` after genuine operation/lock/current-source checks; no transport/callback/capability is returned. Store persistence compares the private actual setter intent before deriving its expected resource delta independently. Cleanup deletes only this invocation's private write membership; the Core finally releases only its owned activeTask lock.

- [ ] Qualify all actual cache cases and the complete original local/ordinary profiles. Expected: exact native18 intent/effect/readback under the shared lock, no downstream completion or authority cache. Commit the bounded source slice.

