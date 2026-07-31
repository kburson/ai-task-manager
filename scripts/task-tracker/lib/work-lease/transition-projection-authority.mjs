import { validateSwitchLeaseRequest } from '@kburson/aitm-ledger';

import { validateSwitchReceipt } from './switch-orchestration.mjs';
import { resolveTimingQueueJournalProjection } from '../timing-queue-projection.mjs';

const proofs = new WeakMap();
const timingQueueAliasProofs = new WeakMap();
const timingQueueAliasCollisionGroupProofs = new WeakMap();

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

function collisionGroupMemberExpected(member, label) {
  const entry = object(member?.entry, `${label} entry`);
  if (!Number.isSafeInteger(member.entryIndex) || member.entryIndex < 0) {
    throw refusal(`${label} entryIndex must be a non-negative integer`);
  }
  return Object.freeze({
    entry,
    entryJson: JSON.stringify(entry),
    entryIndex: member.entryIndex,
    switchProjectionId: requiredString(member.switchProjectionId, `${label} switchProjectionId`),
    journalProjectionId: requiredString(member.journalProjectionId, `${label} journalProjectionId`),
    journalSubOperationId: requiredString(
      member.journalSubOperationId,
      `${label} journalSubOperationId`
    ),
    deliveryProjectionId: requiredString(
      member.deliveryProjectionId,
      `${label} deliveryProjectionId`
    ),
    deliverySubOperationId: requiredString(
      member.deliverySubOperationId,
      `${label} deliverySubOperationId`
    ),
    issueId: canonicalIssue(member.issueId, `${label} issueId`),
    operation: requiredString(member.operation, `${label} operation`),
    row: requiredString(entry.row, `${label} row`),
  });
}

export function deriveTransitionTimingQueueAliasCollisionGroupAuthority({
  receipt,
  request,
  transitionId,
  members,
} = {}) {
  if (!Array.isArray(members) || members.length < 2) {
    throw refusal('timing queue alias collision group requires at least two members');
  }
  const journalIdentities = new Set();
  let deliveryIdentity;
  const validatedMembers = members.map((member, index) => {
    const expected = collisionGroupMemberExpected(
      {
        ...member,
        operation: 'evidence-mutation',
      },
      `timing queue alias collision member ${index}`
    );
    const stableDeliveryIdentity = `${expected.deliveryProjectionId}\0${expected.deliverySubOperationId}`;
    const journalIdentity = `${expected.journalProjectionId}\0${expected.journalSubOperationId}`;
    if (
      journalIdentities.has(journalIdentity) ||
      (deliveryIdentity !== undefined && deliveryIdentity !== stableDeliveryIdentity)
    ) {
      throw refusal('timing queue alias collision group identities do not match');
    }
    journalIdentities.add(journalIdentity);
    deliveryIdentity = stableDeliveryIdentity;
    const authority = deriveTransitionTimingQueueAliasAuthority({
      receipt,
      request,
      transitionId,
      ...expected,
    });
    return Object.freeze({ ...expected, authority });
  });
  const first = validatedMembers[0];
  if (
    validatedMembers.some((member) => member.issueId !== first.issueId || member.row !== first.row)
  ) {
    throw refusal('timing queue alias collision group members are not canonical peers');
  }
  const proof = Object.freeze(Object.create(null));
  timingQueueAliasCollisionGroupProofs.set(proof, Object.freeze(validatedMembers));
  return proof;
}

export function assertTransitionTimingQueueAliasCollisionGroupAuthority(
  proof,
  { transitionId, members, issueId, row, deliveryProjectionId, deliverySubOperationId } = {}
) {
  const actual = timingQueueAliasCollisionGroupProofs.get(proof);
  if (!actual) {
    throw refusal('proof is not a live in-memory timing queue alias collision group proof');
  }
  if (!Array.isArray(members) || members.length !== actual.length) {
    throw refusal('timing queue alias collision group member list does not match');
  }
  const effect = {
    issueId: canonicalIssue(issueId, 'expected timing queue collision issue'),
    row: requiredString(row, 'expected timing queue collision row'),
    deliveryProjectionId: requiredString(
      deliveryProjectionId,
      'expected timing queue collision deliveryProjectionId'
    ),
    deliverySubOperationId: requiredString(
      deliverySubOperationId,
      'expected timing queue collision deliverySubOperationId'
    ),
  };
  for (const [field, value] of Object.entries(effect)) {
    if (actual[0][field] !== value) {
      throw refusal(`timing queue alias collision effect ${field} does not match`);
    }
  }
  for (const [index, member] of members.entries()) {
    const expected = collisionGroupMemberExpected(
      {
        ...member,
        operation: 'evidence-mutation',
      },
      `expected timing queue alias collision member ${index}`
    );
    const validated = actual[index];
    for (const field of [
      'entryJson',
      'entryIndex',
      'switchProjectionId',
      'journalProjectionId',
      'journalSubOperationId',
      'deliveryProjectionId',
      'deliverySubOperationId',
      'issueId',
      'operation',
      'row',
    ]) {
      if (validated[field] !== expected[field]) {
        throw refusal(`timing queue alias collision member ${index} ${field} does not match`);
      }
    }
    assertTransitionTimingQueueAliasAuthority(validated.authority, {
      transitionId,
      journalProjectionId: expected.journalProjectionId,
      journalSubOperationId: expected.journalSubOperationId,
      deliveryProjectionId: expected.deliveryProjectionId,
      deliverySubOperationId: expected.deliverySubOperationId,
      issueId: expected.issueId,
      operation: expected.operation,
      row: expected.row,
    });
  }
  return proof;
}
