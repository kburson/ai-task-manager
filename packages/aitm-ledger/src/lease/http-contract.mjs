import { LEASE_ERROR_CODES, WorkLeaseError, sanitizeLeaseDetails } from './errors.mjs';
import {
  OWNERSHIP_RETAINING_STATES,
  TERMINAL_LEASE_STATES,
  assertFencingToken,
  validateAcquireRequest,
  validateHandoffRequest,
  validateObserveSelector,
  validateReleaseRequest,
  validateRenewRequest,
  validateSwitchLeaseRequest,
  validateTakeoverRequest,
  validateVerifyRequest,
} from './schema.mjs';

export const HTTP_LEASE_ROUTES = Object.freeze({
  acquire: Object.freeze({
    method: 'POST',
    path: '/v1/work-leases:acquire',
    mutating: true,
  }),
  renew: Object.freeze({ method: 'POST', path: '/v1/work-leases:renew', mutating: true }),
  verify: Object.freeze({ method: 'POST', path: '/v1/work-leases:verify', mutating: false }),
  switchLease: Object.freeze({
    method: 'POST',
    path: '/v1/work-leases:switch',
    mutating: true,
  }),
  handoff: Object.freeze({
    method: 'POST',
    path: '/v1/work-leases:handoff',
    mutating: true,
  }),
  release: Object.freeze({
    method: 'POST',
    path: '/v1/work-leases:release',
    mutating: true,
  }),
  takeover: Object.freeze({
    method: 'POST',
    path: '/v1/work-leases:takeover',
    mutating: true,
  }),
  observe: Object.freeze({ method: 'GET', path: '/v1/work-leases', mutating: false }),
});

const REQUEST_VALIDATORS = Object.freeze({
  acquire: validateAcquireRequest,
  renew: validateRenewRequest,
  verify: validateVerifyRequest,
  switchLease: validateSwitchLeaseRequest,
  handoff: validateHandoffRequest,
  release: validateReleaseRequest,
  takeover: validateTakeoverRequest,
  observe: validateObserveSelector,
});

const ERROR_STATUS = Object.freeze({
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
});

const SUCCESS_STATUS = Object.freeze({
  acquire: new Set([200, 201]),
  renew: new Set([200]),
  verify: new Set([200]),
  switchLease: new Set([200]),
  handoff: new Set([200]),
  release: new Set([200]),
  takeover: new Set([200, 201]),
  observe: new Set([200]),
});

function failUnavailable(message = 'remote lease authority returned an invalid response') {
  throw new WorkLeaseError('authority-unavailable', message);
}

function assertObject(value, label, { exactKeys } = {}) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    failUnavailable(`${label} is not a JSON object`);
  }
  if (exactKeys) {
    const actual = Object.keys(value).sort();
    const expected = [...exactKeys].sort();
    if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) {
      failUnavailable(`${label} has an unknown response shape`);
    }
  }
  return value;
}

function assertString(value, label) {
  if (typeof value !== 'string' || value.trim() === '') {
    failUnavailable(`${label} is not a non-empty string`);
  }
}

function assertTimestamp(value, label) {
  assertString(value, label);
  if (
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value) ||
    !Number.isFinite(Date.parse(value)) ||
    new Date(value).toISOString() !== value
  ) {
    failUnavailable(`${label} is not a canonical UTC timestamp`);
  }
}

function headerValue(headers, name) {
  if (headers?.get) return headers.get(name);
  const found = Object.entries(headers ?? {}).find(([key]) => key.toLowerCase() === name);
  return found?.[1];
}

function assertAuthorization(headers) {
  const value = headerValue(headers, 'authorization');
  if (typeof value !== 'string' || !/^Bearer [^\s]+$/.test(value)) {
    throw new WorkLeaseError(
      'authority-unauthenticated',
      'a nonempty bearer credential is required'
    );
  }
}

function routeFor(method, pathname) {
  const match = Object.entries(HTTP_LEASE_ROUTES).find(
    ([, route]) => route.method === method && route.path === pathname
  );
  if (!match) {
    throw new WorkLeaseError('invalid-request', 'unknown work-lease HTTP operation');
  }
  return { operation: match[0], route: match[1] };
}

function queryObject(query) {
  const parameters =
    query instanceof URLSearchParams ? query : new URLSearchParams(query ? String(query) : '');
  const allowed = new Set(['projectId', 'issueId', 'worktreeId']);
  for (const key of parameters.keys()) {
    if (!allowed.has(key) || parameters.getAll(key).length !== 1) {
      throw new WorkLeaseError('invalid-request', 'observation query is invalid');
    }
  }
  return Object.fromEntries(parameters.entries());
}

