// @story #1210
import assert from 'node:assert/strict';
import test from 'node:test';

import {
  listIssueComments,
  ownedCommentMarker,
  upsertOwnedComment,
} from '../../../../task-tracker/lib/owned-comment.mjs';
import { parseCommentArgs } from '../../../../task-tracker/verbs/comment.mjs';

const repository = 'owner/repo';
const issue = 42;
const key = 'planning.audit-v1';
const marker = '<!-- aitm-owned-comment key="planning.audit-v1" -->';
const rendered = `hello\n\n${marker}`;

test('comment parses a strict target, key, and body file', () => {
  assert.deepEqual(parseCommentArgs(['42', '--key', key, '--body-file', '.tmp/gh/body.md']), {
    issueNumber: 42,
    key,
    bodyFile: '.tmp/gh/body.md',
  });
  assert.throws(() => parseCommentArgs(['42', '--key', key]), /body-file/);
  assert.throws(
    () => parseCommentArgs(['42', '--key', key, '--body-file', 'x', '--force']),
    /unknown/
  );
  assert.equal(ownedCommentMarker(key), marker);
  assert.throws(() => ownedCommentMarker('bad key'), /key/);
});

test('owned comment creates, updates, and no-ops exactly one stable marker', async () => {
  const calls = [];
  const comments = [];
  const deps = {
    listComments: async () => ({ issueId: 'I_42', comments: comments.map((x) => ({ ...x })) }),
    createComment: async ({ body }) => {
      calls.push(['create', body]);
      comments.push({ id: 'IC_1', body, repository, issue });
      return { id: 'IC_1' };
    },
    updateComment: async ({ id, body }) => {
      calls.push(['update', id, body]);
      comments[0].body = body;
      return { id };
    },
    readComment: async ({ id }) => comments.find((comment) => comment.id === id),
  };

  assert.equal(
    (await upsertOwnedComment({ repository, issue, key, body: 'hello', deps })).status,
    'created'
  );
  assert.equal(
    (await upsertOwnedComment({ repository, issue, key, body: 'hello', deps })).status,
    'no-op'
  );
  assert.equal(
    (await upsertOwnedComment({ repository, issue, key, body: 'changed', deps })).status,
    'updated'
  );
  assert.deepEqual(calls, [
    ['create', rendered],
    ['update', 'IC_1', `changed\n\n${marker}`],
  ]);
});

test('owned comment refuses duplicate markers and marker spoofing', async () => {
  await assert.rejects(
    () =>
      upsertOwnedComment({
        repository,
        issue,
        key,
        body: 'hello',
        deps: {
          listComments: async () => ({
            issueId: 'I_42',
            comments: [
              { id: 'IC_1', body: rendered, repository, issue },
              { id: 'IC_2', body: rendered, repository, issue },
            ],
          }),
        },
      }),
    /duplicate ownership marker/
  );
  await assert.rejects(
    () => upsertOwnedComment({ repository, issue, key, body: rendered }),
    /must not contain an aitm-owned-comment marker/
  );
});

test('write success is reported only after exact correlated read-back', async () => {
  await assert.rejects(
    () =>
      upsertOwnedComment({
        repository,
        issue,
        key,
        body: 'hello',
        deps: {
          listComments: async () => ({ issueId: 'I_42', comments: [] }),
          createComment: async () => ({ id: 'IC_1' }),
          readComment: async () => ({
            id: 'IC_1',
            body: 'different',
            repository,
            issue,
          }),
        },
      }),
    /read-back mismatch/
  );
});

test('a concurrent duplicate ownership marker after create is a refusal', async () => {
  let listCount = 0;
  await assert.rejects(
    () =>
      upsertOwnedComment({
        repository,
        issue,
        key,
        body: 'hello',
        deps: {
          listComments: async () => {
            listCount += 1;
            return {
              issueId: 'I_42',
              comments:
                listCount === 1
                  ? []
                  : [
                      { id: 'IC_1', body: rendered, repository, issue },
                      { id: 'IC_2', body: rendered, repository, issue },
                    ],
            };
          },
          createComment: async () => ({ id: 'IC_1' }),
          readComment: async () => ({ id: 'IC_1', body: rendered, repository, issue }),
        },
      }),
    /ownership read-back mismatch/
  );
});

