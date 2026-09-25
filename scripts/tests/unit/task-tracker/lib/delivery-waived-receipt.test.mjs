// @story #1787 #1797
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { canonicalRecordJson } from '../../../../task-tracker/lib/github-records/canonical-json.mjs';
import { buildDeliveryScope } from '../../../../task-tracker/lib/workflow-policy/delivery-scope.mjs';
import { createWorkflowExceptionEnvelope } from '../../../../task-tracker/lib/workflow-policy/exception-record.mjs';
import {
  authorizedIntentBytes,
  buildDeliveryIntent,
  buildDeliveryReceipt,
  parseDeliveryComment,
  projectDeliveryRecords,
  renderDeliveryIntentComment,
  renderDeliveryReceiptComment,
} from '../../../../task-tracker/lib/delivery-records.mjs';
import {
  buildWaivedReceiptInput,
  validatePinnedWaiverEvidence,
} from '../../../../task-tracker/lib/delivery-waiver-evidence.mjs';

const digest = (value) => `sha256:${createHash('sha256').update(value).digest('hex')}`;
const id = (n) => `01M2H0000000000000000000${String(n).padStart(2, '0')}`;
const repository = 'kburson/ai-task-manager';
const issueNumber = 1797;
const prNumber = 1800;
const head = 'a'.repeat(40);
const merge = 'b'.repeat(40);
const originalCreatedAt = '2026-09-24T12:01:00.000Z';
const intentCreatedAt = '2026-09-25T12:01:00.000Z';
const context = { repository, issueNumber, prNumber };
const scope = buildDeliveryScope({
  schema: 'aitm.delivery-exception-scope/v1',
  repository,
  issue: issueNumber,
  exceptionKind: 'delivery.invariant-waiver',
  pullRequest: prNumber,
  acceptedHeadSha: head,
  baseRef: 'trunk',
  resolvedTrunkRef: 'origin/trunk',
  requirementId: 'delivery.verification.merge-method',
  deliveryOperationId: id(3),
}).scope;
const scopeDigest = buildDeliveryScope(scope).waiverScopeDigest;
const reason = 'Operator accepts the proven merge topology for this exact PR.';
const reasonDigest = digest(reason);

