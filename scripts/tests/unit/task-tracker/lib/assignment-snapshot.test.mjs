// @story #1212
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  assignmentSnapshotFromGraphql,
  fetchAssignmentSnapshot,
  sameOwnerSet,
  singletonOwner,
} from '../../../../task-tracker/lib/assignment-snapshot.mjs';

const cfg = { repo: 'acme/widgets', projectId: 'PVT_target' };

test('assignmentSnapshotFromGraphql resolves the exact configured project and assignees', () => {
  const snapshot = assignmentSnapshotFromGraphql(
    {
      repository: {
        issue: {
          assignees: { nodes: [{ login: 'Alice' }] },
          projectItems: {
            nodes: [
              { project: { id: 'other' }, fieldValueByName: { name: 'Backlog' } },
              { project: { id: 'PVT_target' }, fieldValueByName: { name: 'Develop' } },
            ],
            pageInfo: { hasNextPage: false, endCursor: null },
          },
        },
      },
    },
    cfg
  );
  assert.deepEqual(snapshot, { state: 'develop', assignees: ['alice'] });
});

test('assignmentSnapshotFromGraphql fails closed on missing issue or configured project', () => {
  assert.throws(() => assignmentSnapshotFromGraphql({}, cfg), /issue.*missing/i);
  assert.throws(
    () =>
      assignmentSnapshotFromGraphql(
        {
          repository: {
            issue: {
              assignees: { nodes: [] },
              projectItems: { nodes: [], pageInfo: { hasNextPage: false, endCursor: null } },
            },
          },
        },
        cfg
      ),
    /configured project.*missing/i
  );
});

test('assignmentSnapshotFromGraphql refuses duplicate configured-project memberships', () => {
  assert.throws(
    () =>
      assignmentSnapshotFromGraphql(
        {
          repository: {
            issue: {
              assignees: { nodes: [{ login: 'alice' }] },
              projectItems: {
                nodes: [
                  { project: { id: 'PVT_target' }, fieldValueByName: { name: 'Plan' } },
                  { project: { id: 'PVT_target' }, fieldValueByName: { name: 'Develop' } },
                ],
              },
            },
          },
        },
        cfg
      ),
    /membership is ambiguous/i
  );
});

test('fetchAssignmentSnapshot paginates project membership without accepting partial scans', async () => {
  const cursors = [];
  const snapshot = await fetchAssignmentSnapshot({
    issueNumber: 12,
    cfg,
    deps: {
      gql: async (_query, variables) => {
        if (variables.item) {
          return {
            repository: { issue: { assignees: { nodes: [{ login: 'ALICE' }] } } },
            node: {
              project: { id: 'PVT_target' },
              fieldValueByName: { name: 'Ready for Planning' },
            },
          };
        }
        cursors.push(variables.cursor ?? null);
        return {
          repository: {
            issue: {
              assignees: { nodes: [{ login: 'ALICE' }] },
              projectItems: variables.cursor
                ? {
                    nodes: [
                      {
                        id: 'PVTI_target',
                        project: { id: 'PVT_target' },
                        fieldValueByName: { name: 'Ready for Planning' },
                      },
                    ],
                    pageInfo: { hasNextPage: false, endCursor: null },
                  }
                : {
                    nodes: [{ project: { id: 'other' }, fieldValueByName: { name: 'Backlog' } }],
                    pageInfo: { hasNextPage: true, endCursor: 'next' },
                  },
            },
          },
        };
      },
    },
  });
  assert.deepEqual(cursors, [null, 'next']);
  assert.deepEqual(snapshot, { state: 'ready-for-plan', assignees: ['alice'] });
});

test('fetchAssignmentSnapshot re-reads Status and owners atomically after pagination', async () => {
  let page = 0;
  const snapshot = await fetchAssignmentSnapshot({
    issueNumber: 12,
    cfg,
    deps: {
      gql: async (_query, variables) => {
        if (variables.item) {
          return {
            repository: { issue: { assignees: { nodes: [{ login: 'alice' }] } } },
            node: {
              project: { id: cfg.projectId },
              fieldValueByName: { name: 'Develop' },
            },
          };
        }
        page += 1;
        return {
          repository: {
            issue: {
              assignees: { nodes: [{ login: 'alice' }] },
              projectItems:
                page === 1
                  ? {
                      nodes: [{ id: 'other', project: { id: 'OTHER' } }],
                      pageInfo: { hasNextPage: true, endCursor: 'next' },
                    }
                  : {
                      nodes: [
                        {
                          id: 'PVTI_target',
                          project: { id: cfg.projectId },
                          fieldValueByName: { name: 'Plan' },
                        },
                      ],
                      pageInfo: { hasNextPage: false, endCursor: null },
                    },
            },
          },
        };
      },
    },
  });

  assert.deepEqual(snapshot, { state: 'develop', assignees: ['alice'] });
});

