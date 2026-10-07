// @story #1855
import { assert, buildVerificationFingerprint, execFileSync, nativeFinalFixture, observeRevision, parseVerificationCommands, path, resolveVerificationProvider, rmSync, test, validateVerificationReceipt, withRevisionConsumer, writeFileSync } from './native-continuation-fixtures.mjs';

test('historical project final receipt survives removal of an obsolete unexecuted Test script', async () => {
  const f = await nativeFinalFixture({ configuredProject: true });
  try {
    const first = await f.invoke();
    assert.equal(first.error, undefined);
    assert.equal(first.finalization?.ok, true);
    assert.equal(first.result.status, 'move-failed');
    const original = structuredClone(f.backend.snapshot.nativeProofRecords);
    assert.equal(original[0].execution.plan.providerId, 'project');
    assert.deepEqual(original[0].execution.commands.map(command => command.classification), ['lint-full']);
    assert.equal((await observeRevision({ context: f.context, deps: f.backend })).status, 'applied');
    writeFileSync(path.join(f.projectDir, '.ai-task-manager/task-tracker.json'), JSON.stringify({ repo: f.context.repository }));
    rmSync(path.join(f.projectDir, 'scripts/obsolete-test.sh'));
    execFileSync('git', ['add', '-u'], { cwd: f.projectDir, env: f.s.env });
    execFileSync('git', ['commit', '-qm', 'Remove obsolete unexecuted Test script'], { cwd: f.projectDir, env: f.s.env });
    f.restart();
    const current = await observeRevision({ context: f.context, deps: f.backend });
    assert.equal(current.status, 'applied');
    assert.deepEqual(f.backend.snapshot.nativeProofRecords, original);
    assert.throws(() => resolveVerificationProvider({ projectDir: f.projectDir,
      config: original[0].execution.configuration.verificationProvider }), /script not found/);
    const currentFingerprint = buildVerificationFingerprint({ projectDir: f.projectDir,
      commitSha: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: f.projectDir, encoding: 'utf8' }).trim(),
      verificationCommands: parseVerificationCommands(f.backend.observation.body.bytes) });
    const eligibility = await withRevisionConsumer({ repository: f.context.repository, issue: f.context.issue,
      backend: f.backend, activity: 'stage-write' }, () => validateVerificationReceipt({
        receipt: original[0].execution.receipt, expectedIssue: f.context.issue,
        expectedStage: 'develop-final', fingerprint: currentFingerprint, required: ['lint-full'],
      }));
    assert.equal(eligibility.ok, false);
    assert.ok(eligibility.reasons.some(reason => reason.code === 'sha-mismatch'));
  } finally { f.dispose(); }
});
