import { WorkLeaseStore } from '../../src/lease/port.mjs';
import {
  OWNERSHIP_RETAINING_STATES,
  canonicalRequestDigest,
  validateAcquireRequest,
  validateHandoffRequest,
  validateObserveSelector,
  validateReleaseRequest,
  validateRenewRequest,
  validateSwitchLeaseRequest,
  validateTakeoverRequest,
  validateVerifyRequest,
} from '../../src/lease/schema.mjs';
import { WorkLeaseError } from '../../src/lease/errors.mjs';

function clone(value) {
  return structuredClone(value);
}

function expiresAt(timestamp, ttlMs) {
  return new Date(Date.parse(timestamp) + ttlMs).toISOString();
}

export class MemoryLeaseStore extends WorkLeaseStore {
  #leases = new Map();
  #idempotency = new Map();
  #leaseNumber = 0;
  #transitionNumber = 0;
  #fence = 0n;

  #nextFence() {
    this.#fence += 1n;
    return String(this.#fence);
  }

  #retains(lease) {
    return lease && OWNERSHIP_RETAINING_STATES.includes(lease.state);
  }

  #currentByIssue(projectId, issueId, exceptLeaseId) {
    return [...this.#leases.values()].find(
      (lease) =>
        lease.projectId === projectId &&
        lease.issueId === issueId &&
        lease.leaseId !== exceptLeaseId &&
        this.#retains(lease)
    );
  }

  #currentByWorktree(projectId, worktreeId, exceptLeaseId) {
    return [...this.#leases.values()].find(
      (lease) =>
        lease.projectId === projectId &&
        lease.holder.worktreeId === worktreeId &&
        lease.leaseId !== exceptLeaseId &&
        this.#retains(lease)
    );
  }

  #lease(request) {
    const lease = this.#leases.get(request.leaseId);
    if (!lease || lease.projectId !== request.projectId) {
      throw new WorkLeaseError('lease-not-held', 'lease is not held', {
        projectId: request.projectId,
        leaseId: request.leaseId,
      });
    }
    if (lease.fencingToken !== request.fencingToken) {
      throw new WorkLeaseError('fence-stale', 'lease fencing token is stale', {
        leaseId: request.leaseId,
        expectedToken: lease.fencingToken,
        receivedToken: request.fencingToken,
      });
    }
    if (!this.#retains(lease)) {
      throw new WorkLeaseError('lease-not-held', 'lease is terminal', {
        leaseId: request.leaseId,
        state: lease.state,
      });
    }
    return lease;
  }

  #mutate(operation, request, validate, apply) {
    const hasIdempotencyEnvelope =
      request &&
      typeof request === 'object' &&
      !Array.isArray(request) &&
      typeof request.projectId === 'string' &&
      request.projectId.trim() !== '' &&
      typeof request.idempotencyKey === 'string' &&
      request.idempotencyKey.trim() !== '';
    if (!hasIdempotencyEnvelope) {
      validate(request);
      throw new WorkLeaseError('invalid-request', 'mutating request lacks an idempotency envelope');
    }
    const scope = `${request.projectId}\0${request.idempotencyKey}`;
    const digest = canonicalRequestDigest(request);
    const previous = this.#idempotency.get(scope);
    if (previous) {
      if (previous.operation !== operation || previous.digest !== digest) {
        throw new WorkLeaseError(
          'idempotency-conflict',
          'idempotency key was reused for a different request',
          { projectId: request.projectId, idempotencyKey: request.idempotencyKey, operation }
        );
      }
      if (previous.error) {
        throw new WorkLeaseError(
          previous.error.code,
          previous.error.message,
          clone(previous.error.details)
        );
      }
      return clone(previous.result);
    }
    try {
      validate(request);
      const result = apply();
      this.#idempotency.set(scope, { operation, digest, result: clone(result) });
      return clone(result);
    } catch (error) {
      if (error instanceof WorkLeaseError && error.code !== 'authority-unavailable') {
        this.#idempotency.set(scope, {
          operation,
          digest,
          error: {
            code: error.code,
            message: error.message,
            details: clone(error.details),
          },
        });
      }
      throw error;
    }
  }

  #newLease(request, { acquiredAt = request.requestedAt } = {}) {
    this.#leaseNumber += 1;
    const lease = {
      projectId: request.projectId,
      issueId: request.issueId,
      mode: 'write',
      leaseId: `lease-${this.#leaseNumber}`,
      fencingToken: this.#nextFence(),
      state: 'active',
      holder: clone(request.holder),
      acquiredAt,
      heartbeatAt: acquiredAt,
      expiresAt: expiresAt(acquiredAt, request.ttlMs),
      audit: {},
    };
    this.#leases.set(lease.leaseId, lease);
    return lease;
  }

  acquire(request) {
    return this.#mutate('acquire', request, validateAcquireRequest, () => {
      const issueLease = this.#currentByIssue(request.projectId, request.issueId);
      if (issueLease) {
        throw new WorkLeaseError('lease-contended', 'issue already has a write lease', {
          issueId: request.issueId,
          holder: issueLease.holder,
          leaseId: issueLease.leaseId,
          state: issueLease.state,
        });
      }
      const worktreeLease = this.#currentByWorktree(request.projectId, request.holder.worktreeId);
      if (worktreeLease) {
        throw new WorkLeaseError('worktree-contended', 'worktree already has a write lease', {
          worktreeId: request.holder.worktreeId,
          holder: worktreeLease.holder,
          leaseId: worktreeLease.leaseId,
          state: worktreeLease.state,
        });
      }
      return this.#newLease(request);
    });
  }

  renew(request) {
    return this.#mutate('renew', request, validateRenewRequest, () => {
      const lease = this.#lease(request);
      lease.heartbeatAt = request.requestedAt;
      lease.expiresAt = expiresAt(request.requestedAt, request.ttlMs);
      return lease;
    });
  }

  verify(request) {
    validateVerifyRequest(request);
    const lease = this.#lease(request);
    return { allowed: true, lease: clone(lease) };
  }

  switchLease(request) {
    return this.#mutate('switch', request, validateSwitchLeaseRequest, () => {
      const current = this.#lease(request);
      if (current.issueId !== request.issueId) {
        throw new WorkLeaseError('lease-not-held', 'outgoing issue does not match the lease', {
          leaseId: current.leaseId,
          expectedIssueId: current.issueId,
          receivedIssueId: request.issueId,
        });
      }
      const issueLease = this.#currentByIssue(
        request.projectId,
        request.target.issueId,
        current.leaseId
      );
      if (issueLease) {
        throw new WorkLeaseError('lease-contended', 'target issue already has a write lease', {
          issueId: request.target.issueId,
          holder: issueLease.holder,
          leaseId: issueLease.leaseId,
        });
      }
      const worktreeLease = this.#currentByWorktree(
        request.projectId,
        request.target.holder.worktreeId,
        current.leaseId
      );
      if (worktreeLease) {
        throw new WorkLeaseError(
          'worktree-contended',
          'target worktree already has a write lease',
          {
            worktreeId: request.target.holder.worktreeId,
            holder: worktreeLease.holder,
            leaseId: worktreeLease.leaseId,
          }
        );
      }

      const priorToken = current.fencingToken;
      current.fencingToken = this.#nextFence();
      current.state = 'superseded';
      current.audit = {
        ...current.audit,
        supersededAt: request.switchedAt,
        reason: 'issue-switch',
      };
      const lease = this.#newLease(request.target, { acquiredAt: request.switchedAt });
      this.#transitionNumber += 1;
      return {
        lease,
        transition: {
          transitionId: `transition-${this.#transitionNumber}`,
          fromIssueId: current.issueId,
          fromLeaseId: current.leaseId,
          fromToken: priorToken,
          toIssueId: lease.issueId,
        },
      };
    });
  }

  handoff(request) {
    return this.#mutate('handoff', request, validateHandoffRequest, () => {
      const lease = this.#lease(request);
      const priorHolder = lease.holder;
      const priorToken = lease.fencingToken;
      lease.fencingToken = this.#nextFence();
      lease.holder = {
        ...clone(request.recipient),
        worktreeId: priorHolder.worktreeId,
        pathHash: priorHolder.pathHash,
        branch: priorHolder.branch,
      };
      lease.state = 'active';
      lease.heartbeatAt = request.handedOffAt;
      lease.audit = {
        ...lease.audit,
        handedOffAt: request.handedOffAt,
        handedOffBy: priorHolder,
        handedOffTo: clone(request.recipient),
        priorToken,
        reason: request.reason,
      };
      return lease;
    });
  }

  release(request) {
    return this.#mutate('release', request, validateReleaseRequest, () => {
      const lease = this.#lease(request);
      lease.fencingToken = this.#nextFence();
      lease.state = 'released';
      lease.audit = {
        ...lease.audit,
        releasedAt: request.releasedAt,
        reason: request.reason,
      };
      return lease;
    });
  }

  takeover(request) {
    return this.#mutate('takeover', request, validateTakeoverRequest, () => {
      const observed = this.#currentByIssue(request.projectId, request.issueId);
      if (!observed) {
        throw new WorkLeaseError('lease-not-held', 'observed lease is absent or terminal', {
          issueId: request.issueId,
        });
      }
      if (
        observed.leaseId !== request.expectedLeaseId ||
        observed.fencingToken !== request.expectedToken
      ) {
        throw new WorkLeaseError('fence-stale', 'observed lease changed before takeover', {
          expectedLeaseId: request.expectedLeaseId,
          currentLeaseId: observed.leaseId,
          expectedToken: request.expectedToken,
          currentToken: observed.fencingToken,
        });
      }
      const worktreeLease = this.#currentByWorktree(
        request.projectId,
        request.requester.worktreeId,
        observed.leaseId
      );
      if (worktreeLease) {
        throw new WorkLeaseError(
          'worktree-contended',
          'takeover worktree already has a write lease',
          {
            worktreeId: request.requester.worktreeId,
            holder: worktreeLease.holder,
            leaseId: worktreeLease.leaseId,
          }
        );
      }
      observed.fencingToken = this.#nextFence();
      observed.state = 'superseded';
      observed.audit = {
        ...observed.audit,
        supersededAt: request.observedAt,
        reason: request.reason,
        evidence: clone(request.evidence),
      };
      return this.#newLease(
        {
          projectId: request.projectId,
          issueId: request.issueId,
          mode: 'write',
          idempotencyKey: request.idempotencyKey,
          requestedAt: request.observedAt,
          ttlMs: 900_000,
          holder: request.requester,
        },
        { acquiredAt: request.observedAt }
      );
    });
  }

  observe(selector) {
    validateObserveSelector(selector);
    const lease =
      selector.issueId != null
        ? this.#currentByIssue(selector.projectId, selector.issueId)
        : this.#currentByWorktree(selector.projectId, selector.worktreeId);
    return lease ? clone(lease) : null;
  }
}

