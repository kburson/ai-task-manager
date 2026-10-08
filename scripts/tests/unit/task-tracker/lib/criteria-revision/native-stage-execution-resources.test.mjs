// @story #1855
// cspell:words nonstring
import test from 'node:test';
import assert from 'node:assert/strict';

const stage =
  await import('../../../../../task-tracker/lib/criteria-revision/stage-execution.mjs').catch(
    (error) => {
      if (error.code !== 'ERR_MODULE_NOT_FOUND') throw error;
      return {};
    }
  );
import { createRevisionMemory } from '../../../../../task-tracker/lib/criteria-revision/store.mjs';
import { makeLegacyRevisionFixture } from '../../../../fixtures/criteria-revision.mjs';

function resourceFixture() {
  const { observation } = makeLegacyRevisionFixture();
  const comment = {
    id: 71,
    node_id: 'native-comment-71',
    body: 'Original retained record bytes.\n',
    issue_url: 'https://api.github.com/repos/example/criteria/issues/124',
    user: { login: 'original-author' },
    created_at: '2026-10-06T09:00:00Z',
    updated_at: '2026-10-06T09:00:00Z',
  };
  const item = {
    id: 'item-124',
    project: { id: 'project-1' },
    content: { number: 124, repository: { nameWithOwner: 'example/criteria' } },
    fieldValues: {
      nodes: [
        {
          field: { id: 'status-field', name: 'Status' },
          name: 'Develop',
          optionId: 'develop-option',
        },
        { field: { id: 'estimate-field', name: 'Estimate' }, number: 80 },
      ],
      totalCount: 2,
      pageInfo: { hasNextPage: false, endCursor: null },
    },
  };
  return {
    observation,
    comments: [{ id: comment.node_id, body: comment.body }],
    hostMessages: [],
    nativeStageResources: {
      schema: 'aitm.native-stage-resources/v1',
      comments: [
        {
          id: String(comment.id),
          nodeId: comment.node_id,
          bytes: JSON.stringify(comment, null, 2),
        },
      ],
      membership: {
        projectId: 'project-1',
        itemId: 'item-124',
        bytes: JSON.stringify(item, null, 2),
      },
      local: {
        activeTask: { bytes: '{"original":"session"}\n' },
        actorTiming: null,
        actorFlush: null,
        wordCursor: { bytes: 'original cursor bytes\n' },
        trackerState: { bytes: '{}\n' },
        queue: null,
      },
    },
  };
}

test('native stage current resources retain independent complete fixture bytes without authority or effects', () => {
  const input = resourceFixture(),
    original = structuredClone(input);
  const backend = createRevisionMemory(input);
  assert.deepEqual(backend.snapshot.nativeStageResources, original.nativeStageResources);
  input.nativeStageResources.comments[0].bytes = '{}';
  const snapshot = backend.snapshot;
  snapshot.nativeStageResources.local.activeTask.bytes = 'changed detached copy';
  assert.deepEqual(backend.snapshot.nativeStageResources, original.nativeStageResources);
  const restored = createRevisionMemory(JSON.parse(JSON.stringify(backend.snapshot)));
  assert.deepEqual(restored.snapshot.nativeStageResources, original.nativeStageResources);
  assert.deepEqual(restored.observation, original.observation);
  assert.deepEqual(restored.effects, []);
  assert.equal(
    restored.admission?.state === 'allow',
    false,
    'coherent constructor DATA does not publish allow'
  );
});

