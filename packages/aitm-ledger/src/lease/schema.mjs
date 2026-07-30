import { createHash } from 'node:crypto';

import { invalidRequest } from './errors.mjs';

export const LEASE_OPERATIONS = Object.freeze([
  'task-bind',
  'source-write',
  'issue-attributed-commit',
  'lifecycle-mutation',
  'issue-body-mutation',
  'evidence-mutation',
  'approval-mutation',
  'review-mutation',
  'close',
  'branch-worktree-orchestration',
]);

export const OWNERSHIP_RETAINING_STATES = Object.freeze(['active', 'paused']);
export const TERMINAL_LEASE_STATES = Object.freeze(['released', 'expired', 'superseded']);
export const TAKEOVER_EVIDENCE_KINDS = Object.freeze([
  'local-process-dead',
  'remote-expired',
  'operator-attestation',
]);

function object(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    invalidRequest(`${label} must be an object`);
  }
  return value;
}

function nonEmpty(value, label) {
  if (typeof value !== 'string' || value.trim() === '') {
    invalidRequest(`${label} must be a non-empty string`);
  }
  return value;
}

function timestamp(value, label) {
  nonEmpty(value, label);
  if (
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value) ||
    !Number.isFinite(Date.parse(value)) ||
    new Date(value).toISOString() !== value
  ) {
    invalidRequest(`${label} must be a canonical UTC ISO timestamp`);
  }
  return value;
}

function ttl(value) {
  if (!Number.isSafeInteger(value) || value <= 0) {
    invalidRequest('ttlMs must be a positive safe integer');
  }
  return value;
}

function exactKeys(value, required, optional, label) {
  const allowed = new Set([...required, ...optional]);
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) invalidRequest(`${label}.${key} is not allowed`);
  }
  for (const key of required) {
    if (!(key in value)) invalidRequest(`${label}.${key} is required`);
  }
}

export function assertFencingToken(value, label = 'fencingToken') {
  if (typeof value !== 'string' || !/^[1-9]\d*$/.test(value)) {
    invalidRequest(`${label} must be a positive base-10 integer string`);
  }
  return value;
}

export function validateHolder(value, { principalKind = 'worker', label = 'holder' } = {}) {
  object(value, label);
  const shared = ['principalKind', 'provider', 'agentRunId', 'sessionId', 'hostId', 'pid'];
  const workerOnly = ['worktreeId', 'pathHash', 'branch'];
  exactKeys(value, principalKind === 'worker' ? [...shared, ...workerOnly] : shared, [], label);
  if (value.principalKind !== principalKind) {
    invalidRequest(`${label}.principalKind must be ${principalKind}`);
  }
  for (const key of shared.filter((key) => key !== 'pid' && key !== 'principalKind')) {
    nonEmpty(value[key], `${label}.${key}`);
  }
  if (!Number.isSafeInteger(value.pid) || value.pid <= 0) {
    invalidRequest(`${label}.pid must be a positive safe integer`);
  }
  for (const key of principalKind === 'worker' ? workerOnly : []) {
    nonEmpty(value[key], `${label}.${key}`);
  }
  return value;
}

function validateMutationEnvelope(request, timestampKey) {
  object(request, 'request');
  nonEmpty(request.projectId, 'projectId');
  nonEmpty(request.idempotencyKey, 'idempotencyKey');
  timestamp(request[timestampKey], timestampKey);
}

export function validateAcquireRequest(request) {
  validateMutationEnvelope(request, 'requestedAt');
  exactKeys(
    request,
    ['projectId', 'issueId', 'mode', 'idempotencyKey', 'requestedAt', 'ttlMs', 'holder'],
    [],
    'request'
  );
  nonEmpty(request.issueId, 'issueId');
  if (request.mode !== 'write') invalidRequest('mode must be write');
  ttl(request.ttlMs);
  validateHolder(request.holder);
  return request;
}

export function validateRenewRequest(request) {
  validateMutationEnvelope(request, 'requestedAt');
  exactKeys(
    request,
    ['projectId', 'leaseId', 'fencingToken', 'idempotencyKey', 'requestedAt', 'ttlMs'],
    [],
    'request'
  );
  nonEmpty(request.leaseId, 'leaseId');
  assertFencingToken(request.fencingToken);
  ttl(request.ttlMs);
  return request;
}

export function validateVerifyRequest(request) {
  object(request, 'request');
  exactKeys(
    request,
    ['projectId', 'leaseId', 'fencingToken', 'operation', 'verifiedAt'],
    [],
    'request'
  );
  nonEmpty(request.projectId, 'projectId');
  nonEmpty(request.leaseId, 'leaseId');
  assertFencingToken(request.fencingToken);
  if (!LEASE_OPERATIONS.includes(request.operation)) {
    invalidRequest('operation is not in the work-lease vocabulary');
  }
  timestamp(request.verifiedAt, 'verifiedAt');
  return request;
}

