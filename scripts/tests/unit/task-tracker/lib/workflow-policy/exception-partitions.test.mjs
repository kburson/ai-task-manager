// @story #1787 #1794 #1795
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';

import { canonicalRecordJson } from '../../../../../task-tracker/lib/github-records/canonical-json.mjs';
import { buildDeliveryScope } from '../../../../../task-tracker/lib/workflow-policy/delivery-scope.mjs';
import {
  createWorkflowExceptionEnvelope,
  resolveDeliveryExceptionChain,
  resolveWorkflowExceptionRecords,
} from '../../../../../task-tracker/lib/workflow-policy/exception-record.mjs';
import { partitionWorkflowExceptions } from '../../../../../task-tracker/lib/workflow-policy/exception-partitions.mjs';
import { evaluateWorkflowPolicy } from '../../../../../task-tracker/lib/workflow-policy/evaluator.mjs';
import {
  executeWorkflowExceptionWrite,
  inspectWorkflowException,
} from '../../../../../task-tracker/lib/workflow-policy/exception-store.mjs';

const repository = 'kburson/ai-task-manager';
const issue = 1794;
const scopeIdentity = `sha256:${'a'.repeat(64)}`;
const createdAt = '2026-09-25T08:00:00.000Z';
const now = '2026-09-25T08:01:00.000Z';
const expiresAt = '2026-09-26T08:00:00.000Z';
const authorization = {
  reference: 'codex://sessions/01a0a1d4-c130-7a42-8ccd-4f31b7d4f0ed/messages/msg_authority',
  statement: 'Authorize the exact issue and delivery scope.',
  principal: 'github-user:kburson',
  recordingActor: 'codex/session:01a0a1d4-c130-7a42-8ccd-4f31b7d4f0ed',
  origin: 'codex-session-transcript',
  verificationLevel: 'host-verified-user-message',
};
const ulid = (n) => `01M2H0000000000000000000${String(n).padStart(2, '0')}`;
const stored = (envelope) => ({ commentNodeId: `IC_${envelope.recordId}`, envelope });

function ordinary() {
  return stored(
    createWorkflowExceptionEnvelope({
      repository,
      issue,
      exceptionId: 'ordinary-review',
      revision: 1,
      scopeIdentity,
      requirementIds: ['review.design'],
      constraints: [{ id: 'provider.managed-execution', effect: 'deny' }],
      reason: 'The operator approved this bounded ordinary review exception.',
      authorization,
      expiresAt,
      operationId: `sha256:${'b'.repeat(64)}`,
      createdAt,
      recordId: ulid(1),
      grantId: ulid(91),
    })
  );
}

function delivery(n, overrides = {}) {
  const deliveryScope = {
    schema: 'aitm.delivery-exception-scope/v1',
    repository,
    issue,
    exceptionKind: 'delivery.invariant-waiver',
    pullRequest: 1785,
    acceptedHeadSha: 'a'.repeat(40),
    baseRef: 'trunk',
    resolvedTrunkRef: 'origin/trunk',
    requirementId: 'delivery.verification.merge-method',
    deliveryOperationId: ulid(n),
    ...overrides.deliveryScope,
  };
  return stored(
    createWorkflowExceptionEnvelope({
      schema: 'aitm.workflow-exception/v2',
      repository,
      issue,
      exceptionId: overrides.exceptionId ?? `delivery-${n}`,
      revision: overrides.revision ?? 1,
      scopeIdentity,
      requirementIds: [deliveryScope.requirementId],
      constraints: [],
      reason: 'The operator approved this exact delivery waiver.',
      authorization,
      expiresAt,
      operationId: overrides.operationId ?? `sha256:${String(n).repeat(64).slice(0, 64)}`,
      createdAt,
      recordId: overrides.recordId ?? ulid(n),
      grantId: ulid(n + 50),
      predecessor: overrides.predecessor ?? null,
      supersedes: overrides.supersedes ?? null,
      scopeKind: 'delivery',
      deliveryScope,
      waiverScopeDigest: buildDeliveryScope(deliveryScope).waiverScopeDigest,
    })
  );
}