test('fetchAssignmentSnapshot refuses pagination with a missing or repeated cursor', async () => {
  const base = {
    repository: {
      issue: {
        assignees: { nodes: [] },
        projectItems: { nodes: [], pageInfo: { hasNextPage: true, endCursor: null } },
      },
    },
  };
  await assert.rejects(
    fetchAssignmentSnapshot({ issueNumber: 12, cfg, deps: { gql: async () => base } }),
    /missing cursor/i
  );
});

test('fetchAssignmentSnapshot refuses owner drift across project-membership pages', async () => {
  let page = 0;
  await assert.rejects(
    fetchAssignmentSnapshot({
      issueNumber: 12,
      cfg,
      deps: {
        gql: async () => {
          page += 1;
          return {
            repository: {
              issue: {
                assignees: { nodes: [{ login: page === 1 ? 'alice' : 'bob' }] },
                projectItems: {
                  nodes:
                    page === 1
                      ? [{ project: { id: 'OTHER' }, fieldValueByName: { name: 'Plan' } }]
                      : [
                          {
                            project: { id: cfg.projectId },
                            fieldValueByName: { name: 'Develop' },
                          },
                        ],
                  pageInfo: {
                    hasNextPage: page === 1,
                    endCursor: page === 1 ? 'next' : null,
                  },
                },
              },
            },
          };
        },
      },
    }),
    /assignees changed during pagination/
  );
});

for (const paginated of [false, true]) {
  test('location snapshot uses one final authority response, paginated=' + paginated, async () => {
    const item = { id: 'item', project: { id: cfg.projectId }, fieldValueByName: { name: 'Plan' } };
    const snapshot = await fetchAssignmentSnapshot({
      issueNumber: 12,
      cfg,
      includeLocation: true,
      deps: {
        gql: async (query, vars) => {
          assert.ok(query.includes('viewer { login }'));
          assert.ok(query.includes('issue(number: $issue) { body state'));
          const another = paginated && !vars.cursor && !vars.item;
          const final = !paginated || Boolean(vars.item);
          return {
            viewer: { login: final ? 'Operator' : 'old' },
            node: item,
            repository: {
              issue: {
                body: final ? 'current\n' : 'old',
                state: final ? 'OPEN' : 'CLOSED',
                assignees: { nodes: [{ login: 'operator' }] },
                projectItems: {
                  nodes: another ? [] : [item],
                  pageInfo: { hasNextPage: another, endCursor: 'next' },
                },
              },
            },
          };
        },
      },
    });
    assert.deepEqual(snapshot, {
      state: 'plan',
      assignees: ['operator'],
      body: 'current\n',
      issueState: 'OPEN',
      currentUser: 'operator',
    });
  });
}
test('location snapshot refuses unreadable viewer, owners or body', async () => {
  const issue = {
    body: '',
    state: 'OPEN',
    assignees: { nodes: [] },
    projectItems: {
      nodes: [{ project: { id: cfg.projectId }, fieldValueByName: { name: 'Plan' } }],
    },
  };
  for (const [viewer, fields] of [
    [null, {}],
    [{ login: 'ok' }, { body: null }],
    [{ login: 'ok' }, { assignees: { nodes: [null] } }],
  ]) {
    await assert.rejects(
      fetchAssignmentSnapshot({
        issueNumber: 12,
        cfg,
        includeLocation: true,
        deps: { gql: async () => ({ viewer, repository: { issue: { ...issue, ...fields } } }) },
      }),
      /location authority is unreadable/
    );
  }
});

test('owner helpers are case-insensitive but reject duplicate singleton claims', () => {
  assert.equal(singletonOwner(['Alice']), 'alice');
  assert.equal(singletonOwner(['Alice', 'alice']), null);
  assert.equal(sameOwnerSet(['Alice'], ['alice']), true);
  assert.equal(sameOwnerSet(['alice', 'bob'], ['bob', 'ALICE']), true);
});
