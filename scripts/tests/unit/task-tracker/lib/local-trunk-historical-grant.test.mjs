// @story #1827
import assert from 'node:assert/strict';
import test from 'node:test';
import { verifyHistoricalLocalTrunkGrant } from '../../../../task-tracker/lib/delivery-waiver-consumption.mjs';
import { renderAitmRecord } from '../../../../task-tracker/lib/github-records/record-envelope.mjs';
import { buildLocalTrunkCloseBurn } from '../../../../task-tracker/lib/local-trunk-close-receipt.mjs';
import { buildDeliveryScope } from '../../../../task-tracker/lib/workflow-policy/delivery-scope.mjs';
import { createWorkflowExceptionEnvelope } from '../../../../task-tracker/lib/workflow-policy/exception-record.mjs';
const repository = 'kburson/ai-task-manager';
const issue = 1827;
const requirementId = 'delivery.local-trunk-close-authorization';
const scope = {
  schema: 'aitm.delivery-exception-scope/v1',
  repository,
  issue,
  exceptionKind: requirementId,
  pullRequest: null,
  acceptedHeadSha: 'a'.repeat(40),
  baseRef: 'trunk',
  resolvedTrunkRef: 'origin/trunk',
  requirementId,
  deliveryOperationId: '01M2H000000000000000000002',
};
const authorization = {
  reference: 'codex://sessions/session/messages/message',
  statement: 'Authorize this exact local-trunk close.',
  principal: 'github-user:kburson',
  recordingActor: 'codex/session:session',
  origin: 'codex-session-transcript',
  verificationLevel: 'host-verified-user-message',
};
function grant(revision, predecessor = null) {
  return createWorkflowExceptionEnvelope({
    schema: 'aitm.workflow-exception/v2',
    repository,
    issue,
    exceptionId: 'delivery-1827',
    revision,
    scopeIdentity: `sha256:${'a'.repeat(64)}`,
    requirementIds: [requirementId],
    constraints: [],
    reason: 'The operator authorizes this already-integrated issue only.',
    authorization,
    expiresAt: '2026-09-27T09:00:00.000Z',
    operationId: `sha256:${String(revision).repeat(64)}`,
    createdAt: `2026-09-26T09:0${revision}:00.000Z`,
    recordId: `01M2H00000000000000000000${revision}`,
    grantId: `01M2H00000000000000000009${revision}`,
    predecessor,
    supersedes: predecessor,
    scopeKind: 'delivery',
    deliveryScope: scope,
    waiverScopeDigest: buildDeliveryScope(scope).waiverScopeDigest,
  });
}
function comment(envelope) {
  return { node_id: `IC_${envelope.recordId}`, body: renderAitmRecord({ envelope }) };
}
test('historical local grant requires the complete predecessor chain', async () => {
  const first = grant(1);
  const second = grant(2, first.recordId);
  const burn = buildLocalTrunkCloseBurn({
    grant: second,
    authorizedAt: '2026-09-26T09:03:00.000Z',
  });
  const input = {
    confirmedBurn: burn,
    journalSnapshot: {
      operations: new Map([[scope.deliveryOperationId, { burn, burnSequence: 1 }]]),
      barriers: new Map(),
    },
    repository,
    issue,
    verifyStoredAuthority: async () => {},
  };
  await assert.rejects(
    verifyHistoricalLocalTrunkGrant({ ...input, comments: [comment(second)] }),
    new RegExp('historical-chain')
  );
  await assert.rejects(
    verifyHistoricalLocalTrunkGrant({
      ...input,
      comments: [comment(first), comment(second)],
    }),
    new RegExp('without-barrier-revision')
  );
  const barrier = {
    entry: {
      revisionRecordId: second.recordId,
      revisionOperationId: second.payload.operationId,
      revisionGrantId: second.authority.grantId,
      revisionCreatedAt: second.createdAt,
      deliveryOperationId: scope.deliveryOperationId,
      action: 'revise',
      sequence: 1,
    },
  };
  const historical = await verifyHistoricalLocalTrunkGrant({
    ...input,
    journalSnapshot: {
      operations: new Map([[scope.deliveryOperationId, { burn, burnSequence: 2 }]]),
      barriers: new Map([[first.recordId, barrier]]),
    },
    comments: [comment(first), comment(second)],
  });
  assert.equal(historical.deliveryOperationId, scope.deliveryOperationId);
});
