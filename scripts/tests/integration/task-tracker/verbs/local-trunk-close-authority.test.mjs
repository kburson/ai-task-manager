// @story #1824
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  parseWorkflowExceptionRequest,
  runWorkflowException,
} from '../../../../task-tracker/verbs/workflow-exception.mjs';
import {
  LOCAL_TRUNK_PROPOSAL_SCHEMA,
  prepareDeliveryWaiver,
} from '../../../../task-tracker/lib/workflow-policy/delivery-request.mjs';
import { parseAitmRecord } from '../../../../task-tracker/lib/github-records/record-envelope.mjs';
import { hashAuthorizationStatement } from '../../../../task-tracker/lib/workflow-policy/authority-resolver.mjs';
import { computeScopeIdentity } from '../../../../task-tracker/lib/workflow-policy/scope-identity.mjs';

const repository = 'kburson/ai-task-manager';
const issue = 1824;
const now = '2026-09-26T08:00:00.000Z';
const scopeIdentity = `sha256:${'a'.repeat(64)}`;
const proposal = Object.freeze({
  schema: 'aitm.local-trunk-close-proposal/v1',
  action: 'record',
  exceptionId: null,
  priorRecordId: null,
  priorRevision: null,
  requirementId: 'delivery.local-trunk-close-authorization',
  reason: 'The operator accepts one verified no-PR close for the exact issue and SHA.',
  expiresAt: '2026-09-27T08:00:00.000Z',
  deliveryOperationId: null,
});
const facts = Object.freeze({
  repository,
  issue,
  scopeIdentity,
  pullRequest: null,
  acceptedHeadSha: 'b'.repeat(40),
  baseRef: 'trunk',
  resolvedTrunkRef: 'origin/trunk',
  originalIntentRecordId: null,
  prior: null,
  now,
});

test('local preparation is read only and names the exact lane and scope', async () => {
  assert.equal(LOCAL_TRUNK_PROPOSAL_SCHEMA, proposal.schema);
  let authorityReads = 0;
  let writes = 0;
  const runtime = {
    async fetchDeliveryFacts() {
      return facts;
    },
    async resolveAuthority() {
      authorityReads += 1;
    },
    async appendRecord() {
      writes += 1;
    },
  };
  const result = await runWorkflowException({
    action: 'prepare',
    issues: [issue],
    request: proposal,
    repository,
    now,
    runtime,
  });
  assert.equal(result.status, 'prepared');
  const prepared = result.results[0];
  assert.equal(
    prepared.request.deliveryScope.exceptionKind,
    'delivery.local-trunk-close-authorization'
  );
  assert.equal(prepared.request.deliveryScope.pullRequest, null);
  for (const fragment of [
    `#${issue}`,
    repository,
    facts.acceptedHeadSha,
    facts.resolvedTrunkRef,
    prepared.request.deliveryScope.deliveryOperationId,
    prepared.request.proposalDigest,
    'local-trunk',
  ]) {
    assert.ok(prepared.statement.includes(fragment), fragment);
  }
  assert.deepEqual([authorityReads, writes], [0, 0]);
  assert.equal(
    prepareDeliveryWaiver({ input: prepared.proposal, facts }).request.proposalDigest,
    prepared.request.proposalDigest
  );
});

test('a generic deliver instruction cannot record the local grant', async () => {
  const prepared = prepareDeliveryWaiver({
    input: proposal,
    facts,
    ids: { exceptionId: 'local-one', deliveryOperationId: '01M2H000000000000000000001' },
  });
  const request = parseWorkflowExceptionRequest(
    {
      ...prepared.request,
      authorizationSource: {
        schema: 'aitm.authorization-source/v1',
        adapter: 'codex-session/v1',
        sessionId: '01a0a1d4-c130-7a42-8ccd-4f31b7d4f0ed',
        messageId: 'msg_user',
        statementHash: `sha256:${'f'.repeat(64)}`,
      },
    },
    { action: 'record' }
  );
  let writes = 0;
  const runtime = {
    async fetchIssue() {
      return {
        number: issue,
        body: '## User Story\n\nAs an operator\nI want one close\nSo that the issue is done\n\n## Scope\n\nExact issue.\n\n## Acceptance Criteria\n\n- [ ] Exact grant.',
      };
    },
    async fetchDeliveryFacts() {
      return facts;
    },
    async resolveAuthority() {
      return { status: 'verified', authority: { statement: 'deliver 1783' } };
    },
    async appendRecord() {
      writes += 1;
    },
  };
  const result = await runWorkflowException({
    action: 'record',
    issues: [issue],
    request,
    repository,
    now,
    runtime,
  });
  assert.equal(result.status, 'blocked');
  assert.ok(result.results[0].code.includes('approval-statement'), result.results[0].code);
  assert.equal(writes, 0);
});

test('PR waiver and local-trunk proposal shapes cannot cross-authorize', () => {
  assert.throws(() =>
    prepareDeliveryWaiver({
      input: { ...proposal, schema: 'aitm.delivery-waiver-proposal/v1' },
      facts,
    })
  );
  assert.throws(() =>
    prepareDeliveryWaiver({ input: proposal, facts: { ...facts, pullRequest: 42 } })
  );
});

