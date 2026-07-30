import { randomUUID as defaultRandomUUID } from 'node:crypto';

import {
  canonicalRequestJson,
  WorkLeaseError,
  validateAcquireRequest,
  validateRenewRequest,
  validateVerifyRequest,
} from '@kburson/aitm-ledger';

import {
  attachWorkLeaseIntentReceipt,
  checkpointWorkLeaseProjection,
  clearWorkLeaseIntent,
  getActiveTask,
  restoreActiveTaskSnapshot,
  setActiveTask,
  setWorkLeaseIntent,
} from '../../session-state.mjs';
import {
  normalizeLeaseContext,
  validateWorkLeaseIntent,
  WORK_LEASE_PROJECTIONS,
} from './context.mjs';
import { resolveWorktreeIdentity } from './worktree-identity.mjs';

export const WORK_LEASE_TTL_MS = 15 * 60 * 1000;
export const WORK_LEASE_HEARTBEAT_AGE_MS = 5 * 60 * 1000;
export const WORK_LEASE_HEARTBEAT_INTERVAL_MS = 60 * 1000;

const heartbeatOwners = new Map();
const heartbeatFailures = new Map();
const TERMINAL_ACQUIRE_CODES = new Set([
  'invalid-request',
  'idempotency-conflict',
  'lease-contended',
  'worktree-contended',
  'fence-stale',
  'authority-unauthenticated',
  'authority-forbidden',
  'holder-live',
  'lease-not-held',
  'main-worktree-unresolved',
]);

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

