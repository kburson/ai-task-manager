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

for (const paginated of [false, true])
  test(`native stage assignment capture runs actual ${paginated ? 'paginated final reread' : 'one-page reader'} without effects`, async () => {
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
      const pairs = nativeAssignmentPairs(f.context, paginated);
      f.restart((snapshot) => {
        snapshot.lifecycleSources = rawLifecycleSources(snapshot.observation);
        snapshot.lifecycleSources.remote.assignments = pairs;
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
      assert.deepEqual(result.assignmentReads.snapshot, {
        state: 'develop',
        assignees: ['native-fixture-owner'],
      });
      assert.deepEqual(result.assignmentReads.reads, [
        ...pairs.pages.map((pair) => ({ kind: 'page', ...pair })),
        ...pairs.final.map((pair) => ({ kind: 'final', ...pair })),
      ]);
      assert.ok(Object.isFrozen(result.assignmentReads.reads));
      assert.deepEqual(f.backend.snapshot, before);
    } finally {
      f.dispose();
    }
  });
