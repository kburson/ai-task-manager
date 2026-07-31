import { createHash } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';

import {
  LEASE_ERROR_CODES,
  WorkLeaseError,
  invalidRequest,
  sanitizeLeaseDetails,
} from './errors.mjs';

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
export const MUTATING_LEASE_OPERATIONS = Object.freeze([
  'acquire',
  'renew',
  'switchLease',
  'handoff',
  'release',
  'takeover',
]);

const REPLAY_SUCCESS_STATUS = Object.freeze({
  acquire: new Set([200, 201]),
  renew: new Set([200]),
  switchLease: new Set([200]),
  handoff: new Set([200]),
  release: new Set([200]),
  takeover: new Set([200, 201]),
});

const REPLAY_ERROR_STATUS = Object.freeze({
  'invalid-request': 400,
  'authority-unauthenticated': 401,
  'authority-forbidden': 403,
  'idempotency-conflict': 409,
  'lease-contended': 409,
  'worktree-contended': 409,
  'holder-live': 409,
  'fence-stale': 412,
  'lease-not-held': 412,
  'authority-unavailable': 503,
  'main-worktree-unresolved': 503,
});

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

function pathHash(value, label = 'pathHash') {
  if (typeof value !== 'string' || !/^[0-9a-f]{64}$/.test(value)) {
    invalidRequest(`${label} must be a lowercase SHA-256 digest`);
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
  if (principalKind === 'worker') pathHash(value.pathHash, `${label}.pathHash`);
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
  pathHash(value.pathHash, `${label}.pathHash`);
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

export function validateReplayMutationSelector(selector) {
  object(selector, 'selector');
  exactKeys(
    selector,
    ['projectId', 'operation', 'idempotencyKey', 'requestDigest'],
    [],
    'selector'
  );
  nonEmpty(selector.projectId, 'selector.projectId');
  if (!MUTATING_LEASE_OPERATIONS.includes(selector.operation)) {
    invalidRequest('selector.operation is not a mutating lease operation');
  }
  nonEmpty(selector.idempotencyKey, 'selector.idempotencyKey');
  if (
    typeof selector.requestDigest !== 'string' ||
    !/^[0-9a-f]{64}$/.test(selector.requestDigest)
  ) {
    invalidRequest('selector.requestDigest must be a lowercase SHA-256 digest');
  }
  return selector;
}

function replayUnavailable(message) {
  throw new WorkLeaseError('authority-unavailable', message);
}

function replayExactKeys(value, expected, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    replayUnavailable(`${label} must be an object`);
  }
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  if (actual.length !== wanted.length || actual.some((key, index) => key !== wanted[index])) {
    replayUnavailable(`${label} has an unknown shape`);
  }
  return value;
}

function validateReplayLease(value) {
  const lease = replayExactKeys(
    value,
    [
      'projectId',
      'issueId',
      'mode',
      'leaseId',
      'fencingToken',
      'state',
      'holder',
      'acquiredAt',
      'heartbeatAt',
      'expiresAt',
      'audit',
    ],
    'mutation replay lease'
  );
  try {
    nonEmpty(lease.projectId, 'lease.projectId');
    issueIdentifier(lease.issueId, 'lease.issueId');
    if (lease.mode !== 'write') throw new Error('mode');
    nonEmpty(lease.leaseId, 'lease.leaseId');
    assertFencingToken(lease.fencingToken);
    if (![...OWNERSHIP_RETAINING_STATES, ...TERMINAL_LEASE_STATES].includes(lease.state)) {
      throw new Error('state');
    }
    validateLeaseHolder(lease.holder);
    timestamp(lease.acquiredAt, 'lease.acquiredAt');
    timestamp(lease.heartbeatAt, 'lease.heartbeatAt');
    timestamp(lease.expiresAt, 'lease.expiresAt');
    object(lease.audit, 'lease.audit');
  } catch {
    replayUnavailable('mutation replay lease is malformed');
  }
  return lease;
}

function validateReplayTransition(value) {
  const transition = replayExactKeys(
    value,
    ['transitionId', 'fromIssueId', 'fromLeaseId', 'fromToken', 'toIssueId'],
    'mutation replay transition'
  );
  try {
    nonEmpty(transition.transitionId, 'transition.transitionId');
    issueIdentifier(transition.fromIssueId, 'transition.fromIssueId');
    nonEmpty(transition.fromLeaseId, 'transition.fromLeaseId');
    assertFencingToken(transition.fromToken);
    issueIdentifier(transition.toIssueId, 'transition.toIssueId');
  } catch {
    replayUnavailable('mutation replay transition is malformed');
  }
  return transition;
}

export function validateReplayMutationOutcome(value, selector) {
  try {
    validateReplayMutationSelector(selector);
  } catch {
    replayUnavailable('mutation replay selector is malformed');
  }
  const outcome = replayExactKeys(
    value,
    value?.outcome === 'absent'
      ? ['selector', 'outcome']
      : value?.outcome === 'committed'
        ? ['selector', 'outcome', 'statusCode', 'result']
        : value?.outcome === 'rejected'
          ? ['selector', 'outcome', 'statusCode', 'error']
          : [],
    'mutation replay outcome'
  );
  const recordedSelector = replayExactKeys(
    outcome.selector,
    ['projectId', 'operation', 'idempotencyKey', 'requestDigest'],
    'mutation replay outcome selector'
  );
  for (const key of ['projectId', 'operation', 'idempotencyKey', 'requestDigest']) {
    if (recordedSelector[key] !== selector[key]) {
      replayUnavailable(`mutation replay selector ${key} does not match`);
    }
  }
  if (outcome.outcome === 'absent') return outcome;
  if (!Number.isInteger(outcome.statusCode)) {
    replayUnavailable('mutation replay statusCode is malformed');
  }
  if (outcome.outcome === 'committed') {
    if (!REPLAY_SUCCESS_STATUS[selector.operation]?.has(outcome.statusCode)) {
      replayUnavailable('mutation replay committed status is invalid');
    }
    if (selector.operation === 'switchLease') {
      const result = replayExactKeys(
        outcome.result,
        ['lease', 'transition'],
        'switch replay result'
      );
      validateReplayLease(result.lease);
      validateReplayTransition(result.transition);
    } else {
      validateReplayLease(outcome.result);
    }
    return outcome;
  }
  if (outcome.outcome !== 'rejected') replayUnavailable('mutation replay outcome is invalid');
  const error = replayExactKeys(
    outcome.error,
    ['code', 'message', 'details'],
    'mutation replay error'
  );
  if (
    !LEASE_ERROR_CODES.includes(error.code) ||
    REPLAY_ERROR_STATUS[error.code] !== outcome.statusCode ||
    typeof error.message !== 'string' ||
    error.message.trim() === '' ||
    !error.details ||
    typeof error.details !== 'object' ||
    Array.isArray(error.details)
  ) {
    replayUnavailable('mutation replay rejected outcome is malformed');
  }
  if (!isDeepStrictEqual(error.details, sanitizeLeaseDetails(error.details))) {
    replayUnavailable('mutation replay error details are not canonically sanitized');
  }
  return outcome;
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
