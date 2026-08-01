// @story #1070
import { strict as assert } from 'node:assert';
import test from 'node:test';

import {
  createIssueComment,
  getCommentsByNodeIds,
  listIssueCommentsSince,
  updateIssueComment,
} from '../../../lib/github-records/github-comment-store.mjs';
import {
  hashRecordPayload,
  renderAitmRecord,
} from '../../../lib/github-records/record-envelope.mjs';

const repository = 'kburson/ai-task-manager';
const issue = 1070;

function recordBody(recordId, value) {
  const payload = { value };
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
    visibleMarkdown: `${value}\n`,
  });
}

function createMemoryTransports() {
  const comments = new Map();
  const nodeBatchSizes = [];
  let sequence = 0;
  const node = (comment) => ({
    __typename: 'IssueComment',
    id: comment.node_id,
    body: comment.body,
    updatedAt: comment.updated_at,
    issue: { number: issue, repository: { nameWithOwner: repository } },
  });
  const store = (body, nodeId = `IC_kwDOMemory${sequence + 1}`) => {
    sequence += 1;
    const comment = {
      node_id: nodeId,
      body,
      updated_at: `2026-08-01T14:0${sequence}:00.000Z`,
    };
    comments.set(nodeId, comment);
    return comment;
  };
  const rest = {
    createIssueComment: async ({ body }) => store(body),
    updateIssueComment: async ({ commentNodeId, body }) => store(body, commentNodeId),
  };
  const graphql = async ({ query, variables }) => {
    if (query.includes('nodes(ids:')) {
      nodeBatchSizes.push(variables.ids.length);
      return { data: { nodes: variables.ids.map((id) => node(comments.get(id))) } };
    }
    const all = [...comments.values()];
    const index = variables.after === null ? 0 : Number(variables.after);
    const next = index + 1;
    return {
      data: {
        repository: {
          issue: {
            number: issue,
            repository: { nameWithOwner: repository },
            comments: {
              nodes: all[index] === undefined ? [] : [node(all[index])],
              pageInfo: {
                hasNextPage: next < all.length,
                endCursor: String(next),
              },
            },
          },
        },
      },
    };
  };
  return { comments, graphql, nodeBatchSizes, rest, store };
}

test('in-memory transports compose writes, pagination, and one batched node read', async () => {
  const memory = createMemoryTransports();
  const context = { repository, issue, graphql: memory.graphql, rest: memory.rest };
  const first = await createIssueComment({
    ...context,
    body: recordBody('01J00000000000000000000000', 'first'),
  });
  const second = await createIssueComment({
    ...context,
    body: recordBody('01J00000000000000000000001', 'second'),
  });
  const updated = await updateIssueComment({
    ...context,
    commentNodeId: first.commentNodeId,
    body: recordBody('01J00000000000000000000002', 'updated'),
  });
  assert.equal(updated.envelope.payload.value, 'updated');

  const comments = await getCommentsByNodeIds({
    ...context,
    ids: [first.commentNodeId, second.commentNodeId],
  });
  assert.deepEqual(
    comments.map((comment) => comment.commentNodeId),
    [first.commentNodeId, second.commentNodeId]
  );
  assert.ok(Object.isFrozen(comments));
  assert.equal(memory.nodeBatchSizes.filter((size) => size === 2).length, 1);

  const listed = await listIssueCommentsSince({
    ...context,
    since: '2026-08-01T14:00:00.000Z',
  });
  assert.deepEqual(
    new Set(listed.map((comment) => comment.commentNodeId)),
    new Set([first.commentNodeId, second.commentNodeId])
  );
  assert.ok(Object.isFrozen(listed));
});

test('a write rejects a canonical read-back that differs from the requested envelope', async () => {
  const memory = createMemoryTransports();
  const requested = recordBody('01J00000000000000000000003', 'requested');
  const different = recordBody('01J00000000000000000000004', 'different');
  await assert.rejects(
    createIssueComment({
      repository,
      issue,
      body: requested,
      graphql: memory.graphql,
      rest: { createIssueComment: async () => memory.store(different) },
    }),
    (error) => error.category === 'readback-mismatch'
  );
});
