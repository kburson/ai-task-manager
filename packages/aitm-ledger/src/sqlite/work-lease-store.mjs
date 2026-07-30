import { randomUUID } from 'node:crypto';

import { WorkLeaseError } from '../lease/errors.mjs';
import { WorkLeaseStore } from '../lease/port.mjs';
import {
  OWNERSHIP_RETAINING_STATES,
  canonicalRequestDigest,
  canonicalRequestJson,
  validateAcquireRequest,
  validateHandoffRequest,
  validateObserveSelector,
  validateReleaseRequest,
  validateRenewRequest,
  validateSwitchLeaseRequest,
  validateTakeoverRequest,
  validateVerifyRequest,
} from '../lease/schema.mjs';

const RETAINING_SQL = "('active','paused')";

function parseJson(value, fallback = {}) {
  try {
    return value ? JSON.parse(value) : fallback;
  } catch {
    return fallback;
  }
}

function asToken(value) {
  return String(value);
}

function readBigInt(statement) {
  statement.setReadBigInts?.(true);
  return statement;
}

function statusFor(code) {
  if (code === 'invalid-request') return 400;
  if (code === 'authority-unauthenticated') return 401;
  if (code === 'authority-forbidden') return 403;
  if (
    ['lease-contended', 'worktree-contended', 'holder-live', 'idempotency-conflict'].includes(code)
  ) {
    return 409;
  }
  if (['fence-stale', 'lease-not-held'].includes(code)) return 412;
  return 503;
}

function isoAfter(timestamp, ttlMs) {
  return new Date(Date.parse(timestamp) + ttlMs).toISOString();
}

function rowToLease(row) {
  if (!row) return null;
  return {
    projectId: row.project_id,
    issueId: row.issue_id,
    mode: row.mode,
    leaseId: row.lease_id,
    fencingToken: asToken(row.fencing_token),
    state: row.state,
    holder: {
      principalKind: row.principal_kind,
      provider: row.provider,
      agentRunId: row.agent_run_id,
      sessionId: row.session_id,
      hostId: row.host_id,
      worktreeId: row.worktree_id,
      pathHash: row.path_hash,
      branch: row.branch,
      pid: Number(row.pid),
    },
    acquiredAt: row.acquired_at,
    heartbeatAt: row.heartbeat_at,
    expiresAt: row.expires_at,
    audit: parseJson(row.audit_json),
  };
}

export class SqliteWorkLeaseStore extends WorkLeaseStore {
  constructor({ db, isHolderLive = () => false, uuid = randomUUID, now = () => new Date() } = {}) {
    super();
    if (!db) throw new WorkLeaseError('invalid-request', 'db is required');
    this.db = db;
    this.isHolderLive = isHolderLive;
    this.uuid = uuid;
    this.now = now;
  }

  close() {
    this.db.close();
  }

