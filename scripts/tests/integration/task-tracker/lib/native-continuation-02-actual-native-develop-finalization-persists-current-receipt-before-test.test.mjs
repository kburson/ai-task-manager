// @story #1855
import { assert, createRevisionMemory, nativeFinalFixture, observeRevision, test } from './native-continuation-fixtures.mjs';

test('actual native Develop finalization persists current receipt before Test stage execution', async (t) => {
  const f = await nativeFinalFixture();
  try {
    const { result, error, finalization } = await f.invoke();
    const { backend, context, effects } = f;
    t.diagnostic(JSON.stringify({ status: result?.status, error: error?.message, effects,
      finalization: finalization && { ok: finalization.ok, commands: finalization.commands, reasons: finalization.reasons } }));
    assert.equal(finalization?.ok, true, JSON.stringify(finalization));
    assert.equal(error, undefined);
    assert.equal(result.status, 'move-failed', 'this receipt-only test stops before any actual stage effect');
    assert.ok(effects.includes('body-push'), 'actual receipt must persist before the stage adapter');
    assert.deepEqual(effects, ['comment', 'actual-finalization', 'body-push', 'stage-boundary']);
    const snapshot = JSON.parse(JSON.stringify(backend.snapshot));
    assert.equal(snapshot.nativeProofRecords.length, 1);
    assert.equal(snapshot.nativeProofRecords[0].criterionIdentity, null);
    const restarted = createRevisionMemory(snapshot);
    const observed = await observeRevision({ context, deps: restarted });
    assert.equal(observed.status, 'applied', JSON.stringify(observed));
    assert.deepEqual(observed.nativeIndividualProofs, [], 'aggregate receipt can never qualify as a preserved individual proof');
    assert.deepEqual(restarted.snapshot.nativeProofRecords, snapshot.nativeProofRecords);
  } finally { f.dispose(); }
});
