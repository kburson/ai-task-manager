// @story #1787 #1795
import { createHash } from 'node:crypto';

import { canonicalRecordJson } from '../github-records/canonical-json.mjs';
import { createRecordId } from '../github-records/record-envelope.mjs';
import { validateAuthorizationSource } from './authority-resolver.mjs';
import { validateDeliveryWaiverIds } from './catalog.mjs';
import { buildDeliveryScope, DELIVERY_SCOPE_SCHEMA } from './delivery-scope.mjs';

export const DELIVERY_PROPOSAL_SCHEMA = 'aitm.delivery-waiver-proposal/v1';
export const DELIVERY_REQUEST_SCHEMA = 'aitm.workflow-exception-request/v2';
export const DELIVERY_REVOCATION_SCHEMA = 'aitm.workflow-exception-revocation/v2';

const PROPOSAL_KEYS = [
  'schema',
  'action',
  'exceptionId',
  'priorRecordId',
  'priorRevision',
  'requirementId',
  'reason',
  'expiresAt',
  'deliveryOperationId',
];
const REQUEST_KEYS = [
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
];
const HASH_RE = /^sha256:[0-9a-f]{64}$/;
const ULID_RE = /^[0-7][0-9A-HJKMNP-TV-Z]{25}$/;

function fail(category) {
  throw new TypeError(`delivery-request:${category}`);
}

function exact(value, keys) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) fail('keys');
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) {
    fail('keys');
  }
}

function digest(value) {
  return `sha256:${createHash('sha256').update(value, 'utf8').digest('hex')}`;
}

export function meaningfulDeliveryReason(value) {
  return (
    typeof value === 'string' &&
    value.trim() === value &&
    value.length >= 20 &&
    !/\b(?:todo|tbd|placeholder|lorem ipsum|because i said so)\b/i.test(value)
  );
}

function canonicalFuture(value, now) {
  if (typeof value !== 'string' || !Number.isFinite(Date.parse(value))) return false;
  const date = new Date(value);
  return date.toISOString() === value && Date.parse(value) > Date.parse(now);
}

export function parseDeliveryWaiverProposal(input) {
  const value = typeof input === 'string' ? JSON.parse(input) : structuredClone(input);
  exact(value, PROPOSAL_KEYS);
  if (value.schema !== DELIVERY_PROPOSAL_SCHEMA) fail('schema');
  if (!['record', 'revise', 'revoke'].includes(value.action)) fail('action');
  if (!meaningfulDeliveryReason(value.reason)) fail('reason');
  if (typeof value.requirementId !== 'string' || value.requirementId.length === 0) {
    fail('requirement-id');
  }
  if (value.expiresAt === null || typeof value.expiresAt !== 'string') fail('expires-at');
  if (value.action === 'record') {
    if (value.priorRecordId !== null || value.priorRevision !== null) fail('prior');
    if ((value.exceptionId === null) !== (value.deliveryOperationId === null)) fail('identity');
  } else if (
    !ULID_RE.test(value.priorRecordId ?? '') ||
    !Number.isSafeInteger(value.priorRevision) ||
    value.priorRevision <= 0 ||
    typeof value.exceptionId !== 'string' ||
    !ULID_RE.test(value.deliveryOperationId ?? '')
  ) {
    fail('prior');
  }
  if (
    value.exceptionId !== null &&
    (typeof value.exceptionId !== 'string' || value.exceptionId.length === 0)
  )
    fail('exception-id');
  if (value.deliveryOperationId !== null && !ULID_RE.test(value.deliveryOperationId))
    fail('operation-id');
  return Object.freeze(value);
}

export function deliveryApprovalStatement({ action, proposalDigest } = {}) {
  if (!['record', 'revise', 'revoke'].includes(action) || !HASH_RE.test(proposalDigest ?? '')) {
    fail('statement');
  }
  return `Authorize ${action} of delivery exception proposal ${proposalDigest}.`;
}

export function deliveryProposalDigest({
  action,
  repository,
  issue,
  scopeIdentity,
  waiverScopeDigest,
  exceptionId,
  reason,
  expiresAt,
  priorRecordId,
  priorRevision,
} = {}) {
  if (!HASH_RE.test(scopeIdentity ?? '') || !HASH_RE.test(waiverScopeDigest ?? ''))
    fail('digest-scope');
  const preimage = {
    schema: 'aitm.delivery-waiver-approval/v1',
    action,
    repository,
    issue,
    scopeIdentity,
    waiverScopeDigest,
    exceptionId,
    reasonDigest: digest(reason),
    expiresAt,
    priorRecordId,
    priorRevision,
  };
  return digest(canonicalRecordJson(preimage));
}

