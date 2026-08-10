// @story #1070
// cspell:ignore Unrequested
import { strict as assert } from 'node:assert';
import test from 'node:test';
import { inspect } from 'node:util';

import {
  hashRecordPayload,
  renderAitmRecord,
} from '../../../../lib/github-records/record-envelope.mjs';
import * as commentStore from '../../../../lib/github-records/github-comment-store.mjs';

const { getCommentsByNodeIds } = commentStore;

const repository = 'kburson/ai-task-manager';
const issue = 1070;

function body(recordId) {
  const payload = { result: recordId };
  return renderAitmRecord({
    envelope: {
      schema: 'aitm.record/v1',
      recordId,
      recordType: 'verification-evidence',
      repository,
      issue,
      createdAt: '2026-08-01T14:00:00.000Z',
      authority: {
        grantId: '01J00000000000000000000009',
        epoch: 1,
        actor: 'codex/session-1070',
      },
      predecessor: null,
      supersedes: null,
      payloadHash: hashRecordPayload(payload),
      payload,
    },
    visibleMarkdown: 'Verified.\n',
  });
}

function node(id, recordId) {
  return {
    __typename: 'IssueComment',
    id,
    body: body(recordId),
    updatedAt: '2026-08-01T14:01:00.000Z',
    issue: { number: issue, repository: { nameWithOwner: repository } },
  };
}

test('getCommentsByNodeIds retrieves opaque IDs in one nodes query', async () => {
  const calls = [];
  const ids = ['IC_kwDOOpaqueA', 'IC_kwDOOpaqueB'];
  const result = await getCommentsByNodeIds({
    ids,
    repository,
    issue,
    graphql: async (request) => {
      calls.push(request);
      return {
        data: {
          nodes: [
            node(ids[0], '01J00000000000000000000000'),
            node(ids[1], '01J00000000000000000000001'),
          ],
        },
      };
    },
  });

  assert.equal(calls.length, 1);
  assert.match(calls[0].query, /nodes\s*\(\s*ids:\s*\$ids\s*\)/);
  assert.deepEqual(calls[0].variables, { ids });
  assert.deepEqual(
    result.map((comment) => comment.commentNodeId),
    ids
  );
});

test('parsePreloadedIssueComments validates cached GraphQL nodes without transport', () => {
  const record = node('IC_kwDOPreloaded', '01J00000000000000000000022');
  const ordinary = {
    ...node('IC_kwDOOrdinaryPreloaded', '01J00000000000000000000023'),
    body: 'Ordinary issue discussion.',
  };

  const result = commentStore.parsePreloadedIssueComments({
    nodes: [ordinary, record],
    repository,
    issue,
  });

  assert.deepEqual(
    result.map((comment) => comment.commentNodeId),
    ['IC_kwDOPreloaded']
  );
  assert.equal(result[0].envelope.recordId, '01J00000000000000000000022');
});

test('parsePreloadedIssueComments fails closed on malformed cached AITM records', () => {
  assert.throws(
    () =>
      commentStore.parsePreloadedIssueComments({
        nodes: [
          {
            ...node('IC_kwDOMalformedPreloaded', '01J00000000000000000000024'),
            body: '<!-- aitm-record malformed -->',
          },
        ],
        repository,
        issue,
      }),
    (error) => error.category === 'envelope'
  );
});

test('GitHub timestamps without fractional seconds are accepted and normalized', async () => {
  const id = 'IC_kwDOGitHubTimestamp';
  const githubNode = {
    ...node(id, '01J00000000000000000000012'),
    updatedAt: '2026-08-02T01:52:38Z',
  };

  const [comment] = await getCommentsByNodeIds({
    ids: [id],
    repository,
    issue,
    graphql: async () => ({ data: { nodes: [githubNode] } }),
  });

  assert.equal(comment.updatedAt, '2026-08-02T01:52:38.000Z');
});