test('ordinary and two delivery histories coexist without ordinary policy drift', () => {
  const records = [ordinary(), delivery(2), delivery(3)];
  const grouped = partitionWorkflowExceptions({ records, repository, issue });
  assert.equal(grouped.ordinary.length, 1);
  assert.equal(grouped.delivery.size, 2);
  assert.ok(Object.isFrozen(grouped.ordinary));
  const ordinaryChain = resolveWorkflowExceptionRecords({
    records,
    repository,
    issue,
    currentScopeIdentity: scopeIdentity,
    now,
  });
  assert.equal(ordinaryChain.status, 'active');
  assert.deepEqual(ordinaryChain.active.requirementIds, ['review.design']);
  for (const [partitionKey, members] of grouped.delivery) {
    assert.equal(members.length, 1);
    const chain = resolveDeliveryExceptionChain({
      records,
      partitionKey,
      repository,
      issue,
      scopeIdentity,
      now,
    });
    assert.equal(chain.status, 'active');
    assert.equal(
      chain.active.deliveryScope.deliveryOperationId,
      members[0].envelope.payload.deliveryScope.deliveryOperationId
    );
  }
  const evaluation = evaluateWorkflowPolicy({
    repository,
    issue,
    scopeIdentity,
    now,
    activity: 'managed-provider:run',
    baselineRequirementIds: ['review.design', 'delivery.verification.merge-method'],
    evidence: {},
    records: [ordinaryChain.active],
  });
  assert.equal(evaluation.decisions[0].outcome, 'waived');
  assert.equal(evaluation.decisions[1].outcome, 'missing');
  assert.deepEqual(
    evaluation.prohibitions.map(({ id }) => id),
    ['provider.managed-execution']
  );
  const firstDeliveryKey = grouped.delivery.keys().next().value;
  const deliveryChain = resolveDeliveryExceptionChain({
    records,
    partitionKey: firstDeliveryKey,
    repository,
    issue,
    scopeIdentity,
    now,
  });
  const deliveryOnly = evaluateWorkflowPolicy({
    repository,
    issue,
    scopeIdentity,
    now,
    baselineRequirementIds: ['delivery.verification.merge-method'],
    evidence: {},
    records: [deliveryChain.active],
  });
  assert.equal(deliveryOnly.decisions[0].outcome, 'missing');
});

test('duplicate delivery exception identities and cross-partition links refuse', () => {
  assert.throws(
    () =>
      partitionWorkflowExceptions({
        records: [delivery(2), delivery(3, { exceptionId: 'delivery-2' })],
        repository,
        issue,
      }),
    /exception-partitions:/
  );
  const cross = delivery(3, { revision: 2, predecessor: ulid(2), supersedes: ulid(2) });
  assert.throws(
    () => partitionWorkflowExceptions({ records: [delivery(2), cross], repository, issue }),
    /exception-partitions:/
  );
  const repeatedApproval = delivery(2, {
    revision: 2,
    recordId: ulid(4),
    predecessor: ulid(2),
    supersedes: ulid(2),
    deliveryScope: { acceptedHeadSha: 'b'.repeat(40) },
  });
  assert.throws(
    () =>
      partitionWorkflowExceptions({ records: [delivery(2), repeatedApproval], repository, issue }),
    /fresh-approval/
  );
});

test('delivery roots, heads, gaps, and unknown schemas fail closed', () => {
  const root = delivery(2);
  const duplicateRoot = delivery(2, { recordId: ulid(4) });
  assert.throws(
    () => partitionWorkflowExceptions({ records: [root, duplicateRoot], repository, issue }),
    /delivery-root/
  );
  const revisionTwo = delivery(2, {
    revision: 2,
    recordId: ulid(4),
    predecessor: root.envelope.recordId,
    supersedes: root.envelope.recordId,
  });
  const fork = delivery(2, {
    revision: 2,
    recordId: ulid(5),
    predecessor: root.envelope.recordId,
    supersedes: root.envelope.recordId,
  });
  assert.throws(
    () => partitionWorkflowExceptions({ records: [root, revisionTwo, fork], repository, issue }),
    /delivery-fork/
  );
  const gap = delivery(2, {
    revision: 3,
    recordId: ulid(6),
    predecessor: root.envelope.recordId,
    supersedes: root.envelope.recordId,
  });
  assert.throws(
    () => partitionWorkflowExceptions({ records: [root, gap], repository, issue }),
    /delivery-chain/
  );
  const unknown = {
    ...root,
    envelope: {
      ...root.envelope,
      payload: { ...root.envelope.payload, schema: 'aitm.workflow-exception/v3' },
    },
  };
  assert.throws(
    () => partitionWorkflowExceptions({ records: [unknown], repository, issue }),
    /invalid-record/
  );
});

