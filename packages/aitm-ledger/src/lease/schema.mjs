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
export const ACTIVE_LEASE_TTL_MS = 900_000;
export const PAUSED_LEASE_TTL_MS = 86_400_000;
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

function issueIdentifier(value, label = 'issueId') {
  nonEmpty(value, label);
  if (!/^[1-9]\d*$/.test(value)) {
    invalidRequest(`${label} must be a canonical positive decimal string`);
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

export function validateLeaseHolder(value, { label = 'holder' } = {}) {
  object(value, label);
  if (!['worker', 'integration'].includes(value.principalKind)) {
    invalidRequest(`${label}.principalKind is invalid`);
  }
  const required = [
    'principalKind',
    'provider',
    'agentRunId',
    'sessionId',
    'hostId',
    'worktreeId',
    'pathHash',
    'branch',
    'pid',
  ];
  exactKeys(value, required, [], label);
  for (const key of required.filter((key) => !['principalKind', 'pid'].includes(key))) {
    nonEmpty(value[key], `${label}.${key}`);
  }
  if (!Number.isSafeInteger(value.pid) || value.pid <= 0) {
    invalidRequest(`${label}.pid must be a positive safe integer`);
  }
  return value;
}

export function validateBindingIdentity(
  value,
  { label = 'binding', holder, issueId, requireDisplayPath = false } = {}
) {
  object(value, label);
  exactKeys(value, ['sessionId', 'issueId', 'worktreeId', 'displayPath'], [], label);
  nonEmpty(value.sessionId, `${label}.sessionId`);
  issueIdentifier(value.issueId, `${label}.issueId`);
  nonEmpty(value.worktreeId, `${label}.worktreeId`);
  if (value.displayPath === null) {
    if (requireDisplayPath) invalidRequest(`${label}.displayPath must be a non-empty string`);
  } else {
    nonEmpty(value.displayPath, `${label}.displayPath`);
  }
  if (holder) {
    if (value.sessionId !== holder.sessionId)
      invalidRequest(`${label}.sessionId must match holder`);
    if (value.worktreeId !== holder.worktreeId) {
      invalidRequest(`${label}.worktreeId must match holder`);
    }
    if (
      value.displayPath !== null &&
      createHash('sha256').update(value.displayPath).digest('hex') !== holder.pathHash
    ) {
      invalidRequest(`${label}.displayPath does not match holder.pathHash`);
    }
  }
  if (issueId != null && value.issueId !== issueId) {
    invalidRequest(`${label}.issueId must match request.issueId`);
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
    ['projectId', 'issueId', 'mode', 'idempotencyKey', 'requestedAt', 'ttlMs', 'holder', 'binding'],
    [],
    'request'
  );
  issueIdentifier(request.issueId);
  if (request.mode !== 'write') invalidRequest('mode must be write');
  ttl(request.ttlMs);
  if (request.ttlMs !== ACTIVE_LEASE_TTL_MS) invalidRequest('active ttlMs must be 900000');
  validateHolder(request.holder);
  validateBindingIdentity(request.binding, {
    holder: request.holder,
    issueId: request.issueId,
    requireDisplayPath: true,
  });
  return request;
}

export function validateRenewRequest(request) {
  validateMutationEnvelope(request, 'requestedAt');
  exactKeys(
    request,
    [
      'projectId',
      'leaseId',
      'fencingToken',
      'idempotencyKey',
      'requestedAt',
      'ttlMs',
      'holder',
      'binding',
    ],
    ['lifecycle'],
    'request'
  );
  nonEmpty(request.leaseId, 'leaseId');
  assertFencingToken(request.fencingToken);
  ttl(request.ttlMs);
  validateLeaseHolder(request.holder);
  validateBindingIdentity(request.binding, { holder: request.holder });
  if (request.lifecycle !== undefined) {
    object(request.lifecycle, 'lifecycle');
    exactKeys(request.lifecycle, ['expectedState', 'nextState'], [], 'lifecycle');
  }
  const expectedState = request.lifecycle?.expectedState ?? 'active';
  const nextState = request.lifecycle?.nextState ?? 'active';
  const transition = `${expectedState}->${nextState}`;
  if (!['active->active', 'active->paused', 'paused->active'].includes(transition)) {
    invalidRequest('renew state transition is invalid');
  }
  const expectedTtl = nextState === 'paused' ? PAUSED_LEASE_TTL_MS : ACTIVE_LEASE_TTL_MS;
  if (request.ttlMs !== expectedTtl) invalidRequest(`ttlMs must be ${expectedTtl}`);
  return request;
}

export function validateVerifyRequest(request) {
  object(request, 'request');
  exactKeys(
    request,
    ['projectId', 'leaseId', 'fencingToken', 'operation', 'verifiedAt', 'holder', 'binding'],
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
  validateLeaseHolder(request.holder);
  validateBindingIdentity(request.binding, { holder: request.holder });
  return request;
}

export function validateSwitchLeaseRequest(request) {
  validateMutationEnvelope(request, 'switchedAt');
  exactKeys(
    request,
    [
      'projectId',
      'issueId',
      'leaseId',
      'fencingToken',
      'holder',
      'binding',
      'idempotencyKey',
      'switchedAt',
      'target',
    ],
    [],
    'request'
  );
  issueIdentifier(request.issueId);
  nonEmpty(request.leaseId, 'leaseId');
  assertFencingToken(request.fencingToken);
  validateLeaseHolder(request.holder);
  validateBindingIdentity(request.binding, { holder: request.holder, issueId: request.issueId });
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
      'ttlMs',
      'holder',
      'binding',
      'recipient',
    ],
    [],
    'request'
  );
  nonEmpty(request.leaseId, 'leaseId');
  assertFencingToken(request.fencingToken);
  nonEmpty(request.reason, 'reason');
  if (ttl(request.ttlMs) !== ACTIVE_LEASE_TTL_MS) invalidRequest('handoff ttlMs must be 900000');
  validateLeaseHolder(request.holder);
  if (request.holder.principalKind !== 'worker') {
    invalidRequest('holder.principalKind must be worker');
  }
  validateBindingIdentity(request.binding, { holder: request.holder });
  validateLeaseHolder(request.recipient, { label: 'recipient' });
  if (request.recipient.principalKind !== 'integration') {
    invalidRequest('recipient.principalKind must be integration');
  }
  for (const key of ['worktreeId', 'pathHash', 'branch']) {
    if (request.recipient[key] !== request.holder[key]) {
      invalidRequest(`recipient.${key} must preserve holder.${key}`);
    }
  }
  return request;
}

export function validateReleaseRequest(request) {
  validateMutationEnvelope(request, 'releasedAt');
  exactKeys(
    request,
    [
      'projectId',
      'leaseId',
      'fencingToken',
      'idempotencyKey',
      'releasedAt',
      'reason',
      'holder',
      'binding',
    ],
    [],
    'request'
  );
  nonEmpty(request.leaseId, 'leaseId');
  assertFencingToken(request.fencingToken);
  nonEmpty(request.reason, 'reason');
  validateLeaseHolder(request.holder);
  validateBindingIdentity(request.binding, { holder: request.holder });
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
      'expectedHolder',
      'expectedBinding',
      'requester',
      'requesterBinding',
      'ttlMs',
      'observedAt',
      'idempotencyKey',
      'reason',
      'evidence',
    ],
    [],
    'request'
  );
  issueIdentifier(request.issueId);
  nonEmpty(request.expectedLeaseId, 'expectedLeaseId');
  assertFencingToken(request.expectedToken, 'expectedToken');
  validateLeaseHolder(request.expectedHolder, { label: 'expectedHolder' });
  validateBindingIdentity(request.expectedBinding, {
    label: 'expectedBinding',
    holder: request.expectedHolder,
    issueId: request.issueId,
  });
  validateHolder(request.requester);
  validateBindingIdentity(request.requesterBinding, {
    label: 'requesterBinding',
    holder: request.requester,
    issueId: request.issueId,
    requireDisplayPath: true,
  });
  if (ttl(request.ttlMs) !== ACTIVE_LEASE_TTL_MS) invalidRequest('takeover ttlMs must be 900000');
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
  if (keys.length > 1) invalidRequest('selector allows at most one of issueId or worktreeId');
  if (keys.length === 0) return selector;
  if (keys[0] === 'issueId') issueIdentifier(selector.issueId);
  else nonEmpty(selector.worktreeId, 'worktreeId');
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
