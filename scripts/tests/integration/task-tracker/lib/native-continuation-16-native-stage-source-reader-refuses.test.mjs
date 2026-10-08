// @story #1855
// cspell:words unadmitted
import {
  assert,
  moveState,
  nativeFinalFixture,
  path,
  rawLifecycleSources,
  test,
  writeFileSync,
} from './native-continuation-fixtures.mjs';

for (const [name, alter] of [
  [
    'missing parent presence',
    (data) => {
      delete data.remote.parent[0].response.repository.issue.parent;
    },
  ],
  [
    'malformed parent identity',
    (data) => {
      data.remote.parent[0].response.repository.issue.parent = { number: -1 };
    },
  ],
  [
    'incomplete dependencies',
    (data) => {
      data.remote.dependencies[0].response.blockedBy.pageInfo.hasNextPage = true;
    },
  ],
  [
    'dependency count mismatch',
    (data) => {
      data.remote.dependencies[0].response.blockedBy.totalCount = 1;
    },
  ],
  [
    'missing child verification',
    (data) => {
      data.remote.children.identities = [];
    },
  ],
  [
    'changed child verification count',
    (data) => {
      data.remote.children.identities[0].response.repository.issue.subIssues.totalCount = 1;
    },
  ],
  [
    'missing configured membership',
    (data) => {
      data.remote.disposition[0].response.repository.issue.projectItems.nodes = [];
    },
  ],
  [
    'incomplete disposition fields',
    (data) => {
      delete data.remote.disposition[0].response.repository.issue.projectItems.nodes[0].fieldValues;
    },
  ],
])
  test(`native stage source reader refuses ${name} before effects`, async () => {
    const f = await nativeFinalFixture();
    try {
      writeFileSync(
        path.join(f.projectDir, '.ai-task-manager/task-tracker.json'),
        JSON.stringify({
          repo: f.context.repository,
          projectId: 'PVT_fixture',
          fieldDisposition: 'PVTF_disposition',
        })
      );
      f.restart((snapshot) => {
        snapshot.lifecycleSources = rawLifecycleSources(snapshot.observation);
        alter(snapshot.lifecycleSources);
      });
      const before = structuredClone(f.backend.snapshot),
        calls = [];
      await assert.rejects(
        moveState({
          cfg: {
            repo: f.context.repository,
            projectId: 'PVT_fixture',
            fieldDisposition: 'PVTF_disposition',
          },
          issueArg: String(f.context.issue),
          stateArg: 'test',
          resolvedFromState: 'develop',
          projectDir: f.projectDir,
          revisionBackend: f.backend,
          plan: { runGuardPipeline: true },
          SKIP_NETWORK: false,
          gh: async () => {
            calls.push('gh');
            throw new Error('unadmitted transport');
          },
          pexec: async () => {
            calls.push('pexec');
            throw new Error('unadmitted transport');
          },
        }),
        (error) => error.code === 'revision-authority-unavailable'
      );
      assert.deepEqual(calls, []);
      assert.deepEqual(f.backend.snapshot, before);
    } finally {
      f.dispose();
    }
  });
