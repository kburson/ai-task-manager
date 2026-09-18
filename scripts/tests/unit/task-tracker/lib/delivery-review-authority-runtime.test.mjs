// @story #1683
import assert from 'node:assert/strict';
import test from 'node:test';

import { resolveLiveDeliveryReviewAuthority } from '../../../../task-tracker/lib/delivery-preflight.mjs';
import { createWorkflowExceptionEnvelope } from '../../../../task-tracker/lib/workflow-policy/exception-record.mjs';
import { computeScopeIdentity } from '../../../../task-tracker/lib/workflow-policy/scope-identity.mjs';

const repository = 'kburson/ai-task-manager';
const issueNumber = 1683;
const head = 'a'.repeat(40);
const body = `## User Story

As a maintainer
I want a semantic-review waiver
So that delivery remains governed

## Scope

Deliver an exact-head semantic-review waiver.

## Acceptance Criteria

- [ ] Current authority is revalidated.`;
const recordId = '01M2H000000000000000000001';

function workflowRecord() {
  return createWorkflowExceptionEnvelope({
    repository,
    issue: issueNumber,
    exceptionId: 'delivery-review-waiver',
    revision: 1,
    scopeIdentity: computeScopeIdentity({ repository, issue: issueNumber, body }),
    requirementIds: ['review.semantic-resident'],
    constraints: [],
    reason: 'The operator authorized this exact semantic-review exception.',
    authorization: {
      reference: 'codex://sessions/session-1/messages/message-1',
      statement: 'Waive semantic review for issue #1683 only.',
      principal: 'github-user:kburson',
      recordingActor: 'codex/session:session-1',
      origin: 'codex-session-transcript',
      verificationLevel: 'host-verified-user-message',
    },
    operationId: `sha256:${'b'.repeat(64)}`,
    createdAt: '2026-09-18T00:00:00.000Z',
    recordId,
    grantId: '01M2H000000000000000000090',
  });
}

test('runtime consumes genuine workflow records and projects exact waiver authority', async () => {
  const timingBody = [
    '## ⏱ Timing Log',
    '| Timestamp | Event | Active | Idle | Δ Words | Word Marker | Description | Δ Words (full) |',
    '|---|---|---|---|---|---|---|---|',
    `| 2026-09-17 20:00:00 -05:00 | review:waived |  |  |  | 100 | semantic resident action waived — requirement review.semantic-resident; authority record ${recordId}; result=waived <!-- aitm-review-waiver requirement="review.semantic-resident" record-id="${recordId}" revision="1" accepted-sha="${head}" --> | <!-- row-sec: a=0 i=0 -->`,
    '| 2026-09-17 20:01:00 -05:00 | review:approved |  |  |  | 100 | story approved | <!-- row-sec: a=0 i=0 -->',
  ].join('\n');

  const result = await resolveLiveDeliveryReviewAuthority({
    deps: {
      resolveAcceptedReviewSha: async () => null,
      resolveAgentReviewPassed: async () => false,
      listIssueComments: async () => [{ id: 'timing', body: timingBody }],
      workflowPolicyRuntime: {
        listRecords: async () => [{ commentNodeId: 'IC_exception_1', envelope: workflowRecord() }],
      },
      now: () => '2026-09-18T01:00:00.000Z',
    },
    cfg: { repo: repository },
    issue: { number: issueNumber, body, agentReviewPassed: false },
    issueNumber,
    testReceiptSha: head,
  });

  assert.deepEqual(result, {
    outcome: 'waived',
    acceptedSha: head,
    authority: { recordId, revision: 1 },
  });
});