test('ambiguous create transport is recovered only from one exact marker read-back', async () => {
  let pass = 0;
  const result = await upsertOwnedComment({
    repository,
    issue,
    key,
    body: 'hello',
    deps: {
      listComments: async () => {
        pass += 1;
        return {
          issueId: 'I_42',
          comments: pass === 1 ? [] : [{ id: 'IC_1', body: rendered, repository, issue }],
        };
      },
      createComment: async () => {
        throw new Error('connection reset after write');
      },
      readComment: async () => ({ id: 'IC_1', body: rendered, repository, issue }),
    },
  });
  assert.equal(result.status, 'created-recovered');

  await assert.rejects(
    () =>
      upsertOwnedComment({
        repository,
        issue,
        key,
        body: 'hello',
        deps: {
          listComments: async () => ({ issueId: 'I_42', comments: [] }),
          createComment: async () => {
            throw new Error('connection reset');
          },
        },
      }),
    /create outcome is unverified/
  );
});

test('comment listing is exhaustive, correlated, and cursor-safe', async () => {
  const responses = [
    {
      data: {
        repository: {
          issue: {
            id: 'I_42',
            number: 42,
            repository: { nameWithOwner: repository },
            comments: {
              nodes: [
                {
                  id: 'IC_1',
                  body: 'one',
                  issue: { number: 42, repository: { nameWithOwner: repository } },
                },
              ],
              pageInfo: { hasNextPage: true, endCursor: 'CURSOR_1' },
            },
          },
        },
      },
    },
    {
      data: {
        repository: {
          issue: {
            id: 'I_42',
            number: 42,
            repository: { nameWithOwner: repository },
            comments: {
              nodes: [
                {
                  id: 'IC_2',
                  body: 'two',
                  issue: { number: 42, repository: { nameWithOwner: repository } },
                },
              ],
              pageInfo: { hasNextPage: false, endCursor: null },
            },
          },
        },
      },
    },
  ];
  const result = await listIssueComments({
    repository,
    issue,
    graphql: async () => responses.shift(),
  });
  assert.deepEqual(
    result.comments.map((comment) => comment.id),
    ['IC_1', 'IC_2']
  );

  await assert.rejects(
    () =>
      listIssueComments({
        repository,
        issue,
        graphql: async () => ({
          data: {
            repository: {
              issue: {
                id: 'I_42',
                number: 42,
                repository: { nameWithOwner: repository },
                comments: { nodes: [], pageInfo: { hasNextPage: true, endCursor: null } },
              },
            },
          },
        }),
      }),
    /pagination/
  );
});

test('default GraphQL adapters create, read, update, and no-op through production queries', async () => {
  const comments = [];
  const graphql = async ({ query, variables }) => {
    if (query.includes('query AitmOwnedComments')) {
      return {
        data: {
          repository: {
            issue: {
              id: 'I_42',
              number: issue,
              repository: { nameWithOwner: repository },
              comments: {
                nodes: comments.map((comment) => ({
                  id: comment.id,
                  body: comment.body,
                  issue: { number: issue, repository: { nameWithOwner: repository } },
                })),
                pageInfo: { hasNextPage: false, endCursor: null },
              },
            },
          },
        },
      };
    }
    if (query.includes('mutation AitmCreateOwnedComment')) {
      comments.push({ id: 'IC_1', body: variables.body });
      return { data: { addComment: { commentEdge: { node: { id: 'IC_1' } } } } };
    }
    if (query.includes('mutation AitmUpdateOwnedComment')) {
      comments[0].body = variables.body;
      return { data: { updateIssueComment: { issueComment: { id: variables.id } } } };
    }
    if (query.includes('query AitmOwnedComment')) {
      const comment = comments.find((candidate) => candidate.id === variables.id);
      return {
        data: {
          node: {
            id: comment.id,
            body: comment.body,
            issue: { number: issue, repository: { nameWithOwner: repository } },
          },
        },
      };
    }
    throw new Error('unexpected GraphQL operation');
  };

  assert.equal(
    (await upsertOwnedComment({ repository, issue, key, body: 'first', deps: { graphql } })).status,
    'created'
  );
  assert.equal(
    (await upsertOwnedComment({ repository, issue, key, body: 'second', deps: { graphql } }))
      .status,
    'updated'
  );
  assert.equal(
    (await upsertOwnedComment({ repository, issue, key, body: 'second', deps: { graphql } }))
      .status,
    'no-op'
  );
});