function storeRuntime(initial = [ordinary()]) {
  const records = [...initial];
  let sequence = 70;
  return {
    records,
    async listRecords() {
      return [...records];
    },
    async appendRecord({ envelope }) {
      records.push(stored(envelope));
    },
    nextIds() {
      sequence += 1;
      return { recordId: ulid(sequence), grantId: ulid(sequence + 20) };
    },
  };
}

function deliveryRequest(n) {
  const envelope = delivery(n).envelope;
  return {
    scopeKind: 'delivery',
    deliveryScope: envelope.payload.deliveryScope,
    waiverScopeDigest: envelope.payload.waiverScopeDigest,
    exceptionId: envelope.payload.exceptionId,
    requirementIds: envelope.payload.requirementIds,
    constraints: [],
    reason: envelope.payload.reason,
    expiresAt,
    priorRecordId: null,
    priorRevision: null,
  };
}

test('store records, retries, and revokes one delivery partition without touching others', async () => {
  const runtime = storeRuntime();
  const write = (action, request, time = now) =>
    executeWorkflowExceptionWrite({
      action,
      repository,
      issue,
      scopeIdentity,
      request,
      authority: authorization,
      now: time,
      runtime,
    });
  const first = await write('record', deliveryRequest(2));
  assert.equal(first.status, 'created');
  assert.equal((await write('record', deliveryRequest(2))).status, 'existing');
  const revised = await write('revise', {
    ...deliveryRequest(2),
    priorRecordId: runtime.records[1].envelope.recordId,
    priorRevision: 1,
    reason: 'The operator revised the exact delivery reason.',
  });
  assert.equal(revised.status, 'created');
  assert.equal(revised.revision, 2);
  assert.equal((await write('record', deliveryRequest(3))).status, 'created');
  assert.equal(runtime.records.length, 4);
  const ordinaryHead = await inspectWorkflowException({
    repository,
    issue,
    scopeIdentity,
    now,
    runtime,
  });
  assert.equal(ordinaryHead.active.recordId, ordinary().envelope.recordId);
  const firstHead = await inspectWorkflowException({
    repository,
    issue,
    scopeIdentity,
    now,
    runtime,
    deliveryScope: deliveryRequest(2).deliveryScope,
  });
  assert.equal(firstHead.status, 'active');
  assert.equal(firstHead.active.deliveryScope.deliveryOperationId, ulid(2));
  assert.equal(
    (
      await write(
        'revoke',
        {
          ...deliveryRequest(2),
          priorRecordId: runtime.records[2].envelope.recordId,
          priorRevision: 2,
          reason: 'Revoke this exact delivery grant.',
        },
        '2026-09-25T08:02:00.000Z'
      )
    ).status,
    'revoked'
  );
  const afterRevoke = await inspectWorkflowException({
    repository,
    issue,
    scopeIdentity,
    now: '2026-09-25T08:03:00.000Z',
    runtime,
    deliveryScope: deliveryRequest(2).deliveryScope,
  });
  assert.equal(afterRevoke.status, 'revoked');
  const other = await inspectWorkflowException({
    repository,
    issue,
    scopeIdentity,
    now,
    runtime,
    deliveryScope: deliveryRequest(3).deliveryScope,
  });
  assert.equal(other.status, 'active');
});

