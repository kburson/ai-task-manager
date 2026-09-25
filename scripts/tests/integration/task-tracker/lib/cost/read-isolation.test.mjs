// @story #1734

import assert from 'node:assert/strict';
import test from 'node:test';

import { listCostRecords } from '../../../../../task-tracker/lib/cost/comment-store.mjs';
import { renderCostRecord } from '../../../../../task-tracker/lib/cost/record-codec.mjs';
import {
  listIssueCommentsSince,
  parsePreloadedIssueComments,
} from '../../../../../task-tracker/lib/github-records/github-comment-store.mjs';
import {
  hashRecordPayload,
  renderAitmRecord,
} from '../../../../../task-tracker/lib/github-records/record-envelope.mjs';

const repository = 'kburson/ai-task-manager';
const issue = 1719;
const createdAt = '2026-09-21T00:00:00.000Z';
const updatedAt = '2026-09-21T00:01:00.000Z';

function authority() {
  return {
    grantId: '01J00000000000000000000001',
    epoch: 1,
    actor: 'codex/session-1719',
  };
}

function node(id, body) {
  return {
    __typename: 'IssueComment',
    id,
    body,
    author: { login: 'kpburson' },
    createdAt,
    updatedAt,
    issue: { number: issue, repository: { nameWithOwner: repository } },
  };
}

function graphqlFor(nodes) {
  return async () => ({
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
  });
}

function governanceBody(recordId = '01J00000000000000000000010') {
  const payload = { result: 'passed' };
  return renderAitmRecord({
    envelope: {
      schema: 'aitm.record/v1',
      recordId,
      recordType: 'verification-evidence',
      repository,
      issue,
      createdAt,
      authority: authority(),
      predecessor: null,
      supersedes: null,
      payloadHash: hashRecordPayload(payload),
      payload,
    },
    visibleMarkdown: 'Governance evidence.\n',
  });
}

function costBody(recordId = '01J00000000000000000000020') {
  const payload = {
    schema: 'aitm.agent-cost-event/v1',
    eventId: 'cost-event-001',
    policyId: 'cost-policy-001',
    operationId: 'operation-001',
    issue,
    timingEvent: 'develop:started',
    timingRecordedAt: createdAt,
    stage: 'develop',
    stageVisit: 1,
    eventRole: 'opening',
    sources: [],
    observations: [],
    spans: [],
    lines: [],
    diagnostics: [],
  };
  return renderCostRecord({
    envelope: {
      schema: 'aitm.record/v1',
      recordId,
      recordType: 'agent-cost-event',
      repository,
      issue,
      createdAt,
      authority: authority(),
      predecessor: null,
      supersedes: null,
      payloadHash: hashRecordPayload(payload),
      payload,
    },
    visibleMarkdown: 'Cost evidence.\n',
  });
}

test('cost records use an isolated comment stream without changing governance readers', async () => {
  const governance = node('IC_kwDOGovernance', governanceBody());
  const cost = node('IC_kwDOCost', costBody());
  const corruptCost = node('IC_kwDOCorruptCost', '<!-- aitm-cost-record\n{}\n-->\nBad cost.\n');
  const ordinary = node('IC_kwDOOrdinary', 'Ordinary issue discussion.\n');
  const baselineNodes = [ordinary, governance];
  const mixedNodes = [ordinary, cost, corruptCost, governance];

  const baselineRecords = await listIssueCommentsSince({
    repository,
    issue,
    since: '1970-01-01T00:00:00.000Z',
    graphql: graphqlFor(baselineNodes),
  });
  const mixedRecords = await listIssueCommentsSince({
    repository,
    issue,
    since: '1970-01-01T00:00:00.000Z',
    graphql: graphqlFor(mixedNodes),
  });

  assert.deepEqual(
    mixedRecords.map((record) => record.commentNodeId),
    baselineRecords.map((record) => record.commentNodeId)
  );
  assert.deepEqual(
    parsePreloadedIssueComments({ nodes: mixedNodes, repository, issue }).map(
      (record) => record.commentNodeId
    ),
    ['IC_kwDOGovernance']
  );

  const costRecords = await listCostRecords({
    repository,
    issue,
    graphql: graphqlFor(mixedNodes),
  });
  assert.equal(costRecords.enumerationStatus, 'available');
  assert.deepEqual(
    costRecords.records.map((record) => record.commentNodeId),
    ['IC_kwDOCost']
  );
  assert.deepEqual(costRecords.diagnostics, [
    { code: 'invalid-cost-record', commentNodeId: 'IC_kwDOCorruptCost' },
  ]);
});

test('cost enumeration outages are unavailable while malformed governance claimants still fail closed', async () => {
  const unavailable = await listCostRecords({
    repository,
    issue,
    graphql: async () => {
      throw new Error('network unavailable');
    },
  });
  assert.deepEqual(unavailable, {
    records: [],
    diagnostics: [{ code: 'enumeration-unavailable', commentNodeId: null }],
    enumerationStatus: 'unavailable',
  });

  await assert.rejects(
    listIssueCommentsSince({
      repository,
      issue,
      since: '1970-01-01T00:00:00.000Z',
      graphql: graphqlFor([node('IC_kwDOMalformedGovernance', '<!-- aitm-record malformed -->')]),
    }),
    (error) => error.category === 'envelope'
  );
});