for (const [name, change] of [
  [
    'unknown vector member',
    (x) => {
      x.nativeStageResources.ready = true;
    },
  ],
  [
    'unknown local resource',
    (x) => {
      x.nativeStageResources.local.path = process.cwd();
    },
  ],
  [
    'local path selector',
    (x) => {
      x.nativeStageResources.local.activeTask.path = process.cwd();
    },
  ],
  [
    'missing local member',
    (x) => {
      delete x.nativeStageResources.local.queue;
    },
  ],
  [
    'nonstring local bytes',
    (x) => {
      x.nativeStageResources.local.activeTask.bytes = {};
    },
  ],
  [
    'missing retained comment',
    (x) => {
      x.nativeStageResources.comments = [];
    },
  ],
  [
    'duplicate comment',
    (x) => {
      x.nativeStageResources.comments.push(structuredClone(x.nativeStageResources.comments[0]));
    },
  ],
  [
    'comment identity',
    (x) => {
      x.nativeStageResources.comments[0].nodeId = 'foreign';
    },
  ],
  [
    'comment bytes',
    (x) => {
      x.nativeStageResources.comments[0].bytes = '{';
    },
  ],
  [
    'foreign comment',
    (x) => {
      const c = JSON.parse(x.nativeStageResources.comments[0].bytes);
      c.issue_url += '5';
      x.nativeStageResources.comments[0].bytes = JSON.stringify(c);
    },
  ],
  [
    'retained body drift',
    (x) => {
      const c = JSON.parse(x.nativeStageResources.comments[0].bytes);
      c.body += 'changed';
      x.nativeStageResources.comments[0].bytes = JSON.stringify(c);
    },
  ],
  [
    'foreign item',
    (x) => {
      x.nativeStageResources.membership.itemId = 'other';
    },
  ],
  [
    'foreign project',
    (x) => {
      x.nativeStageResources.membership.projectId = 'other';
    },
  ],
  [
    'foreign content',
    (x) => {
      const m = JSON.parse(x.nativeStageResources.membership.bytes);
      m.content.number++;
      x.nativeStageResources.membership.bytes = JSON.stringify(m);
    },
  ],
  [
    'partial fields',
    (x) => {
      const m = JSON.parse(x.nativeStageResources.membership.bytes);
      m.fieldValues.pageInfo.hasNextPage = true;
      x.nativeStageResources.membership.bytes = JSON.stringify(m);
    },
  ],
  [
    'field census drift',
    (x) => {
      const m = JSON.parse(x.nativeStageResources.membership.bytes);
      m.fieldValues.totalCount++;
      x.nativeStageResources.membership.bytes = JSON.stringify(m);
    },
  ],
  [
    'duplicate field',
    (x) => {
      const m = JSON.parse(x.nativeStageResources.membership.bytes);
      m.fieldValues.nodes[1].field.id = m.fieldValues.nodes[0].field.id;
      x.nativeStageResources.membership.bytes = JSON.stringify(m);
    },
  ],
])
  test('native stage current resources refuse ' + name, () => {
    const input = resourceFixture();
    change(input);
    assert.throws(() => createRevisionMemory(input), /criteria-revision:native-stage-resources/);
  });
import { rawLifecycleSources } from '../../../../helpers/native-lifecycle-sources.mjs';
import * as stageStore from '../../../../../task-tracker/lib/criteria-revision/store.mjs';

test('historical lifecycle source shape shares native validation without a backend or readiness', () => {
  const { observation } = makeLegacyRevisionFixture();
  const input = { observation, source: rawLifecycleSources(observation) };
  const original = structuredClone(input);
  assert.equal(stageStore.assertNativeLifecycleSourceData(input), undefined);
  assert.deepEqual(input, original);
  for (const change of [
    (value) => {
      value.approved = true;
    },
    (value) => {
      value.source.remote.dependencies[0].request.issueNumber++;
    },
    (value) => {
      value.source.remote.parent[0].response.repository.issue.ready = true;
    },
    (value) => {
      value.source.bodyHash = 'sha256:' + '0'.repeat(64);
    },
    (value) => {
      value.observation.issue++;
    },
    (value) => {
      value.source.remote.comments.commit[0].response.push({ body: 'x', ready: true });
    },
    (value) => {
      value.source.remote.children.pages[0].response.repository.issue.subIssues.pageInfo.hasNextPage =
        'false';
    },
  ]) {
    const bad = structuredClone(input);
    change(bad);
    assert.throws(() => stageStore.assertNativeLifecycleSourceData(bad), /criteria-revision:/);
  }
});

test('recorded CodeComplete Git data uses native file and dirty parsers with exact leaf membership', async () => {
  const code = await import('../../../../../task-tracker/lib/code-complete-gate.mjs');
  const projectDir = process.cwd(),
    sha = 'a'.repeat(40);
  const input = {
    projectDir,
    shas: [sha],
    reads: [
      { kind: 'root', cwd: projectDir, stdout: projectDir + '\n', stderr: '', exitCode: 0 },
      {
        kind: 'files',
        cwd: projectDir,
        sha,
        stdout: ' first.mjs \nsecond.mjs\n\n',
        stderr: '',
        exitCode: 0,
      },
      {
        kind: 'dirty',
        cwd: projectDir,
        stdout: ' M first.mjs\n?? untracked.mjs\n A third.mjs\n',
        stderr: '',
        exitCode: 0,
      },
    ],
  };
  assert.deepEqual(code.deriveRecordedCodeCompleteGit(input), {
    touchedFiles: ['first.mjs', 'second.mjs'],
    dirtyFiles: ['first.mjs', 'third.mjs'],
  });
  for (const change of [
    (value) => {
      value.reads.pop();
    },
    (value) => {
      value.reads[1].exitCode = 1;
    },
    (value) => {
      value.reads[0].stdout = 'foreign\n';
    },
    (value) => {
      value.reads[1].sha = 'b'.repeat(40);
    },
    (value) => {
      value.reads.push(structuredClone(value.reads[2]));
    },
    (value) => {
      value.reads[2].stderr = 'partial';
    },
    (value) => {
      value.reads[2].ready = true;
    },
  ]) {
    const bad = structuredClone(input);
    change(bad);
    assert.throws(() => code.deriveRecordedCodeCompleteGit(bad), /code-complete-data/);
  }
});

