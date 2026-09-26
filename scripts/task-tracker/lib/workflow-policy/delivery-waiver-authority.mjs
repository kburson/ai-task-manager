// @story #1787 #1795 #1824
import { createHash } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';

import { buildDeliveryScope } from './delivery-scope.mjs';
import { resolveDeliveryExceptionChain } from './exception-record.mjs';
import {
  createCodexSessionSourceLoader,
  hashAuthorizationStatement,
  resolveWorkflowExceptionAuthority,
} from './authority-resolver.mjs';
import { deliveryApprovalStatement, deliveryProposalDigest } from './delivery-request.mjs';

const GUARDRAIL_ID = 'delivery.verification.waiver-authority';
const SOURCE_REF = /^codex:\/\/sessions\/([-a-zA-Z0-9]+)\/messages\/([-_a-zA-Z0-9]+)$/;

export const DELIVERY_WAIVER_AUTHORITY_CATEGORIES = Object.freeze({
  'delivery-waiver-authority': Object.freeze({
    requirementId: GUARDRAIL_ID,
    outcome: 'missing',
    remediation: 'prepare a new exact delivery waiver and obtain a host-verified user approval',
  }),
  'delivery-waiver-replay': Object.freeze({
    requirementId: GUARDRAIL_ID,
    outcome: 'missing',
    remediation: 'use a new authorized delivery operation for a distinct transaction',
  }),
  'delivery-waiver-burn-mismatch': Object.freeze({
    requirementId: GUARDRAIL_ID,
    outcome: 'missing',
    remediation: 'reconcile the immutable delivery consumption record before retrying',
  }),
  'delivery-waiver-ambiguity': Object.freeze({
    requirementId: GUARDRAIL_ID,
    outcome: 'indeterminate',
    remediation: 'restore unambiguous grant and consumption evidence before retrying',
  }),
});

export class DeliveryWaiverAuthorityError extends Error {
  constructor(category, outcome = null) {
    const entry = DELIVERY_WAIVER_AUTHORITY_CATEGORIES[category];
    if (!entry) throw new TypeError('delivery-waiver-authority:category');
    if (outcome !== null && outcome !== entry.outcome) {
      throw new TypeError('delivery-waiver-authority:outcome');
    }
    super(`delivery-waiver-authority:${category}`);
    this.name = 'DeliveryWaiverAuthorityError';
    Object.defineProperties(this, {
      category: { value: category, enumerable: true },
      requirementId: { value: GUARDRAIL_ID, enumerable: true },
      outcome: { value: entry.outcome, enumerable: true },
      remediation: { value: entry.remediation, enumerable: true },
    });
    Object.freeze(this);
  }
}

function authorityError(category) {
  return new DeliveryWaiverAuthorityError(category);
}

function actionOf(envelope) {
  if (envelope.payload.status === 'revoked') return 'revoke';
  return envelope.payload.revision === 1 ? 'record' : 'revise';
}

export function reconstructDeliveryProposalDigest(envelope) {
  const payload = envelope?.payload;
  if (!payload || payload.scopeKind !== 'delivery')
    throw authorityError('delivery-waiver-authority');
  return deliveryProposalDigest({
    action: actionOf(envelope),
    repository: envelope.repository,
    issue: envelope.issue,
    scopeIdentity: payload.scopeIdentity,
    waiverScopeDigest: payload.waiverScopeDigest,
    exceptionId: payload.exceptionId,
    reason: payload.reason,
    expiresAt: payload.expiresAt,
    priorRecordId: envelope.predecessor,
    priorRevision: payload.revision === 1 ? null : payload.revision - 1,
  });
}

