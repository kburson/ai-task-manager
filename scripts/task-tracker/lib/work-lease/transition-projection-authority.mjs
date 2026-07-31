import { validateSwitchLeaseRequest } from '@kburson/aitm-ledger';

import { validateSwitchReceipt } from './switch-orchestration.mjs';
import { resolveTimingQueueJournalProjection } from '../timing-queue-projection.mjs';

const proofs = new WeakMap();
const timingQueueAliasProofs = new WeakMap();

export class TransitionProjectionAuthorityError extends TypeError {
  constructor(message) {
    super(`transition projection authority: ${message}`);
    this.name = 'TransitionProjectionAuthorityError';
    this.code = 'transition-projection-refused';
    Object.seal(this);
  }
}

export function isTransitionProjectionAuthorityError(error) {
  return error instanceof TransitionProjectionAuthorityError;
}

function refusal(message) {
  return new TransitionProjectionAuthorityError(message);
}

function object(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw refusal(`${label} must be an object`);
  }
  return value;
}

function requiredString(value, label) {
  if (typeof value !== 'string' || value.trim() === '') {
    throw refusal(`${label} is required`);
  }
  return value;
}

function canonicalIssue(value, label) {
  const match = String(value ?? '').match(/^#?([1-9]\d*)$/);
  if (!match) throw refusal(`${label} must be a canonical issue`);
  return match[1];
}

function validateReceipt(receiptInput, requestInput, transitionIdInput) {
  const receipt = object(receiptInput, 'validated persisted receipt');
  const request = object(requestInput, 'validated persisted request');
  const transitionId = requiredString(transitionIdInput, 'transitionId');
  let validated;
  try {
    validateSwitchLeaseRequest(request);
    validated = validateSwitchReceipt(receipt, request);
  } catch (error) {
    throw refusal(`persisted switch authority is malformed: ${error.message}`);
  }
  const lease = receipt.lease;
  const transition = receipt.transition;
  const target = request.target;
  const sourceIssueId = canonicalIssue(request.issueId, 'request source issue');
  const targetIssueId = canonicalIssue(target.issueId, 'request target issue');
  if (
    validated.transitionId !== transitionId ||
    transition.transitionId !== transitionId ||
    canonicalIssue(transition.fromIssueId, 'receipt source issue') !== sourceIssueId ||
    transition.fromLeaseId !== request.leaseId ||
    transition.fromToken !== request.fencingToken ||
    canonicalIssue(transition.toIssueId, 'receipt target issue') !== targetIssueId ||
    lease.projectId !== request.projectId ||
    canonicalIssue(lease.issueId, 'receipt lease issue') !== targetIssueId ||
    lease.mode !== 'write' ||
    lease.state !== 'active' ||
    lease.leaseId === request.leaseId ||
    lease.holder?.worktreeId !== target.holder?.worktreeId
  ) {
    throw refusal('persisted switch receipt does not match its validated request');
  }
  return {
    transitionId,
    sourceIssueId,
    targetIssueId,
    projectId: request.projectId,
    sourceLeaseId: request.leaseId,
    sourceFencingToken: request.fencingToken,
    targetLeaseId: lease.leaseId,
    targetFencingToken: lease.fencingToken,
  };
}

export function deriveTransitionProjectionAuthority({
  receipt,
  request,
  transitionId,
  projectionName,
  projectionId,
  subOperationId,
  issueId,
  operation,
} = {}) {
  const receiptIdentity = validateReceipt(receipt, request, transitionId);
  const affectedIssueId = canonicalIssue(issueId, 'affected issue');
  if (![receiptIdentity.sourceIssueId, receiptIdentity.targetIssueId].includes(affectedIssueId)) {
    throw refusal('affected issue is outside the validated transition');
  }
  if (!['timing', 'github'].includes(projectionName)) {
    throw refusal('projectionName must be timing or github');
  }
  requiredString(projectionId, 'projectionId');
  requiredString(subOperationId, 'subOperationId');
  if (operation !== 'evidence-mutation') {
    throw refusal('operation must be evidence-mutation');
  }

  const proof = Object.freeze(Object.create(null));
  proofs.set(
    proof,
    Object.freeze({
      ...receiptIdentity,
      projectionName,
      projectionId,
      subOperationId,
      issueId: affectedIssueId,
      operation,
    })
  );
  return proof;
}

export function assertTransitionProjectionAuthority(proof, expected = {}) {
  const actual = proofs.get(proof);
  if (!actual) throw refusal('proof is not a live in-memory transition proof');
  const fields = [
    'transitionId',
    'projectionName',
    'projectionId',
    'subOperationId',
    'issueId',
    'operation',
  ];
  for (const field of fields) {
    const expectedValue =
      field === 'issueId'
        ? canonicalIssue(expected[field], 'expected affected issue')
        : requiredString(expected[field], `expected ${field}`);
    if (actual[field] !== expectedValue) {
      throw refusal(`${field} does not match the validated transition proof`);
    }
  }
  if (
    ![actual.sourceIssueId, actual.targetIssueId].includes(actual.issueId) ||
    !actual.projectId ||
    !actual.sourceLeaseId ||
    !actual.sourceFencingToken ||
    !actual.targetLeaseId ||
    !actual.targetFencingToken
  ) {
    throw refusal('validated transition receipt identity is incomplete');
  }
  return proof;
}

export function deriveTransitionTimingQueueAliasAuthority({
  receipt,
  request,
  transitionId,
  entry,
  entryIndex,
  switchProjectionId,
  journalProjectionId,
  journalSubOperationId,
  deliveryProjectionId,
  deliverySubOperationId,
  issueId,
  operation,
} = {}) {
  let resolved;
  try {
    resolved = resolveTimingQueueJournalProjection({
      entry,
      entryIndex,
      switchProjectionId,
      journalProjectionId,
      journalSubOperationId,
    });
  } catch (error) {
    throw refusal(`timing queue journal alias is malformed: ${error.message}`);
  }
  if (
    resolved.mode !== 'legacy-switch-alias' ||
    resolved.deliveryProjectionId !== deliveryProjectionId ||
    resolved.deliverySubOperationId !== deliverySubOperationId
  ) {
    throw refusal('timing queue journal alias does not match canonical delivery');
  }
  const journalAuthority = deriveTransitionProjectionAuthority({
    receipt,
    request,
    transitionId,
    projectionName: 'timing',
    projectionId: journalProjectionId,
    subOperationId: journalSubOperationId,
    issueId,
    operation,
  });
  const journalProof = proofs.get(journalAuthority);
  const proof = Object.freeze(Object.create(null));
  timingQueueAliasProofs.set(
    proof,
    Object.freeze({
      ...journalProof,
      journalProjectionId,
      journalSubOperationId,
      deliveryProjectionId,
      deliverySubOperationId,
      row: requiredString(entry?.row, 'timing queue alias row'),
    })
  );
  return proof;
}

export function assertTransitionTimingQueueAliasAuthority(proof, expected = {}) {
  const actual = timingQueueAliasProofs.get(proof);
  if (!actual) throw refusal('proof is not a live in-memory timing queue alias proof');
  const exact = {
    transitionId: requiredString(expected.transitionId, 'expected transitionId'),
    journalProjectionId: requiredString(
      expected.journalProjectionId,
      'expected journalProjectionId'
    ),
    journalSubOperationId: requiredString(
      expected.journalSubOperationId,
      'expected journalSubOperationId'
    ),
    deliveryProjectionId: requiredString(
      expected.deliveryProjectionId,
      'expected deliveryProjectionId'
    ),
    deliverySubOperationId: requiredString(
      expected.deliverySubOperationId,
      'expected deliverySubOperationId'
    ),
    issueId: canonicalIssue(expected.issueId, 'expected affected issue'),
    operation: requiredString(expected.operation, 'expected operation'),
    row: requiredString(expected.row, 'expected timing queue alias row'),
  };
  for (const [field, value] of Object.entries(exact)) {
    if (actual[field] !== value) {
      throw refusal(`${field} does not match the validated timing queue alias proof`);
    }
  }
  if (
    actual.projectionName !== 'timing' ||
    actual.projectionId !== actual.journalProjectionId ||
    actual.subOperationId !== actual.journalSubOperationId
  ) {
    throw refusal('validated timing queue alias journal binding is incomplete');
  }
  return proof;
}
