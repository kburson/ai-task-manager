// @story #1855
import { assert, execFileSync, nativeFinalFixture, observeRevision, path, rmSync, test } from './native-continuation-fixtures.mjs';

test('pending native final receipt cannot resume after its original root VC file disappears', async () => {
  const f = await nativeFinalFixture({ scriptsRootVc: true });
  try {
    f.backend.failAfter = 'native-proof-journal-readback';
    assert.match((await f.invoke()).error?.message ?? '', /interrupted/);
    const original = structuredClone(f.backend.snapshot.nativeProofRecords);
    const effects = [...f.effects];
    rmSync(path.join(f.projectDir, 'scripts/root-check.sh'));
    execFileSync('git', ['add', '-u'], { cwd: f.projectDir, env: f.s.env });
    execFileSync('git', ['commit', '-qm', 'Remove root VC during interrupted final receipt'], { cwd: f.projectDir, env: f.s.env });
    f.restart();
    assert.equal((await observeRevision({ context: f.context, deps: f.backend })).status, 'pending-native-proof');
    const refused = await f.invoke({ entryInterlock: true });
    assert.match(refused.error?.message ?? '', /script not found/);
    assert.deepEqual(f.effects, effects);
    assert.deepEqual(f.backend.snapshot.nativeProofRecords, original);
    assert.equal((await observeRevision({ context: f.context, deps: f.backend })).status, 'pending-native-proof');
  } finally { f.dispose(); }
});
