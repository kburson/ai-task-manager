import { WorkLeaseError, validateRenewRequest, validateVerifyRequest } from '@kburson/aitm-ledger';

import { getActiveTask, setActiveTask } from '../../session-state.mjs';
import { normalizeLeaseContext } from './context.mjs';
import { resolveWorktreeIdentity } from './worktree-identity.mjs';

export const WORK_LEASE_TTL_MS = 15 * 60 * 1000;
export const WORK_LEASE_HEARTBEAT_AGE_MS = 5 * 60 * 1000;
export const WORK_LEASE_HEARTBEAT_INTERVAL_MS = 60 * 1000;

const heartbeatOwners = new Map();
const heartbeatFailures = new Map();

function leaseError(code, message, details) {
  return new WorkLeaseError(code, message, details);
}

function stableError(error, code, message) {
  if (error instanceof WorkLeaseError) return error;
  return leaseError(code, message);
}

function canonicalIssue(value) {
  const match = String(value ?? '').match(/^#?([1-9]\d*)$/);
  if (!match)
    throw leaseError('invalid-request', 'governed issue must be a canonical positive decimal');
  return match[1];
}

function canonicalTimestamp(value, label) {
  if (!(value instanceof Date) || !Number.isFinite(value.getTime())) {
    throw leaseError('invalid-request', `${label} must be a valid Date`);
  }
  return value.toISOString();
}

function parseTimestamp(value, label) {
  if (
    typeof value !== 'string' ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value) ||
    !Number.isFinite(Date.parse(value)) ||
    new Date(value).toISOString() !== value
  ) {
    throw leaseError('invalid-request', `${label} must be a canonical UTC ISO timestamp`);
  }
  return Date.parse(value);
}

function object(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw leaseError('invalid-request', `${label} must be an object`);
  }
  return value;
}

function activeSessionIssue(session) {
  return canonicalIssue(session?.issue ?? session?.leaseIssue);
}

function heartbeatOwnerKey(sessionId, lease) {
  return [sessionId, lease.projectId, lease.leaseId, lease.fencingToken, lease.worktreeId].join(
    ':'
  );
}

function expectedLease(session, issueId, worktreeId) {
  let persisted;
  try {
    persisted = normalizeLeaseContext(session?.lease);
  } catch (error) {
    throw stableError(error, 'lease-not-held', 'session has no usable work lease');
  }
  if (activeSessionIssue(session) !== issueId) {
    throw leaseError('lease-not-held', 'requested issue does not match the persisted work lease');
  }
  if (persisted.worktreeId !== worktreeId) {
    throw leaseError(
      'lease-not-held',
      'canonical worktree does not match the persisted work lease'
    );
  }
  return persisted;
}

function normalizeHolderIdentity(value) {
  if (value === undefined) return {};
  const identity = object(value, 'trusted holder identity');
  const normalized = {};
  for (const field of ['provider', 'agentRunId']) {
    if (identity[field] === undefined) continue;
    if (typeof identity[field] !== 'string' || identity[field].trim() === '') {
      throw leaseError(
        'invalid-request',
        `trusted holder identity ${field} must be a non-empty string`
      );
    }
    normalized[field] = identity[field];
  }
  return normalized;
}

function normalizeAuthorityLease(
  value,
  expected,
  issueId,
  worktreeId,
  sessionId,
  hostId,
  holderIdentity
) {
  const lease = object(value, 'authority lease');
  if (lease.projectId !== expected.projectId || lease.leaseId !== expected.leaseId) {
    throw leaseError('lease-not-held', 'authority lease does not match the persisted work lease');
  }
  if (lease.fencingToken !== expected.fencingToken) {
    throw leaseError(
      'fence-stale',
      'authority lease fencing token differs from the persisted work lease'
    );
  }
  if (lease.issueId !== issueId) {
    throw leaseError('lease-not-held', 'authority lease does not belong to the requested issue');
  }
  if (!['active', 'paused'].includes(lease.state)) {
    throw leaseError('lease-not-held', 'authority lease is not ownership-retaining');
  }
  const holder = lease.holder;
  if (
    !holder ||
    typeof holder !== 'object' ||
    holder.worktreeId !== worktreeId ||
    holder.sessionId !== sessionId ||
    holder.hostId !== hostId
  ) {
    throw leaseError('lease-not-held', 'authority lease does not belong to the canonical worktree');
  }
  for (const [field, expectedValue] of Object.entries(holderIdentity)) {
    if (holder[field] !== expectedValue) {
      throw leaseError(
        'lease-not-held',
        `authority lease holder ${field} does not match the trusted session identity`
      );
    }
  }
  parseTimestamp(lease.heartbeatAt, 'authority lease heartbeatAt');
  return lease;
}

