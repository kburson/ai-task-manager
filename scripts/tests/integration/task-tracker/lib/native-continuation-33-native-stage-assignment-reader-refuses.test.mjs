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

for (const [name, alter] of [
  [
    'unused page',
    (pairs) => {
      const extra = structuredClone(pairs.pages[1]);
      extra.request.cursor = 'unused';
      pairs.pages.push(extra);
    },
  ],
  [
    'missing page',
    (pairs) => {
      pairs.pages.pop();
    },
  ],
  [
    'repeated cursor',
    (pairs) => {
      pairs.pages[1].response.repository.issue.projectItems.pageInfo = {
        hasNextPage: true,
        endCursor: 'native-next',
      };
    },
  ],
  [
    'owner drift on page',
    (pairs) => {
      pairs.pages[1].response.repository.issue.assignees.nodes = [{ login: 'other-owner' }];
    },
  ],
  [
    'owner drift on final reread',
    (pairs) => {
      pairs.final[0].response.repository.issue.assignees.nodes = [{ login: 'other-owner' }];
    },
  ],
  [
    'foreign final project',
    (pairs) => {
      pairs.final[0].response.node.project.id = 'PVT_foreign';
    },
  ],
  [
    'ambiguous configured membership',
    (pairs) => {
      const nodes = pairs.pages[1].response.repository.issue.projectItems.nodes;
      nodes.push({ ...structuredClone(nodes[0]), id: 'PVTI_other' });
    },
  ],
  [
    'duplicate item identity',
    (pairs) => {
      pairs.pages[0].response.repository.issue.projectItems.nodes = structuredClone(
        pairs.pages[1].response.repository.issue.projectItems.nodes
      );
    },
  ],
  [
    'missing terminal page flag',
    (pairs) => {
      delete pairs.pages[1].response.repository.issue.projectItems.pageInfo.hasNextPage;
    },
  ],
  [
    'malformed owner',
    (pairs) => {
      pairs.pages[0].response.repository.issue.assignees.nodes = [{ login: '@not-native-login' }];
    },
  ],
  [
    'truncated assignees',
    (pairs) => {
      pairs.pages[0].response.repository.issue.assignees.nodes = Array.from(
        { length: 100 },
        (_, i) => ({ login: `owner-${i}` })
      );
    },
  ],
  [
    'unreadable membership',
    (pairs) => {
      pairs.pages[1].response.repository.issue.projectItems = null;
    },
  ],
  [
    'changed final state',
    (pairs) => {
      pairs.final[0].response.node.fieldValueByName.name = 'Test';
    },
  ],
  [
    'wrong final item',
    (pairs) => {
      pairs.final[0].request.item = 'PVTI_foreign';
    },
  ],
])
  test(`native stage assignment reader refuses ${name} before effects`, async () => {
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
      const pairs = nativeAssignmentPairs(f.context, true);
      alter(pairs);
      f.restart((snapshot) => {
        snapshot.lifecycleSources = rawLifecycleSources(snapshot.observation);
        snapshot.lifecycleSources.remote.assignments = pairs;
      });
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
      f.dispose();
    }
  });