test('GitHub timestamps reject impossible dates and unsupported precision', async () => {
  const id = 'IC_kwDOInvalidTimestamp';
  for (const updatedAt of ['2026-02-30T12:00:00Z', '2026-08-01T14:01:00.0009Z']) {
    await assert.rejects(
      getCommentsByNodeIds({
        ids: [id],
        repository,
        issue,
        graphql: async () => ({
          data: {
            nodes: [
              {
                ...node(id, '01J00000000000000000000017'),
                updatedAt,
              },
            ],
          },
        }),
      }),
      (error) => error.category === 'response-shape'
    );
  }
});

test('GraphQL transport and partial responses fail with safe normalized categories', async () => {
  const secret = 'ghp_1234567890abcdefghijklmnop';
  const cases = [
    [async () => Promise.reject(new Error(secret)), 'transport'],
    [async () => ({ data: { nodes: [] }, errors: [{ message: secret }] }), 'partial-response'],
    [
      async () => ({
        data: { nodes: [node('IC_kwDOOpaqueA', '01J00000000000000000000000')] },
        errors: { message: secret },
      }),
      'partial-response',
    ],
  ];

  for (const [graphql, category] of cases) {
    await assert.rejects(
      getCommentsByNodeIds({ ids: ['IC_kwDOOpaqueA'], repository, issue, graphql }),
      (error) => {
        assert.equal(error.name, 'GitHubCommentStoreError');
        assert.equal(error.category, category);
        assert.doesNotMatch(error.message, /ghp_/);
        if (category === 'transport') {
          assert.equal(error.cause?.message, secret);
          assert.match(inspect(error), /ghp_/);
        } else {
          assert.equal(error.cause, undefined);
          assert.doesNotMatch(inspect(error), /ghp_/);
        }
        return true;
      }
    );
  }
});

test('batched reads reject missing, deleted, wrong, or uncorrelated nodes', async () => {
  const ids = ['IC_kwDOOpaqueA', 'IC_kwDOOpaqueB'];
  const valid = [
    node(ids[0], '01J00000000000000000000000'),
    node(ids[1], '01J00000000000000000000001'),
  ];
  const cases = [
    [null, 'partial-response'],
    [{ data: {} }, 'partial-response'],
    [{ data: { nodes: [valid[0]] } }, 'missing-node'],
    [{ data: { nodes: [valid[0], null] } }, 'missing-node'],
    [{ data: { nodes: [valid[0], { ...valid[1], __typename: 'Issue' }] } }, 'wrong-type'],
    [{ data: { nodes: [valid[1], valid[0]] } }, 'node-mismatch'],
    [{ data: { nodes: [valid[0], { ...valid[1], id: valid[0].id }] } }, 'node-mismatch'],
    [{ data: { nodes: [valid[0], { ...valid[1], id: 'IC_kwDOUnrequested' }] } }, 'node-mismatch'],
    [
      {
        data: {
          nodes: [
            valid[0],
            {
              ...valid[1],
              issue: { ...valid[1].issue, number: 999 },
            },
          ],
        },
      },
      'correlation',
    ],
    [{ data: { nodes: [valid[0], { ...valid[1], body: 'not a record' }] } }, 'envelope'],
    [
      { data: { nodes: [valid[0], { ...valid[1], updatedAt: 'not-an-instant' }] } },
      'response-shape',
    ],
  ];

  for (const [response, category] of cases) {
    await assert.rejects(
      getCommentsByNodeIds({ ids, repository, issue, graphql: async () => response }),
      (error) => error.name === 'GitHubCommentStoreError' && error.category === category
    );
  }
});

test('batched reads reject invalid inputs before invoking transport', async () => {
  let calls = 0;
  const graphql = async () => {
    calls += 1;
    return { data: { nodes: [] } };
  };
  const cases = [
    { ids: [] },
    { ids: ['duplicate', 'duplicate'] },
    { ids: [' padded '] },
    { ids: ['bad\ncontrol'] },
    { ids: [42] },
    { ids: 'not-an-array' },
    { repository: 'not-a-repository' },
    { issue: 0 },
    { graphql: null },
  ];

  for (const overrides of cases) {
    await assert.rejects(
      getCommentsByNodeIds({
        ids: ['opaque-do-not-decode'],
        repository,
        issue,
        graphql,
        ...overrides,
      }),
      (error) => error.name === 'GitHubCommentStoreError' && error.category === 'input'
    );
  }
  assert.equal(calls, 0);
});

