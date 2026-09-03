// @story #1498
import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

import { logicalRecordFixture } from '../../../../helpers/evidence-v2/logical-records.mjs';
import { authorizeAcceptance } from '../../../../../task-tracker/lib/evidence-v2/acceptance.mjs';
import { createRecord } from '../../../../../task-tracker/lib/evidence-v2/codec.mjs';
import {
  resolveDeliveryIntent,
  verifyDelivery,
} from '../../../../../task-tracker/lib/evidence-v2/delivery.mjs';
import { resolveEvidenceV2DeliveryAuthority } from '../../../../../task-tracker/lib/delivery-authority.mjs';
import { verifyEvidenceV2Delivery } from '../../../../../task-tracker/lib/delivery-verification.mjs';
import { requireEvidenceV2DeliveryReceipt } from '../../../../../task-tracker/lib/close-delivery-receipt.mjs';

async function fixture() {
  const f = logicalRecordFixture();
  const authorized = await authorizeAcceptance({
    cycle: f.cycle,
    candidate: f.candidate,
    verificationRecords: [f.verification],
    reviewAuthority: f.reviewAuthority,
    policy: f.policy,
    target: f.target,
  });
  const acceptance = f.make('acceptance', authorized.payload, {
    predecessorId: f.verification.recordId,
  });
  const rewrittenHead = '2'.repeat(40);
  const pr = {
    provider: 'github',
    id: 'PR_rehearsal_42',
    number: 42,
    repositoryId: f.repositoryId,
    baseRef: f.target.ref,
    headRef: 'refs/heads/rewrite',
    headSha: rewrittenHead,
    treeOid: f.candidate.payload.subject.source.treeOid,
  };
  const policy = {
    id: f.policy.id,
    version: f.policy.version,
    requiredMethod: 'squash',
    providers: ['github'],
  };
  const operation = {
    operationId: randomUUID(),
    requestedMethod: 'squash',
  };
  return { ...f, acceptance, pr, policy, operation };
}

function observations(f, overrides = {}) {
  return {
    repositoryId: f.repositoryId,
    provider: 'github',
    prId: f.pr.id,
    prNumber: f.pr.number,
    baseRef: f.pr.baseRef,
    headSha: f.pr.headSha,
    state: 'MERGED',
    landedCommitSha: '3'.repeat(40),
    landedTreeOid: f.candidate.payload.subject.source.treeOid,
    targetHeadSha: '4'.repeat(40),
    method: 'squash',
    transportResult: 'merged',
    contradictory: null,
    ...overrides,
  };
}

test('delivery intent binds acceptance to one explicit rewritten PR and provider head', async () => {
  const f = await fixture();
  const intent = resolveDeliveryIntent(f);

  assert.equal(intent.acceptanceId, f.acceptance.recordId);
  assert.equal(intent.candidateId, f.candidate.recordId);
  assert.equal(intent.pr.id, f.pr.id);
  assert.equal(intent.expectedHeadSha, f.pr.headSha);
  assert.equal(intent.authorizedTreeOid, f.candidate.payload.subject.source.treeOid);
  assert.equal(intent.requestedMethod, 'squash');
  assert.ok(Object.isFrozen(intent));

  assert.throws(() => resolveDeliveryIntent({ ...f, pr: { ...f.pr, id: '' } }), /delivery-pr/);
  assert.throws(
    () =>
      resolveDeliveryIntent({
        ...f,
        pr: {
          ...f.pr,
          repositoryId: { ...f.repositoryId, nodeId: 'wrong' },
        },
      }),
    /delivery-repository/
  );
  assert.throws(
    () => resolveDeliveryIntent({ ...f, pr: { ...f.pr, baseRef: 'refs/heads/wrong' } }),
    /delivery-target/
  );
  assert.throws(
    () => resolveDeliveryIntent({ ...f, pr: { ...f.pr, treeOid: 'f'.repeat(40) } }),
    /delivery-content/
  );
  assert.throws(
    () =>
      resolveDeliveryIntent({
        ...f,
        operation: { ...f.operation, requestedMethod: 'merge' },
      }),
    /delivery-method/
  );
});