function fixture() {
  const originalIntent = buildDeliveryIntent({
    intentId: id(1),
    supersedesIntentId: null,
    issueNumber,
    repository,
    prNumber,
    baseRef: 'trunk',
    headRef: 'feature/1797',
    expectedHeadSha: head,
    mergeMethod: 'squash',
    attributionTokens: ['#1797'],
    commitTitle: '[#1797] Deliver waiver',
    commitMessage: `PR #${prNumber} source ${head}\n\n[#1797]`,
    provider: 'codex',
    sessionId: 'session',
    clientCreatedAt: originalCreatedAt,
  });
  const grant = createWorkflowExceptionEnvelope({
    schema: 'aitm.workflow-exception/v2',
    repository,
    issue: issueNumber,
    exceptionId: 'delivery-1797',
    revision: 1,
    scopeIdentity: digest('scope'),
    requirementIds: [scope.requirementId],
    constraints: [],
    reason,
    authorization: {
      origin: 'codex-session-transcript',
      principal: 'operator',
      recordingActor: 'kpburson',
      reference: 'codex://sessions/session/messages/msg_1',
      statement: 'I approve the exact delivery waiver.',
      verificationLevel: 'host-verified-user-message',
    },
    expiresAt: '2026-09-26T00:00:00.000Z',
    operationId: digest('write'),
    createdAt: '2026-09-24T12:02:00.000Z',
    recordId: id(4),
    grantId: id(5),
    scopeKind: 'delivery',
    deliveryScope: scope,
    waiverScopeDigest: scopeDigest,
  });
  const common = {
    deliveryDisposition: 'waived',
    waivedRequirementId: scope.requirementId,
    waiverRecordId: grant.recordId,
    waiverRevision: 1,
    deliveryOperationId: scope.deliveryOperationId,
    waiverReasonDigest: reasonDigest,
    waiverScopeDigest: scopeDigest,
    observedFailureCategory: 'merge-method',
    waiverGrant: grant,
    providerMergeMethod: 'merge',
    observedMergeMethod: 'merge',
  };
  const {
    schema: _schema,
    state: _state,
    commitTitleSha256: _titleHash,
    commitMessageSha256: _messageHash,
    ...originalInput
  } = originalIntent;
  const intent = buildDeliveryIntent({
    ...originalInput,
    intentId: id(2),
    supersedesIntentId: originalIntent.intentId,
    clientCreatedAt: intentCreatedAt,
    originalIntentId: originalIntent.intentId,
    originalIntentCreatedAt: originalCreatedAt,
    originalIntentDigest: digest(canonicalRecordJson(originalIntent)),
    ...common,
  });
  const burn = {
    schema: 'aitm.delivery-waiver-consumption/v1',
    repository,
    issue: issueNumber,
    deliveryOperationId: scope.deliveryOperationId,
    waiverRecordId: grant.recordId,
    waiverRevision: 1,
    waiverScopeDigest: scopeDigest,
    waiverReasonDigest: reasonDigest,
    acceptedHeadSha: head,
    intentId: intent.intentId,
    mergeCommitSha: merge,
    authorizedAt: '2026-09-25T12:02:00.000Z',
    grantDigest: digest(canonicalRecordJson(grant)),
  };
  const burnOid = 'c'.repeat(40);
  const verifiedFacts = {
    baseReceiptInput: {
      intentId: intent.intentId,
      issueNumber,
      prNumber,
      expectedHeadSha: head,
      mergeCommitSha: merge,
      baseRef: 'trunk',
      mergeMethod: 'squash',
      verifiedTrunkRef: 'origin/trunk',
      provider: 'codex',
      sessionId: 'session',
      verifiedAt: '2026-09-25T12:03:00.000Z',
    },
    providerMergeMethod: 'merge',
    observedMergeMethod: 'merge',
    observedFailureCategory: 'merge-method',
    waivedRequirementId: scope.requirementId,
  };
  const receipt = buildDeliveryReceipt(
    buildWaivedReceiptInput({ verifiedFacts, intent, grant, burn, burnOid })
  );
  return { originalIntent, intent, grant, burn, burnOid, verifiedFacts, receipt };
}

test('v3 intent and v4 receipt round-trip full pinned three-comment history', () => {
  const { originalIntent, intent, grant, burn, receipt } = fixture();
  assert.equal(intent.schema, 'aitm.delivery-intent/v3');
  assert.equal(receipt.schema, 'aitm.delivery-receipt/v4');
  assert.equal(receipt.result, 'waived');
  assert.notEqual(authorizedIntentBytes(originalIntent), authorizedIntentBytes(intent));
  assert.equal(receipt.waivedRequirementId, scope.requirementId);
  assert.equal(
    Object.isFrozen(
      validatePinnedWaiverEvidence({
        intent,
        receipt,
        grant,
        burn,
        originalIntent: { record: originalIntent, createdAt: originalCreatedAt },
      })
    ),
    true
  );
  const records = [
    { id: 'C1', createdAt: originalCreatedAt, body: renderDeliveryIntentComment(originalIntent) },
    { id: 'C2', createdAt: intentCreatedAt, body: renderDeliveryIntentComment(intent) },
    {
      id: 'C3',
      createdAt: '2026-09-25T12:04:00.000Z',
      body: renderDeliveryReceiptComment(receipt),
    },
  ].map((comment) => parseDeliveryComment(comment, context));
  const projected = projectDeliveryRecords(records);
  assert.deepEqual(projected.matchingReceipt.record, receipt);
  assert.match(renderDeliveryReceiptComment(receipt), /waived/i);
  assert.match(renderDeliveryReceiptComment(receipt), /delivery\.verification\.merge-method/);
});