function verifiedAuthorityLease(
  result,
  expected,
  issueId,
  worktreeId,
  sessionId,
  hostId,
  holderIdentity
) {
  const response = object(result, 'authority verify response');
  if (typeof response.allowed !== 'boolean') {
    throw leaseError('invalid-request', 'authority verify response allowed flag is malformed');
  }
  if (response.allowed !== true) {
    throw leaseError('lease-not-held', 'authority did not allow the governed effect');
  }
  return normalizeAuthorityLease(
    response.lease,
    expected,
    issueId,
    worktreeId,
    sessionId,
    hostId,
    holderIdentity
  );
}

function renewRequest(lease, requestedAt, idempotencyKey) {
  const request = {
    projectId: lease.projectId,
    leaseId: lease.leaseId,
    fencingToken: lease.fencingToken,
    idempotencyKey,
    requestedAt,
    ttlMs: WORK_LEASE_TTL_MS,
  };
  validateRenewRequest(request);
  return request;
}

function renewalDue(lease, nowMs, forceRenewal) {
  if (forceRenewal) return true;
  return (
    nowMs - parseTimestamp(lease.heartbeatAt, 'authority lease heartbeatAt') >=
    WORK_LEASE_HEARTBEAT_AGE_MS
  );
}

function renewalRequestIdentity(lease, verifiedAt) {
  const bucket = Math.floor(
    parseTimestamp(verifiedAt, 'renewal verifiedAt') / WORK_LEASE_HEARTBEAT_AGE_MS
  );
  return {
    idempotencyKey: `renew:${lease.leaseId}:${lease.fencingToken}:${bucket}`,
    requestedAt: new Date(bucket * WORK_LEASE_HEARTBEAT_AGE_MS).toISOString(),
  };
}

// Verify authority immediately before a governed effect.  The dependencies are
// intentionally injectable: local SQLite methods are synchronous while the
// HTTPS implementation is asynchronous, and await normalizes both contracts.
export async function verifyGovernedEffect({
  issueId,
  sessionId,
  projectDir,
  hostId,
  operation,
  store,
  forceRenewal = false,
  heartbeat = false,
  heartbeatOwnerKey: suppliedHeartbeatOwnerKey,
  holderIdentity,
  loadSession = getActiveTask,
  saveSession = setActiveTask,
  resolveWorktreeIdentity: resolveIdentity = resolveWorktreeIdentity,
  now = () => new Date(),
} = {}) {
  const canonicalIssueId = canonicalIssue(issueId);
  if (typeof sessionId !== 'string' || sessionId.trim() === '') {
    throw leaseError('invalid-request', 'governed effect sessionId is required');
  }
  if (typeof projectDir !== 'string' || projectDir.trim() === '') {
    throw leaseError('invalid-request', 'governed effect projectDir is required');
  }
  if (typeof hostId !== 'string' || hostId.trim() === '') {
    throw leaseError('invalid-request', 'governed effect hostId is required');
  }
  if (!store || typeof store.verify !== 'function') {
    throw leaseError('invalid-request', 'work-lease authority verify operation is required');
  }

  let session;
  try {
    session = await loadSession(sessionId, projectDir);
  } catch (error) {
    throw stableError(error, 'invalid-request', 'cannot load the persisted work-lease session');
  }
  if (!session || typeof session !== 'object') {
    throw leaseError('lease-not-held', 'session has no persisted work lease');
  }

  let worktree;
  try {
    worktree = await resolveIdentity(projectDir, { hostId });
  } catch (error) {
    throw stableError(error, 'authority-unavailable', 'cannot resolve canonical worktree identity');
  }
  if (typeof worktree?.worktreeId !== 'string' || worktree.worktreeId.trim() === '') {
    throw leaseError('invalid-request', 'canonical worktree identity is malformed');
  }

  const persistedLease = expectedLease(session, canonicalIssueId, worktree.worktreeId);
  const trustedHolderIdentity = normalizeHolderIdentity(holderIdentity);
  const ownerKey = suppliedHeartbeatOwnerKey ?? heartbeatOwnerKey(sessionId, persistedLease);
  if (typeof ownerKey !== 'string' || ownerKey.trim() === '') {
    throw leaseError('invalid-request', 'heartbeat owner identity is required');
  }
  const verifiedAt = canonicalTimestamp(now(), 'governed effect time');
  const verifyRequest = {
    projectId: persistedLease.projectId,
    leaseId: persistedLease.leaseId,
    fencingToken: persistedLease.fencingToken,
    operation,
    verifiedAt,
  };
  validateVerifyRequest(verifyRequest);

  let authorityLease;
  try {
    authorityLease = verifiedAuthorityLease(
      await store.verify(verifyRequest),
      persistedLease,
      canonicalIssueId,
      worktree.worktreeId,
      sessionId,
      hostId,
      trustedHolderIdentity
    );
  } catch (error) {
    throw stableError(error, 'authority-unavailable', 'work-lease authority verification failed');
  }

  const rememberedFailure = heartbeatFailures.get(ownerKey);
  if (rememberedFailure && !heartbeat) {
    heartbeatFailures.delete(ownerKey);
    throw rememberedFailure;
  }

  if (renewalDue(authorityLease, Date.parse(verifiedAt), forceRenewal)) {
    if (typeof store.renew !== 'function') {
      throw leaseError('invalid-request', 'work-lease authority renew operation is required');
    }
    const renewal = renewalRequestIdentity(persistedLease, verifiedAt);
    try {
      authorityLease = normalizeAuthorityLease(
        await store.renew(
          renewRequest(persistedLease, renewal.requestedAt, renewal.idempotencyKey)
        ),
        persistedLease,
        canonicalIssueId,
        worktree.worktreeId,
        sessionId,
        hostId,
        trustedHolderIdentity
      );
    } catch (error) {
      throw stableError(error, 'authority-unavailable', 'work-lease authority renewal failed');
    }
  }

  const durableLease = normalizeLeaseContext({
    projectId: authorityLease.projectId,
    leaseId: authorityLease.leaseId,
    fencingToken: authorityLease.fencingToken,
    worktreeId: worktree.worktreeId,
  });
  try {
    await saveSession(sessionId, { ...session, lease: durableLease }, projectDir);
  } catch (error) {
    throw stableError(
      error,
      'authority-unavailable',
      'cannot persist the verified work-lease identity'
    );
  }

  return { allowed: true, lease: authorityLease };
}

