// @story #1207
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import test from 'node:test';

import { tetherIssueToProject } from '../../../../gh/lib/project-tether.mjs';
import {
  deps as githubProjectsDeps,
  writeProjectFieldValue,
} from '../../../../gh/lib/github-projects.mjs';

const cfg = {
  repo: 'o/r',
  projectId: 'PROJECT',
  kanbanFieldId: 'STATUS',
  kanbanOptionAssigned: 'OPT_ASSIGNED',
};

function projectItem(id = 'ITEM') {
  return {
    id,
    project: { id: cfg.projectId, title: 'Board', url: 'https://example.test/board' },
    fieldValueByName: { name: 'Backlog', optionId: 'OPT_BACKLOG' },
    fieldValues: { nodes: [] },
  };
}

function makeTetherGql({ assignees = [], failAssigneeRead = false } = {}) {
  const writes = [];
  const runGql = async (query, variables) => {
    if (query.includes('linkProjectV2ToRepository')) {
      return { linkProjectV2ToRepository: { repository: { nameWithOwner: cfg.repo } } };
    }
    if (query.includes('repository(owner:') && query.includes('issue(number:')) {
      if (failAssigneeRead && query.includes('assignees(first: 100)')) {
        throw new Error('assignee snapshot transport unavailable');
      }
      return {
        repository: {
          id: 'REPO',
          issue: {
            id: `ISSUE_${variables.issue}`,
            number: Number(variables.issue),
            title: 'Issue',
            url: `https://example.test/o/r/issues/${variables.issue}`,
            assignees: { nodes: assignees.map((login) => ({ login })) },
            projectItems: {
              nodes: [projectItem()],
              pageInfo: { hasNextPage: false, endCursor: null },
            },
          },
        },
      };
    }
    if (query.includes('updateProjectV2ItemFieldValue')) {
      writes.push(variables);
      return { updateProjectV2ItemFieldValue: { projectV2Item: { id: variables.item } } };
    }
    throw new Error(`unexpected query: ${query}`);
  };
  return { runGql, writes };
}

test('direct tether library refuses Assigned with empty or unreadable assignees before Status write', async () => {
  for (const scenario of [{ assignees: [] }, { assignees: ['alice'], failAssigneeRead: true }]) {
    const harness = makeTetherGql(scenario);
    await assert.rejects(
      () =>
        tetherIssueToProject({
          cfg,
          issueNumber: 42,
          status: 'assigned',
          runGql: harness.runGql,
          sleep: async () => {},
        }),
      /assignee|required|verify|transport/i
    );
    assert.deepEqual(harness.writes, []);
  }
});

test('direct tether library locks once and writes Assigned when an assignee is present', async () => {
  const harness = makeTetherGql({ assignees: ['Alice'] });
  let locks = 0;
  const result = await tetherIssueToProject({
    cfg,
    issueNumber: 43,
    status: 'assigned',
    runGql: harness.runGql,
    withIssueLockFn: async (_options, fn) => {
      locks += 1;
      return fn();
    },
    projectDir: '/project',
    sleep: async () => {},
  });

  assert.equal(result.itemId, 'ITEM');
  assert.equal(locks, 1);
  assert.equal(harness.writes.length, 1);
  assert.equal(harness.writes[0].option, 'OPT_ASSIGNED');
});

test('direct tether library inherits an outer lock without reacquiring or deadlocking', async () => {
  const harness = makeTetherGql({ assignees: ['alice'] });
  const prior = process.env.AITM_ISSUE_LOCK_HELD;
  process.env.AITM_ISSUE_LOCK_HELD = '1';
  try {
    const result = await tetherIssueToProject({
      cfg,
      issueNumber: 44,
      status: 'assigned',
      runGql: harness.runGql,
      withIssueLockFn: async () => {
        throw new Error('nested lock acquisition attempted');
      },
      projectDir: '/project',
      sleep: async () => {},
    });
    assert.equal(result.itemId, 'ITEM');
    assert.equal(harness.writes.length, 1);
  } finally {
    if (prior === undefined) delete process.env.AITM_ISSUE_LOCK_HELD;
    else process.env.AITM_ISSUE_LOCK_HELD = prior;
  }
});

function fakeSpawn(handler) {
  return () => {
    const child = new EventEmitter();
    child.stdout = new EventEmitter();
    child.stderr = new EventEmitter();
    child.stdin = {
      end(input) {
        queueMicrotask(async () => {
          try {
            const payload = JSON.parse(String(input || '{}'));
            const data = await handler(payload.query || '', payload.variables || {});
            child.stdout.emit('data', JSON.stringify({ data }));
            child.emit('close', 0);
          } catch (error) {
            child.stderr.emit('data', error.message);
            child.emit('close', 1);
          }
        });
      },
    };
    return child;
  };
}

