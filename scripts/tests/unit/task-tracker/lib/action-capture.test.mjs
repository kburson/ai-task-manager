// @story #1295
import assert from 'node:assert/strict';
import test from 'node:test';

import {
  ACTION_CAPTURE_SCHEMA,
  classifyGhCall,
} from '../../../../task-tracker/lib/action-capture.mjs';

const classify = (args, input = '') => classifyGhCall(args, Buffer.from(input));

test('action capture exposes one stable schema identifier', () => {
  assert.equal(ACTION_CAPTURE_SCHEMA, 'aitm.github-action-capture/v1');
});

test('classifies governed issue mutation families', () => {
  const cases = [
    { args: ['issue', 'create', '--title', 'Story'], kind: 'issue-create' },
    { args: ['issue', 'edit', '42', '--body-file', '-'], kind: 'issue-body' },
    { args: ['issue', 'edit', '42', '--title', 'New'], kind: 'issue-title' },
    { args: ['issue', 'edit', '42', '--add-label', 'infra'], kind: 'issue-labels' },
    { args: ['issue', 'edit', '42', '--remove-label', 'infra'], kind: 'issue-labels' },
    { args: ['issue', 'edit', '42', '--add-assignee', '@me'], kind: 'issue-ownership' },
    { args: ['issue', 'edit', '42', '--remove-assignee', '@me'], kind: 'issue-ownership' },
    { args: ['issue', 'comment', '42', '--body', 'note'], kind: 'issue-comment' },
    { args: ['issue', 'close', '42'], kind: 'issue-close' },
    { args: ['issue', 'reopen', '42'], kind: 'issue-reopen' },
  ];

  for (const { args, kind } of cases) {
    assert.deepEqual(classify(args), {
      operationClass: 'mutation',
      mutationKind: kind,
    });
  }
});

test('classifies project, GraphQL, and REST mutations', () => {
  assert.deepEqual(classify(['project', 'item-edit', '--id', 'PVTI_x']), {
    operationClass: 'mutation',
    mutationKind: 'project',
  });
  assert.deepEqual(
    classify(
      ['api', 'graphql', '--input', '-'],
      JSON.stringify({
        query:
          'mutation Update($id: ID!) { updateProjectV2ItemFieldValue(input: {}) { clientMutationId } }',
      })
    ),
    { operationClass: 'mutation', mutationKind: 'graphql' }
  );
  assert.deepEqual(classify(['api', '-X', 'PATCH', 'repos/o/r/issues/42']), {
    operationClass: 'mutation',
    mutationKind: 'rest',
  });
  assert.deepEqual(classify(['api', 'repos/o/r/issues/42', '-f', 'state=closed']), {
    operationClass: 'mutation',
    mutationKind: 'rest',
  });
});

test('classifies GitHub reads without inventing a mutation kind', () => {
  for (const args of [
    ['issue', 'view', '42', '--json', 'body'],
    ['issue', 'list', '--state', 'open'],
    ['api', 'repos/o/r/issues/42'],
    ['api', 'graphql', '--input', '-'],
  ]) {
    const input = args.includes('graphql')
      ? JSON.stringify({ query: 'query { viewer { login } }' })
      : '';
    assert.deepEqual(classify(args, input), {
      operationClass: 'read',
      mutationKind: null,
    });
  }
});