export function parseDeliveryWaiverRequest(input, { action } = {}) {
  const value = typeof input === 'string' ? JSON.parse(input) : structuredClone(input);
  exact(value, REQUEST_KEYS);
  if (value.action !== action || !['record', 'revise', 'revoke'].includes(action)) fail('action');
  if (value.schema !== (action === 'revoke' ? DELIVERY_REVOCATION_SCHEMA : DELIVERY_REQUEST_SCHEMA))
    fail('schema');
  if (
    value.scopeKind !== 'delivery' ||
    !Array.isArray(value.constraints) ||
    value.constraints.length !== 0
  )
    fail('policy');
  if (!meaningfulDeliveryReason(value.reason)) fail('reason');
  if (!HASH_RE.test(value.scopeIdentity ?? '') || !HASH_RE.test(value.proposalDigest ?? ''))
    fail('digest');
  const built = buildDeliveryScope(value.deliveryScope);
  if (built.waiverScopeDigest !== value.waiverScopeDigest) fail('scope-digest');
  validateDeliveryWaiverIds(value.requirementIds, built.scope);
  if (
    value.exceptionId === null ||
    typeof value.exceptionId !== 'string' ||
    value.exceptionId.length === 0
  )
    fail('exception-id');
  if (!canonicalFuture(value.expiresAt, new Date().toISOString())) fail('expires-at');
  if (action === 'record') {
    if (value.priorRecordId !== null || value.priorRevision !== null) fail('prior');
  } else if (
    !ULID_RE.test(value.priorRecordId ?? '') ||
    !Number.isSafeInteger(value.priorRevision) ||
    value.priorRevision <= 0
  ) {
    fail('prior');
  }
  try {
    validateAuthorizationSource(value.authorizationSource);
  } catch {
    fail('authorization-source');
  }
  const expectedDigest = deliveryProposalDigest({
    ...value,
    repository: built.scope.repository,
    issue: built.scope.issue,
  });
  if (value.proposalDigest !== expectedDigest) fail('proposal-digest');
  return Object.freeze(value);
}

export function prepareDeliveryWaiver({ input, facts, ids = null } = {}) {
  const proposal = parseDeliveryWaiverProposal(input);
  if (!facts || typeof facts !== 'object' || !facts.originalIntentRecordId) fail('original-intent');
  if (!HASH_RE.test(facts.scopeIdentity ?? '')) fail('scope-identity');
  const now = facts.now ?? new Date().toISOString();
  if (!canonicalFuture(proposal.expiresAt, now)) fail('expires-at');
  let exceptionId = proposal.exceptionId;
  let deliveryOperationId = proposal.deliveryOperationId;
  const prior = facts.prior ?? null;
  if (proposal.action === 'record') {
    if (prior !== null) fail('prior');
    if (
      exceptionId === null &&
      (facts.existingDeliveryRecords ?? []).some(
        ({ envelope }) =>
          envelope?.payload?.scopeKind === 'delivery' &&
          envelope.payload.deliveryScope?.requirementId === proposal.requirementId &&
          envelope.payload.deliveryScope?.pullRequest === facts.pullRequest &&
          envelope.payload.deliveryScope?.acceptedHeadSha === facts.acceptedHeadSha &&
          envelope.payload.reason === proposal.reason &&
          envelope.payload.expiresAt === proposal.expiresAt
      )
    ) {
      fail('record-retry-requires-ids');
    }
    exceptionId ??= ids?.exceptionId ?? `delivery-${createRecordId().toLowerCase()}`;
    deliveryOperationId ??= ids?.deliveryOperationId ?? createRecordId();
  } else {
    if (
      prior === null ||
      prior.recordId !== proposal.priorRecordId ||
      prior.revision !== proposal.priorRevision ||
      prior.exceptionId !== exceptionId ||
      prior.deliveryScope?.deliveryOperationId !== deliveryOperationId ||
      prior.deliveryScope?.requirementId !== proposal.requirementId
    )
      fail('prior');
  }
  const selected = Object.freeze({ ...proposal, exceptionId, deliveryOperationId });
  const scopeInput =
    proposal.action === 'revoke'
      ? prior.deliveryScope
      : {
          schema: DELIVERY_SCOPE_SCHEMA,
          repository: facts.repository,
          issue: facts.issue,
          exceptionKind: 'delivery.invariant-waiver',
          pullRequest: facts.pullRequest,
          acceptedHeadSha: facts.acceptedHeadSha,
          baseRef: facts.baseRef,
          resolvedTrunkRef: facts.resolvedTrunkRef,
          requirementId: proposal.requirementId,
          deliveryOperationId,
        };
  const built = buildDeliveryScope(scopeInput);
  if (built.scope.repository !== facts.repository || built.scope.issue !== facts.issue)
    fail('issue-scope');
  validateDeliveryWaiverIds([proposal.requirementId], built.scope);
  const proposalDigest = deliveryProposalDigest({
    action: proposal.action,
    repository: facts.repository,
    issue: facts.issue,
    scopeIdentity: facts.scopeIdentity,
    waiverScopeDigest: built.waiverScopeDigest,
    exceptionId,
    reason: proposal.reason,
    expiresAt: proposal.expiresAt,
    priorRecordId: proposal.priorRecordId,
    priorRevision: proposal.priorRevision,
  });
  const request = Object.freeze({
    schema: proposal.action === 'revoke' ? DELIVERY_REVOCATION_SCHEMA : DELIVERY_REQUEST_SCHEMA,
    action: proposal.action,
    authorizationSource: null,
    constraints: Object.freeze([]),
    exceptionId,
    expiresAt: proposal.expiresAt,
    reason: proposal.reason,
    requirementIds: Object.freeze([proposal.requirementId]),
    scopeKind: 'delivery',
    deliveryScope: built.scope,
    waiverScopeDigest: built.waiverScopeDigest,
    scopeIdentity: facts.scopeIdentity,
    priorRecordId: proposal.priorRecordId,
    priorRevision: proposal.priorRevision,
    proposalDigest,
  });
  return Object.freeze({
    proposal: selected,
    statement: deliveryApprovalStatement({ action: proposal.action, proposalDigest }),
    request,
  });
}
