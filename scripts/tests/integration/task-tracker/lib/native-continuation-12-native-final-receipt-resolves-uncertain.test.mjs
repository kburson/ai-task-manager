// @story #1855
import { assert, nativeFinalFixture, observeRevision, test } from './native-continuation-fixtures.mjs';

for (const point of ['before-write', 'after-write', 'readback'])
  test(`native final receipt resolves uncertain ${point} through fresh original record without duplicate proof`, async () => {
    const f = await nativeFinalFixture();
    try {
      f.failTransport(point);
      const first = await f.invoke();
      assert.ok(first.error || first.result?.status === 'move-failed');
      assert.equal(f.backend.snapshot.nativeProofRecords.length, 1);
      const original = structuredClone(f.backend.snapshot.nativeProofRecords);
      f.restart();
      const state = await observeRevision({ context: f.context, deps: f.backend });
      assert.equal(state.status, point === 'before-write' ? 'pending-native-proof' : 'applied');
      const resumed = await f.invoke();
      assert.equal(resumed.error, undefined);
      assert.equal(resumed.result.status, 'move-failed');
      assert.equal(f.effects.filter(effect => effect === 'actual-finalization').length, 1);
      assert.equal(f.effects.filter(effect => effect === 'body-push').length, 1);
      assert.equal(f.writeAttempts, point === 'before-write' ? 2 : 1);
      assert.deepEqual(f.backend.snapshot.nativeProofRecords, original);
      f.restart();
      assert.equal((await f.invoke()).error, undefined);
      assert.equal(f.effects.filter(effect => effect === 'body-push').length, 1);
      assert.equal(f.effects.filter(effect => effect === 'actual-finalization').length, 1);
    } finally { f.dispose(); }
  });