export function createMemoryLeaseStore() {
  return new MemoryLeaseStore();
}

export async function assertLeaseStoreConformance({ createStore, assert }) {
  const requestedAt = '2026-07-30T12:00:00.000Z';
  const projectId = 'conformance-project';
  const baseHolder = {
    principalKind: 'worker',
    provider: 'conformance',
    agentRunId: 'run-1',
    sessionId: 'session-1',
    hostId: 'host-1',
    worktreeId: 'wt:v1:conformance',
    pathHash: 'path-conformance',
    branch: 'feature/conformance',
    pid: 123,
  };
  const acquireRequest = ({
    issueId = '1049',
    idempotencyKey = 'conformance-acquire',
    holder = baseHolder,
  } = {}) => ({
    projectId,
    issueId,
    mode: 'write',
    idempotencyKey,
    requestedAt,
    ttlMs: 900_000,
    holder,
  });
  const expectCode = async (fn, code) => {
    await assert.rejects(
      async () => fn(),
      (error) => error?.code === code
    );
  };

  const store = await createStore();
  const request = acquireRequest();
  const acquired = await store.acquire(request);
  assert.deepEqual(await store.acquire(request), acquired);
  await expectCode(() => store.acquire({ ...request, issueId: '1051' }), 'idempotency-conflict');
  assert.deepEqual(await store.observe({ projectId, issueId: request.issueId }), acquired);
  assert.equal(
    (
      await store.verify({
        projectId,
        leaseId: acquired.leaseId,
        fencingToken: acquired.fencingToken,
        operation: 'task-bind',
        verifiedAt: requestedAt,
      })
    ).allowed,
    true
  );

  const renewRequest = {
    projectId,
    leaseId: acquired.leaseId,
    fencingToken: acquired.fencingToken,
    idempotencyKey: 'conformance-renew',
    requestedAt: '2026-07-30T12:01:00.000Z',
    ttlMs: 900_000,
  };
  const renewed = await store.renew(renewRequest);
  assert.equal(renewed.fencingToken, acquired.fencingToken);
  assert.deepEqual(await store.renew(renewRequest), renewed);

  const handoffRequest = {
    projectId,
    leaseId: acquired.leaseId,
    fencingToken: acquired.fencingToken,
    idempotencyKey: 'conformance-handoff',
    handedOffAt: '2026-07-30T12:02:00.000Z',
    reason: 'integration',
    recipient: {
      principalKind: 'integration',
      provider: 'conformance',
      agentRunId: 'integration-1',
      sessionId: 'orchestrator-1',
      hostId: 'host-1',
      pid: 456,
    },
  };
  const handed = await store.handoff(handoffRequest);
  assert.equal(handed.state, 'active');
  assert.equal(handed.leaseId, acquired.leaseId);
  assert.equal(handed.holder.worktreeId, acquired.holder.worktreeId);
  assert.ok(BigInt(handed.fencingToken) > BigInt(acquired.fencingToken));
  assert.deepEqual(await store.handoff(handoffRequest), handed);
  await expectCode(
    () =>
      store.verify({
        projectId,
        leaseId: acquired.leaseId,
        fencingToken: acquired.fencingToken,
        operation: 'review-mutation',
        verifiedAt: requestedAt,
      }),
    'fence-stale'
  );

  const releaseRequest = {
    projectId,
    leaseId: handed.leaseId,
    fencingToken: handed.fencingToken,
    idempotencyKey: 'conformance-release',
    releasedAt: '2026-07-30T12:03:00.000Z',
    reason: 'conformance complete',
  };
  const released = await store.release(releaseRequest);
  assert.deepEqual(await store.release(releaseRequest), released);
  assert.equal(await store.observe({ projectId, issueId: request.issueId }), null);

  const switchStore = await createStore();
  const switchCurrent = await switchStore.acquire(
    acquireRequest({ idempotencyKey: 'switch-base' })
  );
  await expectCode(
    () =>
      switchStore.switchLease({
        projectId,
        issueId: '999',
        leaseId: switchCurrent.leaseId,
        fencingToken: switchCurrent.fencingToken,
        idempotencyKey: 'wrong-switch-source',
        switchedAt: '2026-07-30T12:03:30.000Z',
        target: acquireRequest({
          issueId: '1051',
          idempotencyKey: 'wrong-switch-target',
        }),
      }),
    'lease-not-held'
  );
  assert.equal(
    (
      await switchStore.verify({
        projectId,
        leaseId: switchCurrent.leaseId,
        fencingToken: switchCurrent.fencingToken,
        operation: 'task-bind',
        verifiedAt: requestedAt,
      })
    ).allowed,
    true,
    'source-issue mismatch preserves the outgoing lease'
  );
  const switchRequest = {
    projectId,
    issueId: '1049',
    leaseId: switchCurrent.leaseId,
    fencingToken: switchCurrent.fencingToken,
    idempotencyKey: 'conformance-switch',
    switchedAt: '2026-07-30T12:04:00.000Z',
    target: acquireRequest({ issueId: '1051', idempotencyKey: 'switch-target' }),
  };
  const switched = await switchStore.switchLease(switchRequest);
  assert.equal(switched.lease.issueId, '1051');
  assert.equal(switched.transition.fromIssueId, '1049');
  assert.deepEqual(await switchStore.switchLease(switchRequest), switched);
  await expectCode(
    () =>
      switchStore.verify({
        projectId,
        leaseId: switchCurrent.leaseId,
        fencingToken: switchCurrent.fencingToken,
        operation: 'task-bind',
        verifiedAt: requestedAt,
      }),
    'fence-stale'
  );

  const failedSwitchStore = await createStore();
  const preserved = await failedSwitchStore.acquire(
    acquireRequest({ idempotencyKey: 'preserved-base' })
  );
  const otherHolder = {
    ...baseHolder,
    agentRunId: 'run-2',
    sessionId: 'session-2',
    worktreeId: 'wt:v1:other',
    pathHash: 'path-other',
    pid: 456,
  };
  const blocker = await failedSwitchStore.acquire(
    acquireRequest({
      issueId: '1051',
      idempotencyKey: 'switch-blocker',
      holder: otherHolder,
    })
  );
  const failedSwitchRequest = {
    projectId,
    issueId: '1049',
    leaseId: preserved.leaseId,
    fencingToken: preserved.fencingToken,
    idempotencyKey: 'failed-switch',
    switchedAt: '2026-07-30T12:05:00.000Z',
    target: acquireRequest({ issueId: '1051', idempotencyKey: 'failed-target' }),
  };
  await expectCode(() => failedSwitchStore.switchLease(failedSwitchRequest), 'lease-contended');
  assert.equal(
    (
      await failedSwitchStore.verify({
        projectId,
        leaseId: preserved.leaseId,
        fencingToken: preserved.fencingToken,
        operation: 'task-bind',
        verifiedAt: requestedAt,
      })
    ).allowed,
    true
  );
  await failedSwitchStore.release({
    projectId,
    leaseId: blocker.leaseId,
    fencingToken: blocker.fencingToken,
    idempotencyKey: 'release-blocker',
    releasedAt: '2026-07-30T12:06:00.000Z',
    reason: 'unblock issue',
  });
  await expectCode(() => failedSwitchStore.switchLease(failedSwitchRequest), 'lease-contended');

  const takeoverStore = await createStore();
  const observed = await takeoverStore.acquire(acquireRequest({ idempotencyKey: 'takeover-base' }));
  const takeoverRequest = {
    projectId,
    issueId: observed.issueId,
    expectedLeaseId: observed.leaseId,
    expectedToken: observed.fencingToken,
    idempotencyKey: 'conformance-takeover',
    observedAt: '2026-07-30T12:07:00.000Z',
    reason: 'holder confirmed dead',
    requester: {
      ...baseHolder,
      agentRunId: 'run-3',
      sessionId: 'session-3',
      pid: 789,
    },
    evidence: {
      kind: 'local-process-dead',
      hostId: 'host-1',
      pid: 123,
      checkedAt: '2026-07-30T12:07:00.000Z',
      detailsHash: 'dead-proof',
    },
  };
  const taken = await takeoverStore.takeover(takeoverRequest);
  assert.notEqual(taken.leaseId, observed.leaseId);
  assert.ok(BigInt(taken.fencingToken) > BigInt(observed.fencingToken));
  assert.deepEqual(await takeoverStore.takeover(takeoverRequest), taken);
  await expectCode(
    () =>
      takeoverStore.verify({
        projectId,
        leaseId: observed.leaseId,
        fencingToken: observed.fencingToken,
        operation: 'task-bind',
        verifiedAt: requestedAt,
      }),
    'fence-stale'
  );

  const uniquenessStore = await createStore();
  const unique = await uniquenessStore.acquire(acquireRequest({ idempotencyKey: 'unique-base' }));
  await expectCode(
    () =>
      uniquenessStore.acquire(
        acquireRequest({
          idempotencyKey: 'same-issue',
          holder: { ...baseHolder, agentRunId: 'run-4', sessionId: 'session-4', pid: 999 },
        })
      ),
    'lease-contended'
  );
  await expectCode(
    () =>
      uniquenessStore.acquire(
        acquireRequest({
          issueId: '1051',
          idempotencyKey: 'same-worktree',
          holder: { ...baseHolder, agentRunId: 'run-5', sessionId: 'session-5', pid: 1000 },
        })
      ),
    'worktree-contended'
  );
  assert.equal(unique.state, 'active');
}