function requiredString(value, label) {
  if (typeof value !== 'string' || value.trim() === '') {
    throw leaseError('invalid-request', `${label} is required`);
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

export async function buildTrustedWorkLeaseHolder({
  projectDir,
  hostId,
  provider,
  agentRunId,
  sessionId,
  pid,
  branch,
  resolveWorktreeIdentity: resolveIdentity = resolveWorktreeIdentity,
} = {}) {
  requiredString(projectDir, 'work-lease projectDir');
  const trustedHostId = requiredString(hostId, 'work-lease hostId');
  const trustedProvider = requiredString(provider, 'work-lease provider');
  const trustedAgentRunId = requiredString(agentRunId, 'work-lease agentRunId');
  const trustedSessionId = requiredString(sessionId, 'work-lease sessionId');
  const trustedBranch = requiredString(branch, 'work-lease branch');
  if (!Number.isSafeInteger(pid) || pid <= 0) {
    throw leaseError('invalid-request', 'work-lease pid must be a positive safe integer');
  }
  let worktree;
  try {
    worktree = await resolveIdentity(projectDir, { hostId: trustedHostId });
  } catch (error) {
    throw stableError(error, 'authority-unavailable', 'cannot resolve canonical worktree identity');
  }
  const worktreeId = requiredString(worktree?.worktreeId, 'canonical worktreeId');
  const pathHash = requiredString(worktree?.pathHash, 'canonical worktree pathHash');
  return Object.freeze({
    principalKind: 'worker',
    provider: trustedProvider,
    agentRunId: trustedAgentRunId,
    sessionId: trustedSessionId,
    hostId: trustedHostId,
    pid,
    worktreeId,
    pathHash,
    branch: trustedBranch,
  });
}

function canonicalAcquireIssue(value) {
  return canonicalIssue(value);
}

function sameDurableJson(left, right) {
  return canonicalRequestJson(left) === canonicalRequestJson(right);
}

function validateAcquireIntentCorrelation({ intent, holder, issueId, store }) {
  if (intent?.operation !== 'acquire') {
    throw leaseError('invalid-request', 'persisted work-lease intent operation must be acquire');
  }
  let request;
  try {
    request = validateWorkLeaseIntent(intent, { requireAllProjections: true });
    validateAcquireRequest(request);
  } catch (error) {
    throw stableError(
      error,
      'invalid-request',
      `persisted acquire intent is malformed: ${error?.message || 'unknown validation error'}`
    );
  }
  if (request.projectId !== store?.projectId) {
    throw leaseError('invalid-request', 'persisted acquire project does not match authority');
  }
  if (request.issueId !== issueId || request.mode !== 'write') {
    throw leaseError('invalid-request', 'persisted acquire target does not match current bind');
  }
  if (!sameDurableJson(request.holder, holder)) {
    throw leaseError('invalid-request', 'persisted acquire holder does not match trusted holder');
  }
  return request;
}

function validateAcquireReceipt(receipt, request) {
  const lease = object(receipt, 'acquire receipt');
  for (const field of [
    'projectId',
    'leaseId',
    'issueId',
    'mode',
    'fencingToken',
    'state',
    'holder',
    'acquiredAt',
    'heartbeatAt',
    'expiresAt',
  ]) {
    if (!Object.hasOwn(lease, field)) {
      throw leaseError('invalid-request', `acquire receipt ${field} is required`);
    }
  }
  if (
    lease.projectId !== request.projectId ||
    lease.issueId !== request.issueId ||
    lease.mode !== request.mode ||
    lease.state !== 'active' ||
    !sameDurableJson(lease.holder, request.holder)
  ) {
    throw leaseError('invalid-request', 'acquire receipt does not match persisted request');
  }
  const durableLease = normalizeLeaseContext({
    projectId: lease.projectId,
    leaseId: requiredString(lease.leaseId, 'acquire receipt leaseId'),
    fencingToken: lease.fencingToken,
    worktreeId: request.holder.worktreeId,
  });
  const acquiredAt = parseTimestamp(lease.acquiredAt, 'acquire receipt acquiredAt');
  const heartbeatAt = parseTimestamp(lease.heartbeatAt, 'acquire receipt heartbeatAt');
  const expiresAt = parseTimestamp(lease.expiresAt, 'acquire receipt expiresAt');
  if (heartbeatAt < acquiredAt || expiresAt <= heartbeatAt) {
    throw leaseError('invalid-request', 'acquire receipt timestamps are inconsistent');
  }
  return durableLease;
}

function releaseAfterClaimRequest(lease, request) {
  return {
    projectId: lease.projectId,
    leaseId: lease.leaseId,
    fencingToken: lease.fencingToken,
    idempotencyKey: `release-after-claim:${request.idempotencyKey}`,
    releasedAt: request.requestedAt,
    reason: 'assignee-changed-after-acquire',
  };
}

function validateProjectionProof(proof, projectionName, projectionId) {
  if (
    !proof ||
    typeof proof !== 'object' ||
    proof.reconciled !== true ||
    proof.projectionName !== projectionName ||
    proof.projectionId !== projectionId
  ) {
    throw leaseError(
      'authority-unavailable',
      `work-lease ${projectionName} reconciliation proof does not match`
    );
  }
  return proof;
}

function isCurrentAssigneeClaimReplay(claimResult, eligibility) {
  if (claimResult?.ok === true) return true;
  if (claimResult?.kind !== 'already-assigned') return false;
  const currentUser = String(eligibility?.currentUser ?? '').toLowerCase();
  return (
    currentUser !== '' &&
    (claimResult.assignees ?? []).some((assignee) => String(assignee).toLowerCase() === currentUser)
  );
}

// Shared cold-bind/adoption coordinator. Every dependency that can touch
// GitHub, timing, fleet, or the authority is injectable so tests can prove the
// write ordering. The session intent is the only mutation before acquire.
export async function coordinateWorkLeaseAcquire({
  issueId,
  sessionId,
  projectDir,
  hostId,
  provider,
  agentRunId,
  pid,
  branch,
  getStore,
  readEligibility,
  claim,
  projectionInputs,
  projections,
  loadSession = getActiveTask,
  saveIntent = setWorkLeaseIntent,
  attachReceipt = attachWorkLeaseIntentReceipt,
  checkpointProjection = checkpointWorkLeaseProjection,
  clearIntent = clearWorkLeaseIntent,
  restoreSnapshot = restoreActiveTaskSnapshot,
  resolveWorktreeIdentity: resolveIdentity = resolveWorktreeIdentity,
  now = () => new Date(),
  randomUUID = defaultRandomUUID,
} = {}) {
  const canonicalIssueId = canonicalAcquireIssue(issueId);
  requiredString(sessionId, 'work-lease sessionId');
  requiredString(projectDir, 'work-lease projectDir');
  if (typeof getStore !== 'function') {
    throw leaseError('invalid-request', 'lazy work-lease provider is required');
  }
  if (typeof readEligibility !== 'function') {
    throw leaseError('invalid-request', 'read-only bind eligibility is required');
  }
  if (
    !projectionInputs ||
    typeof projectionInputs !== 'object' ||
    Array.isArray(projectionInputs)
  ) {
    throw leaseError('invalid-request', 'work-lease projection inputs are required');
  }
  if (!projections || typeof projections !== 'object' || Array.isArray(projections)) {
    throw leaseError('invalid-request', 'work-lease projection callbacks are required');
  }
  for (const name of WORK_LEASE_PROJECTIONS) {
    if (!Object.hasOwn(projectionInputs, name) || typeof projections[name] !== 'function') {
      throw leaseError('invalid-request', `work-lease ${name} projection is required`);
    }
  }

  const existing = await loadSession(sessionId, projectDir);
  const existingIntent = existing?.workLeaseIntent;
  let eligibility;
  let holder;
  let store;
  let intent;
  let request;

  if (!existingIntent) {
    eligibility = await readEligibility();
    if (!eligibility?.ok) {
      throw leaseError('authority-forbidden', 'incoming issue is not eligible for bind');
    }
    if (eligibility.claimRequired && typeof claim !== 'function') {
      throw leaseError('invalid-request', 'deferred assignee claim is required');
    }
  }

  holder = await buildTrustedWorkLeaseHolder({
    projectDir,
    hostId,
    provider,
    agentRunId,
    sessionId,
    pid,
    branch,
    resolveWorktreeIdentity: resolveIdentity,
  });
  store = await getStore();

  if (existingIntent) {
    intent = existingIntent;
    request = validateAcquireIntentCorrelation({
      intent,
      holder,
      issueId: canonicalIssueId,
      store,
    });
  } else {
    const requestedAt = canonicalTimestamp(now(), 'work-lease acquire time');
    request = {
      projectId: requiredString(store?.projectId, 'work-lease projectId'),
      issueId: canonicalIssueId,
      mode: 'write',
      idempotencyKey: `acquire:${sessionId}:${canonicalIssueId}:${randomUUID()}`,
      requestedAt,
      ttlMs: WORK_LEASE_TTL_MS,
      holder,
    };
    await saveIntent(sessionId, { operation: 'acquire', request, projectionInputs }, projectDir);
    intent = (await loadSession(sessionId, projectDir))?.workLeaseIntent;
    request = validateAcquireIntentCorrelation({
      intent,
      holder,
      issueId: canonicalIssueId,
      store,
    });
  }

  let receipt = intent.receipt;
  if (!receipt) {
    let candidateReceipt;
    try {
      candidateReceipt = await store.acquire(request);
    } catch (error) {
      if (TERMINAL_ACQUIRE_CODES.has(error?.code)) {
        const restored = await restoreSnapshot(
          sessionId,
          intent.priorSessionSnapshot,
          request.idempotencyKey,
          projectDir
        );
        if (!restored) {
          throw leaseError(
            'authority-unavailable',
            'cannot restore prior session after definitive acquire refusal'
          );
        }
      }
      throw stableError(error, 'authority-unavailable', 'work-lease acquisition failed');
    }
    validateAcquireReceipt(candidateReceipt, request);
    await attachReceipt(sessionId, { receipt: candidateReceipt }, projectDir);
    receipt = candidateReceipt;
  }

  intent = (await loadSession(sessionId, projectDir))?.workLeaseIntent;
  request = validateAcquireIntentCorrelation({
    intent,
    holder,
    issueId: canonicalIssueId,
    store,
  });
  receipt = intent.receipt;
  const durableLease = validateAcquireReceipt(receipt, request);

  const rejectGrantedLease = async ({ code, message, cause }) => {
    try {
      if (typeof store.release !== 'function') {
        throw leaseError('authority-unavailable', 'work-lease release operation is required');
      }
      await store.release(releaseAfterClaimRequest(durableLease, request));
    } catch (releaseError) {
      throw stableError(
        releaseError,
        'authority-unavailable',
        'cannot release lease after assignee recheck'
      );
    }
    const restored = await restoreSnapshot(
      sessionId,
      intent.priorSessionSnapshot,
      request.idempotencyKey,
      projectDir
    );
    if (!restored) {
      throw leaseError(
        'authority-unavailable',
        'cannot restore prior session after released acquire'
      );
    }
    if (cause) {
      throw stableError(cause, code, message);
    }
    throw leaseError(code, message);
  };

  if (existingIntent) {
    try {
      eligibility = await readEligibility();
    } catch (error) {
      await rejectGrantedLease({
        code: 'authority-unavailable',
        message: 'incoming issue eligibility cannot be verified',
        cause: error,
      });
    }
    if (!eligibility?.ok) {
      await rejectGrantedLease({
        code: 'authority-forbidden',
        message: 'incoming issue is no longer eligible for bind',
      });
    }
  }

  if (eligibility.claimRequired) {
    if (typeof claim !== 'function') {
      await rejectGrantedLease({
        code: 'invalid-request',
        message: 'deferred assignee claim is required',
      });
    }
    let claimResult;
    let claimError;
    try {
      claimResult = await claim();
    } catch (error) {
      claimError = error;
    }
    if (claimError || !isCurrentAssigneeClaimReplay(claimResult, eligibility)) {
      if (claimError) {
        await rejectGrantedLease({
          code: 'authority-unavailable',
          message: 'assignee claim could not be verified after acquisition',
          cause: claimError,
        });
      }
      await rejectGrantedLease({
        code: 'authority-forbidden',
        message: 'issue assignee changed after work-lease acquisition',
      });
    }
  }

  let currentIntent = (await loadSession(sessionId, projectDir))?.workLeaseIntent;
  validateAcquireIntentCorrelation({
    intent: currentIntent,
    holder,
    issueId: canonicalIssueId,
    store,
  });
  for (const name of WORK_LEASE_PROJECTIONS) {
    const projection = currentIntent.projections[name];
    if (projection.completed === true) continue;
    const proof = await projections[name]({
      input: projection.input,
      lease: durableLease,
      receipt,
      request,
      eligibility,
      projectionName: name,
      projectionId: projection.projectionId,
    });
    validateProjectionProof(proof, name, projection.projectionId);
    await checkpointProjection(
      sessionId,
      name,
      proof,
      currentIntent?.transitionId,
      canonicalTimestamp(now(), `work-lease ${name} checkpoint time`),
      projectDir
    );
    currentIntent = (await loadSession(sessionId, projectDir))?.workLeaseIntent;
    validateAcquireIntentCorrelation({
      intent: currentIntent,
      holder,
      issueId: canonicalIssueId,
      store,
    });
  }
  if ((await clearIntent(sessionId, currentIntent?.transitionId, projectDir)) !== true) {
    throw leaseError('authority-unavailable', 'cannot clear reconciled work-lease intent');
  }
  return Object.freeze({ lease: durableLease, receipt, request, eligibility });
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
