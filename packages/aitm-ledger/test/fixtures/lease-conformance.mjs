import { WorkLeaseStore } from '../../src/lease/port.mjs';
import { createHash } from 'node:crypto';
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
  #bindings = new Map();
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

  #bindingFor(lease) {
    return this.#bindings.get(lease.leaseId);
  }

  #assertAuthority(lease, request) {
    if (JSON.stringify(lease.holder) !== JSON.stringify(request.holder)) {
      throw new WorkLeaseError('lease-not-held', 'lease holder does not match');
    }
    const binding = this.#bindingFor(lease);
    for (const key of ['sessionId', 'issueId', 'worktreeId']) {
      if (binding?.[key] !== request.binding[key]) {
        throw new WorkLeaseError('lease-not-held', 'lease binding does not match');
      }
    }
    if (binding.displayPath !== null && binding.displayPath !== request.binding.displayPath) {
      throw new WorkLeaseError('lease-not-held', 'lease binding path does not match');
    }
    if (binding.displayPath === null && request.binding.displayPath !== null) {
      binding.displayPath = request.binding.displayPath;
    }
    return binding;
  }

  #lease(request, { activeOnly = false } = {}) {
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
    if (activeOnly && lease.state !== 'active') {
      throw new WorkLeaseError('lease-not-held', 'lease is not active', {
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
    this.#bindings.set(lease.leaseId, {
      projectId: lease.projectId,
      leaseId: lease.leaseId,
      ...clone(request.binding),
      fencingToken: lease.fencingToken,
      observedAt: acquiredAt,
    });
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
      this.#assertAuthority(lease, request);
      const expectedState = request.lifecycle?.expectedState ?? 'active';
      const nextState = request.lifecycle?.nextState ?? 'active';
      if (lease.state !== expectedState) {
        throw new WorkLeaseError('lease-not-held', 'lease state does not match');
      }
      lease.state = nextState;
      lease.heartbeatAt = request.requestedAt;
      lease.expiresAt = expiresAt(request.requestedAt, request.ttlMs);
      const binding = this.#bindingFor(lease);
      binding.observedAt = request.requestedAt;
      return lease;
    });
  }

  verify(request) {
    validateVerifyRequest(request);
    const lease = this.#lease(request, { activeOnly: true });
    this.#assertAuthority(lease, request);
    return { allowed: true, lease: clone(lease) };
  }

  switchLease(request) {
    return this.#mutate('switch', request, validateSwitchLeaseRequest, () => {
      const current = this.#lease(request);
      this.#assertAuthority(current, request);
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
      const binding = this.#assertAuthority(lease, request);
      const priorHolder = lease.holder;
      const priorToken = lease.fencingToken;
      lease.fencingToken = this.#nextFence();
      lease.holder = clone(request.recipient);
      lease.state = 'active';
      lease.heartbeatAt = request.handedOffAt;
      lease.expiresAt = expiresAt(request.handedOffAt, request.ttlMs);
      binding.sessionId = request.recipient.sessionId;
      binding.fencingToken = lease.fencingToken;
      binding.observedAt = request.handedOffAt;
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
      this.#assertAuthority(lease, request);
      lease.fencingToken = this.#nextFence();
      lease.state = 'released';
      lease.audit = {
        ...lease.audit,
        releasedAt: request.releasedAt,
        reason: request.reason,
      };
      this.#bindings.delete(lease.leaseId);
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
      if (JSON.stringify(observed.holder) !== JSON.stringify(request.expectedHolder)) {
        throw new WorkLeaseError('lease-not-held', 'expected holder does not match');
      }
      const observedBinding = this.#bindingFor(observed);
      for (const key of ['sessionId', 'issueId', 'worktreeId', 'displayPath']) {
        if (observedBinding?.[key] !== request.expectedBinding[key]) {
          throw new WorkLeaseError('lease-not-held', 'expected binding does not match');
        }
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
      this.#bindings.delete(observed.leaseId);
      return this.#newLease(
        {
          projectId: request.projectId,
          issueId: request.issueId,
          mode: 'write',
          idempotencyKey: request.idempotencyKey,
          requestedAt: request.observedAt,
          ttlMs: request.ttlMs,
          holder: request.requester,
          binding: request.requesterBinding,
        },
        { acquiredAt: request.observedAt }
      );
    });
  }

  observe(selector) {
    validateObserveSelector(selector);
    if (selector.issueId == null && selector.worktreeId == null) {
      const leases = [...this.#leases.values()]
        .filter((lease) => lease.projectId === selector.projectId && this.#retains(lease))
        .sort((a, b) => a.leaseId.localeCompare(b.leaseId));
      const bindings = leases.map((lease) => this.#bindingFor(lease));
      if (bindings.some((binding) => !binding)) {
        throw new WorkLeaseError('authority-unavailable', 'retaining lease has no binding');
      }
      return {
        leases: clone(leases),
        bindings: clone(bindings),
      };
    }
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
  const displayPath = '/workspace/conformance';
  const baseHolder = {
    principalKind: 'worker',
    provider: 'conformance',
    agentRunId: 'run-1',
    sessionId: 'session-1',
    hostId: 'host-1',
    worktreeId: 'wt:v1:conformance',
    pathHash: createHash('sha256').update(displayPath).digest('hex'),
    branch: 'feature/conformance',
    pid: 123,
  };
  const acquireRequest = ({
    issueId = '1049',
    idempotencyKey = 'conformance-acquire',
    holder = baseHolder,
    bindingPath = displayPath,
  } = {}) => {
    return {
      projectId,
      issueId,
      mode: 'write',
      idempotencyKey,
      requestedAt,
      ttlMs: 900_000,
      holder,
      binding: {
        sessionId: holder.sessionId,
        issueId,
        worktreeId: holder.worktreeId,
        displayPath: bindingPath,
      },
    };
  };
  const bindingOf = (lease, path = displayPath) => ({
    sessionId: lease.holder.sessionId,
    issueId: lease.issueId,
    worktreeId: lease.holder.worktreeId,
    displayPath: path,
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
  await expectCode(
    () =>
      store.acquire({
        ...request,
        issueId: '1051',
        binding: { ...request.binding, issueId: '1051' },
      }),
    'idempotency-conflict'
  );
  assert.deepEqual(await store.observe({ projectId, issueId: request.issueId }), acquired);
  assert.equal(
    (
      await store.verify({
        projectId,
        leaseId: acquired.leaseId,
        fencingToken: acquired.fencingToken,
        operation: 'task-bind',
        verifiedAt: requestedAt,
        holder: acquired.holder,
        binding: bindingOf(acquired),
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
    lifecycle: { expectedState: 'active', nextState: 'active' },
    ttlMs: 900_000,
    holder: acquired.holder,
    binding: bindingOf(acquired),
  };
  const renewed = await store.renew(renewRequest);
  assert.equal(renewed.fencingToken, acquired.fencingToken);
  assert.deepEqual(await store.renew(renewRequest), renewed);
  await expectCode(
    () =>
      store.renew({
        ...renewRequest,
        idempotencyKey: 'foreign-renew',
        holder: { ...renewed.holder, pid: renewed.holder.pid + 1 },
      }),
    'lease-not-held'
  );
  assert.deepEqual(await store.observe({ projectId, issueId: request.issueId }), renewed);

  const paused = await store.renew({
    ...renewRequest,
    idempotencyKey: 'conformance-pause',
    requestedAt: '2026-07-30T12:01:10.000Z',
    lifecycle: { expectedState: 'active', nextState: 'paused' },
    ttlMs: 86_400_000,
  });
  assert.equal(paused.state, 'paused');
  await expectCode(
    () =>
      store.verify({
        projectId,
        leaseId: paused.leaseId,
        fencingToken: paused.fencingToken,
        operation: 'task-bind',
        verifiedAt: '2026-07-30T12:01:15.000Z',
        holder: paused.holder,
        binding: bindingOf(paused),
      }),
    'lease-not-held'
  );
  const projectObservation = await store.observe({ projectId });
  assert.deepEqual(projectObservation.leases, [paused]);
  assert.equal(projectObservation.bindings.length, 1);
  assert.equal(projectObservation.bindings[0].leaseId, paused.leaseId);
  const resumed = await store.renew({
    ...renewRequest,
    idempotencyKey: 'conformance-resume',
    requestedAt: '2026-07-30T12:01:20.000Z',
    lifecycle: { expectedState: 'paused', nextState: 'active' },
  });
  assert.equal(resumed.state, 'active');

  const handoffRequest = {
    projectId,
    leaseId: acquired.leaseId,
    fencingToken: acquired.fencingToken,
    idempotencyKey: 'conformance-handoff',
    handedOffAt: '2026-07-30T12:02:00.000Z',
    reason: 'integration',
    ttlMs: 900_000,
    holder: resumed.holder,
    binding: bindingOf(resumed),
    recipient: {
      principalKind: 'integration',
      provider: 'conformance',
      agentRunId: 'integration-1',
      sessionId: 'orchestrator-1',
      hostId: 'host-1',
      worktreeId: resumed.holder.worktreeId,
      pathHash: resumed.holder.pathHash,
      branch: resumed.holder.branch,
      pid: 456,
    },
  };
  await expectCode(
    () =>
      store.handoff({
        ...handoffRequest,
        idempotencyKey: 'foreign-handoff',
        recipient: { ...handoffRequest.recipient, worktreeId: 'wt:v1:replacement' },
      }),
    'invalid-request'
  );
  assert.deepEqual(await store.observe({ projectId, issueId: request.issueId }), resumed);
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
        holder: acquired.holder,
        binding: bindingOf(acquired),
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
    holder: handed.holder,
    binding: bindingOf(handed),
  };
  await expectCode(
    () =>
      store.release({
        ...releaseRequest,
        idempotencyKey: 'foreign-release',
        holder: { ...handed.holder, pid: handed.holder.pid + 1 },
      }),
    'lease-not-held'
  );
  assert.deepEqual(await store.observe({ projectId, issueId: request.issueId }), handed);
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
        holder: switchCurrent.holder,
        binding: { ...bindingOf(switchCurrent), issueId: '999' },
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
        holder: switchCurrent.holder,
        binding: bindingOf(switchCurrent),
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
    holder: switchCurrent.holder,
    binding: bindingOf(switchCurrent),
    idempotencyKey: 'conformance-switch',
    switchedAt: '2026-07-30T12:04:00.000Z',
    target: acquireRequest({ issueId: '1051', idempotencyKey: 'switch-target' }),
  };
  await expectCode(
    () =>
      switchStore.switchLease({
        ...switchRequest,
        idempotencyKey: 'foreign-switch-source',
        holder: { ...switchCurrent.holder, pid: switchCurrent.holder.pid + 1 },
      }),
    'lease-not-held'
  );
  assert.deepEqual(
    await switchStore.observe({ projectId, issueId: switchCurrent.issueId }),
    switchCurrent
  );
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
        holder: switchCurrent.holder,
        binding: bindingOf(switchCurrent),
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
    pathHash: createHash('sha256').update('/workspace/other').digest('hex'),
    pid: 456,
  };
  const blocker = await failedSwitchStore.acquire(
    acquireRequest({
      issueId: '1051',
      idempotencyKey: 'switch-blocker',
      holder: otherHolder,
      bindingPath: '/workspace/other',
    })
  );
  const failedSwitchRequest = {
    projectId,
    issueId: '1049',
    leaseId: preserved.leaseId,
    fencingToken: preserved.fencingToken,
    holder: preserved.holder,
    binding: bindingOf(preserved),
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
        holder: preserved.holder,
        binding: bindingOf(preserved),
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
    holder: blocker.holder,
    binding: bindingOf(blocker, '/workspace/other'),
  });
  await expectCode(() => failedSwitchStore.switchLease(failedSwitchRequest), 'lease-contended');

  const takeoverStore = await createStore();
  const observed = await takeoverStore.acquire(acquireRequest({ idempotencyKey: 'takeover-base' }));
  const takeoverRequest = {
    projectId,
    issueId: observed.issueId,
    expectedLeaseId: observed.leaseId,
    expectedToken: observed.fencingToken,
    expectedHolder: observed.holder,
    expectedBinding: bindingOf(observed),
    idempotencyKey: 'conformance-takeover',
    observedAt: '2026-07-30T12:07:00.000Z',
    reason: 'holder confirmed dead',
    requester: {
      ...baseHolder,
      agentRunId: 'run-3',
      sessionId: 'session-3',
      pid: 789,
    },
    requesterBinding: {
      sessionId: 'session-3',
      issueId: observed.issueId,
      worktreeId: baseHolder.worktreeId,
      displayPath,
    },
    ttlMs: 900_000,
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
        holder: observed.holder,
        binding: bindingOf(observed),
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
