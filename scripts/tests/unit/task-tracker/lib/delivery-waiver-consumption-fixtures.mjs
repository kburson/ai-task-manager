// @story #1787 #1796
import { createHash } from 'node:crypto';
import { canonicalRecordJson } from '../../../../task-tracker/lib/github-records/canonical-json.mjs';
import { buildDeliveryScope } from '../../../../task-tracker/lib/workflow-policy/delivery-scope.mjs';
import {
  createWorkflowExceptionEnvelope,
  WORKFLOW_EXCEPTION_SCHEMA_V2,
} from '../../../../task-tracker/lib/workflow-policy/exception-record.mjs';

export const repository = 'example/project';
export const issue = 1796;
export const operationId = '01M2H000000000000000000001';
export const digest = (value) => `sha256:${createHash('sha256').update(value).digest('hex')}`;
export const scope = Object.freeze({
  schema: 'aitm.delivery-exception-scope/v1',
  repository,
  issue,
  exceptionKind: 'delivery.invariant-waiver',
  pullRequest: 123,
  acceptedHeadSha: 'a'.repeat(40),
  baseRef: 'trunk',
  resolvedTrunkRef: 'origin/trunk',
  requirementId: 'delivery.verification.merge-method',
  deliveryOperationId: operationId,
});
export const grant = createWorkflowExceptionEnvelope({
  schema: WORKFLOW_EXCEPTION_SCHEMA_V2,
  repository,
  issue,
  exceptionId: 'delivery-1796',
  revision: 1,
  status: 'active',
  scopeIdentity: digest('issue body'),
  requirementIds: [scope.requirementId],
  constraints: [],
  reason: 'The operator accepts the verified provider merge method difference for this delivery.',
  authorization: {
    origin: 'codex-session-transcript',
    principal: null,
    recordingActor: 'codex',
    reference: 'codex://sessions/session/messages/message',
    statement: 'I approve the exact scoped waiver.',
    verificationLevel: 'host-verified-user-message',
  },
  expiresAt: '2026-09-26T00:00:00.000Z',
  operationId: digest('record write'),
  createdAt: '2026-09-25T00:00:00.000Z',
  recordId: '01M2H000000000000000000004',
  grantId: '01M2H000000000000000000005',
  scopeKind: 'delivery',
  deliveryScope: scope,
  waiverScopeDigest: buildDeliveryScope(scope).waiverScopeDigest,
});
export const intentRecord = Object.freeze({
  schema: 'aitm.delivery-intent/v3',
  repository,
  issueNumber: issue,
  intentId: '01M2H000000000000000000003',
  deliveryOperationId: operationId,
  originalIntentId: '01M2H000000000000000000002',
});
export const renderIntent = (record = intentRecord) =>
  `<!-- aitm-delivery-intent ${canonicalRecordJson(record)} -->\nDelivery pending.`;
export const renderReceipt = (record = {}) =>
  `<!-- aitm-delivery-receipt ${canonicalRecordJson({
    schema: 'aitm.delivery-receipt/v4',
    issueNumber: issue,
    intentId: intentRecord.intentId,
    deliveryOperationId: operationId,
    ...record,
  })} -->\nDelivery verified.`;
export const intent = Object.freeze({
  originalIntentId: '01M2H000000000000000000002',
  originalIntentDigest: digest('original'),
  intentId: intentRecord.intentId,
  intentBody: renderIntent(),
  intentDigest: digest(renderIntent()),
});
export const burn = Object.freeze({
  schema: 'aitm.delivery-waiver-consumption/v1',
  repository,
  issue,
  deliveryOperationId: operationId,
  waiverRecordId: grant.recordId,
  waiverRevision: grant.payload.revision,
  waiverScopeDigest: grant.payload.waiverScopeDigest,
  waiverReasonDigest: digest(grant.payload.reason),
  acceptedHeadSha: scope.acceptedHeadSha,
  intentId: intent.intentId,
  mergeCommitSha: 'b'.repeat(40),
  authorizedAt: '2026-09-25T00:00:00.000Z',
  grantDigest: digest(canonicalRecordJson(grant)),
});
export const verifiedInitialBurn = async () => ({
  authorizedAt: burn.authorizedAt,
  waiver: {
    outcome: 'waived',
    grant,
    waiverScopeDigest: burn.waiverScopeDigest,
    waiverReasonDigest: burn.waiverReasonDigest,
  },
  verification: {
    deliveryDisposition: 'waived',
    receiptInput: null,
    verifiedFacts: {
      waivedRequirementId: scope.requirementId,
      observedFailureCategory: 'merge-method',
      baseReceiptInput: {
        issueNumber: issue,
        expectedHeadSha: burn.acceptedHeadSha,
        mergeCommitSha: burn.mergeCommitSha,
        intentId: burn.intentId,
      },
    },
  },
});

export function createMemoryJournal({
  repository: repo = repository,
  issue: issueNumber = issue,
} = {}) {
  const events = [];
  let writes = 0;
  return {
    get writes() {
      return writes;
    },
    async read() {
      const { projectDeliveryWaiverJournal } =
        await import('../../../../task-tracker/lib/delivery-waiver-journal.mjs');
      return projectDeliveryWaiverJournal(events, { repository: repo, issue: issueNumber });
    },
    async compareAndAppend({ expectedOid, entry }) {
      const snapshot = await this.read();
      if (expectedOid !== snapshot.oid) return { status: 'stale', snapshot };
      const oid = createHash('sha1')
        .update(String(events.length) + JSON.stringify(entry))
        .digest('hex');
      events.push({ oid, entry });
      writes++;
      return { status: 'appended', snapshot: await this.read() };
    },
  };
}
