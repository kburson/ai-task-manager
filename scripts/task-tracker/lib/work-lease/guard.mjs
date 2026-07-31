import { randomUUID as defaultRandomUUID } from 'node:crypto';

import {
  canonicalRequestDigest,
  canonicalRequestJson,
  parseHttpLeaseResponse,
  validateReplayMutationOutcome,
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
  normalizeWorkLeaseAuthority,
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
const STABLE_HOLDER_FIELDS = [
  'principalKind',
  'provider',
  'agentRunId',
  'sessionId',
  'hostId',
  'worktreeId',
  'pathHash',
  'branch',
];

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

export function workLeaseHeartbeatOwnerKey(sessionId, lease) {
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

function persistedAuthority(session, issueId, worktreeId) {
  const lease = expectedLease(session, issueId, worktreeId);
  try {
    return normalizeWorkLeaseAuthority(
      { lease, holder: session?.holder, binding: session?.binding },
      { issueId }
    );
  } catch (error) {
    throw stableError(
      error,
      'authority-unavailable',
      'persisted work-lease authority tuple is malformed'
    );
  }
}

function requestBindingFromObservation(value) {
  const binding = object(value, 'observed work-lease binding');
  return {
    sessionId: binding.sessionId,
    issueId: binding.issueId,
    worktreeId: binding.worktreeId,
    displayPath: binding.displayPath,
  };
}

export async function backfillPersistedWorkLeaseAuthority({
  session,
  issueId,
  sessionId,
  projectDir,
  worktreeId,
  hostId,
  store,
  saveSession,
  allowedStates = ['active'],
}) {
  const lease = expectedLease(session, issueId, worktreeId);
  if (session.holder !== undefined || session.binding !== undefined) {
    throw leaseError('authority-unavailable', 'persisted work-lease authority tuple is incomplete');
  }
  if (typeof store?.observe !== 'function') {
    throw leaseError('authority-unavailable', 'work-lease authority observation is required');
  }
  let observation;
  try {
    observation = await store.observe({ projectId: lease.projectId });
  } catch (error) {
    throw stableError(error, 'authority-unavailable', 'work-lease authority observation failed');
  }
  const leases = Array.isArray(observation?.leases) ? observation.leases : [];
  const bindings = Array.isArray(observation?.bindings) ? observation.bindings : [];
  const matchingLeases = leases.filter(
    (candidate) =>
      candidate?.projectId === lease.projectId &&
      candidate?.leaseId === lease.leaseId &&
      candidate?.fencingToken === lease.fencingToken &&
      candidate?.issueId === issueId &&
      allowedStates.includes(candidate?.state) &&
      candidate?.holder?.sessionId === sessionId &&
      candidate?.holder?.hostId === hostId &&
      candidate?.holder?.worktreeId === worktreeId
  );
  const matchingBindings = bindings.filter(
    (candidate) =>
      candidate?.projectId === lease.projectId &&
      candidate?.leaseId === lease.leaseId &&
      candidate?.fencingToken === lease.fencingToken &&
      candidate?.sessionId === sessionId &&
      candidate?.issueId === issueId &&
      candidate?.worktreeId === worktreeId
  );
  if (matchingLeases.length !== 1 || matchingBindings.length !== 1) {
    throw leaseError(
      'authority-unavailable',
      'authoritative work-lease observation is absent, ambiguous, or mismatched'
    );
  }
  let authority;
  try {
    authority = normalizeWorkLeaseAuthority(
      {
        lease,
        holder: matchingLeases[0].holder,
        binding: requestBindingFromObservation(matchingBindings[0]),
      },
      { issueId }
    );
  } catch (error) {
    throw stableError(error, 'authority-unavailable', 'observed work-lease authority is malformed');
  }
  try {
    await saveSession(sessionId, { ...session, ...authority }, projectDir);
  } catch (error) {
    throw stableError(
      error,
      'authority-unavailable',
      'cannot persist observed work-lease authority'
    );
  }
  return authority;
}

function normalizeHolderIdentity(value) {
  if (value === undefined) return {};
  const identity = object(value, 'trusted holder identity');
  const normalized = {};
  for (const field of STABLE_HOLDER_FIELDS) {
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

function normalizeResumeBindingIdentity(value, { worktree, sessionId, hostId }) {
  const identity = object(value, 'trusted bind identity');
  const normalized = {};
  for (const field of [...STABLE_HOLDER_FIELDS, 'displayPath']) {
    normalized[field] = requiredString(identity[field], `trusted bind identity ${field}`);
  }
  if (!Number.isSafeInteger(identity.pid) || identity.pid <= 0) {
    throw leaseError(
      'invalid-request',
      'trusted bind identity pid must be a positive safe integer'
    );
  }
  if (normalized.principalKind !== 'worker') {
    throw leaseError('invalid-request', 'trusted bind identity principalKind must be worker');
  }
  if (
    normalized.sessionId !== sessionId ||
    normalized.hostId !== hostId ||
    normalized.worktreeId !== worktree.worktreeId ||
    normalized.pathHash !== worktree.pathHash ||
    normalized.displayPath !== worktree.displayPath
  ) {
    throw leaseError(
      'lease-not-held',
      'trusted bind identity does not match the canonical session worktree'
    );
  }
  return Object.freeze(normalized);
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
  if (lease.state !== 'active') {
    throw leaseError('lease-not-held', 'authority lease is not active');
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
  const acquiredAt = parseTimestamp(lease.acquiredAt, 'authority lease acquiredAt');
  const heartbeatAt = parseTimestamp(lease.heartbeatAt, 'authority lease heartbeatAt');
  const expiresAt = parseTimestamp(lease.expiresAt, 'authority lease expiresAt');
  if (heartbeatAt < acquiredAt || expiresAt <= heartbeatAt) {
    throw leaseError('invalid-request', 'authority lease timestamps are inconsistent');
  }
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

async function verifyCurrentReplayAuthority({
  store,
  authority,
  issueId,
  worktreeId,
  sessionId,
  hostId,
  holderIdentity,
  now,
}) {
  const { lease: expectedLease, holder, binding } = authority;
  if (typeof store?.verify !== 'function') {
    throw leaseError(
      'authority-unavailable',
      'work-lease authority verify operation is required for receipt replay'
    );
  }
  const replayFailure = (error, message) => {
    if (['fence-stale', 'lease-not-held'].includes(error?.code)) return error;
    const diagnostic = error?.message ? `: ${error.message}` : '';
    return leaseError('authority-unavailable', `${message}${diagnostic}`);
  };
  const verifyRequest = {
    projectId: expectedLease.projectId,
    leaseId: expectedLease.leaseId,
    fencingToken: expectedLease.fencingToken,
    operation: 'task-bind',
    verifiedAt: canonicalTimestamp(now(), 'work-lease replay verification time'),
    holder,
    binding,
  };
  validateVerifyRequest(verifyRequest);
  try {
    let authorityLease = verifiedAuthorityLease(
      await store.verify(verifyRequest),
      expectedLease,
      issueId,
      worktreeId,
      sessionId,
      hostId,
      holderIdentity
    );
    const verifiedAtMs = parseTimestamp(
      verifyRequest.verifiedAt,
      'work-lease replay verification time'
    );
    const expiresAtMs = parseTimestamp(authorityLease.expiresAt, 'authority lease expiresAt');
    if (renewalDue(authorityLease, verifiedAtMs, false) || expiresAtMs <= verifiedAtMs) {
      if (typeof store.renew !== 'function') {
        throw leaseError(
          'authority-unavailable',
          'work-lease authority renew operation is required for receipt replay'
        );
      }
      const renewal = renewalRequestIdentity(expectedLease, verifyRequest.verifiedAt);
      const request = renewRequest(authority, renewal.requestedAt, renewal.idempotencyKey);
      authorityLease = normalizeAuthorityLease(
        await store.renew(request),
        expectedLease,
        issueId,
        worktreeId,
        sessionId,
        hostId,
        holderIdentity
      );
      const expectedExpiresAt = new Date(
        parseTimestamp(request.requestedAt, 'renewal request requestedAt') + request.ttlMs
      ).toISOString();
      if (
        authorityLease.heartbeatAt !== request.requestedAt ||
        authorityLease.expiresAt !== expectedExpiresAt
      ) {
        throw leaseError(
          'authority-unavailable',
          'receipt replay renewal does not match its deterministic request'
        );
      }
    }
    if (parseTimestamp(authorityLease.expiresAt, 'authority lease expiresAt') <= verifiedAtMs) {
      throw leaseError(
        'authority-unavailable',
        'receipt replay authority is not live at verification time'
      );
    }
    return authorityLease;
  } catch (error) {
    throw replayFailure(
      error,
      'current work-lease authority could not be verified for receipt replay'
    );
  }
}

function renewRequest(authority, requestedAt, idempotencyKey) {
  const { lease, holder, binding } = authority;
  const request = {
    projectId: lease.projectId,
    leaseId: lease.leaseId,
    fencingToken: lease.fencingToken,
    idempotencyKey,
    requestedAt,
    ttlMs: WORK_LEASE_TTL_MS,
    holder,
    binding,
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

export async function buildTrustedWorkLeaseBinding({
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
  const displayPath = requiredString(worktree?.displayPath, 'canonical worktree displayPath');
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
    displayPath,
  });
}

export async function buildTrustedWorkLeaseHolder(options = {}) {
  const binding = await buildTrustedWorkLeaseBinding(options);
  const { displayPath: _displayPath, ...holder } = binding;
  return Object.freeze(holder);
}

function canonicalAcquireIssue(value) {
  return canonicalIssue(value);
}

function sameDurableJson(left, right) {
  return canonicalRequestJson(left) === canonicalRequestJson(right);
}

function stableHolderIdentity(holder) {
  return Object.fromEntries(STABLE_HOLDER_FIELDS.map((field) => [field, holder?.[field]]));
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
  if (!sameDurableJson(stableHolderIdentity(request.holder), stableHolderIdentity(holder))) {
    throw leaseError('invalid-request', 'persisted acquire holder does not match trusted holder');
  }
  if (
    request.binding.sessionId !== holder.sessionId ||
    request.binding.issueId !== issueId ||
    request.binding.worktreeId !== holder.worktreeId
  ) {
    throw leaseError('invalid-request', 'persisted acquire binding does not match trusted holder');
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
  return { durableLease, acquiredAt: lease.acquiredAt };
}

function validateResumeIntentCorrelation({ intent, issueId, store, persistedLease }) {
  if (intent?.operation !== 'resume') {
    throw leaseError('invalid-request', 'persisted work-lease intent operation must be resume');
  }
  let request;
  try {
    request = validateWorkLeaseIntent(intent, { requireAllProjections: true });
    validateRenewRequest(request);
  } catch (error) {
    throw stableError(
      error,
      'invalid-request',
      `persisted resume intent is malformed: ${error?.message || 'unknown validation error'}`
    );
  }
  if (intent.issueId !== issueId) {
    throw leaseError('invalid-request', 'persisted resume issue does not match current bind');
  }
  if (request.projectId !== store?.projectId) {
    throw leaseError('invalid-request', 'persisted resume project does not match authority');
  }
  if (
    request.projectId !== persistedLease.projectId ||
    request.leaseId !== persistedLease.leaseId ||
    request.fencingToken !== persistedLease.fencingToken
  ) {
    throw leaseError('invalid-request', 'persisted resume request does not match session lease');
  }
  return request;
}

function validateResumeReceipt(
  receipt,
  request,
  expected,
  issueId,
  worktreeId,
  sessionId,
  hostId,
  holderIdentity
) {
  const lease = normalizeAuthorityLease(
    receipt,
    expected,
    issueId,
    worktreeId,
    sessionId,
    hostId,
    holderIdentity
  );
  const expectedExpiresAt = new Date(
    parseTimestamp(request.requestedAt, 'renewal request requestedAt') + request.ttlMs
  ).toISOString();
  if (lease.heartbeatAt !== request.requestedAt || lease.expiresAt !== expectedExpiresAt) {
    throw leaseError('invalid-request', 'renewal receipt does not match persisted request');
  }
  return lease;
}

function releaseAfterClaimRequest(lease, request, acquiredAt) {
  return {
    projectId: lease.projectId,
    leaseId: lease.leaseId,
    fencingToken: lease.fencingToken,
    idempotencyKey: `release-after-claim:${request.idempotencyKey}`,
    releasedAt: acquiredAt,
    reason: 'assignee-changed-after-acquire',
    holder: request.holder,
    binding: request.binding,
  };
}

async function recoverCommittedPostClaimRelease({
  store,
  durableLease,
  request,
  acquiredAt,
  sessionId,
  intent,
  projectDir,
  restoreSnapshot,
}) {
  if (typeof store?.replayMutation !== 'function') return false;
  const releaseRequest = releaseAfterClaimRequest(durableLease, request, acquiredAt);
  const selector = Object.freeze({
    projectId: releaseRequest.projectId,
    operation: 'release',
    idempotencyKey: releaseRequest.idempotencyKey,
    requestDigest: canonicalRequestDigest(releaseRequest),
  });
  let outcome;
  try {
    outcome = validateReplayMutationOutcome(await store.replayMutation(selector), selector);
  } catch (error) {
    throw stableError(
      error,
      'authority-unavailable',
      'post-claim release replay could not be proven'
    );
  }
  if (outcome.outcome !== 'committed') return false;
  const correlatedRelease = parseHttpLeaseResponse({
    operation: 'release',
    status: outcome.statusCode,
    payload: { result: outcome.result },
    request: releaseRequest,
  });
  if (
    correlatedRelease.audit?.releasedAt !== releaseRequest.releasedAt ||
    correlatedRelease.audit?.reason !== releaseRequest.reason
  ) {
    throw leaseError(
      'authority-unavailable',
      'post-claim release replay does not match the persisted acquire'
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
      'cannot restore prior session after committed post-claim release'
    );
  }
  throw leaseError('authority-forbidden', 'lease was released after assignee recheck');
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

function validatePreparedGithubInput(input, issueId) {
  const value = object(input, 'persisted GitHub bind input');
  if (
    value.issueNumber !== issueId ||
    typeof value.skippedNetwork !== 'boolean' ||
    typeof value.claimRequired !== 'boolean' ||
    !['enforced', 'disabled', 'offline'].includes(value.assigneePolicy) ||
    typeof value.currentUser !== 'string' ||
    typeof value.preparedKind !== 'string' ||
    !Array.isArray(value.preparedAssignees) ||
    value.preparedAssignees.some((assignee) => typeof assignee !== 'string') ||
    !Object.hasOwn(value, 'auditBody')
  ) {
    throw leaseError('invalid-request', 'persisted GitHub bind input is malformed');
  }
  if (
    value.assigneePolicy === 'enforced' &&
    (value.currentUser.trim() === '' || value.preparedKind.trim() === '')
  ) {
    throw leaseError('invalid-request', 'persisted assignment intent is incomplete');
  }
  if (value.claimRequired && (typeof value.auditBody !== 'string' || value.auditBody === '')) {
    throw leaseError('invalid-request', 'persisted assignment audit intent is incomplete');
  }
  if ((value.assigneePolicy === 'offline') !== value.skippedNetwork) {
    throw leaseError('invalid-request', 'persisted offline bind policy is inconsistent');
  }
  return value;
}

function validatePreparedEligibility(prepared, githubInput) {
  if (!prepared?.ok) {
    throw leaseError('authority-forbidden', 'incoming issue is not eligible for bind');
  }
  if (githubInput.assigneePolicy !== 'enforced') return;
  const preparedAssignees = (prepared.assignees ?? []).map((value) => String(value).toLowerCase());
  if (
    prepared.claimRequired !== githubInput.claimRequired ||
    String(prepared.currentUser ?? '').toLowerCase() !== githubInput.currentUser.toLowerCase() ||
    canonicalRequestJson(preparedAssignees) !==
      canonicalRequestJson(githubInput.preparedAssignees.map((value) => value.toLowerCase()))
  ) {
    throw leaseError(
      'invalid-request',
      'prepared eligibility does not match persisted assignment intent'
    );
  }
}

function isTransientBindEligibilityFailure(eligibility) {
  return eligibility?.kind === 'assignee-mismatch' && eligibility.assigneeKind === 'unverifiable';
}

async function reconcilePersistedClaim({ intent, issueId, readEligibility, reconcileClaim }) {
  const projection = intent.projections.github;
  const input = validatePreparedGithubInput(projection.input, issueId);
  if (input.skippedNetwork) {
    return {
      reconciled: true,
      projectionName: 'github-claim',
      projectionId: projection.projectionId,
      assignmentResult: 'network-skipped',
    };
  }
  if (typeof readEligibility !== 'function') {
    throw leaseError('invalid-request', 'post-authority bind eligibility reader is required');
  }
  const liveEligibility = await readEligibility();
  if (!liveEligibility?.ok) {
    if (isTransientBindEligibilityFailure(liveEligibility)) {
      const diagnostic =
        typeof liveEligibility.error === 'string' && liveEligibility.error.trim() !== ''
          ? `: ${liveEligibility.error}`
          : '';
      throw leaseError(
        'authority-unavailable',
        `incoming issue assignee is temporarily unverifiable${diagnostic}`
      );
    }
    throw leaseError('authority-forbidden', 'incoming issue is no longer eligible for bind');
  }
  if (input.assigneePolicy !== 'enforced') {
    return {
      reconciled: true,
      projectionName: 'github-claim',
      projectionId: projection.projectionId,
      assignmentResult: 'assignment-disabled',
    };
  }
  if (typeof reconcileClaim !== 'function') {
    throw leaseError('invalid-request', 'persisted assignee claim reconciler is required');
  }
  const proof = await reconcileClaim({
    input,
    projectionId: projection.projectionId,
    liveEligibility,
  });
  if (
    proof?.reconciled !== true ||
    proof.projectionName !== 'github-claim' ||
    proof.projectionId !== projection.projectionId
  ) {
    throw leaseError('authority-unavailable', 'prepared assignee claim proof does not match');
  }
  return proof;
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
  preparedEligibility,
  readEligibility,
  reconcileClaim,
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
  const replayingPersistedIntent = Boolean(existingIntent);
  let eligibility = preparedEligibility;
  let holder;
  let store;
  let intent;
  let request;

  if (!existingIntent) {
    const preparedGithub = validatePreparedGithubInput(projectionInputs.github, canonicalIssueId);
    validatePreparedEligibility(eligibility, preparedGithub);
    if (preparedGithub.assigneePolicy === 'enforced' && typeof reconcileClaim !== 'function') {
      throw leaseError('invalid-request', 'deferred assignee claim reconciler is required');
    }
  }

  const trustedBinding = await buildTrustedWorkLeaseBinding({
    projectDir,
    hostId,
    provider,
    agentRunId,
    sessionId,
    pid,
    branch,
    resolveWorktreeIdentity: resolveIdentity,
  });
  const { displayPath, ...trustedHolder } = trustedBinding;
  holder = Object.freeze(trustedHolder);
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
      binding: {
        sessionId,
        issueId: canonicalIssueId,
        worktreeId: holder.worktreeId,
        displayPath,
      },
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
  const { durableLease, acquiredAt } = validateAcquireReceipt(receipt, request);
  if (replayingPersistedIntent) {
    await recoverCommittedPostClaimRelease({
      store,
      durableLease,
      request,
      acquiredAt,
      sessionId,
      intent,
      projectDir,
      restoreSnapshot,
    });
    await verifyCurrentReplayAuthority({
      store,
      authority: {
        lease: durableLease,
        holder: request.holder,
        binding: request.binding,
      },
      issueId: canonicalIssueId,
      worktreeId: durableLease.worktreeId,
      sessionId,
      hostId,
      holderIdentity: request.holder,
      now,
    });
  }

  const rejectGrantedLease = async ({ code, message, cause }) => {
    try {
      if (typeof store.release !== 'function') {
        throw leaseError('authority-unavailable', 'work-lease release operation is required');
      }
      await store.release(releaseAfterClaimRequest(durableLease, request, acquiredAt));
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

  try {
    await reconcilePersistedClaim({
      intent,
      issueId: canonicalIssueId,
      readEligibility,
      reconcileClaim,
    });
  } catch (error) {
    if (error?.code === 'authority-forbidden') {
      await rejectGrantedLease({
        code: 'authority-forbidden',
        message: 'issue assignee changed after work-lease acquisition',
        cause: error,
      });
    }
    throw stableError(
      error,
      'authority-unavailable',
      'assignee claim outcome is indeterminate; durable work-lease intent retained'
    );
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
  const reconciledProjectionInputs = Object.fromEntries(
    WORK_LEASE_PROJECTIONS.map((name) => [name, currentIntent.projections[name].input])
  );
  if ((await clearIntent(sessionId, currentIntent?.transitionId, projectDir)) !== true) {
    throw leaseError('authority-unavailable', 'cannot clear reconciled work-lease intent');
  }
  return Object.freeze({
    lease: durableLease,
    receipt,
    request,
    eligibility,
    projectionInputs: reconciledProjectionInputs,
  });
}

export async function coordinateWorkLeaseResume({
  issueId,
  sessionId,
  projectDir,
  hostId,
  holderIdentity,
  getStore,
  readEligibility,
  reconcileClaim,
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
  const canonicalIssueId = canonicalIssue(issueId);
  requiredString(sessionId, 'work-lease sessionId');
  requiredString(projectDir, 'work-lease projectDir');
  const trustedHostId = requiredString(hostId, 'work-lease hostId');
  if (typeof getStore !== 'function') {
    throw leaseError('invalid-request', 'lazy work-lease provider is required');
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

  let worktree;
  try {
    worktree = await resolveIdentity(projectDir, { hostId: trustedHostId });
  } catch (error) {
    throw stableError(error, 'authority-unavailable', 'cannot resolve canonical worktree identity');
  }
  const worktreeId = requiredString(worktree?.worktreeId, 'canonical worktreeId');
  const trustedHolderIdentity = normalizeResumeBindingIdentity(holderIdentity, {
    worktree,
    sessionId,
    hostId: trustedHostId,
  });
  const trustedAuthorityHolder = Object.fromEntries(
    STABLE_HOLDER_FIELDS.map((field) => [field, trustedHolderIdentity[field]])
  );
  const store = await getStore();
  let session = await loadSession(sessionId, projectDir);
  if (!session || typeof session !== 'object') {
    throw leaseError('lease-not-held', 'session has no persisted work lease');
  }
  let authority =
    session.holder === undefined && session.binding === undefined
      ? await backfillPersistedWorkLeaseAuthority({
          session,
          issueId: canonicalIssueId,
          sessionId,
          projectDir,
          worktreeId,
          hostId: trustedHostId,
          store,
          saveSession: setActiveTask,
          allowedStates: ['active', 'paused'],
        })
      : persistedAuthority(session, canonicalIssueId, worktreeId);
  for (const [field, expectedValue] of Object.entries(trustedAuthorityHolder)) {
    if (authority.holder[field] !== expectedValue) {
      throw leaseError(
        'lease-not-held',
        `persisted resume holder ${field} does not match the trusted session identity`
      );
    }
  }
  let persistedLease = authority.lease;
  let intent = session.workLeaseIntent;
  const replayingPersistedIntent = Boolean(intent);
  if (!intent) {
    const requestedAt = canonicalTimestamp(now(), 'work-lease resume time');
    const request = renewRequest(
      authority,
      requestedAt,
      `resume:${sessionId}:${canonicalIssueId}:${randomUUID()}`
    );
    await saveIntent(
      sessionId,
      {
        operation: 'resume',
        issueId: canonicalIssueId,
        request,
        projectionInputs,
      },
      projectDir
    );
    session = await loadSession(sessionId, projectDir);
    intent = session?.workLeaseIntent;
  }

  let request = validateResumeIntentCorrelation({
    intent,
    issueId: canonicalIssueId,
    store,
    persistedLease,
  });
  let receipt = intent.receipt;
  if (!receipt) {
    const verifyRequest = {
      projectId: persistedLease.projectId,
      leaseId: persistedLease.leaseId,
      fencingToken: persistedLease.fencingToken,
      operation: 'task-bind',
      verifiedAt: request.requestedAt,
      holder: authority.holder,
      binding: authority.binding,
    };
    validateVerifyRequest(verifyRequest);
    try {
      if (!replayingPersistedIntent) {
        verifiedAuthorityLease(
          await store.verify(verifyRequest),
          persistedLease,
          canonicalIssueId,
          worktreeId,
          sessionId,
          trustedHostId,
          authority.holder
        );
      }
      receipt = await store.renew(request);
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
            'cannot restore prior session after definitive resume refusal'
          );
        }
      }
      throw stableError(error, 'authority-unavailable', 'work-lease resume renewal failed');
    }
    validateResumeReceipt(
      receipt,
      request,
      persistedLease,
      canonicalIssueId,
      worktreeId,
      sessionId,
      trustedHostId,
      authority.holder
    );
    await attachReceipt(sessionId, { receipt }, projectDir);
  }

  session = await loadSession(sessionId, projectDir);
  intent = session?.workLeaseIntent;
  authority = persistedAuthority(session, canonicalIssueId, worktreeId);
  persistedLease = authority.lease;
  request = validateResumeIntentCorrelation({
    intent,
    issueId: canonicalIssueId,
    store,
    persistedLease,
  });
  receipt = intent.receipt;
  const authorityLease = validateResumeReceipt(
    receipt,
    request,
    persistedLease,
    canonicalIssueId,
    worktreeId,
    sessionId,
    trustedHostId,
    authority.holder
  );
  const durableLease = normalizeLeaseContext({
    projectId: authorityLease.projectId,
    leaseId: authorityLease.leaseId,
    fencingToken: authorityLease.fencingToken,
    worktreeId,
  });
  if (replayingPersistedIntent) {
    await verifyCurrentReplayAuthority({
      store,
      authority: {
        lease: durableLease,
        holder: request.holder,
        binding: request.binding,
      },
      issueId: canonicalIssueId,
      worktreeId,
      sessionId,
      hostId: trustedHostId,
      holderIdentity: request.holder,
      now,
    });
  }

  await reconcilePersistedClaim({
    intent,
    issueId: canonicalIssueId,
    readEligibility,
    reconcileClaim,
  });

  let currentIntent = intent;
  for (const name of WORK_LEASE_PROJECTIONS) {
    const projection = currentIntent.projections[name];
    if (projection.completed === true) continue;
    const proof = await projections[name]({
      input: projection.input,
      lease: durableLease,
      receipt,
      request,
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
    session = await loadSession(sessionId, projectDir);
    currentIntent = session?.workLeaseIntent;
    persistedLease = expectedLease(session, canonicalIssueId, worktreeId);
    validateResumeIntentCorrelation({
      intent: currentIntent,
      issueId: canonicalIssueId,
      store,
      persistedLease,
    });
  }
  const reconciledProjectionInputs = Object.fromEntries(
    WORK_LEASE_PROJECTIONS.map((name) => [name, currentIntent.projections[name].input])
  );
  if ((await clearIntent(sessionId, currentIntent?.transitionId, projectDir)) !== true) {
    throw leaseError('authority-unavailable', 'cannot clear reconciled work-lease intent');
  }
  return Object.freeze({
    lease: durableLease,
    receipt,
    request,
    projectionInputs: reconciledProjectionInputs,
  });
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

  const authority =
    session.holder === undefined && session.binding === undefined
      ? await backfillPersistedWorkLeaseAuthority({
          session,
          issueId: canonicalIssueId,
          sessionId,
          projectDir,
          worktreeId: worktree.worktreeId,
          hostId,
          store,
          saveSession,
        })
      : persistedAuthority(session, canonicalIssueId, worktree.worktreeId);
  const persistedLease = authority.lease;
  const trustedHolderIdentity = normalizeHolderIdentity(holderIdentity);
  for (const [field, expectedValue] of Object.entries(trustedHolderIdentity)) {
    if (authority.holder[field] !== expectedValue) {
      throw leaseError(
        'lease-not-held',
        `persisted work-lease holder ${field} does not match the trusted session identity`
      );
    }
  }
  const ownerKey =
    suppliedHeartbeatOwnerKey ?? workLeaseHeartbeatOwnerKey(sessionId, persistedLease);
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
    holder: authority.holder,
    binding: authority.binding,
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
        await store.renew(renewRequest(authority, renewal.requestedAt, renewal.idempotencyKey)),
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
    await saveSession(
      sessionId,
      { ...session, lease: durableLease, holder: authority.holder, binding: authority.binding },
      projectDir
    );
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
  if (existing) return existing.acquire();
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
  let references = 0;
  const onProcessExit = () => stopAll();
  const stopAll = () => {
    if (stopped) return;
    stopped = true;
    clearIntervalImpl?.(timer);
    processEvents.removeListener('exit', onProcessExit);
    if (heartbeatOwners.get(ownerKey) === entry) heartbeatOwners.delete(ownerKey);
  };
  const acquire = () => {
    references += 1;
    let released = false;
    const stop = () => {
      if (released || stopped) return;
      released = true;
      references -= 1;
      if (references === 0) stopAll();
    };
    return Object.freeze({ ownerKey, timer, stop, shutdown: stop });
  };
  const entry = Object.freeze({ acquire });
  heartbeatOwners.set(ownerKey, entry);
  processEvents.once('exit', onProcessExit);
  return acquire();
}