test('updates use the opaque node ID through GraphQL before read-back', async () => {
  const { updateIssueComment } = commentStore;
  const id = 'IC_kwDOGraphqlUpdate';
  const recordBody = body('01J00000000000000000000013');
  const calls = [];
  const graphql = async (request) => {
    calls.push(request);
    if (request.query.includes('mutation AitmUpdateIssueComment')) {
      return { data: { updateIssueComment: { issueComment: { id } } } };
    }
    return { data: { nodes: [node(id, '01J00000000000000000000013')] } };
  };

  const updated = await updateIssueComment({
    commentNodeId: id,
    repository,
    issue,
    body: recordBody,
    graphql,
  });

  assert.equal(updated.commentNodeId, id);
  assert.equal(calls.length, 3);
  assert.deepEqual(calls[0].variables, { ids: [id] });
  assert.deepEqual(calls[1].variables, { id, body: recordBody });
  assert.deepEqual(calls[2].variables, { ids: [id] });
});

test('updates reject a foreign comment node before invoking the mutation', async () => {
  const { updateIssueComment } = commentStore;
  const id = 'IC_kwDOForeignIssue';
  const recordBody = body('01J00000000000000000000016');
  let mutations = 0;
  const graphql = async ({ query, variables }) => {
    if (query.includes('mutation AitmUpdateIssueComment')) {
      mutations += 1;
      return { data: { updateIssueComment: { issueComment: { id } } } };
    }
    return {
      data: {
        nodes: [
          {
            ...node(variables.ids[0], '01J00000000000000000000016'),
            issue: { number: 999, repository: { nameWithOwner: repository } },
          },
        ],
      },
    };
  };

  await assert.rejects(
    updateIssueComment({ commentNodeId: id, repository, issue, body: recordBody, graphql }),
    (error) => error.category === 'correlation'
  );
  assert.equal(mutations, 0);
});

test('writes fail closed before success and never expose transport payloads', async () => {
  const { createIssueComment, updateIssueComment } = commentStore;
  const secret = 'ghp_1234567890abcdefghijklmnop';
  const recordBody = body('01J00000000000000000000005');
  const id = 'IC_kwDOWriteFailure';
  const base = {
    repository,
    issue,
    body: recordBody,
    graphql: async () => ({ data: { nodes: [node(id, '01J00000000000000000000005')] } }),
  };
  const cases = [
    [
      () =>
        createIssueComment({
          ...base,
          rest: { createIssueComment: async () => Promise.reject(new Error(secret)) },
        }),
      'transport',
    ],
    [
      () => createIssueComment({ ...base, rest: { createIssueComment: async () => ({}) } }),
      'write-response',
    ],
    [
      () =>
        updateIssueComment({
          ...base,
          commentNodeId: id,
          graphql: async ({ query }) =>
            query.includes('mutation AitmUpdateIssueComment')
              ? {
                  data: {
                    updateIssueComment: { issueComment: { id: 'IC_kwDOChanged' } },
                  },
                }
              : base.graphql(),
        }),
      'write-response',
    ],
    [
      () =>
        createIssueComment({
          ...base,
          graphql: async () => ({ data: { nodes: [null] } }),
          rest: { createIssueComment: async () => ({ node_id: id }) },
        }),
      'missing-node',
    ],
  ];

  for (const [operation, category] of cases) {
    await assert.rejects(operation(), (error) => {
      assert.equal(error.category, category);
      assert.doesNotMatch(error.message, /ghp_/);
      return true;
    });
  }

  let writes = 0;
  await assert.rejects(
    createIssueComment({
      ...base,
      repository: 'invalid',
      rest: { createIssueComment: async () => (writes += 1) },
    }),
    (error) => error.category === 'input'
  );
  assert.equal(writes, 0);
});

