// @story #1212
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  assignmentSnapshotFromGraphql,
  fetchAssignmentSnapshot,
  sameOwnerSet,
  singletonOwner,
} from '../../../lib/assignment-snapshot.mjs';

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
        cursors.push(variables.cursor ?? null);
        return {
          repository: {
            issue: {
              assignees: { nodes: [{ login: 'ALICE' }] },
              projectItems: variables.cursor
                ? {
                    nodes: [
                      {
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

test('owner helpers are case-insensitive but reject duplicate singleton claims', () => {
  assert.equal(singletonOwner(['Alice']), 'alice');
  assert.equal(singletonOwner(['Alice', 'alice']), null);
  assert.equal(sameOwnerSet(['Alice'], ['alice']), true);
  assert.equal(sameOwnerSet(['alice', 'bob'], ['bob', 'ALICE']), true);
});
