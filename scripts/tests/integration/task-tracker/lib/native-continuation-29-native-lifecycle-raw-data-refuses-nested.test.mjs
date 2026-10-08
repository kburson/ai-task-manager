// @story #1855
import {
  assert,
  evaluateNativeRevisionStageGuards,
  nativeFinalFixture,
  path,
  rawLifecycleSources,
  test,
  withRevisionConsumer,
  writeFileSync,
} from './native-continuation-fixtures.mjs';

for (const [name, alter] of [
  [
    'parent extra decision',
    (r) => {
      r.parent[0].response.repository.issue.ready = true;
    },
  ],
  [
    'dependency extra decision',
    (r) => {
      r.dependencies[0].response.blockedBy.ready = true;
    },
  ],
  [
    'child page extra decision',
    (r) => {
      r.children.pages[0].response.repository.issue.subIssues.approved = true;
    },
  ],
  [
    'disposition extra field',
    (r) => {
      r.disposition[0].response.repository.issue.projectItems.nodes[0].ready = true;
    },
  ],
  [
    'comment extra authority',
    (r) => {
      r.comments.commit[0].response = [{ id: 1, body: 'ordinary note', ready: true }];
    },
  ],
])
  test(`native lifecycle raw data refuses nested ${name}`, async () => {
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
      let refusal;
      try {
        f.restart((snapshot) => {
          snapshot.lifecycleSources = rawLifecycleSources(snapshot.observation);
          alter(snapshot.lifecycleSources.remote);
        });
        await withRevisionConsumer(
          {
            repository: f.context.repository,
            issue: f.context.issue,
            backend: f.backend,
            projectDir: f.projectDir,
            activity: 'stage-write',
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
      } catch (error) {
        refusal = error;
      }
      assert.ok(
        refusal,
        'closed native data must refuse unknown nested input, independent of ordinary unmet guards'
      );
      assert.deepEqual(f.effects, []);
    } finally {
      f.dispose();
    }
  });