test('incremental listing fails closed on broken pagination and partial pages', async () => {
  const { listIssueCommentsSince } = commentStore;
  const comment = node('IC_kwDOPaged', '01J00000000000000000000008');
  const response = (nodes, pageInfo, errors) => ({
    data: {
      repository: {
        issue: {
          number: issue,
          repository: { nameWithOwner: repository },
          comments: { nodes, ...(pageInfo === undefined ? {} : { pageInfo }) },
        },
      },
    },
    ...(errors === undefined ? {} : { errors }),
  });
  const cases = [
    [[response([], undefined)], 'pagination'],
    [[response([], { hasNextPage: true, endCursor: null })], 'pagination'],
    [[response([null], { hasNextPage: false, endCursor: null })], 'missing-node'],
    [
      [response([], { hasNextPage: false, endCursor: null }, [{ message: 'partial' }])],
      'partial-response',
    ],
    [
      [
        response([comment], { hasNextPage: true, endCursor: 'same' }),
        response([comment], { hasNextPage: false, endCursor: 'done' }),
      ],
      'pagination',
    ],
    [
      [
        response([], { hasNextPage: true, endCursor: 'same' }),
        response([], { hasNextPage: true, endCursor: 'same' }),
      ],
      'pagination',
    ],
  ];
  for (const [responses, category] of cases) {
    await assert.rejects(
      listIssueCommentsSince({
        since: '2026-08-01T00:00:00.000Z',
        repository,
        issue,
        graphql: async () => responses.shift(),
      }),
      (error) => error.category === category
    );
  }
  await assert.rejects(
    listIssueCommentsSince({ since: 'invalid', repository, issue, graphql: async () => null }),
    (error) => error.category === 'input'
  );
});

test('incremental listing rejects an empty page that claims a successor', async () => {
  const { listIssueCommentsSince } = commentStore;
  let calls = 0;
  await assert.rejects(
    listIssueCommentsSince({
      since: '2026-08-01T00:00:00.000Z',
      repository,
      issue,
      graphql: async () => {
        calls += 1;
        if (calls > 3) throw new Error('bounded test stop');
        return {
          data: {
            repository: {
              issue: {
                number: issue,
                repository: { nameWithOwner: repository },
                comments: {
                  nodes: [],
                  pageInfo: { hasNextPage: true, endCursor: `fresh-${calls}` },
                },
              },
            },
          },
        };
      },
    }),
    (error) => error.category === 'pagination'
  );
  assert.equal(calls, 1);
});

test('incremental listing rejects pages larger than the requested page size', async () => {
  const { listIssueCommentsSince } = commentStore;
  const nodes = Array.from({ length: 101 }, (_, index) => ({
    ...node(`IC_kwDOOversizedPage${index}`, '01J00000000000000000000021'),
    body: 'Ordinary issue discussion.',
  }));

  await assert.rejects(
    listIssueCommentsSince({
      since: '2026-08-01T00:00:00.000Z',
      repository,
      issue,
      graphql: async () => ({
        data: {
          repository: {
            issue: {
              number: issue,
              repository: { nameWithOwner: repository },
              comments: {
                nodes,
                pageInfo: { hasNextPage: false, endCursor: null },
              },
            },
          },
        },
      }),
    }),
    (error) => error.category === 'pagination'
  );
});

test('incremental listing rejects missing or non-string comment bodies', async () => {
  const { listIssueCommentsSince } = commentStore;
  for (const bodyValue of [undefined, null, 42]) {
    const comment = node('IC_kwDOMalformedBody', '01J00000000000000000000018');
    if (bodyValue === undefined) delete comment.body;
    else comment.body = bodyValue;

    await assert.rejects(
      listIssueCommentsSince({
        since: '2026-08-01T00:00:00.000Z',
        repository,
        issue,
        graphql: async () => ({
          data: {
            repository: {
              issue: {
                number: issue,
                repository: { nameWithOwner: repository },
                comments: {
                  nodes: [comment],
                  pageInfo: { hasNextPage: false, endCursor: null },
                },
              },
            },
          },
        }),
      }),
      (error) => error.category === 'response-shape'
    );
  }
});

