// @story #1855
import {
  assert,
  evaluateNativeRevisionStageGuards,
  nativeFinalFixture,
  nativeStageGuards,
  path,
  rawLifecycleSources,
  test,
  withRevisionConsumer,
  writeFileSync,
} from './native-continuation-fixtures.mjs';

for (const kind of ['missing', 'substitute-function', 'reordered'])
  test(`native stage read pipeline refuses ${kind} native catalog`, async () => {
    const f = await nativeFinalFixture();
    const originals = [...nativeStageGuards.develop.exit],
      run = originals[1].run;
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
      f.restart((snapshot) => {
        snapshot.lifecycleSources = rawLifecycleSources(snapshot.observation);
      });
      if (kind === 'missing') nativeStageGuards.develop.exit.shift();
      if (kind === 'substitute-function') originals[1].run = () => ({ ok: true });
      if (kind === 'reordered') nativeStageGuards.develop.exit.reverse();
      const before = structuredClone(f.backend.snapshot);
      await assert.rejects(
        withRevisionConsumer(
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
        ),
        (error) => error.code === 'revision-authority-unavailable'
      );
      assert.deepEqual(f.backend.snapshot, before);
    } finally {
      originals[1].run = run;
      nativeStageGuards.develop.exit.splice(0, nativeStageGuards.develop.exit.length, ...originals);
      f.dispose();
    }
  });
