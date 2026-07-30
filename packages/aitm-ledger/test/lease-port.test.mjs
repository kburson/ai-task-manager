// @story #1049
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  LEASE_OPERATIONS,
  WorkLeaseStore,
  assertFencingToken,
  canonicalRequestDigest,
  validateAcquireRequest,
  validateHandoffRequest,
  validateTakeoverRequest,
  validateVerifyRequest,
} from '../src/index.mjs';
import { WorkLeaseError, sanitizeLeaseDetails } from '../src/lease/errors.mjs';
import {
  assertLeaseStoreConformance,
  createMemoryLeaseStore,
} from './fixtures/lease-conformance.mjs';

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

function integrationRecipient(overrides = {}) {
  return {
    principalKind: 'integration',
    provider: 'codex',
    agentRunId: 'integration-1',
    sessionId: 'orchestrator-1',
    hostId: 'host-1',
    pid: 456,
    ...overrides,
  };
}

test('port surface is explicit and cannot be instantiated without implementations', () => {
  const store = new WorkLeaseStore();
  for (const method of [
    'acquire',
    'renew',
    'verify',
    'switchLease',
    'handoff',
    'release',
    'takeover',
    'observe',
  ]) {
    assert.equal(typeof store[method], 'function');
    assert.throws(() => store[method]({}), /must implement/);
  }
});

