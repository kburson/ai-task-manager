// @story #1159
import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
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
const issue = 1159;
const commentNodeId = 'IC_kwDOTransportCause';

function recordBody() {
  const payload = { result: 'transport-cause' };
  return renderAitmRecord({
    envelope: {
      schema: 'aitm.record/v1',
      recordId: '01J00000000000000001159000',
      recordType: 'verification-evidence',
      repository,
      issue,
      createdAt: '2026-08-10T08:00:00.000Z',
      authority: {
        grantId: '01J00000000000000001159009',
        epoch: 1,
        actor: 'codex/session-1159',
      },
      predecessor: null,
      supersedes: null,
      payloadHash: hashRecordPayload(payload),
      payload,
    },
    visibleMarkdown: 'Transport cause regression.\n',
  });
}

function commentNode(body) {
  return {
    __typename: 'IssueComment',
    id: commentNodeId,
    body,
    updatedAt: '2026-08-10T08:01:00.000Z',
    issue: { number: issue, repository: { nameWithOwner: repository } },
  };
}

async function assertTransportCause(run) {
  const original = Object.assign(new Error('underlying transport timed out'), {
    code: 'ETIMEDOUT',
  });
  await assert.rejects(run(original), (error) => {
    assert.equal(error.name, 'GitHubCommentStoreError');
    assert.equal(error.category, 'transport');
    assert.equal(error.message, 'github-comment-store:transport');
    assert.equal(error.cause, original);
    return true;
  });
}

test('all comment-store transport boundaries preserve the original error as cause', async () => {
  const body = recordBody();
  const cases = [
    (original) =>
      getCommentsByNodeIds({
        ids: [commentNodeId],
        repository,
        issue,
        graphql: async () => {
          throw original;
        },
      }),
    (original) =>
      createIssueComment({
        repository,
        issue,
        body,
        graphql: async () => assert.fail('read-back must not run after create transport failure'),
        rest: {
          createIssueComment: async () => {
            throw original;
          },
        },
      }),
    (original) =>
      updateIssueComment({
        commentNodeId,
        repository,
        issue,
        body,
        graphql: async ({ query }) => {
          if (query.includes('nodes(ids:')) {
            return { data: { nodes: [commentNode(body)] } };
          }
          throw original;
        },
      }),
    (original) =>
      listIssueCommentsSince({
        since: '2026-08-10T08:00:00.000Z',
        repository,
        issue,
        graphql: async () => {
          throw original;
        },
      }),
  ];

  for (const run of cases) await assertTransportCause(run);
});

test('source has no transport catch that discards its caught error', () => {
  const source = readFileSync(
    new URL('../../../lib/github-records/github-comment-store.mjs', import.meta.url),
    'utf8'
  );
  assert.doesNotMatch(source, /catch\s*\{\s*throw storeError\('transport'\)/s);
  assert.equal((source.match(/catch \(error\) \{/g) || []).length, 4);
  assert.equal((source.match(/throw storeError\('transport', error\);/g) || []).length, 4);
});
