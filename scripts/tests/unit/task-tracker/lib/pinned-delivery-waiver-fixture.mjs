// @story #1787 #1798
import { createHash } from 'node:crypto';
import { canonicalRecordJson } from '../../../../task-tracker/lib/github-records/canonical-json.mjs';
import { buildDeliveryScope } from '../../../../task-tracker/lib/workflow-policy/delivery-scope.mjs';
import { createWorkflowExceptionEnvelope } from '../../../../task-tracker/lib/workflow-policy/exception-record.mjs';
import {
  buildDeliveryIntent,
  buildDeliveryReceipt,
} from '../../../../task-tracker/lib/delivery-records.mjs';
import { buildWaivedReceiptInput } from '../../../../task-tracker/lib/delivery-waiver-evidence.mjs';
import { verifyDeliveredPullRequest } from '../../../../task-tracker/lib/delivery-verification.mjs';

const digest = (value) => `sha256:${createHash('sha256').update(value).digest('hex')}`;
export const head = 'a'.repeat(40);
export const merge = 'b'.repeat(40);
export const id = (n) => `01M2H0000000000000000000${String(n).padStart(2, '0')}`;
export const createdAt = '2026-09-24T12:01:00.000Z';
export const mergedAt = '2026-09-25T12:03:00.000Z';
export const requirementId = 'delivery.verification.merge-method';
export const original = buildDeliveryIntent({
  intentId: id(1),
  supersedesIntentId: null,
  issueNumber: 1798,
  repository: 'kburson/ai-task-manager',
  prNumber: 1800,
  baseRef: 'trunk',
  headRef: 'feature/1798',
  expectedHeadSha: head,
  mergeMethod: 'squash',
  attributionTokens: ['#1798'],
  commitTitle: '[#1798] Deliver waiver',
  commitMessage: `PR #1800 source ${head}\n\nAttribution: [#1798]`,
  provider: 'codex',
  sessionId: 'session',
  clientCreatedAt: createdAt,
});
const scope = buildDeliveryScope({
  schema: 'aitm.delivery-exception-scope/v1',
  repository: original.repository,
  issue: original.issueNumber,
  exceptionKind: 'delivery.invariant-waiver',
  pullRequest: original.prNumber,
  acceptedHeadSha: head,
  baseRef: 'trunk',
  resolvedTrunkRef: 'origin/trunk',
  requirementId,
  deliveryOperationId: id(3),
}).scope;
const reason = 'Accept the observed merge method for this exact delivery.';
export const grant = createWorkflowExceptionEnvelope({
  schema: 'aitm.workflow-exception/v2',
  repository: original.repository,
  issue: original.issueNumber,
  exceptionId: 'delivery-1798',
  revision: 1,
  scopeIdentity: digest('scope'),
  requirementIds: [requirementId],
  constraints: [],
  reason,
  authorization: {
    origin: 'codex-session-transcript',
    principal: 'operator',
    recordingActor: 'kpburson',
    reference: 'codex://sessions/session/messages/msg_1',
    statement: 'I approve this exact delivery waiver.',
    verificationLevel: 'host-verified-user-message',
  },
  expiresAt: '2026-09-26T00:00:00.000Z',
  operationId: digest('write'),
  createdAt: '2026-09-24T12:02:00.000Z',
  recordId: id(4),
  grantId: id(5),
  scopeKind: 'delivery',
  deliveryScope: scope,
  waiverScopeDigest: buildDeliveryScope(scope).waiverScopeDigest,
});
const waiver = Object.freeze({
  outcome: 'waived',
  grant,
  waiverScopeDigest: grant.payload.waiverScopeDigest,
  waiverReasonDigest: digest(reason),
});
export const originalIntent = { record: original, createdAt };
const common = {
  deliveryDisposition: 'waived',
  waivedRequirementId: requirementId,
  waiverRecordId: grant.recordId,
  waiverRevision: 1,
  deliveryOperationId: scope.deliveryOperationId,
  waiverReasonDigest: waiver.waiverReasonDigest,
  waiverScopeDigest: waiver.waiverScopeDigest,
  observedFailureCategory: 'merge-method',
  waiverGrant: grant,
  providerMergeMethod: 'merge',
  observedMergeMethod: 'merge',
};
export const {
  schema: _schema,
  state: _state,
  commitTitleSha256: _titleHash,
  commitMessageSha256: _messageHash,
  ...originalInput
} = original;
export const pinnedIntent = buildDeliveryIntent({
  ...originalInput,
  intentId: id(2),
  supersedesIntentId: original.intentId,
  clientCreatedAt: '2026-09-25T12:01:00.000Z',
  originalIntentId: original.intentId,
  originalIntentCreatedAt: createdAt,
  originalIntentDigest: digest(canonicalRecordJson(original)),
  ...common,
});
export const burn = {
  schema: 'aitm.delivery-waiver-consumption/v1',
  repository: original.repository,
  issue: original.issueNumber,
  deliveryOperationId: scope.deliveryOperationId,
  waiverRecordId: grant.recordId,
  waiverRevision: 1,
  waiverScopeDigest: waiver.waiverScopeDigest,
  waiverReasonDigest: waiver.waiverReasonDigest,
  acceptedHeadSha: head,
  intentId: pinnedIntent.intentId,
  mergeCommitSha: merge,
  authorizedAt: '2026-09-25T12:02:00.000Z',
  grantDigest: digest(canonicalRecordJson(grant)),
};
export const burnOid = 'c'.repeat(40);
export const storedFacts = {
  baseReceiptInput: {
    intentId: pinnedIntent.intentId,
    issueNumber: original.issueNumber,
    prNumber: original.prNumber,
    expectedHeadSha: head,
    mergeCommitSha: merge,
    baseRef: 'trunk',
    mergeMethod: 'squash',
    verifiedTrunkRef: 'origin/trunk',
    provider: 'codex',
    sessionId: 'session',
    verifiedAt: mergedAt,
  },
  providerMergeMethod: 'merge',
  observedMergeMethod: 'merge',
  observedFailureCategory: 'merge-method',
  waivedRequirementId: requirementId,
};
export const receipt = buildDeliveryReceipt(
  buildWaivedReceiptInput({
    verifiedFacts: storedFacts,
    intent: pinnedIntent,
    grant,
    burn,
    burnOid,
  })
);

export function input(intent = original) {
  return {
    acceptedSha: head,
    acceptedReviewSha: head,
    attributingCommits: async () => [],
    fetchOriginTrunk: async () => {},
    inspectMergeCommit: async () => ({
      parents: ['d'.repeat(40), head],
      commitTitle: intent.commitTitle,
      commitMessage: intent.commitMessage,
    }),
    intent,
    intentCreatedAt: createdAt,
    isAncestor: async () => true,
    localHeadSha: head,
    pullRequest: {
      number: original.prNumber,
      merged: true,
      state: 'MERGED',
      baseRefName: 'trunk',
      headRefOid: head,
      mergeMethod: 'merge',
      mergeCommitSha: merge,
      mergedAt,
      headRefDeleted: false,
    },
    recovery: false,
    testReceiptSha: head,
  };
}
