// @story #1049
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

import {
  HTTP_LEASE_ROUTES,
  WorkLeaseError,
  createHttpErrorEnvelope,
  createHttpSuccessEnvelope,
  parseHttpLeaseResponse,
  validateHttpLeaseRequest,
} from '../src/index.mjs';

const NOW = '2026-07-30T12:00:00.000Z';
const DISPLAY_PATH = '/workspace/1049';
const PATH_HASH = createHash('sha256').update(DISPLAY_PATH).digest('hex');

function holder(overrides = {}) {
  return {
    principalKind: 'worker',
    provider: 'codex',
    agentRunId: 'run-1',
    sessionId: 'session-1',
    hostId: 'host-1',
    worktreeId: 'wt:v1:one',
    pathHash: PATH_HASH,
    branch: 'feature/child/1049',
    pid: 123,
    ...overrides,
  };
}

function acquire(overrides = {}) {
  const requestHolder = overrides.holder ?? holder();
  const issueId = overrides.issueId ?? '1049';
  return {
    projectId: 'project-1',
    issueId,
    mode: 'write',
    idempotencyKey: 'acquire-1',
    requestedAt: NOW,
    ttlMs: 900_000,
    holder: requestHolder,
    binding: {
      sessionId: requestHolder.sessionId,
      issueId,
      worktreeId: requestHolder.worktreeId,
      displayPath: DISPLAY_PATH,
    },
    ...overrides,
  };
}

function binding(overrides = {}) {
  return {
    projectId: 'project-1',
    leaseId: 'lease-1',
    sessionId: 'session-1',
    issueId: '1049',
    worktreeId: 'wt:v1:one',
    displayPath: DISPLAY_PATH,
    fencingToken: '1',
    observedAt: NOW,
    ...overrides,
  };
}

function requestAuthority(requestHolder = holder(), issueId = '1049') {
  return {
    holder: requestHolder,
    binding: {
      sessionId: requestHolder.sessionId,
      issueId,
      worktreeId: requestHolder.worktreeId,
      displayPath: DISPLAY_PATH,
    },
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
        ...requestAuthority(),
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
          ...requestAuthority(),
        },
      }),
    (error) => error.code === 'invalid-request'
  );
});

test('GET observation accepts project scope and validates correlated binding receipts', () => {
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

  assert.deepEqual(
    validateHttpLeaseRequest({
      method: 'GET',
      pathname: '/v1/work-leases',
      headers: { authorization: 'Bearer secret' },
      query: new URLSearchParams({ projectId: 'project-1' }),
    }),
    { operation: 'observe', request: { projectId: 'project-1' } }
  );
  assert.deepEqual(
    parseHttpLeaseResponse({
      operation: 'observe',
      status: 200,
      payload: createHttpSuccessEnvelope({ leases: [lease()], bindings: [binding()] }),
      request: { projectId: 'project-1' },
    }),
    { leases: [lease()], bindings: [binding()] }
  );
  for (const bad of [
    { leases: [lease()], bindings: [] },
    { leases: [lease()], bindings: [binding({ displayPath: null, leaseId: 'wrong' })] },
  ]) {
    assert.throws(
      () =>
        parseHttpLeaseResponse({
          operation: 'observe',
          status: 200,
          payload: createHttpSuccessEnvelope(bad),
          request: { projectId: 'project-1' },
        }),
      (error) => error.code === 'authority-unavailable'
    );
  }

  for (const query of [
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
      request: { projectId: 'project-1', issueId: '1049' },
    }),
    { lease: null }
  );
});

test('project observation requires canonical issue IDs and verifies non-null binding paths', () => {
  const validNullPath = { leases: [lease()], bindings: [binding({ displayPath: null })] };
  assert.deepEqual(
    parseHttpLeaseResponse({
      operation: 'observe',
      status: 200,
      payload: createHttpSuccessEnvelope(validNullPath),
      request: { projectId: 'project-1' },
    }),
    validNullPath,
    'v1 NULL display paths remain observable'
  );

  for (const result of [
    {
      leases: [lease({ issueId: '01' })],
      bindings: [binding({ issueId: '01' })],
    },
    {
      leases: [lease()],
      bindings: [binding({ displayPath: '/workspace/hash-mismatch' })],
    },
  ]) {
    assert.throws(
      () =>
        parseHttpLeaseResponse({
          operation: 'observe',
          status: 200,
          payload: createHttpSuccessEnvelope(result),
          request: { projectId: 'project-1' },
        }),
      (error) => error.code === 'authority-unavailable'
    );
  }
});