test('recorded transition actor follows native environment fallback without authorizing caller override', async () => {
  const { deriveRecordedTransitionActor } =
    await import('../../../../../task-tracker/lib/move-state/transition-commit.mjs');
  for (const [input, expected] of [
    [{ githubActor: 'github-owner', user: 'local-user' }, 'github-owner'],
    [{ githubActor: '', user: 'local-user' }, 'local-user'],
    [{ githubActor: null, user: 'local-user' }, 'local-user'],
    [{ githubActor: '', user: '' }, 'aitm'],
    [{ githubActor: null, user: null }, 'aitm'],
  ])
    assert.equal(deriveRecordedTransitionActor(input), expected);
  for (const input of [
    { githubActor: null, user: null, actor: 'caller' },
    { githubActor: 1, user: null },
    { user: null },
  ])
    assert.throws(
      () => deriveRecordedTransitionActor(input),
      (error) => error.message.includes('recorded-transition-actor')
    );
});

function sourceItemFixture() {
  return {
    config: {
      projectId: 'PVT_native',
      kanbanFieldId: 'FIELD_status',
      kanbanOptionDevelop: 'OPTION_develop',
    },
    item: {
      id: 'PVTI_subject',
      fieldValues: {
        nodes: [{ field: { id: 'FIELD_status' }, name: 'Develop', optionId: 'OPTION_develop' }],
      },
    },
    assignmentReads: {
      reads: [
        {
          kind: 'page',
          response: {
            repository: {
              issue: {
                projectItems: {
                  nodes: [
                    {
                      id: 'PVTI_subject',
                      project: { id: 'PVT_native' },
                      fieldValueByName: { name: 'Develop' },
                    },
                  ],
                },
              },
            },
          },
        },
      ],
    },
  };
}

test('native stage source item binds actual status option and unique assignment membership', () => {
  assert.equal(stage.assertNativeStageSourceItem(sourceItemFixture()), undefined);
  for (const [name, change] of [
    [
      'coherent wrong option',
      (x) => {
        x.item.fieldValues.nodes[0].optionId = 'OPTION_other';
      },
    ],
    [
      'wrong item',
      (x) => {
        x.item.id = 'PVTI_other';
      },
    ],
    [
      'wrong assignment item',
      (x) => {
        x.assignmentReads.reads[0].response.repository.issue.projectItems.nodes[0].id =
          'PVTI_other';
      },
    ],
    [
      'wrong assignment state',
      (x) => {
        x.assignmentReads.reads[0].response.repository.issue.projectItems.nodes[0].fieldValueByName.name =
          'Test';
      },
    ],
    [
      'duplicate status',
      (x) => {
        x.item.fieldValues.nodes.push(structuredClone(x.item.fieldValues.nodes[0]));
      },
    ],
    [
      'duplicate membership',
      (x) => {
        const n = x.assignmentReads.reads[0].response.repository.issue.projectItems.nodes;
        n.push(structuredClone(n[0]));
      },
    ],
    [
      'missing status',
      (x) => {
        x.item.fieldValues.nodes = [];
      },
    ],
    [
      'foreign project',
      (x) => {
        x.assignmentReads.reads[0].response.repository.issue.projectItems.nodes[0].project.id =
          'PVT_other';
      },
    ],
  ]) {
    const input = sourceItemFixture();
    change(input);
    assert.throws(() => stage.assertNativeStageSourceItem(input), /native-stage-source-item/, name);
  }
});

test('native stage persistence rejects caller token and closed-input authority additions before writes', async () => {
  const backend = createRevisionMemory(resourceFixture()),
    original = backend.snapshot;
  const context = {
    repository: backend.observation.repository,
    issue: backend.observation.issue,
    executor: backend.observation.executor,
  };
  await stageStore.withMemoryInterlock(backend, context, async (capability) => {
    await assert.rejects(
      stageStore.persistMemoryNativeStage({ backend, capability, context, token: {} }),
      /revision-authority-unavailable/
    );
    for (const extra of [
      { header: {} },
      { journal: {} },
      { ready: true },
      { observe: () => ({ ready: true }) },
    ])
      await assert.rejects(
        stageStore.persistMemoryNativeStage({ backend, capability, context, token: {}, ...extra }),
        /native-stage-input/
      );
  });
  assert.deepEqual(backend.snapshot, original);
  assert.ok(backend.effects.every((effect) => !effect.endsWith('-write')));
});