test('provisional facts and mismatched confirmed burn cannot construct a receipt', () => {
  const { verifiedFacts, intent, grant, burn, burnOid } = fixture();
  assert.throws(() => buildDeliveryReceipt(verifiedFacts), /receipt-input-keys/);
  for (const changes of [
    { burn: null },
    { burn: { ...burn, mergeCommitSha: 'd'.repeat(40) } },
    { burn: { ...burn, authorizedAt: '2026-09-24T11:59:00.000Z' } },
    { burnOid: null },
    { burnOid: 'd'.repeat(40), burn: { ...burn, intentId: id(9) } },
  ]) {
    assert.throws(() =>
      buildWaivedReceiptInput({ verifiedFacts, intent, grant, burn, burnOid, ...changes })
    );
  }
});

function history({ originalIntent, intent, receipt }) {
  return [
    { id: 'C1', createdAt: originalCreatedAt, record: originalIntent },
    { id: 'C2', createdAt: intentCreatedAt, record: intent },
    { id: 'C3', createdAt: '2026-09-25T12:04:00.000Z', record: receipt },
  ];
}
const mutateHistory = (change) => {
  const records = structuredClone(history(fixture()));
  change(records);
  return records;
};

test('v3 graph refuses original authorization drift and unsupported predecessors', () => {
  for (const change of [
    (r) => {
      r[0].record.mergeMethod = 'merge';
    },
    (r) => {
      r[0].record.commitMessage = 'changed';
    },
    (r) => {
      r[0].record.expectedHeadSha = 'd'.repeat(40);
    },
    (r) => {
      r[0].record.baseRef = 'release';
    },
    (r) => {
      r[1].record.originalIntentDigest = digest('wrong');
    },
    (r) => {
      r[1].record.originalIntentCreatedAt = '2026-09-24T12:02:00.000Z';
    },
    (r) => {
      r[1].record.originalIntentId = id(9);
      r[1].record.supersedesIntentId = id(9);
    },
    (r) => {
      r[0].record.schema = 'aitm.delivery-intent/v2';
    },
  ])
    assert.throws(() => projectDeliveryRecords(mutateHistory(change)));
});

test('v3 provider comment must follow the original provider comment', () => {
  for (const createdAt of [originalCreatedAt, '2026-09-24T12:00:59.000Z']) {
    assert.throws(
      () =>
        projectDeliveryRecords(
          mutateHistory((records) => {
            records[1].createdAt = createdAt;
          })
        ),
      /generic-supersession/
    );
  }
});

test('v4 projection and pinned validation reject receipt identity drift', () => {
  const { originalIntent, intent, receipt, grant, burn } = fixture();
  for (const change of [
    { provider: 'other-provider' },
    { sessionId: 'other-session' },
    { mergeMethod: 'merge' },
  ]) {
    const altered = { ...receipt, ...change };
    assert.throws(() =>
      projectDeliveryRecords(
        mutateHistory((records) => {
          records[2].record = altered;
        })
      )
    );
    assert.throws(
      () =>
        validatePinnedWaiverEvidence({
          originalIntent: { record: originalIntent, createdAt: originalCreatedAt },
          intent,
          receipt: altered,
          grant,
          burn,
        }),
      /pinned-correlation/
    );
  }
});