test('HTTP lifecycle receipts correlate issue, holder, and acquire chronology exactly', () => {
  const integrationHolder = {
    ...holder(),
    principalKind: 'integration',
    agentRunId: 'integration-1',
    sessionId: 'orchestrator-1',
    pid: 456,
  };
  const requests = {
    renew: {
      projectId: 'project-1',
      leaseId: 'lease-1',
      fencingToken: '1',
      idempotencyKey: 'renew-1',
      requestedAt: NOW,
      ttlMs: 900_000,
      ...requestAuthority(),
    },
    verify: {
      projectId: 'project-1',
      leaseId: 'lease-1',
      fencingToken: '1',
      operation: 'source-write',
      verifiedAt: NOW,
      ...requestAuthority(),
    },
    handoff: {
      projectId: 'project-1',
      leaseId: 'lease-1',
      fencingToken: '1',
      idempotencyKey: 'handoff-1',
      handedOffAt: NOW,
      reason: 'integrate',
      ttlMs: 900_000,
      ...requestAuthority(),
      recipient: integrationHolder,
    },
    release: {
      projectId: 'project-1',
      leaseId: 'lease-1',
      fencingToken: '1',
      idempotencyKey: 'release-1',
      releasedAt: NOW,
      reason: 'done',
      ...requestAuthority(),
    },
  };
  const validResults = {
    renew: lease(),
    verify: { allowed: true, lease: lease() },
    handoff: lease({ fencingToken: '2', holder: integrationHolder }),
    release: lease({ fencingToken: '2', state: 'released' }),
  };

  for (const operation of Object.keys(requests)) {
    const payloadLease =
      operation === 'verify' ? validResults.verify.lease : validResults[operation];
    const wrongIssue = { ...payloadLease, issueId: '1050' };
    const wrongHolder = { ...payloadLease, holder: holder({ sessionId: 'alien-session' }) };
    for (const corruptedLease of [wrongIssue, wrongHolder]) {
      const result =
        operation === 'verify' ? { allowed: true, lease: corruptedLease } : corruptedLease;
      assert.throws(
        () =>
          parseHttpLeaseResponse({
            operation,
            status: 200,
            payload: createHttpSuccessEnvelope(result),
            request: requests[operation],
          }),
        (error) => error.code === 'authority-unavailable',
        `${operation} must reject an alien issue or holder`
      );
    }
  }

  for (const corrupted of [
    lease({ acquiredAt: '2026-07-30T11:59:59.000Z' }),
    lease({ heartbeatAt: '2026-07-30T12:00:01.000Z' }),
    lease({ expiresAt: '2026-07-30T12:14:59.000Z' }),
  ]) {
    assert.throws(
      () =>
        parseHttpLeaseResponse({
          operation: 'acquire',
          status: 201,
          payload: createHttpSuccessEnvelope(corrupted),
          request: acquire(),
        }),
      (error) => error.code === 'authority-unavailable'
    );
  }
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
      request: acquire(),
    }),
    lease()
  );
  assert.deepEqual(
    parseHttpLeaseResponse({
      operation: 'acquire',
      status: 200,
      payload: createHttpSuccessEnvelope(lease()),
      request: acquire(),
    }),
    lease(),
    'an exact replay may retain a stored success status'
  );
  assert.deepEqual(
    parseHttpLeaseResponse({
      operation: 'verify',
      status: 200,
      payload: createHttpSuccessEnvelope({ allowed: true, lease: lease() }),
      request: {
        projectId: 'project-1',
        issueId: '1049',
        leaseId: 'lease-1',
        fencingToken: '1',
        operation: 'source-write',
        verifiedAt: NOW,
        ...requestAuthority(),
      },
    }),
    { allowed: true, lease: lease() }
  );
  assert.throws(
    () =>
      parseHttpLeaseResponse({
        operation: 'acquire',
        status: 201,
        payload: createHttpSuccessEnvelope(lease({ fencingToken: 1 })),
        request: acquire(),
      }),
    (error) => error.code === 'authority-unavailable'
  );
  assert.throws(
    () =>
      parseHttpLeaseResponse({
        operation: 'renew',
        status: 201,
        payload: createHttpSuccessEnvelope(lease()),
        request: {
          projectId: 'project-1',
          leaseId: 'lease-1',
          fencingToken: '1',
          idempotencyKey: 'renew-1',
          requestedAt: NOW,
          ttlMs: 900_000,
        },
      }),
    (error) => error.code === 'authority-unavailable'
  );
  assert.throws(
    () =>
      parseHttpLeaseResponse({
        operation: 'acquire',
        status: 201,
        payload: createHttpSuccessEnvelope(lease({ unknownField: true })),
        request: acquire(),
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
        request: acquire(),
      }),
    (error) => error.code === 'authority-unavailable'
  );
});

