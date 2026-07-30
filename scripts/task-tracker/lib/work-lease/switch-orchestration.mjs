import { createHash, randomUUID as defaultRandomUUID } from 'node:crypto';

import {
  canonicalRequestJson,
  validateRenewRequest,
  validateSwitchLeaseRequest,
  validateVerifyRequest,
  WorkLeaseError,
} from '@kburson/aitm-ledger';

import { jsonlPath } from '../../word-counter.mjs';
import { claimAuditProjectionMarker } from '../assignee-guard.mjs';
import {
  attachWorkLeaseCompensationReceipt,
  attachWorkLeaseIntentReceipt,
  checkpointWorkLeaseCompensationProjection,
  checkpointWorkLeaseProjection,
  clearWorkLeaseIntent,
  commitWorkLeaseForwardPhase,
  getActiveTask,
  restoreActiveTaskSnapshot,
  setWorkLeaseCompensation,
  setWorkLeaseIntent,
} from '../../session-state.mjs';
import {
  normalizeLeaseContext,
  normalizePriorSessionSnapshot,
  validateWorkLeaseCompensation,
  validateWorkLeaseIntent,
  WORK_LEASE_PROJECTIONS,
} from './context.mjs';
import {
  buildTrustedWorkLeaseHolder,
  WORK_LEASE_HEARTBEAT_AGE_MS,
  WORK_LEASE_TTL_MS,
} from './guard.mjs';
import { validateIssueTimeExpectedFields } from './issue-time-projection.mjs';