test('v3 graph refuses receipted predecessor, competing successors, and operation reuse', () => {
  const predecessorReceipt = buildDeliveryReceipt({
    intentId: id(1),
    issueNumber,
    prNumber,
    expectedHeadSha: head,
    mergeCommitSha: merge,
    baseRef: 'trunk',
    mergeMethod: 'squash',
    verifiedTrunkRef: 'origin/trunk',
    provider: 'codex',
    sessionId: 'session',
    verifiedAt: '2026-09-24T12:05:00.000Z',
  });
  assert.throws(
    () =>
      projectDeliveryRecords(
        mutateHistory((r) => {
          r.splice(1, 0, {
            id: 'C0',
            createdAt: '2026-09-24T12:06:00.000Z',
            record: predecessorReceipt,
          });
        })
      ),
    /receipted-predecessor/
  );
  assert.throws(
    () =>
      projectDeliveryRecords(
        mutateHistory((r) => {
          r.splice(2, 0, {
            id: 'C4',
            createdAt: '2026-09-25T12:02:00.000Z',
            record: { ...r[1].record, intentId: id(8), deliveryOperationId: id(8) },
          });
        })
      ),
    /supersession-fork|generic-waiver-correlation/
  );
  assert.throws(
    () =>
      projectDeliveryRecords(
        mutateHistory((r) => {
          r.splice(2, 0, {
            id: 'C4',
            createdAt: '2026-09-25T12:02:00.000Z',
            record: { ...r[1].record, intentId: id(8) },
          });
        })
      ),
    /operation-reuse/
  );
});

test('v4 refuses altered grant, reason, scope, burn, mixed versions, and duplicate receipt', () => {
  for (const change of [
    (r) => {
      r[2].record.humanReason = 'changed';
    },
    (r) => {
      r[2].record.waiverReasonDigest = digest('changed');
    },
    (r) => {
      r[2].record.waiverScopeDigest = digest('changed');
    },
    (r) => {
      r[2].record.burnDigest = digest('changed');
    },
    (r) => {
      r[2].record.burn.grantDigest = digest('changed');
    },
    (r) => {
      r[2].record.waiverGrant.recordId = id(9);
    },
    (r) => {
      r[2].record.schema = 'aitm.delivery-receipt/v3';
    },
    (r) => {
      r[2].record.extra = true;
    },
    (r) => {
      delete r[2].record.burnOid;
    },
    (r) => {
      r.push({ ...r[2], id: 'C4' });
    },
  ])
    assert.throws(() => projectDeliveryRecords(mutateHistory(change)));
});

test('pinned validation uses provider timestamp and immutable burn, not wall clock', () => {
  const { originalIntent, intent, receipt, grant, burn } = fixture();
  const original = { record: originalIntent, createdAt: originalCreatedAt };
  assert.doesNotThrow(() =>
    validatePinnedWaiverEvidence({ originalIntent: original, intent, receipt, grant, burn })
  );
  assert.throws(
    () =>
      validatePinnedWaiverEvidence({
        originalIntent: {
          ...original,
          createdAt: '2026-09-24T12:02:00.000Z',
        },
        intent,
        receipt,
        grant,
        burn,
      }),
    /pinned-correlation/
  );
  assert.throws(
    () =>
      validatePinnedWaiverEvidence({
        originalIntent: original,
        intent,
        receipt,
        grant,
        burn: { ...burn, authorizedAt: '2026-09-26T00:00:00.000Z' },
      }),
    /pinned-correlation/
  );
  assert.throws(() =>
    validatePinnedWaiverEvidence({
      originalIntent: original,
      intent,
      receipt,
      grant: { ...grant, payload: { ...grant.payload, status: 'revoked' } },
      burn,
    })
  );
});

test('comment parser refuses overlarge v4 body and mixed nested authority', () => {
  const { receipt } = fixture();
  const body = renderDeliveryReceiptComment(receipt);
  assert.throws(
    () =>
      parseDeliveryComment(
        { id: 'C4', createdAt: intentCreatedAt, body: `${body}${'x'.repeat(1024 * 1024)}` },
        context
      ),
    /comment-too-large/
  );
  assert.throws(() =>
    projectDeliveryRecords(
      mutateHistory((r) => {
        r[2].record.waiverGrant.payload.deliveryScope.deliveryOperationId = id(9);
      })
    )
  );
});