export async function verifyStoredDeliveryWaiverAuthority(envelope, runtime) {
  const payload = envelope?.payload;
  if (!payload || payload.scopeKind !== 'delivery')
    throw authorityError('delivery-waiver-authority');
  const match = SOURCE_REF.exec(payload.approvalEvidence?.reference ?? '');
  if (!match || typeof runtime?.resolveTranscriptPath !== 'function') {
    throw authorityError('delivery-waiver-ambiguity');
  }
  let transcriptPath;
  try {
    transcriptPath = await runtime.resolveTranscriptPath(match[1]);
  } catch {
    throw authorityError('delivery-waiver-ambiguity');
  }
  if (typeof transcriptPath !== 'string' || transcriptPath.length === 0) {
    throw authorityError('delivery-waiver-ambiguity');
  }
  const source = {
    schema: 'aitm.authorization-source/v1',
    adapter: 'codex-session/v1',
    sessionId: match[1],
    messageId: match[2],
    statementHash: hashAuthorizationStatement(payload.approvalEvidence.statement),
  };
  const result = await resolveWorkflowExceptionAuthority({
    source,
    recordingActor: payload.approvalEvidence.recordingActor,
    loadSource: createCodexSessionSourceLoader({
      transcriptPath,
      expectedSessionId: match[1],
    }),
  });
  if (result.status !== 'verified') {
    throw authorityError(
      ['authorization-source-unavailable', 'authorization-adapter-unavailable'].includes(
        result.code
      )
        ? 'delivery-waiver-ambiguity'
        : 'delivery-waiver-authority'
    );
  }
  const expected = deliveryApprovalStatement({
    action: actionOf(envelope),
    proposalDigest: reconstructDeliveryProposalDigest(envelope),
    deliveryScope: payload.deliveryScope,
  });
  if (
    result.authority.statement !== expected ||
    result.authority.reference !== payload.approvalEvidence.reference ||
    result.authority.principal !== payload.approvalEvidence.principal ||
    result.authority.recordingActor !== payload.approvalEvidence.recordingActor ||
    result.authority.origin !== 'codex-session-transcript' ||
    result.authority.verificationLevel !== 'host-verified-user-message'
  ) {
    throw authorityError('delivery-waiver-authority');
  }
  return result.authority;
}

export async function resolveDeliveryWaiver({ records, scope, scopeIdentity, now, runtime } = {}) {
  let built;
  try {
    built = buildDeliveryScope(scope);
  } catch {
    throw authorityError('delivery-waiver-authority');
  }
  if (!Array.isArray(records)) throw authorityError('delivery-waiver-ambiguity');
  let chain;
  try {
    chain = resolveDeliveryExceptionChain({
      records,
      partitionKey: built.partitionKey,
      repository: built.scope.repository,
      issue: built.scope.issue,
      scopeIdentity,
      now,
    });
  } catch {
    throw authorityError('delivery-waiver-ambiguity');
  }
  if (chain.status === 'invalid') throw authorityError('delivery-waiver-ambiguity');
  if (chain.status === 'none') return Object.freeze({ outcome: 'missing', grant: null });
  if (chain.status !== 'active') throw authorityError('delivery-waiver-authority');
  const matches = records.filter(({ envelope }) => envelope?.recordId === chain.head.recordId);
  if (matches.length !== 1) throw authorityError('delivery-waiver-ambiguity');
  const grant = matches[0].envelope;
  if (
    !isDeepStrictEqual(grant.payload.deliveryScope, built.scope) ||
    grant.payload.waiverScopeDigest !== built.waiverScopeDigest ||
    grant.payload.scopeIdentity !== scopeIdentity ||
    grant.payload.requirementIds.length !== 1 ||
    grant.payload.requirementIds[0] !== built.scope.requirementId
  ) {
    throw authorityError('delivery-waiver-authority');
  }
  await verifyStoredDeliveryWaiverAuthority(grant, runtime);
  const waiverReasonDigest = `sha256:${createHash('sha256')
    .update(grant.payload.reason, 'utf8')
    .digest('hex')}`;
  return Object.freeze({
    outcome: 'waived',
    grant,
    waiverScopeDigest: built.waiverScopeDigest,
    waiverReasonDigest,
  });
}
