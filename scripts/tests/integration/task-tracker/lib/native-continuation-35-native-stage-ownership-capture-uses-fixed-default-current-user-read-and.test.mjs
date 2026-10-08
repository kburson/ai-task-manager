// @story #1855
import {
  assert,
  evaluateNativeRevisionStageGuards,
  nativeAssignmentPairs,
  nativeFinalFixture,
  path,
  rawLifecycleSources,
  test,
  withRevisionConsumer,
  writeFileSync,
} from './native-continuation-fixtures.mjs';

test('native stage ownership capture uses fixed default current-user read and actual complete assignment reader', async () => {
  const f = await nativeFinalFixture();
  try {
    const cfg = {
      repo: f.context.repository,
      projectId: 'PVT_fixture',
      fieldDisposition: 'PVTF_disposition',
    };
    writeFileSync(
      path.join(f.projectDir, '.ai-task-manager/task-tracker.json'),
      JSON.stringify(cfg)
    );
    const identity = {
      request: { file: 'gh', args: ['api', 'user', '--jq', '.login'] },
      response: { stdout: 'native-fixture-owner\n', stderr: '', exitCode: 0 },
    };
    f.restart((snapshot) => {
      snapshot.lifecycleSources = rawLifecycleSources(snapshot.observation);
      snapshot.lifecycleSources.remote.assignments = nativeAssignmentPairs(f.context, true);
      snapshot.lifecycleSources.remote.identity = identity;
    });
    const before = structuredClone(f.backend.snapshot);
    const result = await withRevisionConsumer(
      {
        repository: f.context.repository,
        issue: f.context.issue,
        activity: 'stage-write',
        backend: f.backend,
        projectDir: f.projectDir,
      },
      () =>
        evaluateNativeRevisionStageGuards({
          cfg,
          projectDir: f.projectDir,
          issueArg: String(f.context.issue),
          stateArg: 'test',
          resolvedFromState: 'develop',
          plan: { runGuardPipeline: true },
        })
    );
    assert.deepEqual(result.ownershipReads.identity, identity);
    assert.equal(result.ownershipReads.currentUser, 'native-fixture-owner');
    assert.equal(result.ownershipReads.decision.kind, 'owned-by-session');
    assert.equal(result.ownershipReads.decision.ok, true);
    assert.deepEqual(result.assignmentReads.snapshot.assignees, ['native-fixture-owner']);
    assert.deepEqual(f.backend.snapshot, before);
  } finally {
    f.dispose();
  }
});