async function withFakeGithub(handler, fn) {
  const prior = githubProjectsDeps.spawn;
  githubProjectsDeps.spawn = fakeSpawn(handler);
  try {
    return await fn();
  } finally {
    githubProjectsDeps.spawn = prior;
  }
}

test('raw exported field writer refuses Assigned on empty/read-failed assignee snapshots', async () => {
  for (const failure of ['empty', 'transport']) {
    const writes = [];
    await withFakeGithub(
      async (query, variables) => {
        if (query.includes('assignees(first: 100)')) {
          if (failure === 'transport') throw new Error('raw guard transport unavailable');
          return {
            repository: {
              issue: {
                id: 'ISSUE',
                assignees: { nodes: [] },
                projectItems: {
                  nodes: [projectItem()],
                  pageInfo: { hasNextPage: false, endCursor: null },
                },
              },
            },
          };
        }
        if (query.includes('updateProjectV2ItemFieldValue')) {
          writes.push(variables);
          return { updateProjectV2ItemFieldValue: { projectV2Item: { id: variables.item } } };
        }
        throw new Error(`unexpected query: ${query}`);
      },
      async () => {
        await assert.rejects(
          () =>
            writeProjectFieldValue({
              repo: cfg.repo,
              issueNumber: 45,
              projectId: cfg.projectId,
              itemId: 'ITEM',
              fieldId: cfg.kanbanFieldId,
              value: { singleSelectOptionName: 'Assigned' },
              optionMap: { STATUS: { Assigned: 'OPT_ASSIGNED' } },
              projectDir: '/project',
              withIssueLockFn: async (_options, guarded) => guarded(),
            }),
          /assignee|required|verify|transport/i
        );
      }
    );
    assert.deepEqual(writes, []);
  }
});

test('raw writer permits guarded Assigned and preserves unrelated field writes', async () => {
  const writes = [];
  await withFakeGithub(
    async (query, variables) => {
      if (query.includes('assignees(first: 100)')) {
        return {
          repository: {
            issue: {
              id: 'ISSUE',
              assignees: { nodes: [{ login: 'alice' }] },
              projectItems: {
                nodes: [projectItem()],
                pageInfo: { hasNextPage: false, endCursor: null },
              },
            },
          },
        };
      }
      if (query.includes('updateProjectV2ItemFieldValue')) {
        writes.push(variables);
        return { updateProjectV2ItemFieldValue: { projectV2Item: { id: variables.item } } };
      }
      throw new Error(`unexpected query: ${query}`);
    },
    async () => {
      assert.equal(
        await writeProjectFieldValue({
          repo: cfg.repo,
          issueNumber: 46,
          projectId: cfg.projectId,
          itemId: 'ITEM',
          fieldId: cfg.kanbanFieldId,
          value: { singleSelectOptionName: 'Assigned' },
          optionMap: { STATUS: { Assigned: 'OPT_ASSIGNED' } },
          projectDir: '/project',
          withIssueLockFn: async (_options, guarded) => guarded(),
        }),
        true
      );
      assert.equal(
        await writeProjectFieldValue({
          projectId: cfg.projectId,
          itemId: 'ITEM',
          fieldId: 'RANK',
          value: { number: 7 },
        }),
        true
      );
    }
  );
  assert.equal(writes.length, 2);
});

test('raw writer preserves an explicitly non-Status single-select option named Assigned', async () => {
  const writes = [];
  await withFakeGithub(
    async (query, variables) => {
      assert.doesNotMatch(query, /assignees\(first: 100\)/);
      if (query.includes('updateProjectV2ItemFieldValue')) {
        writes.push(variables);
        return { updateProjectV2ItemFieldValue: { projectV2Item: { id: variables.item } } };
      }
      throw new Error(`unexpected query: ${query}`);
    },
    () =>
      writeProjectFieldValue({
        projectId: cfg.projectId,
        itemId: 'ITEM',
        fieldId: 'CUSTOM_OWNER_STATE',
        statusFieldId: cfg.kanbanFieldId,
        value: { singleSelectOptionName: 'Assigned' },
        optionMap: { CUSTOM_OWNER_STATE: { Assigned: 'CUSTOM_ASSIGNED' } },
      })
  );

  assert.equal(writes.length, 1);
  assert.equal(writes[0].field, 'CUSTOM_OWNER_STATE');
  assert.equal(writes[0].option, 'CUSTOM_ASSIGNED');
});