test('exact host-verified statement records one visible typed grant with readback', async () => {
  const body =
    '## User Story\n\nAs an operator\nI want one close\nSo that the issue is done\n\n## Scope\n\nExact issue.\n\n## Acceptance Criteria\n\n- [ ] Exact grant.';
  const records = [];
  let approvedStatement = null;
  const liveFacts = {
    ...facts,
    scopeIdentity: computeScopeIdentity({ repository, issue, body }),
    existingDeliveryRecords: records,
  };
  const runtime = {
    async fetchIssue() {
      return { number: issue, body };
    },
    async fetchDeliveryFacts() {
      return liveFacts;
    },
    async listRecords() {
      return [...records];
    },
    async resolveAuthority() {
      return {
        status: 'verified',
        authority: {
          reference: 'codex://sessions/01a0a1d4-c130-7a42-8ccd-4f31b7d4f0ed/messages/msg_local',
          statement: approvedStatement,
          principal: null,
          recordingActor: 'codex/session:01a0a1d4-c130-7a42-8ccd-4f31b7d4f0ed',
          origin: 'codex-session-transcript',
          verificationLevel: 'host-verified-user-message',
        },
      };
    },
    async appendRecord({ body: comment }) {
      records.push({
        ...parseAitmRecord({
          commentNodeId: 'IC_local_1',
          body: comment,
          expectedRepository: repository,
          expectedIssue: issue,
        }),
        body: comment,
      });
    },
    nextIds() {
      return { recordId: '01M2H000000000000000000002', grantId: '01M2H000000000000000000003' };
    },
  };
  const draft = await runWorkflowException({
    action: 'prepare',
    issues: [issue],
    request: proposal,
    repository,
    now,
    runtime,
  });
  assert.equal(draft.status, 'prepared');
  approvedStatement = draft.results[0].statement;
  const writeRequest = parseWorkflowExceptionRequest(
    {
      ...draft.results[0].request,
      authorizationSource: {
        schema: 'aitm.authorization-source/v1',
        adapter: 'codex-session/v1',
        sessionId: '01a0a1d4-c130-7a42-8ccd-4f31b7d4f0ed',
        messageId: 'msg_local',
        statementHash: hashAuthorizationStatement(approvedStatement),
      },
    },
    { action: 'record' }
  );
  const result = await runWorkflowException({
    action: 'record',
    issues: [issue],
    request: writeRequest,
    repository,
    now,
    runtime,
  });
  assert.equal(result.status, 'recorded', JSON.stringify(result));
  assert.equal(records.length, 1);
  assert.equal(
    records[0].envelope.payload.deliveryScope.exceptionKind,
    'delivery.local-trunk-close-authorization'
  );
  assert.equal(records[0].envelope.payload.deliveryScope.pullRequest, null);
  assert.ok(records[0].body.includes('one-issue local-trunk close authority'));
  const retry = await runWorkflowException({
    action: 'record',
    issues: [issue],
    request: writeRequest,
    repository,
    now,
    runtime,
  });
  assert.equal(retry.results[0].status, 'existing');
  assert.equal(records.length, 1);
});

test('local revise and revoke statements bind the same operation and prior revision', () => {
  const first = prepareDeliveryWaiver({
    input: proposal,
    facts,
    ids: { exceptionId: 'local-one', deliveryOperationId: '01M2H000000000000000000001' },
  });
  const prior = {
    recordId: '01M2H000000000000000000002',
    revision: 1,
    exceptionId: first.request.exceptionId,
    deliveryScope: first.request.deliveryScope,
  };
  const revised = prepareDeliveryWaiver({
    input: {
      ...first.proposal,
      action: 'revise',
      priorRecordId: prior.recordId,
      priorRevision: prior.revision,
      reason: 'The operator has a revised reason for the same exact local-trunk grant.',
    },
    facts: { ...facts, prior },
  });
  assert.equal(
    revised.request.deliveryScope.deliveryOperationId,
    prior.deliveryScope.deliveryOperationId
  );
  assert.ok(revised.statement.includes('Authorize revise'));
  assert.notEqual(revised.statement, first.statement);
  const revoked = prepareDeliveryWaiver({
    input: {
      ...first.proposal,
      action: 'revoke',
      priorRecordId: prior.recordId,
      priorRevision: prior.revision,
      reason: 'The operator revokes the exact local-trunk grant before its use.',
    },
    facts: { ...facts, prior },
  });
  assert.ok(revoked.statement.includes('Authorize revoke'));
  assert.equal(revoked.request.deliveryScope.pullRequest, null);
  assert.throws(() =>
    prepareDeliveryWaiver({
      input: {
        ...first.proposal,
        action: 'revoke',
        priorRecordId: prior.recordId,
        priorRevision: 2,
      },
      facts: { ...facts, prior },
    })
  );
});
