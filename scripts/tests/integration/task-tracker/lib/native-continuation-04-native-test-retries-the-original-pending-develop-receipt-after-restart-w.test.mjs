// @story #1855
import {
  assert,
  nativeFinalFixture,
  observeRevision,
  test,
} from './native-continuation-fixtures.mjs';

test('native Test retries the original pending Develop receipt after restart without rerunning commands', async () => {
  const f = await nativeFinalFixture();
  try {
    f.backend.failAfter = 'native-proof-journal-readback';
    const first = await f.invoke();
    assert.match(first.error?.message ?? '', /interrupted/);
    assert.deepEqual(f.effects, ['comment', 'actual-finalization']);
    const original = f.backend.snapshot.nativeProofRecords[0];
    f.restart();
    assert.equal(
      (await observeRevision({ context: f.context, deps: f.backend })).status,
      'pending-native-proof'
    );
    const second = await f.invoke();
    assert.equal(second.error, undefined);
    assert.equal(second.result.status, 'move-failed');
    assert.deepEqual(f.effects, ['comment', 'actual-finalization', 'body-push', 'stage-boundary']);
    assert.deepEqual(f.backend.snapshot.nativeProofRecords, [original]);
    f.restart();
    const third = await f.invoke();
    assert.equal(third.error, undefined);
    assert.equal(third.result.status, 'move-failed');
    assert.equal(f.effects.filter((effect) => effect === 'actual-finalization').length, 1);
    assert.equal(f.effects.filter((effect) => effect === 'body-push').length, 1);
    assert.deepEqual(f.backend.snapshot.nativeProofRecords, [original]);
  } finally {
    f.dispose();
  }
});