test('delivery verification separates accepted content from required method policy', async () => {
  const f = await fixture();
  const intent = resolveDeliveryIntent(f);
  const delivered = await verifyDelivery({
    intent,
    observations: observations(f),
    ports: {
      inspectCommit: async ({ sha }) => ({
        sha,
        treeOid: f.candidate.payload.subject.source.treeOid,
      }),
    },
  });

  assert.equal(delivered.acceptanceId, f.acceptance.recordId);
  assert.equal(delivered.intentId, null);
  assert.equal(delivered.contentVerification.result, 'match');
  assert.equal(delivered.methodObservation.result, 'compliant');
  assert.equal(delivered.transport.result, 'merged');
  assert.ok(Object.isFrozen(delivered));

  await assert.rejects(
    () =>
      verifyDelivery({
        intent,
        observations: observations(f, { headSha: '5'.repeat(40) }),
        ports: { inspectCommit: async () => ({ treeOid: intent.authorizedTreeOid }) },
      }),
    /delivery-v2:head-race/
  );
  await assert.rejects(
    () =>
      verifyDelivery({
        intent,
        observations: observations(f, { landedTreeOid: '6'.repeat(40) }),
        ports: { inspectCommit: async () => ({ treeOid: '6'.repeat(40) }) },
      }),
    /delivery-v2:content/
  );
  await assert.rejects(
    () =>
      verifyDelivery({
        intent,
        observations: observations(f, { method: 'merge' }),
        ports: { inspectCommit: async () => ({ treeOid: intent.authorizedTreeOid }) },
      }),
    /delivery-v2:method/
  );
  await assert.rejects(
    () =>
      verifyDelivery({
        intent,
        observations: observations(f, { contradictory: 'reverted' }),
        ports: { inspectCommit: async () => ({ treeOid: intent.authorizedTreeOid }) },
      }),
    /delivery-v2:contradictory/
  );
});

test('strict intent and delivery payloads roundtrip through evidence records', async () => {
  const f = await fixture();
  const intentPayload = resolveDeliveryIntent(f);
  const intentRecord = createRecord({
    schema: 'aitm.evidence-record/v2',
    recordType: 'delivery-intent',
    repositoryId: f.repositoryId,
    issueNumber: f.acceptance.issueNumber,
    cycleId: f.acceptance.cycleId,
    operationId: f.operation.operationId,
    predecessorId: f.acceptance.recordId,
    actor: { id: 'rehearsal-author', kind: 'user' },
    recordedAt: '2026-09-03T17:00:00.000Z',
    payload: intentPayload,
  });
  const deliveryPayload = await verifyDelivery({
    intent: { ...intentPayload, intentId: intentRecord.recordId },
    observations: observations(f),
    ports: { inspectCommit: async () => ({ treeOid: intentPayload.authorizedTreeOid }) },
  });
  const deliveryRecord = createRecord({
    schema: 'aitm.evidence-record/v2',
    recordType: 'delivery',
    repositoryId: f.repositoryId,
    issueNumber: f.acceptance.issueNumber,
    cycleId: f.acceptance.cycleId,
    operationId: randomUUID(),
    predecessorId: intentRecord.recordId,
    actor: { id: 'rehearsal-author', kind: 'runner' },
    recordedAt: '2026-09-03T17:01:00.000Z',
    payload: deliveryPayload,
  });

  assert.equal(intentRecord.payload.acceptanceId, f.acceptance.recordId);
  assert.equal(deliveryRecord.payload.intentId, intentRecord.recordId);
  assert.equal(
    requireEvidenceV2DeliveryReceipt({
      delivery: deliveryRecord,
      acceptanceId: f.acceptance.recordId,
      intentId: intentRecord.recordId,
    }).receipt.recordId,
    deliveryRecord.recordId
  );
});

test('v1 modules expose narrow v2 adapters without changing their existing functions', async () => {
  const f = await fixture();
  const direct = resolveDeliveryIntent(f);
  const adapted = resolveEvidenceV2DeliveryAuthority(f);
  assert.deepEqual(adapted, direct);
  assert.deepEqual(
    await verifyEvidenceV2Delivery({
      intent: adapted,
      observations: observations(f),
      ports: { inspectCommit: async () => ({ treeOid: adapted.authorizedTreeOid }) },
    }),
    await verifyDelivery({
      intent: direct,
      observations: observations(f),
      ports: { inspectCommit: async () => ({ treeOid: direct.authorizedTreeOid }) },
    })
  );
});