test('success responses must correlate to the originating fenced request', () => {
  const verifyRequest = {
    projectId: 'project-1',
    leaseId: 'lease-1',
    fencingToken: '1',
    operation: 'source-write',
    verifiedAt: NOW,
    ...requestAuthority(),
  };
  const releaseRequest = {
    projectId: 'project-1',
    leaseId: 'lease-1',
    fencingToken: '1',
    idempotencyKey: 'release-1',
    releasedAt: NOW,
    reason: 'done',
  };
  const handoffRequest = {
    projectId: 'project-1',
    leaseId: 'lease-1',
    fencingToken: '1',
    idempotencyKey: 'handoff-1',
    handedOffAt: NOW,
    reason: 'integrate',
    recipient: {
      principalKind: 'integration',
      provider: 'codex',
      agentRunId: 'integration-1',
      sessionId: 'integration-session',
      hostId: 'host-1',
      pid: 456,
    },
  };
  const mismatches = [
    {
      operation: 'verify',
      request: verifyRequest,
      result: {
        allowed: true,
        lease: lease({
          projectId: 'other-project',
          leaseId: 'other-lease',
          fencingToken: '9',
          state: 'released',
        }),
      },
    },
    {
      operation: 'acquire',
      request: acquire(),
      status: 201,
      result: lease({
        projectId: 'other-project',
        issueId: '1051',
        state: 'released',
        holder: holder({ sessionId: 'other-session' }),
      }),
    },
    {
      operation: 'release',
      request: releaseRequest,
      result: lease({ fencingToken: '2', state: 'active' }),
    },
    {
      operation: 'renew',
      request: {
        projectId: 'project-1',
        leaseId: 'lease-1',
        fencingToken: '1',
        idempotencyKey: 'renew-1',
        requestedAt: NOW,
        ttlMs: 900_000,
      },
      result: lease({ fencingToken: '2' }),
    },
    {
      operation: 'handoff',
      request: handoffRequest,
      result: lease({ fencingToken: '2', holder: holder() }),
    },
    {
      operation: 'switchLease',
      request: {
        projectId: 'project-1',
        leaseId: 'lease-1',
        fencingToken: '1',
        idempotencyKey: 'switch-1',
        switchedAt: NOW,
        target: acquire({ issueId: '1051', idempotencyKey: 'target-1' }),
      },
      result: {
        lease: lease({ issueId: '1051', leaseId: 'lease-2', fencingToken: '3' }),
        transition: {
          transitionId: 'transition-1',
          fromIssueId: 'WRONG-ISSUE',
          fromLeaseId: 'lease-1',
          fromToken: '1',
          toIssueId: '1051',
        },
      },
    },
    {
      operation: 'takeover',
      request: {
        projectId: 'project-1',
        issueId: '1049',
        expectedLeaseId: 'lease-1',
        expectedToken: '1',
        requester: holder({ agentRunId: 'run-2', sessionId: 'session-2', pid: 456 }),
        observedAt: NOW,
        idempotencyKey: 'takeover-1',
        reason: 'dead holder',
        evidence: {
          kind: 'local-process-dead',
          hostId: 'host-1',
          pid: 123,
          checkedAt: NOW,
          detailsHash: 'proof',
        },
      },
      result: lease({
        leaseId: 'lease-1',
        fencingToken: '2',
        holder: holder({ agentRunId: 'run-2', sessionId: 'session-2', pid: 456 }),
      }),
    },
    {
      operation: 'observe',
      request: { projectId: 'project-1', worktreeId: 'wt:v1:one' },
      result: { lease: lease({ holder: holder({ worktreeId: 'wt:v1:other' }) }) },
    },
  ];

  for (const mismatch of mismatches) {
    assert.throws(
      () =>
        parseHttpLeaseResponse({
          operation: mismatch.operation,
          status: mismatch.status ?? 200,
          payload: createHttpSuccessEnvelope(mismatch.result),
          request: mismatch.request,
        }),
      (error) => error.code === 'authority-unavailable',
      mismatch.operation
    );
  }

  assert.throws(
    () =>
      parseHttpLeaseResponse({
        operation: 'observe',
        status: 200,
        payload: createHttpSuccessEnvelope({ lease: null }),
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
