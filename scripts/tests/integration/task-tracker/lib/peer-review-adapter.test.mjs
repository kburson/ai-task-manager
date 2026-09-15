// @story #1629
import assert from 'node:assert/strict';
import test from 'node:test';

import { invokeManagedPeerReview } from '../../../../task-tracker/lib/peer-review-adapter.mjs';
import { createWorkflowExceptionEnvelope } from '../../../../task-tracker/lib/workflow-policy/exception-record.mjs';
import { computeScopeIdentity } from '../../../../task-tracker/lib/workflow-policy/scope-identity.mjs';

const repository = 'kburson/ai-task-manager';
const issue = 1629;
const now = '2026-09-15T02:00:00.000Z';
const body = `## User Story

As a maintainer
I want managed providers denied
So that exceptions remain bounded

## Scope

Guard the managed peer-review adapter.

## Acceptance Criteria

- [ ] No managed provider request is submitted.
`;

function denyEnvelope() {
  return createWorkflowExceptionEnvelope({
    repository,
    issue,
    exceptionId: 'deny-managed-providers',
    revision: 1,
    scopeIdentity: computeScopeIdentity({ repository, issue, body }),
    requirementIds: [],
    constraints: [{ id: 'provider.managed-execution', effect: 'deny' }],
    reason: 'The operator denied managed provider execution for this issue.',
    authorization: {
      reference: 'codex://sessions/session-1/messages/message-1',
      statement: 'Do not launch managed providers for issue #1629.',
      principal: 'github-user:kburson',
      recordingActor: 'codex/session:session-1',
      origin: 'codex-session-transcript',
      verificationLevel: 'host-verified-user-message',
    },
    operationId: `sha256:${'a'.repeat(64)}`,
    createdAt: '2026-09-15T01:00:00.000Z',
    recordId: '01M2H000000000000000000001',
    grantId: '01M2H000000000000000000090',
  });
}

test('deny record prevents normal, retry, and Full-Auto managed submissions', async () => {
  const envelope = denyEnvelope();
  let reads = 0;
  let processSpawns = 0;
  let requestSubmissions = 0;
  const runtime = {
    async listRecords() {
      reads += 1;
      return [{ commentNodeId: 'IC_deny', envelope }];
    },
  };
  const attempts = [
    {
      request: {},
      submit: async () => {
        processSpawns += 1;
      },
    },
    {
      request: { retry: true },
      submit: async () => {
        requestSubmissions += 1;
      },
    },
    {
      request: { fullAuto: true, launch: true },
      submit: async () => {
        processSpawns += 1;
      },
    },
  ];

  for (const attempt of attempts) {
    const result = await invokeManagedPeerReview({
      repository,
      issue,
      body,
      now,
      runtime,
      submit: attempt.submit,
      request: attempt.request,
    });
    assert.equal(result.status, 'prohibited');
    assert.equal(result.reason, 'managed-provider-denied');
  }

  assert.equal(reads, 3, 'policy must be reloaded immediately before every attempt');
  assert.equal(processSpawns, 0, 'no managed provider process may be spawned');
  assert.equal(requestSubmissions, 0, 'no managed provider request may be submitted');
});

test('ordinary no-exception operation submits once and returns the provider result', async () => {
  let submissions = 0;
  const result = await invokeManagedPeerReview({
    repository,
    issue,
    body,
    now,
    runtime: { listRecords: async () => [] },
    submit: async (request) => {
      submissions += 1;
      return { reviewId: 'review-1', request };
    },
    request: { artifact: 'docs/spec.md' },
  });

  assert.deepEqual(result, {
    status: 'submitted',
    result: { reviewId: 'review-1', request: { artifact: 'docs/spec.md' } },
  });
  assert.equal(submissions, 1);
});

test('policy read failure fails closed before the managed request', async () => {
  let submissions = 0;
  const result = await invokeManagedPeerReview({
    repository,
    issue,
    body,
    now,
    runtime: {
      listRecords: async () => {
        throw new Error('history unavailable');
      },
    },
    submit: async () => {
      submissions += 1;
    },
  });

  assert.equal(result.status, 'indeterminate');
  assert.equal(result.reason, 'managed-provider-policy-unavailable');
  assert.equal(submissions, 0);
});
