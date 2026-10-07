// @story #1855
import { assert, nativeFinalFixture, test } from './native-continuation-fixtures.mjs';

test('native Test public entry resumes its original receipt before acquiring the issue lock', async () => {
  const f = await nativeFinalFixture();
  try {
    f.backend.failAfter = 'native-proof-journal-readback';
    assert.match((await f.invoke()).error?.message ?? '', /interrupted/);
    f.restart();
    const original = structuredClone(f.backend.snapshot.nativeProofRecords);
    const resumed = await f.invoke({ entryInterlock: true });
    assert.equal(resumed.error, undefined);
    assert.equal(resumed.result.status, 'entry-preflight-refused', 'normal native preflight remains enforced after fixed receipt completion');
    assert.equal(f.effects.filter(effect => effect === 'actual-finalization').length, 1);
    assert.equal(f.effects.filter(effect => effect === 'body-push').length, 1);
    assert.deepEqual(f.backend.snapshot.nativeProofRecords, original);
  } finally { f.dispose(); }
});
