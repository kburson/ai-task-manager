## Task 1: Derive current facts and connect the failure facade

**Modify:** scripts/task-tracker/lib/criteria-revision/stage-execution.mjs; store.mjs; scripts/task-tracker/lib/move-state/move-state-core.mjs.
**Extend:** scripts/tests/integration/task-tracker/lib/native-stage-continuation-fixture.mjs.
**Create:** criteria-revision-partial-reporting.test.mjs plus four independently registered genuine wrappers in the same integration directory.

**Consumes:** actual private preparation identity, held backend/capability/context, original header and completed native prefixes.
**Produces:** readMemoryNativeStagePartialFacts({backend,capability,context,holder}) returning detached report DATA; Core assertNativeStagePartialHolder(holder,backend) is a no-return comparison against the actual live WeakMap holder; deriveRecordedNativeStagePartialFacts({journal}) derives DATA only.

- [ ] Add genuine native profiles stopping before sentinel15, transition-comment16, dispatcher17, and after an interrupted comment16 effect write. Preserve complete original setup, exact resource/host-byte assertions and all original profiles. Literal expectations are board true/item PVTI_subject in all four; sentinel false only at14; transitionCommitPresent true only at completed16. Run and watch actual facade RED before code.

```javascript
assert.equal(result.exit, 4);
assert.equal(result.itemId, 'PVTI_subject');
assert.equal(result.boardMoved, true);
assert.equal(result.sentinelPresent, completed >= 15);
assert.equal(result.transitionCommitPresent, completed === 16);
assert.equal(result.progressVerified, true);
```

- [ ] DATA projection detaches canonical own-DATA before its first await, validates the journal and independently reconstructs board14, sentinel15 and comment16 when present. Only non-null validated readbacks qualify facts; no mutation/constructor runtime membership is created.

```javascript
const boardMoved = steps[13]?.readback != null && steps[13].outcome?.kind === 'confirmed';
const sentinelPresent = boardMoved && steps[14]?.readback != null;
const transitionCommitPresent = sentinelPresent && steps[15]?.readback != null;
return Object.freeze({
  itemId: boardMoved ? header.intent.itemId : '',
  boardMoved,
  sentinelPresent,
  transitionCommitPresent,
  transitionCommitId: transitionCommitPresent ? steps[15].intent.commentId : null,
  progressVerified: true,
});
```

- [ ] Fixed Store reader checks closed own-DATA tuple before property access, actual holder membership and held capability. Capture canonical snapshot; before/after imports/observe/projection, compare exact snapshot, held identity/header and capability. observeRevision must independently validate pending-native-stage/current resources. No admission writes or resource mutation occur.
- [ ] In Core catch, set record.cancelled, reject its gate and await running.catch before projection. Retain actual holder membership until finally. Return original exit4/code/phase/preparationReason plus the verified facts. If current facts cannot qualify, return progressVerified false and no invented committed facts. Finally retains original cancellation/join/holder cleanup; no user-selected signals/callbacks added.

```javascript
if (record) {
  record.cancelled = true;
  record.cancel(preparationRefusal('preparation-cancelled'));
  if (running) await running.catch(() => {});
}
let partial = {
  itemId: '',
  boardMoved: false,
  sentinelPresent: false,
  transitionCommitPresent: false,
  transitionCommitId: null,
  progressVerified: !record,
};
if (record?.header) {
  try {
    partial = await store.readMemoryNativeStagePartialFacts({
      backend: record.backend,
      capability: record.capability,
      context: record.context,
      holder: record.identity,
    });
  } catch {
    partial.progressVerified = false;
  }
}
```

- [ ] Run all four genuine profiles; expect exact retained prefixes/resources and accurate reports with original failure preserved. Commit source slice with1918/1924 attribution.