test('incremental listing bounds fresh non-terminal pages', async () => {
  const { listIssueCommentsSince } = commentStore;
  let calls = 0;
  await assert.rejects(
    listIssueCommentsSince({
      since: '2026-08-01T00:00:00.000Z',
      repository,
      issue,
      graphql: async () => {
        calls += 1;
        if (calls > 1000) throw new Error('bounded test stop');
        return {
          data: {
            repository: {
              issue: {
                number: issue,
                repository: { nameWithOwner: repository },
                comments: {
                  nodes: [
                    {
                      ...node(`IC_kwDOFreshPage${calls}`, '01J00000000000000000000019'),
                      body: 'Ordinary comment.',
                    },
                  ],
                  pageInfo: { hasNextPage: true, endCursor: `fresh-${calls}` },
                },
              },
            },
          },
        };
      },
    }),
    (error) => error.category === 'pagination'
  );
  assert.equal(calls, 1000);
});

test('incremental listing applies an exclusive boundary and normalizes transport failure', async () => {
  const { listIssueCommentsSince } = commentStore;
  const since = '2026-08-01T14:01:00.000Z';
  const atBoundary = node('IC_kwDOBoundary', '01J00000000000000000000010');
  const afterBoundary = {
    ...node('IC_kwDOAfterBoundary', '01J00000000000000000000011'),
    updatedAt: '2026-08-01T14:01:00.001Z',
  };
  const result = await listIssueCommentsSince({
    since,
    repository,
    issue,
    graphql: async () => ({
      data: {
        repository: {
          issue: {
            number: issue,
            repository: { nameWithOwner: repository },
            comments: {
              nodes: [atBoundary, afterBoundary],
              pageInfo: { hasNextPage: false, endCursor: null },
            },
          },
        },
      },
    }),
  });
  assert.deepEqual(
    result.map((comment) => comment.commentNodeId),
    ['IC_kwDOAfterBoundary']
  );

  const secret = 'ghp_1234567890abcdefghijklmnop';
  await assert.rejects(
    listIssueCommentsSince({
      since,
      repository,
      issue,
      graphql: async () => Promise.reject(new Error(secret)),
    }),
    (error) => {
      assert.equal(error.category, 'transport');
      assert.doesNotMatch(error.message, /ghp_/);
      return true;
    }
  );
});

test('incremental listing rejects malformed AITM-like record openers', async () => {
  const { listIssueCommentsSince } = commentStore;
  for (const bodyValue of [
    '<!-- aitm-record-->',
    '<!-- aitm-record{} -->',
    '<!-- aitm-record',
    '<!-- AITM-record -->',
    '<!-- aitm-record_v1 -->',
  ]) {
    await assert.rejects(
      listIssueCommentsSince({
        since: '2026-08-01T00:00:00.000Z',
        repository,
        issue,
        graphql: async () => ({
          data: {
            repository: {
              issue: {
                number: issue,
                repository: { nameWithOwner: repository },
                comments: {
                  nodes: [
                    {
                      ...node('IC_kwDOMalformedOpener', '01J00000000000000000000020'),
                      body: bodyValue,
                    },
                  ],
                  pageInfo: { hasNextPage: false, endCursor: null },
                },
              },
            },
          },
        }),
      }),
      (error) => error.category === 'envelope'
    );
  }
});

test('incremental listing ignores ordinary issue comments', async () => {
  const { listIssueCommentsSince } = commentStore;
  const record = {
    ...node('IC_kwDORecordAfterOrdinary', '01J00000000000000000000014'),
    updatedAt: '2026-08-01T14:02:00Z',
  };
  const ordinary = {
    ...node('IC_kwDOOrdinary', '01J00000000000000000000015'),
    body: 'Human discussion without an AITM record marker.',
    updatedAt: '2026-08-01T14:01:00Z',
  };

  const result = await listIssueCommentsSince({
    since: '2026-08-01T14:00:00.000Z',
    repository,
    issue,
    graphql: async () => ({
      data: {
        repository: {
          issue: {
            number: issue,
            repository: { nameWithOwner: repository },
            comments: {
              nodes: [ordinary, record],
              pageInfo: { hasNextPage: false, endCursor: null },
            },
          },
        },
      },
    }),
  });

  assert.deepEqual(
    result.map((comment) => comment.commentNodeId),
    ['IC_kwDORecordAfterOrdinary']
  );
});
