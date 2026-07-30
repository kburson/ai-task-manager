// @story #1049
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  HTTP_LEASE_ROUTES,
  WorkLeaseError,
  createHttpErrorEnvelope,
  createHttpSuccessEnvelope,
  parseHttpLeaseResponse,
  validateHttpLeaseRequest,
} from '../src/index.mjs';

const NOW = '2026-07-30T12:00:00.000Z';

function holder(overrides = {}) {
  return {
    principalKind: 'worker',
    provider: 'codex',
    agentRunId: 'run-1',
    sessionId: 'session-1',
    hostId: 'host-1',
    worktreeId: 'wt:v1:one',
    pathHash: 'path-one',
    branch: 'feature/child/1049',
    pid: 123,
    ...overrides,
  };
}

function acquire(overrides = {}) {
  return {
    projectId: 'project-1',
    issueId: '1049',
    mode: 'write',
    idempotencyKey: 'acquire-1',
    requestedAt: NOW,
    ttlMs: 900_000,
    holder: holder(),
    ...overrides,
  };
}

function lease(overrides = {}) {
  return {
    projectId: 'project-1',
    issueId: '1049',
    mode: 'write',
    leaseId: 'lease-1',
    fencingToken: '1',
    state: 'active',
    holder: holder(),
    acquiredAt: NOW,
    heartbeatAt: NOW,
    expiresAt: '2026-07-30T12:15:00.000Z',
    audit: {},
    ...overrides,
  };
}

test('closed HTTP route vocabulary validates authentication and request schemas', () => {
  assert.deepEqual(HTTP_LEASE_ROUTES, {
    acquire: { method: 'POST', path: '/v1/work-leases:acquire', mutating: true },
    renew: { method: 'POST', path: '/v1/work-leases:renew', mutating: true },
    verify: { method: 'POST', path: '/v1/work-leases:verify', mutating: false },
    switchLease: { method: 'POST', path: '/v1/work-leases:switch', mutating: true },
    handoff: { method: 'POST', path: '/v1/work-leases:handoff', mutating: true },
    release: { method: 'POST', path: '/v1/work-leases:release', mutating: true },
    takeover: { method: 'POST', path: '/v1/work-leases:takeover', mutating: true },
    observe: { method: 'GET', path: '/v1/work-leases', mutating: false },
  });

  const validated = validateHttpLeaseRequest({
    method: 'POST',
    pathname: '/v1/work-leases:acquire',
    headers: {
      authorization: 'Bearer secret-value',
      'content-type': 'application/json',
      'idempotency-key': 'acquire-1',
    },
    body: acquire(),
  });
  assert.equal(validated.operation, 'acquire');
  assert.deepEqual(validated.request, acquire());
  assert.equal(JSON.stringify(validated).includes('secret-value'), false);

  for (const body of [null, {}, acquire({ ttlMs: 0 })]) {
    assert.throws(
      () =>
        validateHttpLeaseRequest({
          method: 'POST',
          pathname: '/v1/work-leases:acquire',
          headers: {
            authorization: 'Bearer secret',
            'content-type': 'application/json',
            'idempotency-key': 'acquire-1',
          },
          body,
        }),
      (error) => error.code === 'invalid-request'
    );
  }
  assert.throws(
    () =>
      validateHttpLeaseRequest({
        method: 'POST',
        pathname: '/v1/work-leases:unknown',
        headers: { authorization: 'Bearer secret', 'content-type': 'application/json' },
        body: {},
      }),
    (error) => error.code === 'invalid-request'
  );
  assert.throws(
    () =>
      validateHttpLeaseRequest({
        method: 'POST',
        pathname: '/v1/work-leases:acquire',
        headers: { 'content-type': 'application/json', 'idempotency-key': 'acquire-1' },
        body: acquire(),
      }),
    (error) => error.code === 'authority-unauthenticated'
  );
});

test('idempotency header must exactly match the mutating body and is absent for verify', () => {
  assert.throws(
    () =>
      validateHttpLeaseRequest({
        method: 'POST',
        pathname: '/v1/work-leases:acquire',
        headers: {
          authorization: 'Bearer secret',
          'content-type': 'application/json',
          'idempotency-key': 'different',
        },
        body: acquire(),
      }),
    (error) => error.code === 'invalid-request'
  );
  assert.throws(
    () =>
      validateHttpLeaseRequest({
        method: 'POST',
        pathname: '/v1/work-leases:acquire',
        headers: { authorization: 'Bearer secret', 'content-type': 'application/json' },
        body: acquire(),
      }),
    (error) => error.code === 'invalid-request'
  );

  assert.doesNotThrow(() =>
    validateHttpLeaseRequest({
      method: 'POST',
      pathname: '/v1/work-leases:verify',
      headers: { authorization: 'Bearer secret', 'content-type': 'application/json' },
      body: {
        projectId: 'project-1',
        leaseId: 'lease-1',
        fencingToken: '1',
        operation: 'source-write',
        verifiedAt: NOW,
      },
    })
  );
  assert.throws(
    () =>
      validateHttpLeaseRequest({
        method: 'POST',
        pathname: '/v1/work-leases:verify',
        headers: {
          authorization: 'Bearer secret',
          'content-type': 'application/json',
          'idempotency-key': 'not-allowed',
        },
        body: {
          projectId: 'project-1',
          leaseId: 'lease-1',
          fencingToken: '1',
          operation: 'source-write',
          verifiedAt: NOW,
        },
      }),
    (error) => error.code === 'invalid-request'
  );
});