test('re-scoping within one delivery operation requires a fresh approval reference', async () => {
  const runtime = storeRuntime([delivery(2)]);
  const changedScope = { ...deliveryRequest(2).deliveryScope, acceptedHeadSha: 'b'.repeat(40) };
  const request = {
    ...deliveryRequest(2),
    priorRecordId: ulid(2),
    priorRevision: 1,
    deliveryScope: changedScope,
    waiverScopeDigest: buildDeliveryScope(changedScope).waiverScopeDigest,
  };
  const call = (authority) =>
    executeWorkflowExceptionWrite({
      action: 'revise',
      repository,
      issue,
      scopeIdentity,
      request,
      authority,
      now,
      runtime,
    });
  const stale = await call(authorization);
  assert.equal(stale.status, 'blocked');
  assert.equal(stale.code, 'fresh-approval-required');
  assert.equal(runtime.records.length, 1);
  const fresh = await call({
    ...authorization,
    reference: 'codex://sessions/01a0a1d4-c130-7a42-8ccd-4f31b7d4f0ed/messages/msg_fresh',
  });
  assert.equal(fresh.status, 'created');
  assert.equal(
    runtime.records.at(-1).envelope.payload.waiverScopeDigest,
    request.waiverScopeDigest
  );
});

test('store refuses an operation digest already used by another partition', async () => {
  const request = deliveryRequest(2);
  const policy = {
    exceptionId: request.exceptionId,
    scopeIdentity,
    requirementIds: request.requirementIds,
    constraints: request.constraints,
    reason: request.reason,
    authorization,
    expiresAt: request.expiresAt,
    schema: 'aitm.workflow-exception/v2',
    scopeKind: 'delivery',
    deliveryScope: request.deliveryScope,
    waiverScopeDigest: request.waiverScopeDigest,
  };
  const operationId = `sha256:${createHash('sha256')
    .update(
      canonicalRecordJson({
        action: 'record',
        repository,
        issue,
        revision: 1,
        status: 'active',
        ...policy,
      })
    )
    .digest('hex')}`;
  const runtime = storeRuntime([ordinary(), delivery(3, { operationId })]);
  const result = await executeWorkflowExceptionWrite({
    action: 'record',
    repository,
    issue,
    scopeIdentity,
    request,
    authority: authorization,
    now,
    runtime,
  });
  assert.deepEqual(
    { status: result.status, code: result.code },
    {
      status: 'blocked',
      code: 'operation-digest-collision',
    }
  );
  assert.equal(runtime.records.length, 2);
});

test('lost write and wrong-partition readback remain indeterminate', async () => {
  const request = deliveryRequest(2);
  const lost = storeRuntime();
  lost.appendRecord = async () => {
    throw new Error('lost response');
  };
  const call = (runtime) =>
    executeWorkflowExceptionWrite({
      action: 'record',
      repository,
      issue,
      scopeIdentity,
      request,
      authority: authorization,
      now,
      runtime,
    });
  assert.equal((await call(lost)).status, 'indeterminate');
  const wrongPartition = storeRuntime();
  wrongPartition.appendRecord = async ({ envelope }) => {
    const otherScope = deliveryRequest(3).deliveryScope;
    wrongPartition.records.push(
      stored(
        createWorkflowExceptionEnvelope({
          schema: 'aitm.workflow-exception/v2',
          repository,
          issue,
          exceptionId: 'delivery-3',
          revision: 1,
          scopeIdentity,
          requirementIds: [otherScope.requirementId],
          constraints: [],
          reason: envelope.payload.reason,
          authorization,
          expiresAt,
          operationId: envelope.payload.operationId,
          createdAt: envelope.createdAt,
          recordId: envelope.recordId,
          grantId: envelope.authority.grantId,
          scopeKind: 'delivery',
          deliveryScope: otherScope,
          waiverScopeDigest: buildDeliveryScope(otherScope).waiverScopeDigest,
        })
      )
    );
  };
  assert.equal((await call(wrongPartition)).status, 'indeterminate');
  const unreadable = storeRuntime();
  let reads = 0;
  unreadable.listRecords = async () => {
    reads += 1;
    if (reads > 1) throw new Error('readback unavailable');
    return [...unreadable.records];
  };
  assert.equal((await call(unreadable)).status, 'indeterminate');
});