test('closed operation vocabulary accepts every canonical name and rejects aliases', () => {
  assert.deepEqual(LEASE_OPERATIONS, [
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
  for (const operation of LEASE_OPERATIONS) {
    assert.doesNotThrow(() =>
      validateVerifyRequest({
        projectId: 'project-1',
        leaseId: 'lease-1',
        fencingToken: '1',
        operation,
        verifiedAt: NOW,
      })
    );
  }
  for (const operation of ['bind', 'source_write', 'anything']) {
    assert.throws(
      () =>
        validateVerifyRequest({
          projectId: 'project-1',
          leaseId: 'lease-1',
          fencingToken: '1',
          operation,
          verifiedAt: NOW,
        }),
      (error) => error.code === 'invalid-request'
    );
  }
  for (const verifiedAt of ['2026-07-30', '2026-07-30T12:00:00Z', 'July 30, 2026']) {
    assert.throws(
      () =>
        validateVerifyRequest({
          projectId: 'project-1',
          leaseId: 'lease-1',
          fencingToken: '1',
          operation: 'task-bind',
          verifiedAt,
        }),
      (error) => error.code === 'invalid-request'
    );
  }
});

test('fencing token is a positive base-10 string on every boundary', () => {
  for (const token of ['1', '9', '9007199254740993']) {
    assert.equal(assertFencingToken(token), token);
  }
  for (const token of [1, 0, '0', '-1', '01', '1.0', '1e3', '', null]) {
    assert.throws(
      () => assertFencingToken(token),
      (error) => error.code === 'invalid-request'
    );
  }
});

test('request validators reject malformed holder, handoff identity changes, and weak takeover evidence', () => {
  assert.throws(
    () => validateAcquireRequest(acquire({ issueId: '#1049' })),
    (error) => error.code === 'invalid-request'
  );
  assert.doesNotThrow(() => validateAcquireRequest(acquire()));
  assert.throws(
    () => validateAcquireRequest(acquire({ holder: holder({ principalKind: 'integration' }) })),
    (error) => error.code === 'invalid-request'
  );
  assert.doesNotThrow(() =>
    validateHandoffRequest({
      projectId: 'project-1',
      leaseId: 'lease-1',
      fencingToken: '1',
      idempotencyKey: 'handoff-1',
      handedOffAt: NOW,
      reason: 'ready to integrate',
      recipient: integrationRecipient(),
    })
  );
  assert.throws(
    () =>
      validateHandoffRequest({
        projectId: 'project-1',
        leaseId: 'lease-1',
        fencingToken: '1',
        idempotencyKey: 'handoff-1',
        handedOffAt: NOW,
        reason: 'ready',
        recipient: integrationRecipient({ worktreeId: 'replacement' }),
      }),
    (error) => error.code === 'invalid-request'
  );
  assert.throws(
    () =>
      validateTakeoverRequest({
        projectId: 'project-1',
        issueId: '1049',
        expectedLeaseId: 'lease-1',
        expectedToken: '1',
        idempotencyKey: 'takeover-1',
        observedAt: NOW,
        reason: 'dead holder',
        requester: holder(),
        evidence: { kind: 'operator-attestation' },
      }),
    (error) => error.code === 'invalid-request'
  );
});

test('canonical request digest is key-order independent but payload-sensitive', () => {
  const one = canonicalRequestDigest({ b: 2, a: { y: 2, x: 1 } });
  const same = canonicalRequestDigest({ a: { x: 1, y: 2 }, b: 2 });
  const other = canonicalRequestDigest({ a: { x: 1, y: 3 }, b: 2 });
  assert.equal(one, same);
  assert.notEqual(one, other);
  assert.match(one, /^[a-f0-9]{64}$/);
  assert.match(canonicalRequestDigest({ fencingToken: 1n }), /^[a-f0-9]{64}$/);
  const cyclic = { projectId: 'project-1' };
  cyclic.self = cyclic;
  assert.match(canonicalRequestDigest(cyclic), /^[a-f0-9]{64}$/);
});

test('memory conformance: uniqueness, exact replay, conflict, verification, and release fencing', () => {
  const store = createMemoryLeaseStore();
  const first = store.acquire(acquire());
  assert.equal(first.fencingToken, '1');
  assert.deepEqual(store.acquire(acquire()), first, 'exact acquire replay returns original result');
  assert.throws(
    () => store.acquire(acquire({ issueId: '1051' })),
    (error) => error.code === 'idempotency-conflict'
  );
  assert.throws(
    () =>
      store.release({
        projectId: 'project-1',
        leaseId: first.leaseId,
        fencingToken: first.fencingToken,
        idempotencyKey: 'acquire-1',
        releasedAt: NOW,
        reason: 'different operation',
      }),
    (error) => error.code === 'idempotency-conflict'
  );
  assert.throws(
    () => store.acquire(acquire({ idempotencyKey: 'acquire-2', holder: holder({ pid: 999 }) })),
    (error) => error.code === 'lease-contended'
  );
  assert.throws(
    () =>
      store.acquire(
        acquire({
          issueId: '1051',
          idempotencyKey: 'acquire-3',
          holder: holder({ sessionId: 'session-2' }),
        })
      ),
    (error) => error.code === 'worktree-contended'
  );
  const allowed = store.verify({
    projectId: 'project-1',
    leaseId: first.leaseId,
    fencingToken: first.fencingToken,
    operation: 'source-write',
    verifiedAt: NOW,
  });
  assert.equal(allowed.allowed, true);

  const released = store.release({
    projectId: 'project-1',
    leaseId: first.leaseId,
    fencingToken: first.fencingToken,
    idempotencyKey: 'release-1',
    releasedAt: NOW,
    reason: 'done',
  });
  assert.equal(released.state, 'released');
  assert.ok(BigInt(released.fencingToken) > BigInt(first.fencingToken));
  assert.deepEqual(
    store.release({
      projectId: 'project-1',
      leaseId: first.leaseId,
      fencingToken: first.fencingToken,
      idempotencyKey: 'release-1',
      releasedAt: NOW,
      reason: 'done',
    }),
    released,
    'replay precedes stale-fence evaluation'
  );
  assert.throws(
    () =>
      store.verify({
        projectId: 'project-1',
        leaseId: first.leaseId,
        fencingToken: first.fencingToken,
        operation: 'close',
        verifiedAt: NOW,
      }),
    (error) => error.code === 'fence-stale'
  );
});

test('terminal mutation errors replay even after authority state changes', () => {
  const store = createMemoryLeaseStore();
  const winner = store.acquire(acquire());
  const contended = acquire({
    idempotencyKey: 'terminal-contention',
    holder: holder({ agentRunId: 'run-2', sessionId: 'session-2', pid: 456 }),
  });
  assert.throws(
    () => store.acquire(contended),
    (error) => error.code === 'lease-contended'
  );
  store.release({
    projectId: 'project-1',
    leaseId: winner.leaseId,
    fencingToken: winner.fencingToken,
    idempotencyKey: 'release-winner',
    releasedAt: NOW,
    reason: 'make issue available',
  });
  assert.throws(
    () => store.acquire(contended),
    (error) => error.code === 'lease-contended',
    'exact replay returns original terminal error instead of re-evaluating current state'
  );
});

test('recordable invalid requests replay and corrected payload reuse conflicts', () => {
  const store = createMemoryLeaseStore();
  const malformed = acquire({ idempotencyKey: 'invalid-recorded', mode: 'read' });
  assert.throws(
    () => store.acquire(malformed),
    (error) => error.code === 'invalid-request'
  );
  assert.throws(
    () => store.acquire(malformed),
    (error) => error.code === 'invalid-request',
    'exact malformed replay returns the stored terminal response'
  );
  assert.throws(
    () => store.acquire({ ...malformed, mode: 'write' }),
    (error) => error.code === 'idempotency-conflict',
    'correcting a payload cannot reuse the terminal response key'
  );

  const lease = store.acquire(acquire({ idempotencyKey: 'bigint-base' }));
  const invalidToken = {
    projectId: 'project-1',
    leaseId: lease.leaseId,
    fencingToken: 1n,
    idempotencyKey: 'bigint-invalid',
    requestedAt: NOW,
    ttlMs: 900_000,
  };
  assert.throws(
    () => store.renew(invalidToken),
    (error) => error.code === 'invalid-request'
  );
  assert.throws(
    () => store.renew(invalidToken),
    (error) => error.code === 'invalid-request'
  );
  assert.throws(
    () => store.renew({ ...invalidToken, fencingToken: lease.fencingToken }),
    (error) => error.code === 'idempotency-conflict'
  );
});

test('takeover cannot claim a worktree that retains another issue lease', () => {
  const store = createMemoryLeaseStore();
  const observed = store.acquire(acquire());
  const other = store.acquire(
    acquire({
      issueId: '1051',
      idempotencyKey: 'other-issue',
      holder: holder({
        agentRunId: 'run-2',
        sessionId: 'session-2',
        worktreeId: 'wt:v1:two',
        pathHash: 'path-two',
        pid: 456,
      }),
    })
  );
  assert.throws(
    () =>
      store.takeover({
        projectId: 'project-1',
        issueId: '1049',
        expectedLeaseId: observed.leaseId,
        expectedToken: observed.fencingToken,
        idempotencyKey: 'takeover-conflicting-worktree',
        observedAt: NOW,
        reason: 'confirmed dead',
        requester: holder({
          agentRunId: 'run-3',
          sessionId: 'session-3',
          worktreeId: other.holder.worktreeId,
          pathHash: other.holder.pathHash,
          pid: 789,
        }),
        evidence: {
          kind: 'local-process-dead',
          hostId: 'host-1',
          pid: 123,
          checkedAt: NOW,
          detailsHash: 'dead-proof',
        },
      }),
    (error) => error.code === 'worktree-contended'
  );
  assert.equal(
    store.verify({
      projectId: 'project-1',
      leaseId: observed.leaseId,
      fencingToken: observed.fencingToken,
      operation: 'task-bind',
      verifiedAt: NOW,
    }).allowed,
    true
  );
});

test('memory conformance: renew, handoff, switch, and takeover are fenced and idempotent', () => {
  const store = createMemoryLeaseStore();
  const lease = store.acquire(acquire());
  const renewed = store.renew({
    projectId: 'project-1',
    leaseId: lease.leaseId,
    fencingToken: lease.fencingToken,
    idempotencyKey: 'renew-1',
    requestedAt: '2026-07-30T12:01:00.000Z',
    ttlMs: 900_000,
  });
  assert.equal(renewed.fencingToken, lease.fencingToken, 'renew does not advance fence');
  assert.deepEqual(
    store.renew({
      projectId: 'project-1',
      leaseId: lease.leaseId,
      fencingToken: lease.fencingToken,
      idempotencyKey: 'renew-1',
      requestedAt: '2026-07-30T12:01:00.000Z',
      ttlMs: 900_000,
    }),
    renewed
  );

  const handed = store.handoff({
    projectId: 'project-1',
    leaseId: lease.leaseId,
    fencingToken: lease.fencingToken,
    idempotencyKey: 'handoff-1',
    handedOffAt: '2026-07-30T12:02:00.000Z',
    reason: 'integrate',
    recipient: integrationRecipient(),
  });
  assert.equal(handed.state, 'active');
  assert.equal(handed.leaseId, lease.leaseId);
  assert.equal(handed.holder.worktreeId, lease.holder.worktreeId);
  assert.equal(handed.holder.principalKind, 'integration');
  assert.ok(BigInt(handed.fencingToken) > BigInt(lease.fencingToken));
  assert.deepEqual(
    store.handoff({
      projectId: 'project-1',
      leaseId: lease.leaseId,
      fencingToken: lease.fencingToken,
      idempotencyKey: 'handoff-1',
      handedOffAt: '2026-07-30T12:02:00.000Z',
      reason: 'integrate',
      recipient: integrationRecipient(),
    }),
    handed,
    'handoff replay precedes old-token rejection'
  );
  assert.throws(
    () =>
      store.verify({
        projectId: 'project-1',
        leaseId: lease.leaseId,
        fencingToken: lease.fencingToken,
        operation: 'close',
        verifiedAt: NOW,
      }),
    (error) => error.code === 'fence-stale'
  );

  const workerStore = createMemoryLeaseStore();
  const current = workerStore.acquire(acquire());
  const switched = workerStore.switchLease({
    projectId: 'project-1',
    issueId: '1049',
    leaseId: current.leaseId,
    fencingToken: current.fencingToken,
    idempotencyKey: 'switch-1',
    switchedAt: NOW,
    target: acquire({
      issueId: '1051',
      idempotencyKey: 'target-acquire-1',
      holder: holder(),
    }),
  });
  assert.equal(switched.lease.issueId, '1051');
  assert.equal(switched.transition.fromIssueId, '1049');
  assert.deepEqual(
    workerStore.switchLease({
      projectId: 'project-1',
      issueId: '1049',
      leaseId: current.leaseId,
      fencingToken: current.fencingToken,
      idempotencyKey: 'switch-1',
      switchedAt: NOW,
      target: acquire({
        issueId: '1051',
        idempotencyKey: 'target-acquire-1',
        holder: holder(),
      }),
    }),
    switched
  );

  const failureStore = createMemoryLeaseStore();
  const preserved = failureStore.acquire(acquire({ idempotencyKey: 'preserve-current' }));
  failureStore.acquire(
    acquire({
      issueId: '1051',
      idempotencyKey: 'blocked-target',
      holder: holder({
        agentRunId: 'run-2',
        sessionId: 'session-2',
        worktreeId: 'wt:v1:two',
        pathHash: 'path-two',
        pid: 456,
      }),
    })
  );
  assert.throws(
    () =>
      failureStore.switchLease({
        projectId: 'project-1',
        issueId: '1049',
        leaseId: preserved.leaseId,
        fencingToken: preserved.fencingToken,
        idempotencyKey: 'failed-switch',
        switchedAt: NOW,
        target: acquire({
          issueId: '1051',
          idempotencyKey: 'failed-target',
          holder: holder(),
        }),
      }),
    (error) => error.code === 'lease-contended'
  );
  assert.equal(
    failureStore.verify({
      projectId: 'project-1',
      leaseId: preserved.leaseId,
      fencingToken: preserved.fencingToken,
      operation: 'task-bind',
      verifiedAt: NOW,
    }).allowed,
    true,
    'failed switch preserves the old lease'
  );

  const takeoverStore = createMemoryLeaseStore();
  const observed = takeoverStore.acquire(acquire());
  const taken = takeoverStore.takeover({
    projectId: 'project-1',
    issueId: '1049',
    expectedLeaseId: observed.leaseId,
    expectedToken: observed.fencingToken,
    idempotencyKey: 'takeover-1',
    observedAt: NOW,
    reason: 'confirmed dead',
    requester: holder({ agentRunId: 'run-2', sessionId: 'session-2', pid: 999 }),
    evidence: {
      kind: 'local-process-dead',
      hostId: 'host-1',
      pid: 123,
      checkedAt: NOW,
      detailsHash: 'dead-proof',
    },
  });
  assert.notEqual(taken.leaseId, observed.leaseId);
  assert.ok(BigInt(taken.fencingToken) > BigInt(observed.fencingToken));
  assert.deepEqual(
    takeoverStore.takeover({
      projectId: 'project-1',
      issueId: '1049',
      expectedLeaseId: observed.leaseId,
      expectedToken: observed.fencingToken,
      idempotencyKey: 'takeover-1',
      observedAt: NOW,
      reason: 'confirmed dead',
      requester: holder({ agentRunId: 'run-2', sessionId: 'session-2', pid: 999 }),
      evidence: {
        kind: 'local-process-dead',
        hostId: 'host-1',
        pid: 123,
        checkedAt: NOW,
        detailsHash: 'dead-proof',
      },
    }),
    taken,
    'takeover replay returns the original result after supersession'
  );
});

test('stable errors expose sanitized diagnostics without secrets', () => {
  const details = sanitizeLeaseDetails({
    holder: holder(),
    authorization: 'Bearer secret',
    authToken: 'secret',
    tokenEnv: 'TOP_SECRET',
    nested: { secret: 'hidden', leaseId: 'lease-1' },
  });
  assert.equal(JSON.stringify(details).includes('secret'), false);
  assert.equal(details.nested.leaseId, 'lease-1');
  const error = new WorkLeaseError('lease-contended', 'busy', details);
  assert.equal(error.code, 'lease-contended');
  assert.equal(error.name, 'WorkLeaseError');
  assert.equal(JSON.stringify(error.toJSON()).includes('Bearer'), false);
});

test('reusable conformance fixture runs against the memory adapter', async () => {
  await assertLeaseStoreConformance({ createStore: createMemoryLeaseStore, assert });
});