test('GET observation requires exactly one selector and represents absence explicitly', () => {
  const issue = validateHttpLeaseRequest({
    method: 'GET',
    pathname: '/v1/work-leases',
    headers: { authorization: 'Bearer secret' },
    query: new URLSearchParams({ projectId: 'project-1', issueId: '1049' }),
  });
  assert.deepEqual(issue, {
    operation: 'observe',
    request: { projectId: 'project-1', issueId: '1049' },
  });
  assert.throws(
    () =>
      validateHttpLeaseRequest({
        method: 'GET',
        pathname: '/v1/work-leases',
        headers: {
          authorization: 'Bearer secret',
          'idempotency-key': 'not-allowed',
        },
        query: new URLSearchParams({ projectId: 'project-1', issueId: '1049' }),
      }),
    (error) => error.code === 'invalid-request'
  );

  for (const query of [
    new URLSearchParams({ projectId: 'project-1' }),
    new URLSearchParams({
      projectId: 'project-1',
      issueId: '1049',
      worktreeId: 'wt:v1:one',
    }),
    new URLSearchParams({
      projectId: 'project-1',
      issueId: '1049',
      extra: 'not-allowed',
    }),
  ]) {
    assert.throws(
      () =>
        validateHttpLeaseRequest({
          method: 'GET',
          pathname: '/v1/work-leases',
          headers: { authorization: 'Bearer secret' },
          query,
        }),
      (error) => error.code === 'invalid-request'
    );
  }
  assert.deepEqual(
    parseHttpLeaseResponse({
      operation: 'observe',
      status: 200,
      payload: createHttpSuccessEnvelope({ lease: null }),
    }),
    { lease: null }
  );
});

test('POST operations reject query parameters outside the closed contract', () => {
  assert.throws(
    () =>
      validateHttpLeaseRequest({
        method: 'POST',
        pathname: '/v1/work-leases:acquire',
        headers: {
          authorization: 'Bearer secret',
          'content-type': 'application/json',
          'idempotency-key': 'acquire-1',
        },
        body: acquire(),
        query: new URLSearchParams({ extra: 'not-allowed' }),
      }),
    (error) => error.code === 'invalid-request'
  );
});

test('success envelopes validate operation-specific status and fencing fields', () => {
  assert.deepEqual(
    parseHttpLeaseResponse({
      operation: 'acquire',
      status: 201,
      payload: createHttpSuccessEnvelope(lease()),
    }),
    lease()
  );
  assert.deepEqual(
    parseHttpLeaseResponse({
      operation: 'acquire',
      status: 200,
      payload: createHttpSuccessEnvelope(lease()),
    }),
    lease(),
    'an exact replay may retain a stored success status'
  );
  assert.deepEqual(
    parseHttpLeaseResponse({
      operation: 'verify',
      status: 200,
      payload: createHttpSuccessEnvelope({ allowed: true, lease: lease() }),
    }),
    { allowed: true, lease: lease() }
  );
  assert.throws(
    () =>
      parseHttpLeaseResponse({
        operation: 'acquire',
        status: 201,
        payload: createHttpSuccessEnvelope(lease({ fencingToken: 1 })),
      }),
    (error) => error.code === 'authority-unavailable'
  );
  assert.throws(
    () =>
      parseHttpLeaseResponse({
        operation: 'renew',
        status: 201,
        payload: createHttpSuccessEnvelope(lease()),
      }),
    (error) => error.code === 'authority-unavailable'
  );
  assert.throws(
    () =>
      parseHttpLeaseResponse({
        operation: 'acquire',
        status: 201,
        payload: createHttpSuccessEnvelope(lease({ unknownField: true })),
      }),
    (error) => error.code === 'authority-unavailable'
  );
  assert.throws(
    () =>
      parseHttpLeaseResponse({
        operation: 'acquire',
        status: 201,
        payload: createHttpSuccessEnvelope(
          lease({ holder: holder({ authorizationEcho: 'not-allowed' }) })
        ),
      }),
    (error) => error.code === 'authority-unavailable'
  );
});

test('every stable remote error maps to its exact HTTP status', () => {
  const mappings = new Map([
    ['invalid-request', 400],
    ['authority-unauthenticated', 401],
    ['authority-forbidden', 403],
    ['idempotency-conflict', 409],
    ['lease-contended', 409],
    ['worktree-contended', 409],
    ['holder-live', 409],
    ['fence-stale', 412],
    ['lease-not-held', 412],
    ['authority-unavailable', 503],
  ]);
  for (const [code, status] of mappings) {
    const error = new WorkLeaseError(code, `mapped ${code}`, { safe: true });
    const envelope = createHttpErrorEnvelope(error);
    assert.throws(
      () => parseHttpLeaseResponse({ operation: 'verify', status, payload: envelope }),
      (received) =>
        received.code === code &&
        received.message === `mapped ${code}` &&
        received.details.safe === true
    );
    assert.throws(
      () => parseHttpLeaseResponse({ operation: 'verify', status: 418, payload: envelope }),
      (received) => received.code === 'authority-unavailable'
    );
  }
});

test('malformed and unknown success or error envelopes fail closed', () => {
  for (const payload of [
    null,
    {},
    { result: lease(), extra: true },
    { result: { lease: null }, error: {} },
    { error: { code: 'new-server-code', message: 'unknown', details: {} } },
    { error: { code: 'fence-stale', message: 123, details: {} } },
    { error: { code: 'fence-stale', message: 'stale', details: {}, extra: true } },
  ]) {
    assert.throws(
      () => parseHttpLeaseResponse({ operation: 'observe', status: 200, payload }),
      (error) => error.code === 'authority-unavailable'
    );
  }
});