export function validateSwitchLeaseRequest(request) {
  validateMutationEnvelope(request, 'switchedAt');
  exactKeys(
    request,
    ['projectId', 'issueId', 'leaseId', 'fencingToken', 'idempotencyKey', 'switchedAt', 'target'],
    [],
    'request'
  );
  nonEmpty(request.issueId, 'issueId');
  nonEmpty(request.leaseId, 'leaseId');
  assertFencingToken(request.fencingToken);
  validateAcquireRequest(request.target);
  if (request.target.projectId !== request.projectId) {
    invalidRequest('switch target projectId must match current projectId');
  }
  return request;
}

export function validateHandoffRequest(request) {
  validateMutationEnvelope(request, 'handedOffAt');
  exactKeys(
    request,
    [
      'projectId',
      'leaseId',
      'fencingToken',
      'idempotencyKey',
      'handedOffAt',
      'reason',
      'recipient',
    ],
    [],
    'request'
  );
  nonEmpty(request.leaseId, 'leaseId');
  assertFencingToken(request.fencingToken);
  nonEmpty(request.reason, 'reason');
  validateHolder(request.recipient, { principalKind: 'integration', label: 'recipient' });
  return request;
}

export function validateReleaseRequest(request) {
  validateMutationEnvelope(request, 'releasedAt');
  exactKeys(
    request,
    ['projectId', 'leaseId', 'fencingToken', 'idempotencyKey', 'releasedAt', 'reason'],
    [],
    'request'
  );
  nonEmpty(request.leaseId, 'leaseId');
  assertFencingToken(request.fencingToken);
  nonEmpty(request.reason, 'reason');
  return request;
}

export function validateTakeoverRequest(request) {
  validateMutationEnvelope(request, 'observedAt');
  exactKeys(
    request,
    [
      'projectId',
      'issueId',
      'expectedLeaseId',
      'expectedToken',
      'requester',
      'observedAt',
      'idempotencyKey',
      'reason',
      'evidence',
    ],
    [],
    'request'
  );
  nonEmpty(request.issueId, 'issueId');
  nonEmpty(request.expectedLeaseId, 'expectedLeaseId');
  assertFencingToken(request.expectedToken, 'expectedToken');
  validateHolder(request.requester);
  nonEmpty(request.reason, 'reason');
  object(request.evidence, 'evidence');
  exactKeys(
    request.evidence,
    ['kind', 'hostId', 'pid', 'checkedAt', 'detailsHash'],
    [],
    'evidence'
  );
  if (!TAKEOVER_EVIDENCE_KINDS.includes(request.evidence.kind)) {
    invalidRequest('evidence.kind is invalid');
  }
  nonEmpty(request.evidence.hostId, 'evidence.hostId');
  if (!Number.isSafeInteger(request.evidence.pid) || request.evidence.pid <= 0) {
    invalidRequest('evidence.pid must be a positive safe integer');
  }
  timestamp(request.evidence.checkedAt, 'evidence.checkedAt');
  nonEmpty(request.evidence.detailsHash, 'evidence.detailsHash');
  return request;
}

export function validateObserveSelector(selector) {
  object(selector, 'selector');
  exactKeys(selector, ['projectId'], ['issueId', 'worktreeId'], 'selector');
  nonEmpty(selector.projectId, 'projectId');
  const keys = ['issueId', 'worktreeId'].filter((key) => selector[key] != null);
  if (keys.length !== 1) invalidRequest('selector requires exactly one of issueId or worktreeId');
  nonEmpty(selector[keys[0]], keys[0]);
  return selector;
}

function stable(value, seen = new Map(), location = '$') {
  if (value === null) return null;
  if (typeof value === 'bigint') return { $aitmType: 'bigint', value: String(value) };
  if (typeof value === 'undefined') return { $aitmType: 'undefined' };
  if (typeof value === 'symbol') return { $aitmType: 'symbol', value: String(value.description) };
  if (typeof value === 'function') return { $aitmType: 'function', value: value.name || '' };
  if (typeof value === 'number' && !Number.isFinite(value)) {
    return { $aitmType: 'number', value: String(value) };
  }
  if (typeof value !== 'object') return value;
  if (seen.has(value)) return { $aitmRef: seen.get(value) };
  seen.set(value, location);
  if (Array.isArray(value)) {
    return value.map((item, index) => stable(item, seen, `${location}[${index}]`));
  }
  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .map((key) => [key, stable(value[key], seen, `${location}.${key}`)])
  );
}

export function canonicalRequestDigest(request) {
  return createHash('sha256').update(canonicalRequestJson(request)).digest('hex');
}

export function canonicalRequestJson(request) {
  return JSON.stringify(stable(request));
}