const TERMINAL_SWITCH_CODES = new Set([
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
const LOGICAL_HOLDER_FIELDS = Object.freeze([
  'principalKind',
  'provider',
  'agentRunId',
  'sessionId',
  'hostId',
  'worktreeId',
  'pathHash',
  'branch',
]);

function leaseError(code, message, details) {
  return new WorkLeaseError(code, message, details);
}

function stableError(error, code, message) {
  if (error instanceof WorkLeaseError) return error;
  return leaseError(code, message);
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

function canonicalIssue(value, label) {
  const match = String(value ?? '').match(/^#?([1-9]\d*)$/);
  if (!match) {
    throw leaseError('invalid-request', `${label} must be a canonical positive decimal`);
  }
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

function sameJson(left, right) {
  return canonicalRequestJson(left) === canonicalRequestJson(right);
}

function stableHolder(holder) {
  return Object.fromEntries(LOGICAL_HOLDER_FIELDS.map((field) => [field, holder?.[field]]));
}

function validFileSnapshot(snapshot, expectedPath) {
  return (
    snapshot &&
    typeof snapshot === 'object' &&
    !Array.isArray(snapshot) &&
    snapshot.path === expectedPath &&
    typeof snapshot.present === 'boolean' &&
    typeof snapshot.bytesBase64 === 'string' &&
    (snapshot.present || snapshot.bytesBase64 === '')
  );
}

function sourceSessionFromSnapshot(intent) {
  const snapshot = normalizePriorSessionSnapshot(intent.priorSessionSnapshot);
  if (!snapshot.present) {
    throw leaseError('invalid-request', 'persisted switch intent has no source session snapshot');
  }
  try {
    return JSON.parse(Buffer.from(snapshot.bytesBase64, 'base64').toString('utf8'));
  } catch {
    throw leaseError('invalid-request', 'persisted switch source snapshot is unreadable');
  }
}

function validateSwitchIntentCorrelation({ intent, sourceIssueId, targetIssueId, holder, store }) {
  if (intent?.operation !== 'switchLease') {
    throw leaseError(
      'invalid-request',
      'persisted work-lease intent operation must be switchLease'
    );
  }
  let request;
  try {
    request = validateWorkLeaseIntent(intent, { requireAllProjections: true });
    validateSwitchLeaseRequest(request);
  } catch (error) {
    throw stableError(
      error,
      'invalid-request',
      `persisted switch intent is malformed: ${error?.message || 'unknown validation error'}`
    );
  }
  if (request.projectId !== store?.projectId) {
    throw leaseError('invalid-request', 'persisted switch project does not match authority');
  }
  if (
    request.issueId !== sourceIssueId ||
    request.target.issueId !== targetIssueId ||
    request.target.projectId !== request.projectId ||
    request.target.mode !== 'write'
  ) {
    throw leaseError('invalid-request', 'persisted switch source or target does not match bind');
  }
  if (request.target.requestedAt !== request.switchedAt) {
    throw leaseError('invalid-request', 'persisted switch target timestamp does not match');
  }
  if (!sameJson(stableHolder(request.target.holder), stableHolder(holder))) {
    throw leaseError('invalid-request', 'persisted switch holder does not match trusted holder');
  }

  const sourceSession = sourceSessionFromSnapshot(intent);
  const snapshotIssue = canonicalIssue(
    sourceSession.issue ?? sourceSession.leaseIssue,
    'persisted switch source issue'
  );
  let sourceLease;
  try {
    sourceLease = normalizeLeaseContext(sourceSession.lease);
  } catch {
    throw leaseError('invalid-request', 'persisted switch source lease is malformed');
  }
  if (
    snapshotIssue !== sourceIssueId ||
    sourceLease.projectId !== request.projectId ||
    sourceLease.leaseId !== request.leaseId ||
    sourceLease.fencingToken !== request.fencingToken ||
    sourceLease.worktreeId !== request.target.holder.worktreeId
  ) {
    throw leaseError('invalid-request', 'persisted switch request does not match source authority');
  }
  return request;
}

function validateSwitchReceipt(receipt, request) {
  const value = object(receipt, 'switch receipt');
  const lease = object(value.lease, 'switch receipt lease');
  const transition = object(value.transition, 'switch receipt transition');
  for (const field of [
    'projectId',
    'issueId',
    'mode',
    'leaseId',
    'fencingToken',
    'state',
    'holder',
    'acquiredAt',
    'heartbeatAt',
    'expiresAt',
    'audit',
  ]) {
    if (!Object.hasOwn(lease, field)) {
      throw leaseError('invalid-request', `switch receipt lease ${field} is required`);
    }
  }
  if (
    lease.projectId !== request.projectId ||
    lease.issueId !== request.target.issueId ||
    lease.mode !== 'write' ||
    lease.state !== 'active' ||
    lease.leaseId === request.leaseId ||
    !sameJson(lease.holder, request.target.holder)
  ) {
    throw leaseError('invalid-request', 'switch receipt target lease does not match request');
  }
  try {
    if (BigInt(lease.fencingToken) <= BigInt(request.fencingToken)) {
      throw new Error('not advanced');
    }
  } catch {
    throw leaseError('invalid-request', 'switch receipt target fence did not advance');
  }
  const switchedAt = parseTimestamp(request.switchedAt, 'switch request switchedAt');
  const expectedExpiresAt = new Date(switchedAt + request.target.ttlMs).toISOString();
  if (
    lease.acquiredAt !== request.switchedAt ||
    lease.heartbeatAt !== request.switchedAt ||
    lease.expiresAt !== expectedExpiresAt
  ) {
    throw leaseError('invalid-request', 'switch receipt target lease chronology does not match');
  }
  for (const field of ['transitionId', 'fromIssueId', 'fromLeaseId', 'fromToken', 'toIssueId']) {
    requiredString(transition[field], `switch receipt transition ${field}`);
  }
  if (
    transition.fromIssueId !== request.issueId ||
    transition.fromLeaseId !== request.leaseId ||
    transition.fromToken !== request.fencingToken ||
    transition.toIssueId !== request.target.issueId
  ) {
    throw leaseError('invalid-request', 'switch receipt transition does not match request');
  }
  const durableLease = normalizeLeaseContext({
    projectId: lease.projectId,
    leaseId: lease.leaseId,
    fencingToken: lease.fencingToken,
    worktreeId: request.target.holder.worktreeId,
  });
  return { durableLease, transitionId: transition.transitionId };
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

export function validateSwitchGithubProjectionInput(
  input,
  { sourceIssueId, targetIssueId, sessionId, request, projectionId } = {}
) {
  const target = canonicalIssue(targetIssueId, 'persisted GitHub switch target');
  const value = object(input, 'persisted GitHub switch input');
  if (
    value.issueNumber !== target ||
    typeof value.skippedNetwork !== 'boolean' ||
    typeof value.claimRequired !== 'boolean' ||
    !['enforced', 'disabled', 'offline'].includes(value.assigneePolicy) ||
    typeof value.currentUser !== 'string' ||
    typeof value.preparedKind !== 'string' ||
    !Array.isArray(value.preparedAssignees) ||
    value.preparedAssignees.some((assignee) => typeof assignee !== 'string') ||
    !Object.hasOwn(value, 'auditBody')
  ) {
    throw leaseError('invalid-request', 'persisted GitHub switch input is malformed');
  }
  if (
    value.assigneePolicy === 'enforced' &&
    (value.currentUser.trim() === '' || value.preparedKind.trim() === '')
  ) {
    throw leaseError('invalid-request', 'persisted switch assignment intent is incomplete');
  }
  if (value.claimRequired && (typeof value.auditBody !== 'string' || value.auditBody === '')) {
    throw leaseError('invalid-request', 'persisted switch assignment audit intent is incomplete');
  }
  if ((value.assigneePolicy === 'offline') !== value.skippedNetwork) {
    throw leaseError('invalid-request', 'persisted offline switch policy is inconsistent');
  }
  if (sourceIssueId !== undefined || request !== undefined) {
    const source = canonicalIssue(
      sourceIssueId ?? request?.issueId,
      'persisted GitHub switch source'
    );
    const trustedSessionId = requiredString(
      sessionId ?? request?.target?.holder?.sessionId,
      'persisted GitHub switch sessionId'
    );
    const switchInput = object(value.switch, 'persisted GitHub switch operation');
    if (
      switchInput.sourceIssue !== `#${source}` ||
      switchInput.targetIssue !== `#${target}` ||
      switchInput.sessionId !== trustedSessionId ||
      switchInput.jsonlPath !== jsonlPath(trustedSessionId) ||
      typeof switchInput.subOperations?.sessionRef !== 'string' ||
      switchInput.subOperations.sessionRef === '' ||
      typeof switchInput.subOperations?.issueTime !== 'string' ||
      switchInput.subOperations.issueTime === '' ||
      switchInput.subOperations.sessionRef === switchInput.subOperations.issueTime
    ) {
      throw leaseError(
        'invalid-request',
        'persisted GitHub switch operation does not match its source, target, or session'
      );
    }
    if (request) {
      if (
        request.issueId !== source ||
        request.target?.issueId !== target ||
        request.target?.holder?.sessionId !== trustedSessionId ||
        switchInput.ts !== request.switchedAt
      ) {
        throw leaseError(
          'invalid-request',
          'persisted GitHub switch operation does not match the immutable request'
        );
      }
      if (value.skippedNetwork) {
        if (switchInput.issueTimeExpected !== null) {
          throw leaseError(
            'invalid-request',
            'offline switch issue-time expectation is unexpected'
          );
        }
      } else {
        try {
          validateIssueTimeExpectedFields(switchInput.issueTimeExpected);
        } catch {
          throw leaseError(
            'invalid-request',
            'persisted switch issue-time expectation is malformed'
          );
        }
      }
    } else if (!isCanonicalTimestamp(switchInput.ts)) {
      throw leaseError('invalid-request', 'persisted GitHub switch timestamp is malformed');
    }
  }
  if (value.claimRequired && projectionId !== undefined) {
    const marker = claimAuditProjectionMarker(
      requiredString(projectionId, 'persisted GitHub projectionId')
    );
    if (!value.auditBody.includes(marker)) {
      throw leaseError(
        'invalid-request',
        'persisted switch assignment audit does not match its projection'
      );
    }
  } else if (!value.claimRequired && value.auditBody !== null) {
    throw leaseError('invalid-request', 'persisted switch assignment audit is unexpected');
  }
  if (
    value.switch &&
    projectionId !== undefined &&
    (!value.switch.subOperations.sessionRef.startsWith(`${projectionId}:`) ||
      !value.switch.subOperations.issueTime.startsWith(`${projectionId}:`))
  ) {
    throw leaseError(
      'invalid-request',
      'persisted GitHub switch suboperations do not match their projection'
    );
  }
  return value;
}

export function validateSwitchProjectionInputs(
  projections,
  { sourceIssueId, targetIssueId, sessionId, request, projectionContext } = {}
) {
  const source = canonicalIssue(sourceIssueId ?? request?.issueId, 'persisted switch source');
  const target = canonicalIssue(
    targetIssueId ?? request?.target?.issueId,
    'persisted switch target'
  );
  const trustedSessionId = requiredString(
    sessionId ?? request?.target?.holder?.sessionId,
    'persisted switch sessionId'
  );
  const sourceRef = `#${source}`;
  const targetRef = `#${target}`;
  const values = Object.fromEntries(
    WORK_LEASE_PROJECTIONS.map((name) => [
      name,
      object(projections?.[name]?.input ?? projections?.[name], `persisted ${name} switch input`),
    ])
  );
  const session = values.session;
  if (
    session.sessionId !== trustedSessionId ||
    session.switch?.sourceIssue !== sourceRef ||
    session.switch?.targetIssue !== targetRef ||
    session.activeTask?.issue !== targetRef ||
    session.activeTask?.entryStartTs !== request?.switchedAt ||
    session.activeTask?.boundAt !== request?.switchedAt ||
    session.state?.active !== targetRef ||
    session.state?.lastActive !== targetRef ||
    session.state?.entryStartTs !== request?.switchedAt ||
    session.state?.wordsAtEntryStart !== session.activeTask?.wordsAtStart ||
    session.marker?.task !== targetRef ||
    session.marker?.ts !== request?.switchedAt
  ) {
    throw leaseError(
      'invalid-request',
      'persisted session switch input does not match source, target, or session'
    );
  }
  const context = object(projectionContext, 'persisted switch projection context');
  const sourceState = object(context.sourceState, 'persisted switch source state');
  const mutableStateKeys = new Set([
    'active',
    'lastActive',
    'entryStartTs',
    'wordsAtEntryStart',
    'pausedAtTs',
    'lastWordMarker',
  ]);
  const removedStateKeys = new Set(['paused', 'pauseReasonSlug', 'pauseReasonText']);
  const stateShapeMatches =
    Object.keys(session.state).every(
      (key) =>
        Object.hasOwn(sourceState, key) || mutableStateKeys.has(key) || removedStateKeys.has(key)
    ) &&
    Object.entries(sourceState).every(
      ([key, value]) =>
        mutableStateKeys.has(key) ||
        removedStateKeys.has(key) ||
        sameJson(session.state[key], value)
    );
  if (
    !stateShapeMatches ||
    session.state.pausedAtTs !== null ||
    session.orphanFinalize?.enabled !== true ||
    session.orphanFinalize?.sessionId !== trustedSessionId ||
    session.orphanFinalize?.reason !== 'orphan-finalize' ||
    session.marker.path !== context.markerPath ||
    !Number.isSafeInteger(session.marker.line) ||
    session.marker.line < 0 ||
    !Number.isSafeInteger(session.marker.words) ||
    session.marker.words !== session.activeTask.wordsAtStart ||
    !Number.isSafeInteger(session.marker.wordsFull) ||
    session.marker.wordsFull < session.marker.words ||
    !validFileSnapshot(session.compensationSnapshot?.globalState, context.statePath) ||
    !validFileSnapshot(session.compensationSnapshot?.wordMarker, context.markerPath) ||
    !validFileSnapshot(session.compensationSnapshot?.pendingPause, context.pendingPausePath)
  ) {
    throw leaseError('invalid-request', 'persisted session switch recovery paths do not match');
  }
  const fleet = values.fleet;
  const trustedBranch = request?.target?.holder?.branch;
  const trustedBinding = stableHolder(request?.target?.holder);
  const expectedPathHash = createHash('sha256').update(context.displayPath).digest('hex');
  if (
    fleet.sourceIssue !== sourceRef ||
    fleet.targetIssue !== targetRef ||
    fleet.source?.issue !== sourceRef ||
    fleet.target?.issue !== targetRef ||
    fleet.source.worktreePath !== context.displayPath ||
    fleet.target.worktreePath !== context.displayPath ||
    fleet.source.branch !== trustedBranch ||
    fleet.target.branch !== trustedBranch ||
    fleet.source.status !== 'active' ||
    fleet.target.status !== 'active' ||
    fleet.target.startedAt !== request?.switchedAt ||
    !isCanonicalTimestamp(fleet.source.startedAt) ||
    Date.parse(fleet.source.startedAt) > Date.parse(request?.switchedAt) ||
    !sameJson(stableHolder(fleet.source.binding), trustedBinding) ||
    !sameJson(stableHolder(fleet.target.binding), trustedBinding) ||
    request?.target?.holder?.pathHash !== expectedPathHash
  ) {
    throw leaseError(
      'invalid-request',
      'persisted fleet switch input does not match source or target'
    );
  }
  const timing = values.timing;
  const timingProjectionId = projections?.timing?.projectionId;
  const expectedOperations = [
    ['outgoing:reengage', source],
    ['outgoing:switch-out', source],
    ['incoming:synthetic-departure', target],
    ['incoming:bind', target],
  ];
  let priorOperationIndex = -1;
  let sawSwitchOut = false;
  const timingRowsMalformed =
    !Array.isArray(timing.rows) ||
    timing.rows.some((row) => {
      const operationIndex = expectedOperations.findIndex(
        ([operation]) => operation === row?.subOperationId
      );
      const expectedIssue = expectedOperations[operationIndex]?.[1];
      if (
        operationIndex < 0 ||
        operationIndex <= priorOperationIndex ||
        String(row?.issueNumber) !== expectedIssue ||
        row?.projectionId !== timingProjectionId ||
        typeof row?.row !== 'string' ||
        row.row === ''
      ) {
        return true;
      }
      priorOperationIndex = operationIndex;
      sawSwitchOut ||= row.subOperationId === 'outgoing:switch-out';
      const event = row.row.split('|')[2]?.trim();
      const expectedEvent =
        row.subOperationId === 'outgoing:reengage'
          ? 'resumed'
          : row.subOperationId === 'outgoing:switch-out'
            ? `switch-out:${targetRef}`
            : row.subOperationId === 'incoming:synthetic-departure'
              ? 'pause:auto-detected-gap'
              : timing.decision?.emittedEvent;
      if (!expectedEvent || event !== expectedEvent) return true;
      if (row.subOperationId === 'incoming:synthetic-departure') return false;
      const timestamp = row.row.match(
        /\b(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}(?::\d{2})?) ([+-]\d{2}:\d{2})\b/
      );
      if (!timestamp) return true;
      return (
        Math.floor(Date.parse(`${timestamp[1]}T${timestamp[2]}${timestamp[3]}`) / 1000) !==
        Math.floor(Date.parse(request?.switchedAt) / 1000)
      );
    });
  if (
    timing.sourceIssue !== sourceRef ||
    timing.targetIssue !== targetRef ||
    timing.decision?.mode !== 'switch' ||
    (!timing.skippedNetwork &&
      ((timing.decision?.suppressed === true) !==
        !timing.rows?.some((row) => row.subOperationId === 'incoming:bind') ||
        Boolean(timing.decision?.syntheticGap) !==
          Boolean(
            timing.rows?.some((row) => row.subOperationId === 'incoming:synthetic-departure')
          ))) ||
    (timing.skippedNetwork ? timing.rows?.length !== 0 : timingRowsMalformed || !sawSwitchOut)
  ) {
    throw leaseError(
      'invalid-request',
      'persisted timing switch input does not match source or target'
    );
  }
  validateSwitchGithubProjectionInput(values.github, {
    sourceIssueId: source,
    targetIssueId: target,
    sessionId: trustedSessionId,
    request,
    projectionId: projections?.github?.projectionId,
  });
  return values;
}

function isCanonicalTimestamp(value) {
  try {
    parseTimestamp(value, 'persisted GitHub switch timestamp');
    return true;
  } catch {
    return false;
  }
}

function validatePreparedEligibility(prepared, githubInput) {
  if (!prepared?.ok) {
    throw leaseError('authority-forbidden', 'incoming issue is not eligible for switch');
  }
  if (githubInput.assigneePolicy !== 'enforced') return;
  const actualAssignees = (prepared.assignees ?? []).map((value) => String(value).toLowerCase());
  const expectedAssignees = githubInput.preparedAssignees.map((value) =>
    String(value).toLowerCase()
  );
  if (
    prepared.claimRequired !== githubInput.claimRequired ||
    String(prepared.currentUser ?? '').toLowerCase() !== githubInput.currentUser.toLowerCase() ||
    !sameJson(actualAssignees, expectedAssignees)
  ) {
    throw leaseError(
      'invalid-request',
      'prepared eligibility does not match persisted switch assignment intent'
    );
  }
}

async function reconcileTargetClaim({ intent, targetIssueId, readEligibility, reconcileClaim }) {
  const github = intent.projections.github;
  const input = validateSwitchGithubProjectionInput(github.input, {
    targetIssueId,
    projectionId: github.projectionId,
  });
  if (input.skippedNetwork) {
    return {
      reconciled: true,
      projectionName: 'github-claim',
      projectionId: github.projectionId,
      assignmentResult: 'network-skipped',
    };
  }
  if (typeof readEligibility !== 'function') {
    throw leaseError('invalid-request', 'target assignment eligibility reader is required');
  }
  const liveEligibility = await readEligibility();
  if (!liveEligibility?.ok) {
    if (
      liveEligibility?.kind === 'assignee-mismatch' &&
      liveEligibility?.assigneeKind === 'unverifiable'
    ) {
      throw leaseError('authority-unavailable', 'target assignee is temporarily unverifiable');
    }
    throw leaseError('authority-forbidden', 'target issue is no longer eligible for switch');
  }
  if (input.assigneePolicy !== 'enforced') {
    return {
      reconciled: true,
      projectionName: 'github-claim',
      projectionId: github.projectionId,
      assignmentResult: 'assignment-disabled',
    };
  }
  if (typeof reconcileClaim !== 'function') {
    throw leaseError('invalid-request', 'target assignment claim reconciler is required');
  }
  const proof = await reconcileClaim({
    input,
    projectionId: github.projectionId,
    liveEligibility,
  });
  if (
    proof?.reconciled !== true ||
    proof.projectionName !== 'github-claim' ||
    proof.projectionId !== github.projectionId
  ) {
    throw leaseError('authority-unavailable', 'target assignee claim proof does not match');
  }
  return proof;
}

async function verifyReceiptAuthority({ store, receipt, request, sessionId, hostId, now }) {
  if (typeof store?.verify !== 'function') {
    throw leaseError('authority-unavailable', 'switch receipt replay requires authority verify');
  }
  const { durableLease } = validateSwitchReceipt(receipt, request);
  const verifiedAt = canonicalTimestamp(now(), 'switch receipt replay verification time');
  const verifyRequest = {
    projectId: durableLease.projectId,
    leaseId: durableLease.leaseId,
    fencingToken: durableLease.fencingToken,
    operation: 'task-bind',
    verifiedAt,
  };
  validateVerifyRequest(verifyRequest);
  let result;
  try {
    result = await store.verify(verifyRequest);
  } catch (error) {
    throw stableError(error, 'authority-unavailable', 'switch receipt authority verify failed');
  }
  const validateAuthority = (value, label) => {
    const authorityLease = object(value, label);
    if (
      authorityLease.projectId !== durableLease.projectId ||
      authorityLease.issueId !== request.target.issueId ||
      authorityLease.leaseId !== durableLease.leaseId ||
      authorityLease.fencingToken !== durableLease.fencingToken ||
      !['active', 'paused'].includes(authorityLease.state) ||
      authorityLease.holder?.sessionId !== sessionId ||
      authorityLease.holder?.hostId !== hostId ||
      !sameJson(authorityLease.holder, request.target.holder)
    ) {
      throw leaseError('authority-unavailable', 'switch receipt authority does not match target');
    }
    const acquiredAt = parseTimestamp(authorityLease.acquiredAt, `${label} acquiredAt`);
    const heartbeatAt = parseTimestamp(authorityLease.heartbeatAt, `${label} heartbeatAt`);
    const expiresAt = parseTimestamp(authorityLease.expiresAt, `${label} expiresAt`);
    if (heartbeatAt < acquiredAt || expiresAt <= heartbeatAt) {
      throw leaseError('authority-unavailable', 'switch receipt authority chronology is invalid');
    }
    return authorityLease;
  };
  if (result.allowed !== true) {
    throw leaseError('authority-unavailable', 'switch receipt authority was not allowed');
  }
  let authorityLease = validateAuthority(result.lease, 'switch authority verify response lease');
  const verifiedAtMs = parseTimestamp(verifiedAt, 'switch receipt replay verification time');
  const heartbeatAtMs = parseTimestamp(authorityLease.heartbeatAt, 'switch authority heartbeatAt');
  const expiresAtMs = parseTimestamp(authorityLease.expiresAt, 'switch authority expiresAt');
  if (parseTimestamp(authorityLease.acquiredAt, 'switch authority acquiredAt') > verifiedAtMs) {
    throw leaseError('authority-unavailable', 'switch receipt authority begins in the future');
  }
  if (expiresAtMs <= verifiedAtMs || verifiedAtMs - heartbeatAtMs >= WORK_LEASE_HEARTBEAT_AGE_MS) {
    if (typeof store.renew !== 'function') {
      throw leaseError('authority-unavailable', 'switch receipt replay requires authority renew');
    }
    const bucket = Math.floor(verifiedAtMs / WORK_LEASE_HEARTBEAT_AGE_MS);
    const requestedAt = new Date(bucket * WORK_LEASE_HEARTBEAT_AGE_MS).toISOString();
    const renewRequest = {
      projectId: durableLease.projectId,
      leaseId: durableLease.leaseId,
      fencingToken: durableLease.fencingToken,
      idempotencyKey: `renew:${durableLease.leaseId}:${durableLease.fencingToken}:${bucket}`,
      requestedAt,
      ttlMs: WORK_LEASE_TTL_MS,
    };
    validateRenewRequest(renewRequest);
    try {
      authorityLease = validateAuthority(
        await store.renew(renewRequest),
        'switch authority renewal receipt'
      );
    } catch (error) {
      throw stableError(error, 'authority-unavailable', 'switch receipt authority renewal failed');
    }
    const expectedExpiresAt = new Date(
      parseTimestamp(requestedAt, 'switch authority renewal requestedAt') + WORK_LEASE_TTL_MS
    ).toISOString();
    if (
      authorityLease.heartbeatAt !== requestedAt ||
      authorityLease.expiresAt !== expectedExpiresAt
    ) {
      throw leaseError(
        'authority-unavailable',
        'switch receipt authority renewal does not match request'
      );
    }
  }
  if (parseTimestamp(authorityLease.expiresAt, 'switch authority expiresAt') <= verifiedAtMs) {
    throw leaseError('authority-unavailable', 'switch receipt authority is not live');
  }
  return authorityLease;
}

function deterministicCompensationRequest(forwardRequest, forwardReceipt, compensationAt) {
  const targetLease = object(forwardReceipt?.lease, 'forward switch receipt target lease');
  const transitionId = requiredString(
    forwardReceipt?.transition?.transitionId,
    'forward switch transitionId'
  );
  const request = {
    projectId: forwardRequest.projectId,
    issueId: forwardRequest.target.issueId,
    leaseId: targetLease.leaseId,
    fencingToken: targetLease.fencingToken,
    idempotencyKey: `compensate:${transitionId}`,
    switchedAt: compensationAt,
    target: {
      projectId: forwardRequest.projectId,
      issueId: forwardRequest.issueId,
      mode: 'write',
      idempotencyKey: `compensate-target:${transitionId}`,
      requestedAt: compensationAt,
      ttlMs: forwardRequest.target.ttlMs,
      holder: forwardRequest.target.holder,
    },
  };
  validateSwitchLeaseRequest(request);
  return request;
}

function validateCompensationCorrelation(intent, forwardRequest, forwardReceipt) {
  let request;
  try {
    request = validateWorkLeaseCompensation(intent, { requireAllProjections: true });
  } catch (error) {
    throw stableError(
      error,
      'invalid-request',
      `persisted compensation is malformed: ${error?.message || 'unknown validation error'}`
    );
  }
  const expected = deterministicCompensationRequest(
    forwardRequest,
    forwardReceipt,
    request.switchedAt
  );
  if (
    !sameJson(request, expected) ||
    intent.compensation.reason !== 'target-ineligible-after-switch'
  ) {
    throw leaseError(
      'invalid-request',
      'persisted compensation does not match the immutable forward transition'
    );
  }
  for (const name of WORK_LEASE_PROJECTIONS) {
    const input = object(
      intent.compensation.projections?.[name]?.input,
      `persisted compensation ${name} input`
    );
    if (
      input.compensation !== true ||
      input.forwardTransitionId !== intent.transitionId ||
      !sameJson(input.forwardInput, intent.projections[name].input)
    ) {
      throw leaseError(
        'invalid-request',
        `persisted compensation ${name} input does not match the forward transition`
      );
    }
  }
  return request;
}

async function coordinateSwitchCompensation({
  sessionId,
  projectDir,
  sourceIssueId,
  targetIssueId,
  hostId,
  store,
  forwardRequest,
  forwardReceipt,
  projections,
  loadSession,
  saveCompensation,
  attachCompensationReceipt,
  checkpointCompensationProjection,
  clearIntent,
  now,
}) {
  let intent = (await loadSession(sessionId, projectDir))?.workLeaseIntent;
  if (!intent?.compensation) {
    const compensationAt = canonicalTimestamp(now(), 'work-lease compensation time');
    const request = deterministicCompensationRequest(
      forwardRequest,
      forwardReceipt,
      compensationAt
    );
    const projectionInputs = Object.fromEntries(
      WORK_LEASE_PROJECTIONS.map((name) => [
        name,
        {
          forwardInput: intent.projections[name].input,
          compensation: true,
          forwardTransitionId: intent.transitionId,
        },
      ])
    );
    await saveCompensation(
      sessionId,
      {
        request,
        reason: 'target-ineligible-after-switch',
        projectionInputs,
      },
      projectDir
    );
    intent = (await loadSession(sessionId, projectDir))?.workLeaseIntent;
  }
  let request = validateCompensationCorrelation(intent, forwardRequest, forwardReceipt);
  let receipt = intent.compensation.receipt;
  if (!receipt) {
    try {
      receipt = await store.switchLease(request);
    } catch (error) {
      throw stableError(
        error,
        'authority-unavailable',
        'work-lease switch compensation failed; recovery state retained'
      );
    }
    const validated = validateSwitchReceipt(receipt, request);
    await attachCompensationReceipt(
      sessionId,
      { receipt, transitionId: validated.transitionId },
      projectDir
    );
  }

  intent = (await loadSession(sessionId, projectDir))?.workLeaseIntent;
  request = validateCompensationCorrelation(intent, forwardRequest, forwardReceipt);
  receipt = intent.compensation.receipt;
  const { durableLease, transitionId } = validateSwitchReceipt(receipt, request);
  if (intent.compensation.transitionId !== transitionId) {
    throw leaseError('invalid-request', 'persisted compensation transition does not match receipt');
  }
  await verifyReceiptAuthority({
    store,
    receipt,
    request,
    sessionId,
    hostId,
    now,
  });

  let currentIntent = intent;
  for (const name of WORK_LEASE_PROJECTIONS) {
    const projection = currentIntent.compensation.projections[name];
    if (projection.completed === true) continue;
    const proof = await projections[name]({
      phase: 'compensation',
      input: projection.input,
      lease: durableLease,
      receipt,
      request,
      sourceIssueId: targetIssueId,
      targetIssueId: sourceIssueId,
      transitionId,
      forwardTransitionId: currentIntent.transitionId,
      projectionName: name,
      projectionId: projection.projectionId,
    });
    validateProjectionProof(proof, name, projection.projectionId);
    await checkpointCompensationProjection(
      sessionId,
      name,
      proof,
      transitionId,
      canonicalTimestamp(now(), `work-lease compensation ${name} checkpoint time`),
      projectDir
    );
    currentIntent = (await loadSession(sessionId, projectDir))?.workLeaseIntent;
    validateCompensationCorrelation(currentIntent, forwardRequest, forwardReceipt);
    if (currentIntent.compensation.transitionId !== transitionId) {
      throw leaseError('invalid-request', 'compensation transition changed during projection');
    }
  }
  if ((await clearIntent(sessionId, transitionId, projectDir)) !== true) {
    throw leaseError('authority-unavailable', 'cannot clear reconciled compensation intent');
  }
  throw leaseError(
    'authority-forbidden',
    'target issue became ineligible; source authority was restored'
  );
}

export async function coordinateWorkLeaseSwitch({
  sourceIssueId,
  targetIssueId,
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
  projectionContext,
  projections,
  loadSession = getActiveTask,
  saveIntent = setWorkLeaseIntent,
  saveCompensation = setWorkLeaseCompensation,
  attachReceipt = attachWorkLeaseIntentReceipt,
  attachCompensationReceipt = attachWorkLeaseCompensationReceipt,
  checkpointProjection = checkpointWorkLeaseProjection,
  checkpointCompensationProjection = checkpointWorkLeaseCompensationProjection,
  commitForwardPhase = commitWorkLeaseForwardPhase,
  clearIntent = clearWorkLeaseIntent,
  restoreSnapshot = restoreActiveTaskSnapshot,
  resolveWorktreeIdentity,
  afterReconcile,
  requestTimestamp,
  now = () => new Date(),
  randomUUID = defaultRandomUUID,
} = {}) {
  const source = canonicalIssue(sourceIssueId, 'switch source issue');
  const target = canonicalIssue(targetIssueId, 'switch target issue');
  if (source === target) {
    throw leaseError('invalid-request', 'cross-issue switch target must differ from source');
  }
  requiredString(sessionId, 'work-lease sessionId');
  requiredString(projectDir, 'work-lease projectDir');
  const trustedHostId = requiredString(hostId, 'work-lease hostId');
  if (typeof getStore !== 'function') {
    throw leaseError('invalid-request', 'lazy work-lease provider is required');
  }
  object(projectionInputs, 'work-lease projection inputs');
  object(projections, 'work-lease projection callbacks');
  for (const name of WORK_LEASE_PROJECTIONS) {
    if (!Object.hasOwn(projectionInputs, name) || typeof projections[name] !== 'function') {
      throw leaseError('invalid-request', `work-lease ${name} projection is required`);
    }
  }

  const existing = await loadSession(sessionId, projectDir);
  const existingIntent = existing?.workLeaseIntent;
  if (existingIntent) {
    const existingRequest = validateWorkLeaseIntent(existingIntent, {
      requireAllProjections: true,
    });
    validateSwitchProjectionInputs(existingIntent.projections, {
      sourceIssueId: source,
      targetIssueId: target,
      sessionId,
      request: existingRequest,
      projectionContext,
    });
  } else {
    const githubInput = validateSwitchGithubProjectionInput(projectionInputs.github, {
      targetIssueId: target,
    });
    validatePreparedEligibility(preparedEligibility, githubInput);
  }
  const holder = await buildTrustedWorkLeaseHolder({
    projectDir,
    hostId: trustedHostId,
    provider,
    agentRunId,
    sessionId,
    pid,
    branch,
    ...(resolveWorktreeIdentity ? { resolveWorktreeIdentity } : {}),
  });
  const store = await getStore();

  let intent = existingIntent;
  let request;
  if (intent) {
    request = validateSwitchIntentCorrelation({
      intent,
      sourceIssueId: source,
      targetIssueId: target,
      holder,
      store,
    });
  } else {
    let sourceLease;
    try {
      sourceLease = normalizeLeaseContext(existing?.lease);
    } catch {
      throw leaseError('lease-not-held', 'session has no source work lease for switch');
    }
    if (
      canonicalIssue(existing?.issue ?? existing?.leaseIssue, 'switch source session issue') !==
        source ||
      sourceLease.projectId !== store?.projectId ||
      sourceLease.worktreeId !== holder.worktreeId
    ) {
      throw leaseError('lease-not-held', 'source session authority does not match switch request');
    }
    const switchedAt =
      requestTimestamp === undefined
        ? canonicalTimestamp(now(), 'work-lease switch time')
        : new Date(
            parseTimestamp(requestTimestamp, 'persisted work-lease switch request time')
          ).toISOString();
    const requestId = randomUUID();
    request = {
      projectId: sourceLease.projectId,
      issueId: source,
      leaseId: sourceLease.leaseId,
      fencingToken: sourceLease.fencingToken,
      idempotencyKey: `switch:${sessionId}:${source}:${target}:${requestId}`,
      switchedAt,
      target: {
        projectId: sourceLease.projectId,
        issueId: target,
        mode: 'write',
        idempotencyKey: `switch-target:${sessionId}:${target}:${requestId}`,
        requestedAt: switchedAt,
        ttlMs: WORK_LEASE_TTL_MS,
        holder,
      },
    };
    validateSwitchLeaseRequest(request);
    await saveIntent(
      sessionId,
      { operation: 'switchLease', request, projectionInputs },
      projectDir
    );
    intent = (await loadSession(sessionId, projectDir))?.workLeaseIntent;
    request = validateSwitchIntentCorrelation({
      intent,
      sourceIssueId: source,
      targetIssueId: target,
      holder,
      store,
    });
  }
  validateSwitchProjectionInputs(intent.projections, {
    sourceIssueId: source,
    targetIssueId: target,
    sessionId,
    request,
    projectionContext,
  });

  let receipt = intent.receipt;
  if (!receipt) {
    try {
      receipt = await store.switchLease(request);
    } catch (error) {
      if (TERMINAL_SWITCH_CODES.has(error?.code)) {
        const restored = await restoreSnapshot(
          sessionId,
          intent.priorSessionSnapshot,
          request.idempotencyKey,
          projectDir
        );
        if (!restored) {
          throw leaseError(
            'authority-unavailable',
            'cannot restore source session after definitive switch refusal'
          );
        }
      }
      throw stableError(error, 'authority-unavailable', 'work-lease switch failed');
    }
    const validated = validateSwitchReceipt(receipt, request);
    await attachReceipt(sessionId, { receipt, transitionId: validated.transitionId }, projectDir);
  }

  intent = (await loadSession(sessionId, projectDir))?.workLeaseIntent;
  request = validateSwitchIntentCorrelation({
    intent,
    sourceIssueId: source,
    targetIssueId: target,
    holder,
    store,
  });
  receipt = intent.receipt;
  const { durableLease, transitionId } = validateSwitchReceipt(receipt, request);
  if (intent.transitionId !== transitionId) {
    throw leaseError('invalid-request', 'persisted switch transition does not match receipt');
  }
  if (intent.compensation) {
    return coordinateSwitchCompensation({
      sessionId,
      projectDir,
      sourceIssueId: source,
      targetIssueId: target,
      hostId: trustedHostId,
      store,
      forwardRequest: request,
      forwardReceipt: receipt,
      projections,
      loadSession,
      saveCompensation,
      attachCompensationReceipt,
      checkpointCompensationProjection,
      clearIntent,
      now,
    });
  }
  if (existingIntent) {
    await verifyReceiptAuthority({
      store,
      receipt,
      request,
      sessionId,
      hostId: trustedHostId,
      now,
    });
  }

  if (!intent.forwardPhase) {
    let claimProof;
    try {
      claimProof = await reconcileTargetClaim({
        intent,
        targetIssueId: target,
        readEligibility,
        reconcileClaim,
      });
    } catch (error) {
      if (error?.code === 'authority-forbidden') {
        return coordinateSwitchCompensation({
          sessionId,
          projectDir,
          sourceIssueId: source,
          targetIssueId: target,
          hostId: trustedHostId,
          store,
          forwardRequest: request,
          forwardReceipt: receipt,
          projections,
          loadSession,
          saveCompensation,
          attachCompensationReceipt,
          checkpointCompensationProjection,
          clearIntent,
          now,
        });
      }
      throw error;
    }
    await commitForwardPhase(
      sessionId,
      {
        claimProof,
        transitionId,
        committedAt: canonicalTimestamp(now(), 'work-lease forward phase commit time'),
      },
      projectDir
    );
    intent = (await loadSession(sessionId, projectDir))?.workLeaseIntent;
    validateSwitchIntentCorrelation({
      intent,
      sourceIssueId: source,
      targetIssueId: target,
      holder,
      store,
    });
  }

  let currentIntent = intent;
  for (const name of WORK_LEASE_PROJECTIONS) {
    const projection = currentIntent.projections[name];
    if (projection.completed === true) continue;
    const proof = await projections[name]({
      phase: 'forward',
      input: projection.input,
      lease: durableLease,
      receipt,
      request,
      sourceIssueId: source,
      targetIssueId: target,
      transitionId,
      projectionName: name,
      projectionId: projection.projectionId,
    });
    validateProjectionProof(proof, name, projection.projectionId);
    await checkpointProjection(
      sessionId,
      name,
      proof,
      transitionId,
      canonicalTimestamp(now(), `work-lease ${name} checkpoint time`),
      projectDir
    );
    currentIntent = (await loadSession(sessionId, projectDir))?.workLeaseIntent;
    validateSwitchIntentCorrelation({
      intent: currentIntent,
      sourceIssueId: source,
      targetIssueId: target,
      holder,
      store,
    });
    if (currentIntent.transitionId !== transitionId) {
      throw leaseError('invalid-request', 'persisted switch transition changed during projection');
    }
  }
  const reconciledProjectionInputs = Object.fromEntries(
    WORK_LEASE_PROJECTIONS.map((name) => [name, currentIntent.projections[name].input])
  );
  if ((await clearIntent(sessionId, transitionId, projectDir)) !== true) {
    throw leaseError('authority-unavailable', 'cannot clear reconciled switch intent');
  }
  if (typeof afterReconcile === 'function') {
    await afterReconcile({ lease: durableLease, receipt, request, transitionId });
  }
  return Object.freeze({
    lease: durableLease,
    receipt,
    request,
    transitionId,
    eligibility: preparedEligibility,
    projectionInputs: reconciledProjectionInputs,
  });
}
