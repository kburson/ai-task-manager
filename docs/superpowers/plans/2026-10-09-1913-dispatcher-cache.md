# #1913 Dispatcher and Cache Continuation Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans inline, with one fresh final reviewer. Continue the accepted source repair under active #1918 orchestration in the existing parent worktree.

**Goal:** Qualify the original dispatcher17 and execute the original session cache18 algorithm through genuine fixed memory reads/writes and durable resource custody.

**Architecture:** Keep the existing private tail call window, original dispatcher and kanbanRefreshProgram. Add a cache leaf whose invocation and yielded operations are registered privately by the actual original loop; use the existing activeTask resource lock under the common revision frame. Independently reconstruct step18 from the complete original step17 and the original DATA replay, retaining pending status until later owners finish the transition.

**Tech Stack:** Node.js, node:test, existing complete native fixture, Markdown; no dependency/addon or production activation.

**Spec:** docs/superpowers/specs/2026-09-30-1847-governed-criteria-revisions-design.md; original Task5 in docs/superpowers/plans/2026-09-30-1847-governed-criteria-revisions.md; current live #1913 Scope and #1918 hydration/continuation.

## Baseline and acceptance boundary

Exact source input `047f0a750` includes the reviewed #1916 compensation slice and its single verified fix pass. Final #1916 focused30/30 passed in1112.89s with unchanged limits; these are local source inputs, not current Linux or lifecycle receipts. Current original cache/tail/native-command baseline44/44 passed in1.46s. Existing dispatcher17/private-window/reentry implementation is reused. refreshKanbanStateCache remains host-only; deriveRecordedNativeLocalTail is DATA-only and cannot substitute for actual read/set execution.

The three inherited phase-frontier failures remain owned here as recorded by #1918's continuation. Diagnose their actual causes using the unchanged original cases before changing code or fixture boundaries. Preserve every numeric assertion and requested original effect; record any frontier adaptation explicitly.

## Global Constraints

- Native lineage1847 →1855 →1918 →1913; existing parent branch/worktree and active orchestrator. Preserve ordinary child states/dependency edges under the accepted sequencing exception; no new issue/defect/prerequisite chain.
- Preserve original algorithms, fixture size, all original cases/assertions, source/approval/proof guards, and common-interlock-before-resource-lock order.
- Node/Markdown only; no authority cache, caller-selected after bytes/callbacks, constructor-branded execution or production activation.
- Unchanged600000ms per file/semantic section,1200s focused command,45-minute sandbox; at most four independent native processes in one qualification.
- Steps19–21 and tracker22 remain #1921; event fields #1922; terminal #1923; facade/reentry #1924/#1915; composed qualification #1917.
- Cache completion alone never claims whole-transition completion, nativeHistoryApproved or Test/Review/Done.
- Prospective incremental estimate8h: dispatcher/private-window qualification1h; original cache/resource/intent/readback4h; original-input/reentry/current/fault coverage3h. Reassess/split before code if >=24h; exclude passive execution and inherited work.

## Review Focus

- A reentrant cache invocation during the private pre-intent call window must fail without consuming the legitimate invocation or releasing its lock.
- A copied operation/input or getter inserted after an await cannot select session state, callbacks, identity or resource bytes.
- A cache write that lands before interrupted readback must retain its exact prefix and avoid duplicate or unrelated local changes.
- Constructor DATA and cache18 completion cannot authorize later tail functions, resume/reentry or production delivery.
- Current source/configuration/HEAD/transcript/resource drift must stop subsequent effects and release only the owned activeTask lock.

## Task 1: Qualify the retained dispatcher and phase boundary

**Create:** scripts/tests/integration/task-tracker/lib/criteria-revision-local-transition-tail.test.mjs.
**Reuse:** scripts/tests/integration/task-tracker/lib/move-state-native-command.test.mjs.
**Review/modify only if real failures require:** audit-timing.mjs native error boundary; post-commit-tail.mjs and move-state-core.mjs private sequence window; original native fixture's explicit requested frontier.

**Consumes:** genuine original transition-comment16 return and private original tail call window.
**Produces:** independently selected complete original dispatch/reentry cases, truthful stopped phase failures and unchanged ordinary dispatcher/tail behavior.

- [ ] Run the original native-stage-tail-dispatch and native-stage-tail-dispatch-reentry files plus phase12-after-effect-readback, phase-pair and phase-adversarial. Expected: characterize actual current failures; never count setup/empty selections as RED.
- [ ] Independently discover their literal registrations using the existing AST helper and assert the exact five descriptors. Qualify the original files through isolated processes with intact fixtures and limits.
- [ ] If the actual native phase emitter swallows an interrupted callback and advances entry13, preserve ordinary warning-only behavior but rethrow in native scope before continuation. If a phase-only fixture previously relied on the next unimplemented route as its frontier, replace that implicit stop only with an explicit actual next-stage intent fault; preserve all original assertions/effects and ledger the reasoning/cost.

```javascript
} catch (err) {
  process.stderr.write(`[move-state] #${issueArg}: phase-pair emission failed: ${err.message}\n`);
  if (nativeMemory) throw err;
}
```

- [ ] Run the five original native cases and all44 original ordinary regressions. Expected: requested durable prefixes and private reentry refusal, no extra effects and no changed ordinary behavior. Commit with #1918/#1913 attribution.

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

## Task 3: Qualification and one fresh review

Run the two declared root files: node --test --test-concurrency=1 scripts/tests/integration/task-tracker/lib/criteria-revision-local-transition-tail.test.mjs scripts/tests/integration/task-tracker/lib/move-state-native-command.test.mjs.

Distribute complete native descriptors into two explicitly asserted semantic groups within the two files; preserve600s each and1200s combined, four isolated workers. Record actual case membership, counts, zero skips/cancellations and current durations. Never drop a wrapper/original or raise limits to obtain a pass.

Run all44 original ordinary profiles, affected public/DATA boundaries, package/import checks, full lint/format and git log --oneline -1. Expected: current-source scoped GREEN, with all aggregate/Linux/full/slow and ordinary child lifecycle obligations still visible.

Request one fresh reviewer with exact full-plan range/spec/ledger and Review Focus. Re-grade by actual effect, make one meaningful RED→GREEN Important/Critical fix pass with current suite GREEN, record all declines/rulings/costs and deferred minors, no re-review. Retain workspace/provenance while aggregate obligations remain pending. New qualifier/wrapper classification and budgets must be reconciled under final #1917 composition without reducing tests or manufacturing receipts.