  #retaining(lease) {
    return lease && OWNERSHIP_RETAINING_STATES.includes(lease.state);
  }

  #eventFor(projectId, idempotencyKey) {
    return this.db
      .prepare(
        `SELECT operation, request_digest, response_json, error_json, status_code
           FROM work_lease_events
          WHERE project_id = ? AND idempotency_key = ?`
      )
      .get(projectId, idempotencyKey);
  }

  #replay(event) {
    if (event.error_json) {
      const error = parseJson(event.error_json);
      throw new WorkLeaseError(error.code, error.message, error.details);
    }
    return parseJson(event.response_json, null);
  }

  #insertEvent({ operation, request, digest, result, error, event = {} }) {
    const actor = request.holder || request.requester || request.recipient || null;
    this.db
      .prepare(
        `INSERT INTO work_lease_events(
           event_id, project_id, lease_id, event_type, operation,
           idempotency_key, request_digest, response_json, error_json,
           status_code, actor_json, reason, prior_token, new_token,
           canonical_json, created_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        this.uuid(),
        request.projectId,
        event.leaseId || request.leaseId || request.expectedLeaseId || result?.leaseId || null,
        event.type || (error ? `${operation}-rejected` : operation),
        operation,
        request.idempotencyKey,
        digest,
        error ? null : JSON.stringify(result),
        error ? JSON.stringify(error.toJSON().error) : null,
        error ? statusFor(error.code) : event.statusCode || 200,
        actor ? JSON.stringify(actor) : null,
        request.reason || event.reason || null,
        event.priorToken != null ? BigInt(event.priorToken) : null,
        event.newToken != null ? BigInt(event.newToken) : null,
        canonicalRequestJson(request),
        event.createdAt || this.now().toISOString()
      );
  }

  #mutate(operation, request, validate, apply) {
    const hasEnvelope =
      request &&
      typeof request === 'object' &&
      !Array.isArray(request) &&
      typeof request.projectId === 'string' &&
      request.projectId.trim() !== '' &&
      typeof request.idempotencyKey === 'string' &&
      request.idempotencyKey.trim() !== '';
    if (!hasEnvelope) {
      validate(request);
      throw new WorkLeaseError('invalid-request', 'mutating request lacks idempotency envelope');
    }

    const digest = canonicalRequestDigest(request);
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const prior = this.#eventFor(request.projectId, request.idempotencyKey);
      if (prior) {
        if (prior.operation !== operation || prior.request_digest !== digest) {
          this.db.exec('COMMIT');
          throw new WorkLeaseError(
            'idempotency-conflict',
            'idempotency key was reused for a different request',
            {
              projectId: request.projectId,
              idempotencyKey: request.idempotencyKey,
              operation,
            }
          );
        }
        const replay = this.#replay.bind(this, prior);
        this.db.exec('COMMIT');
        return replay();
      }

      this.db.exec('SAVEPOINT lease_effect');
      try {
        validate(request);
        const applied = apply();
        this.#insertEvent({
          operation,
          request,
          digest,
          result: applied.result,
          event: applied.event,
        });
        this.db.exec('RELEASE lease_effect');
        this.db.exec('COMMIT');
        return structuredClone(applied.result);
      } catch (error) {
        this.db.exec('ROLLBACK TO lease_effect');
        this.db.exec('RELEASE lease_effect');
        if (error instanceof WorkLeaseError && error.code !== 'authority-unavailable') {
          this.#insertEvent({ operation, request, digest, error });
          this.db.exec('COMMIT');
          throw error;
        }
        this.db.exec('ROLLBACK');
        if (error instanceof WorkLeaseError) throw error;
        throw new WorkLeaseError('authority-unavailable', 'SQLite lease authority failed', {
          operation,
          cause: error?.message,
        });
      }
    } catch (error) {
      try {
        this.db.exec('ROLLBACK');
      } catch {
        // The successful/rejected path may already have committed.
      }
      throw error;
    }
  }

  #allocateFence(projectId) {
    this.db
      .prepare(
        `INSERT INTO lease_fences(project_id, current_token)
         VALUES (?, 0)
         ON CONFLICT(project_id) DO NOTHING`
      )
      .run(projectId);
    const statement = readBigInt(
      this.db.prepare(
        `UPDATE lease_fences
            SET current_token = current_token + 1
          WHERE project_id = ?
          RETURNING current_token`
      )
    );
    return asToken(statement.get(projectId).current_token);
  }

  #rowById(leaseId) {
    const statement = readBigInt(this.db.prepare('SELECT * FROM work_leases WHERE lease_id = ?'));
    return statement.get(leaseId);
  }

  #lease(request) {
    const lease = rowToLease(this.#rowById(request.leaseId));
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
    if (!this.#retaining(lease)) {
      throw new WorkLeaseError('lease-not-held', 'lease is terminal', {
        leaseId: request.leaseId,
        state: lease.state,
      });
    }
    return lease;
  }

  #currentByIssue(projectId, issueId, exceptLeaseId = null) {
    const statement = readBigInt(
      this.db.prepare(
        `SELECT * FROM work_leases
          WHERE project_id = ? AND issue_id = ?
            AND state IN ${RETAINING_SQL}
            AND (? IS NULL OR lease_id <> ?)
          LIMIT 1`
      )
    );
    return rowToLease(statement.get(projectId, issueId, exceptLeaseId, exceptLeaseId));
  }

  #currentByWorktree(projectId, worktreeId, exceptLeaseId = null) {
    const statement = readBigInt(
      this.db.prepare(
        `SELECT * FROM work_leases
          WHERE project_id = ? AND worktree_id = ?
            AND state IN ${RETAINING_SQL}
            AND (? IS NULL OR lease_id <> ?)
          LIMIT 1`
      )
    );
    return rowToLease(statement.get(projectId, worktreeId, exceptLeaseId, exceptLeaseId));
  }

  #assertAvailable(projectId, issueId, worktreeId, exceptLeaseId = null) {
    const issueLease = this.#currentByIssue(projectId, issueId, exceptLeaseId);
    if (issueLease) {
      throw new WorkLeaseError('lease-contended', 'issue already has a write lease', {
        issueId,
        holder: issueLease.holder,
        leaseId: issueLease.leaseId,
        state: issueLease.state,
      });
    }
    const worktreeLease = this.#currentByWorktree(projectId, worktreeId, exceptLeaseId);
    if (worktreeLease) {
      throw new WorkLeaseError('worktree-contended', 'worktree already has a write lease', {
        worktreeId,
        holder: worktreeLease.holder,
        leaseId: worktreeLease.leaseId,
        state: worktreeLease.state,
      });
    }
  }

  #insertLease(request, acquiredAt = request.requestedAt) {
    const lease = {
      projectId: request.projectId,
      issueId: request.issueId,
      mode: 'write',
      leaseId: this.uuid(),
      fencingToken: this.#allocateFence(request.projectId),
      state: 'active',
      holder: structuredClone(request.holder),
      acquiredAt,
      heartbeatAt: acquiredAt,
      expiresAt: isoAfter(acquiredAt, request.ttlMs),
      audit: {},
    };
    this.db
      .prepare(
        `INSERT INTO work_leases(
           lease_id, project_id, issue_id, mode, fencing_token, state,
           principal_kind, provider, agent_run_id, session_id, host_id,
           worktree_id, path_hash, branch, pid, acquired_at, heartbeat_at,
           expires_at, audit_json
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        lease.leaseId,
        lease.projectId,
        lease.issueId,
        lease.mode,
        BigInt(lease.fencingToken),
        lease.state,
        lease.holder.principalKind,
        lease.holder.provider,
        lease.holder.agentRunId,
        lease.holder.sessionId,
        lease.holder.hostId,
        lease.holder.worktreeId,
        lease.holder.pathHash,
        lease.holder.branch,
        lease.holder.pid,
        lease.acquiredAt,
        lease.heartbeatAt,
        lease.expiresAt,
        JSON.stringify(lease.audit)
      );
    this.#writeBinding(lease, acquiredAt);
    return lease;
  }

  #writeBinding(lease, observedAt) {
    this.db
      .prepare(
        `INSERT INTO work_bindings(
           project_id, session_id, issue_id, worktree_id, lease_id,
           fencing_token, observed_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(project_id, session_id) DO UPDATE SET
           issue_id = excluded.issue_id,
           worktree_id = excluded.worktree_id,
           lease_id = excluded.lease_id,
           fencing_token = excluded.fencing_token,
           observed_at = excluded.observed_at`
      )
      .run(
        lease.projectId,
        lease.holder.sessionId,
        lease.issueId,
        lease.holder.worktreeId,
        lease.leaseId,
        BigInt(lease.fencingToken),
        observedAt
      );
  }

  acquire(request) {
    return this.#mutate('acquire', request, validateAcquireRequest, () => {
      this.#assertAvailable(request.projectId, request.issueId, request.holder.worktreeId);
      const lease = this.#insertLease(request);
      return {
        result: lease,
        event: {
          type: 'acquired',
          leaseId: lease.leaseId,
          newToken: lease.fencingToken,
          createdAt: request.requestedAt,
          statusCode: 201,
        },
      };
    });
  }

  renew(request) {
    return this.#mutate('renew', request, validateRenewRequest, () => {
      const lease = this.#lease(request);
      const expiresAt = isoAfter(request.requestedAt, request.ttlMs);
      this.db
        .prepare('UPDATE work_leases SET heartbeat_at = ?, expires_at = ? WHERE lease_id = ?')
        .run(request.requestedAt, expiresAt, lease.leaseId);
      const result = {
        ...lease,
        heartbeatAt: request.requestedAt,
        expiresAt,
      };
      this.#writeBinding(result, request.requestedAt);
      return {
        result,
        event: {
          type: 'renewed',
          leaseId: lease.leaseId,
          priorToken: lease.fencingToken,
          newToken: lease.fencingToken,
          createdAt: request.requestedAt,
        },
      };
    });
  }

  verify(request) {
    validateVerifyRequest(request);
    return { allowed: true, lease: this.#lease(request) };
  }

  switchLease(request) {
    return this.#mutate('switch', request, validateSwitchLeaseRequest, () => {
      const current = this.#lease(request);
      this.#assertAvailable(
        request.projectId,
        request.target.issueId,
        request.target.holder.worktreeId,
        current.leaseId
      );
      const supersededToken = this.#allocateFence(request.projectId);
      this.db
        .prepare(
          `UPDATE work_leases
              SET fencing_token = ?, state = 'superseded',
                  audit_json = ?
            WHERE lease_id = ?`
        )
        .run(
          BigInt(supersededToken),
          JSON.stringify({
            ...current.audit,
            supersededAt: request.switchedAt,
            reason: 'issue-switch',
          }),
          current.leaseId
        );
      this.db
        .prepare('DELETE FROM work_bindings WHERE project_id = ? AND lease_id = ?')
        .run(request.projectId, current.leaseId);
      const lease = this.#insertLease(request.target, request.switchedAt);
      const transition = {
        transitionId: this.uuid(),
        fromIssueId: current.issueId,
        fromLeaseId: current.leaseId,
        fromToken: current.fencingToken,
        toIssueId: lease.issueId,
      };
      return {
        result: { lease, transition },
        event: {
          type: 'switched',
          leaseId: lease.leaseId,
          priorToken: current.fencingToken,
          newToken: lease.fencingToken,
          createdAt: request.switchedAt,
        },
      };
    });
  }

  handoff(request) {
    return this.#mutate('handoff', request, validateHandoffRequest, () => {
      const lease = this.#lease(request);
      const token = this.#allocateFence(request.projectId);
      const holder = {
        ...structuredClone(request.recipient),
        worktreeId: lease.holder.worktreeId,
        pathHash: lease.holder.pathHash,
        branch: lease.holder.branch,
      };
      const audit = {
        ...lease.audit,
        handedOffAt: request.handedOffAt,
        handedOffBy: lease.holder,
        handedOffTo: request.recipient,
        priorToken: lease.fencingToken,
        reason: request.reason,
      };
      this.db
        .prepare(
          `UPDATE work_leases SET
             fencing_token = ?, principal_kind = ?, provider = ?,
             agent_run_id = ?, session_id = ?, host_id = ?, pid = ?,
             heartbeat_at = ?, audit_json = ?
           WHERE lease_id = ?`
        )
        .run(
          BigInt(token),
          holder.principalKind,
          holder.provider,
          holder.agentRunId,
          holder.sessionId,
          holder.hostId,
          holder.pid,
          request.handedOffAt,
          JSON.stringify(audit),
          lease.leaseId
        );
      this.db
        .prepare('DELETE FROM work_bindings WHERE project_id = ? AND lease_id = ?')
        .run(request.projectId, lease.leaseId);
      const result = {
        ...lease,
        fencingToken: token,
        holder,
        heartbeatAt: request.handedOffAt,
        audit,
      };
      this.#writeBinding(result, request.handedOffAt);
      return {
        result,
        event: {
          type: 'handed-off',
          leaseId: lease.leaseId,
          priorToken: lease.fencingToken,
          newToken: token,
          createdAt: request.handedOffAt,
        },
      };
    });
  }

  release(request) {
    return this.#mutate('release', request, validateReleaseRequest, () => {
      const lease = this.#lease(request);
      const token = this.#allocateFence(request.projectId);
      const audit = {
        ...lease.audit,
        releasedAt: request.releasedAt,
        reason: request.reason,
      };
      this.db
        .prepare(
          `UPDATE work_leases
              SET fencing_token = ?, state = 'released', audit_json = ?
            WHERE lease_id = ?`
        )
        .run(BigInt(token), JSON.stringify(audit), lease.leaseId);
      this.db
        .prepare('DELETE FROM work_bindings WHERE project_id = ? AND lease_id = ?')
        .run(request.projectId, lease.leaseId);
      const result = { ...lease, fencingToken: token, state: 'released', audit };
      return {
        result,
        event: {
          type: 'released',
          leaseId: lease.leaseId,
          priorToken: lease.fencingToken,
          newToken: token,
          createdAt: request.releasedAt,
        },
      };
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
      if (this.isHolderLive(observed.holder, request.evidence) === true) {
        throw new WorkLeaseError('holder-live', 'live holder cannot be displaced', {
          leaseId: observed.leaseId,
          holder: observed.holder,
        });
      }
      if (
        request.evidence.kind === 'local-process-dead' &&
        (request.evidence.hostId !== observed.holder.hostId ||
          request.evidence.pid !== observed.holder.pid)
      ) {
        throw new WorkLeaseError(
          'invalid-request',
          'local-process-dead evidence does not identify the holder'
        );
      }
      if (
        request.evidence.kind === 'remote-expired' &&
        Date.parse(observed.expiresAt) > Date.parse(request.observedAt)
      ) {
        throw new WorkLeaseError('invalid-request', 'remote-expired evidence predates expiry');
      }
      this.#assertAvailable(
        request.projectId,
        request.issueId,
        request.requester.worktreeId,
        observed.leaseId
      );
      const supersededToken = this.#allocateFence(request.projectId);
      this.db
        .prepare(
          `UPDATE work_leases
              SET fencing_token = ?, state = 'superseded', audit_json = ?
            WHERE lease_id = ?`
        )
        .run(
          BigInt(supersededToken),
          JSON.stringify({
            ...observed.audit,
            supersededAt: request.observedAt,
            reason: request.reason,
            evidence: request.evidence,
          }),
          observed.leaseId
        );
      this.db
        .prepare('DELETE FROM work_bindings WHERE project_id = ? AND lease_id = ?')
        .run(request.projectId, observed.leaseId);
      const lease = this.#insertLease(
        {
          projectId: request.projectId,
          issueId: request.issueId,
          mode: 'write',
          idempotencyKey: request.idempotencyKey,
          requestedAt: request.observedAt,
          ttlMs: 900_000,
          holder: request.requester,
        },
        request.observedAt
      );
      return {
        result: lease,
        event: {
          type: 'taken-over',
          leaseId: lease.leaseId,
          priorToken: observed.fencingToken,
          newToken: lease.fencingToken,
          createdAt: request.observedAt,
        },
      };
    });
  }

  observe(selector) {
    validateObserveSelector(selector);
    return selector.issueId != null
      ? this.#currentByIssue(selector.projectId, selector.issueId)
      : this.#currentByWorktree(selector.projectId, selector.worktreeId);
  }
}