// Creates one best-effort process heartbeat for an owning lease. Failures are
// retained and intentionally surface on the next non-heartbeat preflight.
export function createWorkLeaseHeartbeat({
  ownerKey,
  verifyEffect = verifyGovernedEffect,
  setInterval: setIntervalImpl = globalThis.setInterval,
  clearInterval: clearIntervalImpl = globalThis.clearInterval,
  processEvents = process,
  ...verifyOptions
} = {}) {
  if (typeof ownerKey !== 'string' || ownerKey.trim() === '') {
    throw leaseError('invalid-request', 'heartbeat owner identity is required');
  }
  const existing = heartbeatOwners.get(ownerKey);
  if (existing) return existing;
  if (
    typeof verifyEffect !== 'function' ||
    typeof setIntervalImpl !== 'function' ||
    typeof processEvents?.once !== 'function' ||
    typeof processEvents?.removeListener !== 'function'
  ) {
    throw leaseError('invalid-request', 'heartbeat dependencies are unavailable');
  }

  let stopped = false;
  let inFlight = false;
  const tick = async () => {
    if (stopped || inFlight) return;
    inFlight = true;
    try {
      await verifyEffect({ ...verifyOptions, heartbeat: true, heartbeatOwnerKey: ownerKey });
    } catch (error) {
      heartbeatFailures.set(
        ownerKey,
        stableError(error, 'authority-unavailable', 'work-lease heartbeat failed')
      );
    } finally {
      inFlight = false;
    }
  };
  const timer = setIntervalImpl(tick, WORK_LEASE_HEARTBEAT_INTERVAL_MS);
  timer?.unref?.();
  let controller;
  const onProcessExit = () => stop();
  const stop = () => {
    if (stopped) return;
    stopped = true;
    clearIntervalImpl?.(timer);
    processEvents.removeListener('exit', onProcessExit);
    if (heartbeatOwners.get(ownerKey) === controller) heartbeatOwners.delete(ownerKey);
  };
  controller = Object.freeze({ ownerKey, timer, stop, shutdown: stop });
  heartbeatOwners.set(ownerKey, controller);
  processEvents.once('exit', onProcessExit);
  return controller;
}
