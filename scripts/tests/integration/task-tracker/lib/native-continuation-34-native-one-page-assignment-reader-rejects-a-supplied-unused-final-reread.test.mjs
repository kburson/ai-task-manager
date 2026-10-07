// @story #1855
import { assert, evaluateNativeRevisionStageGuards, nativeAssignmentPairs, nativeFinalFixture, path, rawLifecycleSources, test, withRevisionConsumer, writeFileSync } from './native-continuation-fixtures.mjs';

test('native one-page assignment reader rejects a supplied unused final reread', async () => {
  const f = await nativeFinalFixture();
  try {
    const cfg = { repo: f.context.repository, projectId: 'PVT_fixture', fieldDisposition: 'PVTF_disposition' };
    writeFileSync(path.join(f.projectDir, '.ai-task-manager/task-tracker.json'), JSON.stringify(cfg));
    const pairs = nativeAssignmentPairs(f.context, false);
    pairs.final = nativeAssignmentPairs(f.context, true).final;
    f.restart(snapshot => { snapshot.lifecycleSources = rawLifecycleSources(snapshot.observation);
      snapshot.lifecycleSources.remote.assignments = pairs; });
    const before = structuredClone(f.backend.snapshot);
    await assert.rejects(withRevisionConsumer({ repository: f.context.repository, issue: f.context.issue,
      activity: 'stage-write', backend: f.backend, projectDir: f.projectDir }, () => evaluateNativeRevisionStageGuards({
      cfg, projectDir: f.projectDir, issueArg: String(f.context.issue), stateArg: 'test',
      resolvedFromState: 'develop', plan: { runGuardPipeline: true },
    })), error => error.code === 'revision-authority-unavailable');
    assert.deepEqual(f.backend.snapshot, before);
  } finally { f.dispose(); }
});