export function validateHttpLeaseRequest({ method, pathname, headers = {}, body, query } = {}) {
  const normalizedMethod = typeof method === 'string' ? method.toUpperCase() : '';
  const { operation, route } = routeFor(normalizedMethod, pathname);
  assertAuthorization(headers);

  if (operation === 'observe') {
    if (headerValue(headers, 'idempotency-key') != null) {
      throw new WorkLeaseError(
        'invalid-request',
        'Idempotency-Key is not allowed for non-mutating requests'
      );
    }
    if (body !== undefined) {
      throw new WorkLeaseError('invalid-request', 'observation requests cannot have a body');
    }
    const request = queryObject(query);
    REQUEST_VALIDATORS.observe(request);
    return { operation, request };
  }

  if (query != null && [...new URLSearchParams(query).keys()].length > 0) {
    throw new WorkLeaseError(
      'invalid-request',
      'POST lease operations cannot use query parameters'
    );
  }
  const contentType = headerValue(headers, 'content-type');
  if (typeof contentType !== 'string' || !/^application\/json(?:\s*;|$)/i.test(contentType)) {
    throw new WorkLeaseError('invalid-request', 'JSON content type is required');
  }
  REQUEST_VALIDATORS[operation](body);
  const idempotencyKey = headerValue(headers, 'idempotency-key');
  if (route.mutating) {
    if (idempotencyKey !== body.idempotencyKey) {
      throw new WorkLeaseError(
        'invalid-request',
        'Idempotency-Key header must match the request body'
      );
    }
  } else if (idempotencyKey != null) {
    throw new WorkLeaseError(
      'invalid-request',
      'Idempotency-Key is not allowed for non-mutating requests'
    );
  }
  return { operation, request: body };
}

function validateResponseHolder(holder) {
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
  assertObject(holder, 'lease.holder', { exactKeys: required });
  if (!['worker', 'integration'].includes(holder.principalKind)) {
    failUnavailable('lease.holder.principalKind is invalid');
  }
  for (const key of required.filter((key) => !['principalKind', 'pid'].includes(key))) {
    assertString(holder[key], `lease.holder.${key}`);
  }
  if (!Number.isSafeInteger(holder.pid) || holder.pid <= 0) {
    failUnavailable('lease.holder.pid is invalid');
  }
}

function validateLease(lease) {
  const required = [
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
  ];
  assertObject(lease, 'lease', { exactKeys: required });
  for (const key of ['projectId', 'issueId', 'leaseId']) assertString(lease[key], `lease.${key}`);
  if (lease.mode !== 'write') failUnavailable('lease.mode is invalid');
  try {
    assertFencingToken(lease.fencingToken);
  } catch {
    failUnavailable('lease.fencingToken is invalid');
  }
  if (![...OWNERSHIP_RETAINING_STATES, ...TERMINAL_LEASE_STATES].includes(lease.state)) {
    failUnavailable('lease.state is invalid');
  }
  validateResponseHolder(lease.holder);
  for (const key of ['acquiredAt', 'heartbeatAt', 'expiresAt']) {
    assertTimestamp(lease[key], `lease.${key}`);
  }
  assertObject(lease.audit, 'lease.audit');
  return lease;
}

function validateTransition(value) {
  assertObject(value, 'transition', {
    exactKeys: ['transitionId', 'fromIssueId', 'fromLeaseId', 'fromToken', 'toIssueId'],
  });
  for (const key of ['transitionId', 'fromIssueId', 'fromLeaseId', 'toIssueId']) {
    assertString(value[key], `transition.${key}`);
  }
  try {
    assertFencingToken(value.fromToken, 'transition.fromToken');
  } catch {
    failUnavailable('transition.fromToken is invalid');
  }
}

function validateResult(operation, result) {
  if (['acquire', 'renew', 'handoff', 'release', 'takeover'].includes(operation)) {
    return validateLease(result);
  }
  if (operation === 'verify') {
    assertObject(result, 'verify result', { exactKeys: ['allowed', 'lease'] });
    if (result.allowed !== true) failUnavailable('verify result did not authorize the operation');
    validateLease(result.lease);
    return result;
  }
  if (operation === 'switchLease') {
    assertObject(result, 'switch result', { exactKeys: ['lease', 'transition'] });
    validateLease(result.lease);
    validateTransition(result.transition);
    return result;
  }
  if (operation === 'observe') {
    assertObject(result, 'observation result', { exactKeys: ['lease'] });
    if (result.lease !== null) validateLease(result.lease);
    return result;
  }
  failUnavailable('response operation is unknown');
}

export function httpStatusForLeaseError(code) {
  return ERROR_STATUS[code];
}

export function createHttpSuccessEnvelope(result) {
  return { result };
}

export function createHttpErrorEnvelope(error) {
  if (!(error instanceof WorkLeaseError) || !(error.code in ERROR_STATUS)) {
    throw new TypeError('HTTP lease errors must use a remotely mapped WorkLeaseError');
  }
  return {
    error: {
      code: error.code,
      message: error.message,
      details: sanitizeLeaseDetails(error.details),
    },
  };
}

function parseErrorEnvelope(status, payload) {
  assertObject(payload, 'error envelope', { exactKeys: ['error'] });
  const error = assertObject(payload.error, 'error', {
    exactKeys: ['code', 'message', 'details'],
  });
  if (!LEASE_ERROR_CODES.includes(error.code) || !(error.code in ERROR_STATUS)) {
    failUnavailable('remote lease authority returned an unknown error code');
  }
  assertString(error.message, 'error.message');
  assertObject(error.details, 'error.details');
  if (ERROR_STATUS[error.code] !== status) {
    failUnavailable('remote lease authority returned an inconsistent error status');
  }
  throw new WorkLeaseError(error.code, error.message, error.details);
}

export function parseHttpLeaseResponse({ operation, status, payload } = {}) {
  if (!Number.isInteger(status)) failUnavailable();
  if (status < 200 || status >= 300) return parseErrorEnvelope(status, payload);
  if (!SUCCESS_STATUS[operation]?.has(status)) {
    failUnavailable('remote lease authority returned an unexpected success status');
  }
  assertObject(payload, 'success envelope', { exactKeys: ['result'] });
  return validateResult(operation, payload.result);
}
