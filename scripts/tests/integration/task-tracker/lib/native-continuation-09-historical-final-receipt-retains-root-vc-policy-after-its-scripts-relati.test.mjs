// @story #1855
import { assert, execFileSync, nativeFinalFixture, observeRevision, parseVerificationCommands, path, rmSync, runDevelopVerification, test, withRevisionConsumer } from './native-continuation-fixtures.mjs';

test('historical final receipt retains root VC policy after its scripts-relative file is removed', async () => {
  const f = await nativeFinalFixture({ scriptsRootVc: true });
  try {
    const first = await f.invoke();
    assert.equal(first.error, undefined);
    assert.equal(first.finalization?.ok, true);
    assert.equal(first.result.status, 'move-failed');
    const original = structuredClone(f.backend.snapshot.nativeProofRecords);
    assert.ok(original[0].execution.fingerprint.verificationCommands.some(argv => argv[0] === './scripts/root-check.sh'));
    assert.equal((await observeRevision({ context: f.context, deps: f.backend })).status, 'applied');
    rmSync(path.join(f.projectDir, 'scripts/root-check.sh'));
    execFileSync('git', ['add', '-u'], { cwd: f.projectDir, env: f.s.env });
    execFileSync('git', ['commit', '-qm', 'Remove original root verifier after completed final receipt'], { cwd: f.projectDir, env: f.s.env });
    f.restart();
    assert.equal((await observeRevision({ context: f.context, deps: f.backend })).status, 'applied');
    assert.deepEqual(f.backend.snapshot.nativeProofRecords, original);
    const fresh = await withRevisionConsumer({ repository: f.context.repository, issue: f.context.issue,
      backend: f.backend, activity: 'stage-write' }, () => runDevelopVerification({ projectDir: f.projectDir,
        issueNumber: f.context.issue, mode: 'final', verificationCommands: parseVerificationCommands(f.backend.observation.body.bytes) }));
    assert.equal(fresh.ok, false);
    assert.equal(fresh.reasons[0].code, 'native-final-authority');
    assert.deepEqual(fresh.commands, []);
    assert.equal(fresh.nativeExecutionToken, undefined);
  } finally { f.dispose(); }
});
