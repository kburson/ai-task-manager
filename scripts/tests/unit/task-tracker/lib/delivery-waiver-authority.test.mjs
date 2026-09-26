// @story #1787 #1795
import assert from 'node:assert/strict';
import test from 'node:test';

import {
  deliveryApprovalStatement,
  prepareDeliveryWaiver,
  parseDeliveryWaiverProposal,
  parseDeliveryWaiverRequest,
} from '../../../../task-tracker/lib/workflow-policy/delivery-request.mjs';
import {
  DeliveryWaiverAuthorityError,
  DELIVERY_WAIVER_AUTHORITY_CATEGORIES,
  resolveDeliveryWaiver,
} from '../../../../task-tracker/lib/workflow-policy/delivery-waiver-authority.mjs';

const repository = 'kburson/ai-task-manager';
const issue = 1795;
const ulid = (n) => `01M2H0000000000000000000${String(n).padStart(2, '0')}`;
const scopeIdentity = `sha256:${'a'.repeat(64)}`;
const facts = Object.freeze({
  repository,
  issue,
  scopeIdentity,
  pullRequest: 1785,
  acceptedHeadSha: 'b'.repeat(40),
  baseRef: 'trunk',
  resolvedTrunkRef: 'origin/trunk',
  originalIntentRecordId: ulid(80),
  prior: null,
});
const input = Object.freeze({
  schema: 'aitm.delivery-waiver-proposal/v1',
  action: 'record',
  exceptionId: null,
  priorRecordId: null,
  priorRevision: null,
  requirementId: 'delivery.verification.merge-method',
  reason: 'The operator accepts the observed provider merge method for this delivery.',
  expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
  deliveryOperationId: null,
});

test('preparation binds one exact scope and returns a draft with no approval source', () => {
  const prepared = prepareDeliveryWaiver({
    input,
    facts,
    ids: { exceptionId: 'delivery-1795', deliveryOperationId: ulid(1) },
  });
  assert.equal(prepared.proposal.exceptionId, 'delivery-1795');
  assert.equal(prepared.proposal.deliveryOperationId, ulid(1));
  assert.equal(prepared.request.authorizationSource, null);
  assert.equal(prepared.request.scopeKind, 'delivery');
  assert.equal(prepared.request.deliveryScope.repository, repository);
  assert.equal(prepared.request.deliveryScope.issue, issue);
  assert.equal(prepared.request.deliveryScope.pullRequest, 1785);
  assert.equal(prepared.request.deliveryScope.acceptedHeadSha, 'b'.repeat(40));
  assert.match(prepared.request.proposalDigest, /^sha256:[0-9a-f]{64}$/);
  assert.equal(
    prepared.statement,
    deliveryApprovalStatement({ action: 'record', proposalDigest: prepared.request.proposalDigest })
  );
  assert.deepEqual(
    Object.keys(prepared.request).sort(),
    [
      'schema',
      'action',
      'authorizationSource',
      'constraints',
      'exceptionId',
      'expiresAt',
      'reason',
      'requirementIds',
      'scopeKind',
      'deliveryScope',
      'waiverScopeDigest',
      'scopeIdentity',
      'priorRecordId',
      'priorRevision',
      'proposalDigest',
    ].sort()
  );
  assert.throws(
    () => parseDeliveryWaiverRequest(prepared.request, { action: 'record' }),
    /authorization-source/
  );
  const repeat = prepareDeliveryWaiver({ input: prepared.proposal, facts });
  assert.equal(repeat.request.proposalDigest, prepared.request.proposalDigest);
  assert.throws(
    () =>
      prepareDeliveryWaiver({
        input,
        facts: {
          ...facts,
          existingDeliveryRecords: [
            {
              envelope: {
                payload: {
                  scopeKind: 'delivery',
                  deliveryScope: {
                    requirementId: input.requirementId,
                    pullRequest: facts.pullRequest,
                    acceptedHeadSha: facts.acceptedHeadSha,
                  },
                  reason: input.reason,
                  expiresAt: input.expiresAt,
                },
              },
            },
          ],
        },
      }),
    /record-retry-requires-ids/
  );
});

test('closed proposal and action grammar refuse drift and placeholder reasons', () => {
  assert.throws(() => parseDeliveryWaiverProposal({ ...input, extra: true }), /keys/);
  assert.throws(() => parseDeliveryWaiverProposal({ ...input, action: 'show' }), /action/);
  assert.throws(() => parseDeliveryWaiverProposal({ ...input, reason: 'TODO' }), /reason/);
  assert.throws(
    () => prepareDeliveryWaiver({ input, facts: { ...facts, originalIntentRecordId: null } }),
    /original-intent/
  );
  assert.throws(
    () => prepareDeliveryWaiver({ input: { ...input, priorRecordId: ulid(2) }, facts }),
    /prior/
  );
  const prepared = prepareDeliveryWaiver({
    input,
    facts,
    ids: { exceptionId: 'delivery-1795', deliveryOperationId: ulid(1) },
  });
  const source = {
    schema: 'aitm.authorization-source/v1',
    adapter: 'codex-session/v1',
    sessionId: '01a0a1d4-c130-7a42-8ccd-4f31b7d4f0ed',
    messageId: 'msg_authority',
    statementHash: `sha256:${'f'.repeat(64)}`,
  };
  const request = { ...prepared.request, authorizationSource: source };
  assert.throws(
    () => parseDeliveryWaiverRequest({ ...request, action: 'revise' }, { action: 'record' }),
    /action/
  );
  assert.throws(
    () =>
      parseDeliveryWaiverRequest(
        { ...request, waiverScopeDigest: `sha256:${'f'.repeat(64)}` },
        { action: 'record' }
      ),
    /scope-digest/
  );
  assert.throws(
    () =>
      parseDeliveryWaiverRequest(
        { ...request, reason: 'A new reason with a changed approval preimage.' },
        { action: 'record' }
      ),
    /proposal-digest/
  );
});

test('resolver distinguishes missing authority from ambiguous evidence', async () => {
  assert.deepEqual(Object.keys(DELIVERY_WAIVER_AUTHORITY_CATEGORIES), [
    'delivery-waiver-authority',
    'delivery-waiver-replay',
    'delivery-waiver-burn-mismatch',
    'delivery-waiver-ambiguity',
  ]);
  for (const entry of Object.values(DELIVERY_WAIVER_AUTHORITY_CATEGORIES)) {
    assert.equal(entry.requirementId, 'delivery.verification.waiver-authority');
    assert.ok(Object.isFrozen(entry));
  }
  const prepared = prepareDeliveryWaiver({
    input,
    facts,
    ids: { exceptionId: 'delivery-1795', deliveryOperationId: ulid(1) },
  });
  const scope = prepared.request.deliveryScope;
  const missing = await resolveDeliveryWaiver({
    records: [],
    scope,
    scopeIdentity,
    now: '2026-09-25T08:00:00.000Z',
    runtime: { resolveTranscriptPath: () => null },
  });
  assert.deepEqual(missing, { outcome: 'missing', grant: null });
  assert.equal(
    DELIVERY_WAIVER_AUTHORITY_CATEGORIES['delivery-waiver-authority'].requirementId,
    'delivery.verification.waiver-authority'
  );
  const error = new DeliveryWaiverAuthorityError('delivery-waiver-ambiguity', 'indeterminate');
  assert.equal(error.outcome, 'indeterminate');
  assert.equal(error.requirementId, 'delivery.verification.waiver-authority');
});
