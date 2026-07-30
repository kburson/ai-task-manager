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
    validate(request);
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
      return clone(previous.result);
    }
    const result = apply();
    this.#idempotency.set(scope, { operation, digest, result: clone(result) });
    return clone(result);
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
  const store = await createStore();
  const requestedAt = '2026-07-30T12:00:00.000Z';
  const request = {
    projectId: 'conformance-project',
    issueId: '1049',
    mode: 'write',
    idempotencyKey: 'conformance-acquire',
    requestedAt,
    ttlMs: 900_000,
    holder: {
      principalKind: 'worker',
      provider: 'conformance',
      agentRunId: 'run-1',
      sessionId: 'session-1',
      hostId: 'host-1',
      worktreeId: 'wt:v1:conformance',
      pathHash: 'path-conformance',
      branch: 'feature/conformance',
      pid: 123,
    },
  };
  const acquired = await store.acquire(request);
  assert.deepEqual(await store.acquire(request), acquired);
  assert.deepEqual(
    await store.observe({ projectId: request.projectId, issueId: request.issueId }),
    acquired
  );
  assert.equal(
    (
      await store.verify({
        projectId: request.projectId,
        leaseId: acquired.leaseId,
        fencingToken: acquired.fencingToken,
        operation: 'task-bind',
        verifiedAt: requestedAt,
      })
    ).allowed,
    true
  );
  const releaseRequest = {
    projectId: request.projectId,
    leaseId: acquired.leaseId,
    fencingToken: acquired.fencingToken,
    idempotencyKey: 'conformance-release',
    releasedAt: requestedAt,
    reason: 'conformance complete',
  };
  const released = await store.release(releaseRequest);
  assert.deepEqual(await store.release(releaseRequest), released);
  assert.equal(
    await store.observe({ projectId: request.projectId, issueId: request.issueId }),
    null
  );
}
