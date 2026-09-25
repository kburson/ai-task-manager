// @story #1787 #1795
import { writeFileSync } from 'node:fs';
import path from 'node:path';

import { mkdtempProjectIsolated } from '../../../../task-tracker/lib/scratch-dir.mjs';
import { createWorkflowExceptionEnvelope } from '../../../../task-tracker/lib/workflow-policy/exception-record.mjs';
import { prepareDeliveryWaiver } from '../../../../task-tracker/lib/workflow-policy/delivery-request.mjs';

const repository = 'kburson/ai-task-manager';
const issue = 1795;
const scopeIdentity = `sha256:${'a'.repeat(64)}`;
const ulid = (n) => `01M2H0000000000000000000${String(n).padStart(2, '0')}`;

export function makeDeliveryAuthorityFixture({
  role = 'user',
  statement = null,
  scopeOverride = null,
  expiresAt = '2026-09-26T08:00:00.000Z',
  createdAt = '2026-09-25T08:00:00.000Z',
  observedAt = '2026-09-25T08:01:00.000Z',
} = {}) {
  const facts = {
    repository,
    issue,
    scopeIdentity,
    pullRequest: 1785,
    acceptedHeadSha: 'b'.repeat(40),
    baseRef: 'trunk',
    resolvedTrunkRef: 'origin/trunk',
    originalIntentRecordId: ulid(80),
    prior: null,
    now: createdAt,
  };
  const input = {
    schema: 'aitm.delivery-waiver-proposal/v1',
    action: 'record',
    exceptionId: null,
    priorRecordId: null,
    priorRevision: null,
    requirementId: 'delivery.verification.merge-method',
    reason: 'The operator accepts the independently observed merge method for this pull request.',
    expiresAt,
    deliveryOperationId: null,
  };
  const prepared = prepareDeliveryWaiver({
    input,
    facts,
    ids: { exceptionId: 'delivery-1795', deliveryOperationId: ulid(1) },
  });
  const sessionId = '01a0a1d4-c130-7a42-8ccd-4f31b7d4f0ed';
  const messageId = 'msg_delivery_authority';
  const approvalStatement = prepared.statement;
  const authority = {
    reference: `codex://sessions/${sessionId}/messages/${messageId}`,
    statement: approvalStatement,
    principal: null,
    recordingActor: `codex/session:${sessionId}`,
    origin: 'codex-session-transcript',
    verificationLevel: 'host-verified-user-message',
  };
  const envelope = createWorkflowExceptionEnvelope({
    schema: 'aitm.workflow-exception/v2',
    repository,
    issue,
    exceptionId: prepared.request.exceptionId,
    revision: 1,
    scopeIdentity,
    requirementIds: prepared.request.requirementIds,
    constraints: [],
    reason: prepared.request.reason,
    authorization: authority,
    expiresAt: prepared.request.expiresAt,
    operationId: `sha256:${'c'.repeat(64)}`,
    createdAt,
    recordId: ulid(20),
    grantId: ulid(21),
    scopeKind: 'delivery',
    deliveryScope: prepared.request.deliveryScope,
    waiverScopeDigest: prepared.request.waiverScopeDigest,
  });
  const sandbox = mkdtempProjectIsolated('delivery-waiver-authority-');
  const transcriptPath = path.join(sandbox, 'session.jsonl');
  writeFileSync(
    transcriptPath,
    `${JSON.stringify({
      type: 'response_item',
      payload: {
        type: 'message',
        id: messageId,
        role,
        content: [{ type: 'input_text', text: statement ?? approvalStatement }],
      },
    })}\n`,
    'utf8'
  );
  return {
    prepared,
    envelope,
    sandbox,
    records: [{ envelope, commentNodeId: `IC_${envelope.recordId}` }],
    scope: { ...prepared.request.deliveryScope, ...scopeOverride },
    scopeIdentity,
    now: observedAt,
    runtime: { resolveTranscriptPath: () => transcriptPath },
  };
}
