// @story #1855
import { assert, nativeFinalFixture, test } from './native-continuation-fixtures.mjs';

for (const [fault, point, executions] of [
  ['failBefore', 'native-proof-journal-write', 2],
  ['failAfter', 'native-proof-journal-write', 1],
  ['failBefore', 'native-proof-journal-readback', 1],
]) test(`native final receipt restart at ${fault} ${point} retains exact execution boundary`, async () => {
  const f = await nativeFinalFixture();
  try {
    f.backend[fault] = point;
    assert.match((await f.invoke()).error?.message ?? '', /interrupted/);
    const original = structuredClone(f.backend.snapshot.nativeProofRecords ?? []);
    assert.equal(f.effects.filter(effect => effect === 'body-push').length, 0);
    f.restart();
    const resumed = await f.invoke({ entryInterlock: original.length > 0 });
    assert.equal(resumed.error, undefined);
    assert.equal(resumed.result.status, original.length ? 'entry-preflight-refused' : 'move-failed');
    assert.equal(f.effects.filter(effect => effect === 'actual-finalization').length, executions);
    assert.equal(f.effects.filter(effect => effect === 'body-push').length, 1);
    assert.equal(f.backend.snapshot.nativeProofRecords.length, 1);
    if (original.length) assert.deepEqual(f.backend.snapshot.nativeProofRecords, original);
  } finally { f.dispose(); }
});
