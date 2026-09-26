// @story #1823
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  requirementById,
  validateDeliveryExceptionIds,
  validateDeliveryWaiverIds,
  validateWaiverIds,
} from '../../../../task-tracker/lib/workflow-policy/catalog.mjs';
import { createWorkflowExceptionEnvelope } from '../../../../task-tracker/lib/workflow-policy/exception-record.mjs';
import { buildDeliveryScope } from '../../../../task-tracker/lib/workflow-policy/delivery-scope.mjs';

const id = 'delivery.local-trunk-close-authorization';
const scope = Object.freeze({
  schema: 'aitm.delivery-exception-scope/v1',
  repository: 'kburson/ai-task-manager',
  issue: 1823,
  exceptionKind: id,
  pullRequest: null,
  acceptedHeadSha: 'a'.repeat(40),
  baseRef: 'trunk',
  resolvedTrunkRef: 'origin/trunk',
  requirementId: id,
  deliveryOperationId: '01M2H000000000000000000002',
});
const authorization = Object.freeze({
  reference: 'codex://sessions/session/messages/message',
  statement: 'Authorize this exact local-trunk close.',
  principal: 'github-user:kburson',
  recordingActor: 'codex/session:session',
  origin: 'codex-session-transcript',
  verificationLevel: 'host-verified-user-message',
});
function envelope(overrides = {}) {
  return createWorkflowExceptionEnvelope({
    schema: 'aitm.workflow-exception/v2',
    repository: scope.repository,
    issue: scope.issue,
    exceptionId: 'delivery-1823',
    revision: 1,
    scopeIdentity: `sha256:${'a'.repeat(64)}`,
    requirementIds: [id],
    constraints: [],
    reason: 'The operator authorizes this already-integrated issue only.',
    authorization,
    expiresAt: '2026-09-27T09:00:00.000Z',
    operationId: `sha256:${'b'.repeat(64)}`,
    createdAt: '2026-09-26T09:00:00.000Z',
    recordId: '01M2H000000000000000000001',
    grantId: '01M2H000000000000000000090',
    scopeKind: 'delivery',
    deliveryScope: scope,
    waiverScopeDigest: buildDeliveryScope(scope).waiverScopeDigest,
    ...overrides,
  });
}

test('local-trunk ID is closed and cannot enter an ordinary or PR waiver', () => {
  assert.equal(requirementById(id).family, 'delivery-local-trunk-authorization');
  assert.throws(() => validateWaiverIds([id]));
  assert.throws(() => validateDeliveryWaiverIds([id], scope));
  assert.deepEqual(validateDeliveryExceptionIds([id], scope), [id]);
  for (const ids of [[], [id, id], ['delivery.verification.pr-scope']])
    assert.throws(() => validateDeliveryExceptionIds(ids, scope));
  for (const changed of [
    { ...scope, exceptionKind: 'delivery.invariant-waiver', pullRequest: 1824 },
    { ...scope, pullRequest: 1824 },
    { ...scope, requirementId: 'delivery.verification.pr-scope' },
  ])
    assert.throws(() => validateDeliveryExceptionIds([id], changed));
});

test('v2 local record binds exact scope, digest, identity, and expiry', () => {
  const value = envelope();
  assert.equal(value.payload.deliveryScope.pullRequest, null);
  const digest = buildDeliveryScope(scope).waiverScopeDigest;
  for (const [key, replacement] of [
    ['repository', 'other/repo'],
    ['issue', 1824],
    ['acceptedHeadSha', 'b'.repeat(40)],
    ['baseRef', 'release'],
    ['resolvedTrunkRef', 'origin/release'],
    ['deliveryOperationId', '01M2H000000000000000000003'],
  ])
    assert.notEqual(buildDeliveryScope({ ...scope, [key]: replacement }).waiverScopeDigest, digest);
  for (const overrides of [
    { requirementIds: ['delivery.verification.pr-scope'] },
    { requirementIds: [id, id] },
    { deliveryScope: { ...scope, pullRequest: 1824 } },
    { deliveryScope: { ...scope, requirementId: 'delivery.verification.pr-scope' } },
    { schema: 'aitm.workflow-exception/v1' },
    { expiresAt: null },
    { expiresAt: '2026-09-26T08:00:00.000Z' },
  ])
    assert.throws(() => envelope(overrides));
});

test('v2 request accepts local scope while rejecting mismatched kind and ID', async () => {
  const { deliveryProposalDigest, parseDeliveryWaiverRequest } =
    await import('../../../../task-tracker/lib/workflow-policy/delivery-request.mjs');
  const reason = 'The operator authorizes this already-integrated issue only.';
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();
  const scopeIdentity = `sha256:${'a'.repeat(64)}`;
  const waiverScopeDigest = buildDeliveryScope(scope).waiverScopeDigest;
  const request = {
    schema: 'aitm.workflow-exception-request/v2',
    action: 'record',
    authorizationSource: {
      schema: 'aitm.authorization-source/v1',
      adapter: 'codex-session/v1',
      sessionId: '01a0a1d4-c130-7a42-8ccd-4f31b7d4f0ed',
      messageId: 'msg_authority',
      statementHash: `sha256:${'f'.repeat(64)}`,
    },
    constraints: [],
    exceptionId: 'delivery-1823',
    expiresAt,
    reason,
    requirementIds: [id],
    scopeKind: 'delivery',
    deliveryScope: scope,
    waiverScopeDigest,
    scopeIdentity,
    priorRecordId: null,
    priorRevision: null,
    proposalDigest: deliveryProposalDigest({
      action: 'record',
      repository: scope.repository,
      issue: scope.issue,
      scopeIdentity,
      waiverScopeDigest,
      exceptionId: 'delivery-1823',
      reason,
      expiresAt,
      priorRecordId: null,
      priorRevision: null,
    }),
  };
  assert.deepEqual(parseDeliveryWaiverRequest(request, { action: 'record' }), request);
  for (const changed of [
    { ...request, requirementIds: ['delivery.verification.pr-scope'] },
    { ...request, deliveryScope: { ...scope, pullRequest: 1824 } },
    { ...request, deliveryScope: { ...scope, requirementId: 'delivery.verification.pr-scope' } },
    { ...request, expiresAt: '2020-01-01T00:00:00.000Z' },
  ])
    assert.throws(() => parseDeliveryWaiverRequest(changed, { action: 'record' }));
});
