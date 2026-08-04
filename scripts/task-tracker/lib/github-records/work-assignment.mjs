import { isDeepStrictEqual } from 'node:util';

import { authorizeCoordinatorAdoption } from './coordination-authority.mjs';
import { resolveSupersession, validateCapsuleChain } from './capsule-chain.mjs';
import { assertNoSecretRecordData, renderAitmRecord } from './record-envelope.mjs';

const ASSIGNMENT_KEYS = [
  'branch',
  'coordinator',
  'dependency',
  'epoch',
  'files',
  'grantId',
  'issue',
  'schema',
  'subsystem',
  'verification',
  'worker',
];
const DEPENDENCY_KEYS = ['baselineSha', 'recordIds'];
const VERIFICATION_KEYS = ['contractEpoch', 'verifierIds'];
const IDENTITY_KEYS = ['actor', 'platform', 'session'];
const RECORD_KEYS = ['commentNodeId', 'envelope'];
const SUBMISSION_KEYS = [
  'assignmentRecordId',
  'branch',
  'dependency',
  'files',
  'issue',
  'result',
  'schema',
  'status',
  'subsystem',
  'verification',
  'worker',
];
const DISPOSITION_KEYS = [
  'assignmentCommentNodeId',
  'assignmentRecordId',
  'decidedBy',
  'decision',
  'epoch',
  'grantId',
  'issue',
  'reason',
  'schema',
  'submissionCommentNodeId',
  'submissionRecordId',
];
const ULID_RE = /^[0-7][0-9A-HJKMNP-TV-Z]{25}$/;
const SHA_RE = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/;
const SUBSYSTEM_RE = /^[A-Za-z0-9](?:[A-Za-z0-9._-]{0,127})$/;
const MAX_RESULT_BYTES = 256 * 1024;

const SUBMISSION_TYPES = new Set([
  'execution-result',
  'verification-evidence',
  'review-result',
  'handoff',
]);

function isWorkAssignmentSubmissionType(recordType) {
  return SUBMISSION_TYPES.has(recordType);
}

function assignmentError(category) {
  return new TypeError(`work-assignment:${category}`);
}

function isPlainDataObject(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) return false;
  return Reflect.ownKeys(value).every((key) => {
    if (typeof key !== 'string') return false;
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    return descriptor?.enumerable === true && Object.hasOwn(descriptor, 'value');
  });
}

function hasExactlyKeys(value, keys) {
  if (!isPlainDataObject(value)) return false;
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
}

function isOpaqueId(value) {
  return (
    typeof value === 'string' &&
    value.length > 0 &&
    value.length <= 256 &&
    value === value.trim() &&
    ![...value].some((character) => {
      const code = character.charCodeAt(0);
      return code <= 0x1f || code === 0x7f;
    })
  );
}

function isRecordId(value) {
  return typeof value === 'string' && ULID_RE.test(value);
}

function normalizeBranch(value, category = 'assignment') {
  if (!isOpaqueId(value)) throw assignmentError(category);
  const branch = value.startsWith('refs/heads/') ? value.slice('refs/heads/'.length) : value;
  if (!branch || branch.startsWith('/') || branch.endsWith('/') || branch.includes('//')) {
    throw assignmentError(category);
  }
  return branch;
}

function validateIdentity(value, category) {
  if (!hasExactlyKeys(value, IDENTITY_KEYS) || !Object.values(value).every(isOpaqueId)) {
    throw assignmentError(category);
  }
  return value;
}

function validateFiles(files, category) {
  if (!Array.isArray(files) || files.length > 256) throw assignmentError(category);
  for (const file of files) {
    if (
      !isOpaqueId(file) ||
      file.length > 1024 ||
      file.startsWith('/') ||
      /^[A-Za-z]:/.test(file) ||
      file.includes('\\') ||
      file.split('/').some((segment) => segment === '' || segment === '.' || segment === '..')
    ) {
      throw assignmentError(category);
    }
  }
  if (new Set(files).size !== files.length) throw assignmentError(category);
  return files;
}

function validateSubsystem(subsystem, category) {
  if (subsystem !== null && (typeof subsystem !== 'string' || !SUBSYSTEM_RE.test(subsystem))) {
    throw assignmentError(category);
  }
  return subsystem;
}

function validateDependency(dependency, category) {
  if (
    !hasExactlyKeys(dependency, DEPENDENCY_KEYS) ||
    typeof dependency.baselineSha !== 'string' ||
    !SHA_RE.test(dependency.baselineSha) ||
    !Array.isArray(dependency.recordIds) ||
    dependency.recordIds.length > 256 ||
    dependency.recordIds.some((recordId) => !isRecordId(recordId)) ||
    new Set(dependency.recordIds).size !== dependency.recordIds.length
  ) {
    throw assignmentError(category);
  }
  return dependency;
}

function validateVerification(verification, category) {
  if (
    !hasExactlyKeys(verification, VERIFICATION_KEYS) ||
    !Number.isInteger(verification.contractEpoch) ||
    verification.contractEpoch <= 0 ||
    !Array.isArray(verification.verifierIds) ||
    verification.verifierIds.length === 0 ||
    verification.verifierIds.length > 256 ||
    verification.verifierIds.some((verifierId) => !isOpaqueId(verifierId)) ||
    new Set(verification.verifierIds).size !== verification.verifierIds.length
  ) {
    throw assignmentError(category);
  }
  return verification;
}

function validateAssignmentPayload(payload, category = 'assignment') {
  try {
    assertNoSecretRecordData(payload);
  } catch {
    throw assignmentError(category);
  }
  if (
    !hasExactlyKeys(payload, ASSIGNMENT_KEYS) ||
    payload.schema !== 'aitm.work-assignment/v1' ||
    !Number.isInteger(payload.issue) ||
    payload.issue <= 0 ||
    !isOpaqueId(payload.grantId) ||
    !Number.isInteger(payload.epoch) ||
    payload.epoch <= 0
  ) {
    throw assignmentError(category);
  }
  const normalizedBranch = normalizeBranch(payload.branch, category);
  if (normalizedBranch !== payload.branch) throw assignmentError(category);
  validateFiles(payload.files, category);
  validateSubsystem(payload.subsystem, category);
  if (payload.files.length === 0 && payload.subsystem === null) throw assignmentError(category);
  validateDependency(payload.dependency, category);
  validateVerification(payload.verification, category);
  validateIdentity(payload.worker, category);
  validateIdentity(payload.coordinator, category);
  return payload;
}

function validateCorrelatedRecord(record, category) {
  if (!hasExactlyKeys(record, RECORD_KEYS) || !isOpaqueId(record.commentNodeId)) {
    throw assignmentError(category);
  }
  try {
    renderAitmRecord({ envelope: record.envelope, visibleMarkdown: '' });
  } catch {
    throw assignmentError(category);
  }
  return record;
}

function validateAssignmentRecord(record) {
  validateCorrelatedRecord(record, 'assignment');
  if (record.envelope.recordType !== 'work-assignment') throw assignmentError('assignment');
  const payload = validateAssignmentPayload(record.envelope.payload);
  if (
    record.envelope.issue !== payload.issue ||
    record.envelope.authority.actor !== payload.coordinator.actor ||
    record.envelope.authority.grantId !== payload.grantId ||
    record.envelope.authority.epoch !== payload.epoch
  ) {
    throw assignmentError('assignment');
  }
  return record;
}

function validateResult(result) {
  try {
    assertNoSecretRecordData(result);
    if (Buffer.byteLength(JSON.stringify(result), 'utf8') > MAX_RESULT_BYTES) {
      throw assignmentError('submission');
    }
  } catch {
    throw assignmentError('submission');
  }
  return result;
}

function validateSubmissionPayload(payload) {
  try {
    assertNoSecretRecordData(payload);
  } catch {
    throw assignmentError('submission');
  }
  if (
    !hasExactlyKeys(payload, SUBMISSION_KEYS) ||
    payload.schema !== 'aitm.worker-submission/v1' ||
    payload.status !== 'submitted' ||
    !isRecordId(payload.assignmentRecordId) ||
    !Number.isInteger(payload.issue) ||
    payload.issue <= 0
  ) {
    throw assignmentError('submission');
  }
  const normalizedBranch = normalizeBranch(payload.branch, 'submission');
  if (normalizedBranch !== payload.branch) throw assignmentError('submission');
  validateFiles(payload.files, 'submission');
  validateSubsystem(payload.subsystem, 'submission');
  if (payload.files.length === 0 && payload.subsystem === null) {
    throw assignmentError('submission');
  }
  validateDependency(payload.dependency, 'submission');
  validateVerification(payload.verification, 'submission');
  validateIdentity(payload.worker, 'submission');
  validateResult(payload.result);
  return payload;
}

function validateReason(reason) {
  if (!isOpaqueId(reason) || reason.length > 2048) throw assignmentError('reason');
  try {
    assertNoSecretRecordData(reason);
  } catch {
    throw assignmentError('reason');
  }
  return reason;
}

function validateDispositionPayload(payload) {
  try {
    assertNoSecretRecordData(payload);
  } catch {
    throw assignmentError('disposition');
  }
  if (
    !hasExactlyKeys(payload, DISPOSITION_KEYS) ||
    payload.schema !== 'aitm.record-disposition/v1' ||
    !['accepted', 'rejected'].includes(payload.decision) ||
    !Number.isInteger(payload.issue) ||
    payload.issue <= 0 ||
    !isRecordId(payload.assignmentRecordId) ||
    !isOpaqueId(payload.assignmentCommentNodeId) ||
    !isRecordId(payload.submissionRecordId) ||
    !isOpaqueId(payload.submissionCommentNodeId) ||
    !isOpaqueId(payload.grantId) ||
    !Number.isInteger(payload.epoch) ||
    payload.epoch <= 0
  ) {
    throw assignmentError('disposition');
  }
  validateIdentity(payload.decidedBy, 'disposition');
  if (payload.decision === 'accepted' && payload.reason !== null) {
    throw assignmentError('disposition');
  }
  if (payload.decision === 'rejected') validateReason(payload.reason);
  return payload;
}

function validateDispositionRecord(record) {
  validateCorrelatedRecord(record, 'disposition');
  if (record.envelope.recordType !== 'record-disposition') {
    throw assignmentError('disposition');
  }
  validateDispositionPayload(record.envelope.payload);
  return record;
}

const ASSIGNMENT_INPUT_KEYS = [
  'authority',
  'branch',
  'coordinator',
  'dependency',
  'files',
  'issue',
  'subsystem',
  'verification',
  'worker',
];
const SNAPSHOT_KEYS = ['expectedHeadRecordId', 'issue', 'records', 'repository'];
const ADOPTION_ARRAY_INPUT_KEYS = ['assignments', 'authority', 'dispositions', 'submissions'];
const MAX_CAPSULE_RECORDS = 2048;
const MAX_CAPSULE_DEPTH = 1024;

function deepFreeze(value) {
  if (value === null || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

function frozenCopy(value) {
  return deepFreeze(structuredClone(value));
}

function blocked(reason) {
  return deepFreeze({ status: 'blocked', diagnostic: { reason } });
}

function validateAdoptionSnapshot(snapshot) {
  if (
    !hasExactlyKeys(snapshot, SNAPSHOT_KEYS) ||
    !Number.isInteger(snapshot.issue) ||
    snapshot.issue <= 0 ||
    !isRecordId(snapshot.expectedHeadRecordId) ||
    !Array.isArray(snapshot.records) ||
    snapshot.records.length === 0 ||
    snapshot.records.length > MAX_CAPSULE_RECORDS
  ) {
    throw assignmentError('input');
  }
  const validated = validateCapsuleChain(snapshot);
  if (validated.forks.length > 0) return blocked('forked-history');
  const resolved = resolveSupersession(snapshot);
  const successorByPredecessorId = new Map();
  let rootRecordId = null;
  for (const { envelope } of resolved.records) {
    if (envelope.predecessor === null) {
      rootRecordId = envelope.recordId;
    } else {
      successorByPredecessorId.set(envelope.predecessor, envelope.recordId);
    }
  }
  let headRecordId = rootRecordId;
  let depth = 0;
  while (headRecordId !== null) {
    depth += 1;
    if (depth > MAX_CAPSULE_DEPTH) throw assignmentError('input');
    const successor = successorByPredecessorId.get(headRecordId);
    if (successor === undefined) break;
    headRecordId = successor;
  }
  if (headRecordId !== snapshot.expectedHeadRecordId) return blocked('stale-head');
  return { resolved };
}

function structuralIndex(records) {
  const byId = new Map(records.map((record) => [record.envelope.recordId, record]));
  const successors = new Map();
  const root = records.find(({ envelope }) => envelope.predecessor === null);
  for (const { envelope } of records) {
    if (envelope.predecessor !== null) successors.set(envelope.predecessor, envelope.recordId);
  }
  const ordered = [];
  const positions = new Map();
  let recordId = root?.envelope.recordId;
  while (recordId !== undefined) {
    const record = byId.get(recordId);
    positions.set(recordId, ordered.length);
    ordered.push(record);
    recordId = successors.get(recordId);
  }
  return { byId, ordered, positions };
}

function replacementLineage(authorization, positions) {
  const grantsById = new Map(authorization.grants.map((entry) => [entry.grant.grantId, entry]));
  const grants = [];
  const revocations = [];
  let current = grantsById.get(authorization.grant.grantId);
  if (current === undefined) return null;
  grants.unshift(current);
  while (true) {
    const incoming = authorization.revocations.find(
      ({ revocation }) =>
        revocation.state === 'replaced' && revocation.replacementGrantId === current.grant.grantId
    );
    if (incoming === undefined) break;
    const predecessor = grantsById.get(incoming.revocation.grantId);
    if (predecessor === undefined || predecessor.grant.epoch !== incoming.revocation.epoch) {
      return null;
    }
    grants.unshift(predecessor);
    revocations.unshift(incoming);
    current = predecessor;
  }
  const lineage = grants.map((entry, index) => {
    const revocation = revocations[index] ?? null;
    return {
      grant: entry.grant,
      scopeIssueIds: entry.scopeIssueIds,
      branchBoundary: entry.branchBoundary,
      grantRecordId: entry.recordId,
      revocationRecordId: revocation?.recordId ?? null,
      grantPosition: positions.get(entry.recordId),
      revocationPosition:
        revocation === null ? Number.POSITIVE_INFINITY : positions.get(revocation.recordId),
    };
  });
  if (
    lineage.some(
      ({ grantPosition, revocationPosition }) =>
        grantPosition === undefined || revocationPosition === undefined
    ) ||
    lineage.some((entry, index) => {
      const successor = lineage[index + 1];
      return (
        entry.grantPosition >= entry.revocationPosition ||
        (successor !== undefined && entry.revocationPosition >= successor.grantPosition)
      );
    })
  ) {
    return null;
  }
  return lineage;
}

function assignmentAuthority(record, lineage, position, { includeCurrent }) {
  const payload = record.envelope.payload;
  const authority = lineage.find(
    (candidate) =>
      (includeCurrent || candidate.revocationRecordId !== null) &&
      payload?.grantId === candidate.grant.grantId &&
      payload?.epoch === candidate.grant.epoch &&
      record.envelope.authority.grantId === candidate.grant.grantId &&
      record.envelope.authority.epoch === candidate.grant.epoch &&
      record.envelope.authority.actor === candidate.grant.coordinator.actor
  );
  if (
    authority === undefined ||
    !authority.grant.operations.includes('assign-work') ||
    position <= authority.grantPosition ||
    position >= authority.revocationPosition
  ) {
    return null;
  }
  try {
    validateAssignmentRecord(record);
  } catch {
    return null;
  }
  return isDeepStrictEqual(payload.coordinator, authority.grant.coordinator) &&
    authority.scopeIssueIds.includes(payload.issue) &&
    authority.branchBoundary.includes(payload.branch)
    ? authority
    : null;
}

function dispositionTarget(payload) {
  return payload === null || typeof payload !== 'object'
    ? null
    : [
        payload.assignmentRecordId,
        payload.assignmentCommentNodeId,
        payload.submissionRecordId,
        payload.submissionCommentNodeId,
      ];
}

function sameDispositionTarget(left, right) {
  return left !== null && right !== null && isDeepStrictEqual(left, right);
}

function replayWorkRecords(authorization, resolved, { adoption, allowRepair = false }) {
  const { byId, ordered, positions } = structuralIndex(resolved.records);
  if (ordered.length !== resolved.records.length) return blocked('replacement-boundary');
  const lineage = replacementLineage(authorization, positions);
  if (lineage === null || (adoption && lineage.length < 2)) {
    return blocked('replacement-boundary');
  }
  const currentAuthority = lineage.at(-1);
  const effectiveIds = new Set(resolved.effectiveRecords.map(({ envelope }) => envelope.recordId));
  if (adoption) {
    const predecessorAuthority = lineage.at(-2);
    const revocationPosition = predecessorAuthority.revocationPosition;
    const replacementPosition = currentAuthority.grantPosition;
    if (
      resolved.effectiveRecords.some((record) => {
        const position = positions.get(record.envelope.recordId);
        if (position <= revocationPosition || position === replacementPosition) return false;
        if (position < replacementPosition) {
          return !isWorkAssignmentSubmissionType(record.envelope.recordType);
        }
        return (
          !isWorkAssignmentSubmissionType(record.envelope.recordType) &&
          record.envelope.recordType !== 'record-disposition'
        );
      })
    ) {
      return blocked('authority');
    }
  }
  const allAssignments = new Map();
  const effectiveAssignments = new Map();
  const structurallyKnownAssignmentIds = new Set();
  for (const record of ordered) {
    if (record.envelope.recordType !== 'work-assignment') continue;
    structurallyKnownAssignmentIds.add(record.envelope.recordId);
    const authority = assignmentAuthority(
      record,
      lineage,
      positions.get(record.envelope.recordId),
      {
        includeCurrent: !adoption,
      }
    );
    if (authority !== null) {
      const entry = { authority, position: positions.get(record.envelope.recordId), record };
      allAssignments.set(record.envelope.recordId, entry);
      if (effectiveIds.has(record.envelope.recordId))
        effectiveAssignments.set(record.envelope.recordId, entry);
    } else if (effectiveIds.has(record.envelope.recordId)) {
      if (adoption) return blocked('authority');
      const envelopeAuthority = lineage.some(
        (candidate) =>
          record.envelope.authority.grantId === candidate.grant.grantId &&
          record.envelope.authority.epoch === candidate.grant.epoch
      );
      if (envelopeAuthority) {
        const position = positions.get(record.envelope.recordId);
        const predecessorRevocationPosition = lineage.at(-2)?.revocationPosition;
        return blocked(
          adoption &&
            position > predecessorRevocationPosition &&
            position < currentAuthority.grantPosition
            ? 'authority'
            : 'assignment-authority'
        );
      }
    }
  }
  const allEvaluations = new Map();
  const effectiveEvaluations = new Map();
  for (const record of ordered) {
    if (!isWorkAssignmentSubmissionType(record.envelope.recordType)) continue;
    let payload;
    try {
      validateCorrelatedRecord(record, 'submission');
      payload = validateSubmissionPayload(record.envelope.payload);
    } catch {
      if (effectiveIds.has(record.envelope.recordId)) {
        return blocked(adoption ? 'authority' : 'assignment-provenance');
      }
      continue;
    }
    const assignment = allAssignments.get(payload.assignmentRecordId);
    const position = positions.get(record.envelope.recordId);
    if (assignment === undefined) {
      if (
        effectiveIds.has(record.envelope.recordId) &&
        structurallyKnownAssignmentIds.has(payload.assignmentRecordId)
      ) {
        return blocked('authority');
      }
      const submissionAuthority = lineage.find(
        (candidate) =>
          record.envelope.authority.grantId === candidate.grant.grantId &&
          record.envelope.authority.epoch === candidate.grant.epoch
      );
      if (
        effectiveIds.has(record.envelope.recordId) &&
        (position > currentAuthority.grantPosition ||
          (submissionAuthority?.revocationRecordId !== null &&
            position > submissionAuthority.revocationPosition))
      ) {
        const predecessorRevocationPosition = lineage.at(-2)?.revocationPosition;
        return blocked(
          adoption &&
            position > predecessorRevocationPosition &&
            position < currentAuthority.grantPosition
            ? 'authority'
            : 'assignment-order'
        );
      }
      continue;
    }
    if (assignment.position >= position) return blocked('submission-order');
    const evaluation = evaluateSubmissionBounds(assignment.record, record);
    if (evaluation.status === 'blocked') {
      const predecessorRevocationPosition = lineage.at(-2)?.revocationPosition;
      return blocked(
        adoption &&
          position > predecessorRevocationPosition &&
          position < currentAuthority.grantPosition
          ? 'authority'
          : evaluation.diagnostic.reason
      );
    }
    const entry = { assignment, evaluation, position, record };
    allEvaluations.set(record.envelope.recordId, entry);
    if (effectiveIds.has(record.envelope.recordId)) {
      if (!effectiveAssignments.has(payload.assignmentRecordId)) return blocked('authority');
      effectiveEvaluations.set(record.envelope.recordId, entry);
    }
  }
  const historicalDecisions = new Map();
  const currentDecisions = new Map();
  const dispositionRecords = ordered.filter(
    ({ envelope }) => envelope.recordType === 'record-disposition'
  );
  for (const candidate of dispositionRecords) {
    const prior =
      candidate.envelope.supersedes === null ? null : byId.get(candidate.envelope.supersedes);
    if (
      prior?.envelope.recordType === 'record-disposition' &&
      !sameDispositionTarget(
        dispositionTarget(prior.envelope.payload),
        dispositionTarget(candidate.envelope.payload)
      )
    ) {
      return blocked('authority');
    }
    const rawPayload = candidate.envelope.payload;
    const target = allEvaluations.get(rawPayload?.submissionRecordId);
    const candidatePosition = positions.get(candidate.envelope.recordId);
    if (target === undefined) {
      if (
        effectiveIds.has(candidate.envelope.recordId) &&
        candidatePosition > currentAuthority.grantPosition
      ) {
        return blocked('unknown-disposition');
      }
      continue;
    }
    if (
      historicalDecisions.has(rawPayload.submissionRecordId) ||
      currentDecisions.has(rawPayload.submissionRecordId)
    ) {
      return blocked('duplicate-disposition');
    }
    let disposition;
    try {
      disposition = validateDispositionRecord(candidate);
    } catch {
      if (!allowRepair && effectiveIds.has(candidate.envelope.recordId)) {
        return blocked('disposition-provenance');
      }
      continue;
    }
    const payload = disposition.envelope.payload;
    if (
      payload.issue !== target.assignment.record.envelope.payload.issue ||
      payload.assignmentRecordId !== target.assignment.record.envelope.recordId ||
      payload.assignmentCommentNodeId !== target.assignment.record.commentNodeId ||
      payload.submissionCommentNodeId !== target.record.commentNodeId
    ) {
      if (!allowRepair && effectiveIds.has(candidate.envelope.recordId)) {
        return blocked('disposition-provenance');
      }
      continue;
    }
    const authority = lineage.find(
      (candidateAuthority) =>
        payload.grantId === candidateAuthority.grant.grantId &&
        payload.epoch === candidateAuthority.grant.epoch &&
        candidatePosition > candidateAuthority.grantPosition &&
        candidatePosition < candidateAuthority.revocationPosition
    );
    if (
      authority === undefined ||
      !authority.grant.operations.includes('dispose-submission') ||
      candidatePosition <= target.position ||
      !isDeepStrictEqual(payload.decidedBy, authority.grant.coordinator) ||
      disposition.envelope.repository !== target.assignment.record.envelope.repository ||
      disposition.envelope.authority.grantId !== authority.grant.grantId ||
      disposition.envelope.authority.epoch !== authority.grant.epoch ||
      disposition.envelope.authority.actor !== authority.grant.coordinator.actor ||
      (payload.decision === 'accepted' && target.evaluation.status !== 'matched')
    ) {
      if (!allowRepair && effectiveIds.has(candidate.envelope.recordId)) {
        return blocked('disposition-authority');
      }
      continue;
    }
    const decisions = authority === currentAuthority ? currentDecisions : historicalDecisions;
    decisions.set(payload.submissionRecordId, {
      decision: payload.decision,
      recordId: candidate.envelope.recordId,
    });
  }
  if (adoption) {
    for (const submissionRecordId of effectiveEvaluations.keys()) {
      if (historicalDecisions.has(submissionRecordId)) {
        if (currentDecisions.has(submissionRecordId)) return blocked('duplicate-disposition');
        continue;
      }
      if (!currentDecisions.has(submissionRecordId)) return blocked('missing-disposition');
    }
  }
  return {
    allEvaluations,
    currentAuthority,
    currentDecisions,
    effectiveEvaluations,
    historicalDecisions,
    lineage,
  };
}

function coordinatorAuthorization(
  authority,
  { issue, operation, branch, repository, assignment, submission }
) {
  const authorization = authorizeCoordinatorAdoption({
    authority,
    issue,
    operation,
    branch,
    repository,
  });
  if (!authorization.authorized) return authorization;
  if (operation === 'assign-work') {
    const grantRecord = authorization.grants.find(
      ({ grant }) =>
        grant.grantId === authorization.grant.grantId && grant.epoch === authorization.grant.epoch
    );
    return grantRecord === undefined
      ? { authorized: false, reason: 'record' }
      : {
          authorized: true,
          grantId: authorization.grant.grantId,
          epoch: authorization.grant.epoch,
          coordinator: authorization.grant.coordinator,
        };
  }
  let resolved;
  try {
    resolved = resolveSupersession({
      records: authorization.capturedRecords,
      repository: authorization.repository,
      issue: authorization.issue,
    });
  } catch {
    return { authorized: false, reason: 'record' };
  }
  const replay = replayWorkRecords(authorization, resolved, {
    adoption: false,
    allowRepair: true,
  });
  if (replay.status === 'blocked') return { authorized: false, reason: 'record' };
  const target = replay.effectiveEvaluations.get(submission?.envelope?.recordId);
  if (
    target === undefined ||
    !isDeepStrictEqual(target.assignment.record, assignment) ||
    !isDeepStrictEqual(target.record, submission) ||
    replay.historicalDecisions.has(submission.envelope.recordId) ||
    replay.currentDecisions.has(submission.envelope.recordId)
  ) {
    return { authorized: false, reason: 'record' };
  }
  return {
    authorized: true,
    grantId: authorization.grant.grantId,
    epoch: authorization.grant.epoch,
    coordinator: authorization.grant.coordinator,
  };
}

export function createWorkAssignment(input = {}) {
  if (!hasExactlyKeys(input, ASSIGNMENT_INPUT_KEYS)) throw assignmentError('assignment');
  const { authority, coordinator, issue, files, subsystem, dependency, verification, worker } =
    input;
  validateIdentity(coordinator, 'assignment');
  validateIdentity(worker, 'assignment');
  if (!Number.isInteger(issue) || issue <= 0) throw assignmentError('assignment');
  const branch = normalizeBranch(input.branch);
  validateFiles(files, 'assignment');
  validateSubsystem(subsystem, 'assignment');
  if (files.length === 0 && subsystem === null) throw assignmentError('assignment');
  validateDependency(dependency, 'assignment');
  validateVerification(verification, 'assignment');
  const authorization = coordinatorAuthorization(authority, {
    issue,
    operation: 'assign-work',
    branch,
  });
  if (!authorization.authorized || !isDeepStrictEqual(authorization.coordinator, coordinator)) {
    throw assignmentError('authority');
  }
  const payload = {
    schema: 'aitm.work-assignment/v1',
    issue,
    branch,
    files,
    subsystem,
    dependency,
    verification,
    worker,
    coordinator,
    grantId: authorization.grantId,
    epoch: authorization.epoch,
  };
  validateAssignmentPayload(payload);
  return frozenCopy({ recordType: 'work-assignment', payload });
}

function evaluateSubmissionBounds(assignment, submission) {
  if (!isWorkAssignmentSubmissionType(submission.envelope.recordType)) {
    return blocked('unsupported-submission-type');
  }
  const assignmentPayload = assignment.envelope.payload;
  const submissionPayload = validateSubmissionPayload(submission.envelope.payload);
  if (
    submissionPayload.assignmentRecordId !== assignment.envelope.recordId ||
    submissionPayload.issue !== assignmentPayload.issue ||
    submission.envelope.issue !== assignmentPayload.issue ||
    !isDeepStrictEqual(submissionPayload.worker, assignmentPayload.worker)
  ) {
    return blocked('assignment-provenance');
  }
  if (
    submission.envelope.repository !== assignment.envelope.repository ||
    submission.envelope.authority.actor !== assignmentPayload.worker.actor ||
    submission.envelope.authority.grantId !== assignmentPayload.grantId ||
    submission.envelope.authority.epoch !== assignmentPayload.epoch
  ) {
    return blocked('submission-provenance');
  }
  const identity = {
    assignmentRecordId: assignment.envelope.recordId,
    submissionRecordId: submission.envelope.recordId,
  };
  if (
    submissionPayload.branch !== assignmentPayload.branch ||
    !isDeepStrictEqual(submissionPayload.files, assignmentPayload.files) ||
    submissionPayload.subsystem !== assignmentPayload.subsystem ||
    !isDeepStrictEqual(submissionPayload.dependency, assignmentPayload.dependency) ||
    !isDeepStrictEqual(submissionPayload.verification, assignmentPayload.verification)
  ) {
    return deepFreeze({
      status: 'rejectable',
      ...identity,
      diagnostic: { reason: 'assignment-bounds-drift' },
    });
  }
  return deepFreeze({ status: 'matched', ...identity });
}

export function evaluateAssignment(input = {}) {
  if (!hasExactlyKeys(input, ['assignment', 'authority', 'submission'])) {
    throw assignmentError('input');
  }
  const assignment = validateAssignmentRecord(input.assignment);
  const submission = validateCorrelatedRecord(input.submission, 'submission');
  const assignmentPayload = assignment.envelope.payload;
  const authorization = coordinatorAuthorization(input.authority, {
    issue: assignmentPayload.issue,
    operation: 'dispose-submission',
    branch: assignmentPayload.branch,
    repository: assignment.envelope.repository,
    assignment,
    submission,
  });
  if (!authorization.authorized) return blocked('authority');
  return evaluateSubmissionBounds(assignment, submission);
}

function disposition(input, { decision, reason }) {
  const evaluation = evaluateAssignment(input);
  if (evaluation.status === 'blocked') {
    const category =
      evaluation.diagnostic.reason === 'authority' ? 'authority' : 'invalid-disposition';
    throw assignmentError(category);
  }
  if (decision === 'accepted' && evaluation.status !== 'matched') {
    throw assignmentError('not-matched');
  }
  const assignment = validateAssignmentRecord(input.assignment);
  const assignmentPayload = assignment.envelope.payload;
  const authorization = coordinatorAuthorization(input.authority, {
    coordinator: assignmentPayload.coordinator,
    issue: assignmentPayload.issue,
    operation: 'dispose-submission',
    branch: assignmentPayload.branch,
    repository: assignment.envelope.repository,
    grantId: assignmentPayload.grantId,
    epoch: assignmentPayload.epoch,
    assignment,
    submission: input.submission,
  });
  if (!authorization.authorized) throw assignmentError('authority');
  const payload = {
    schema: 'aitm.record-disposition/v1',
    decision,
    issue: assignmentPayload.issue,
    assignmentRecordId: assignment.envelope.recordId,
    assignmentCommentNodeId: assignment.commentNodeId,
    submissionRecordId: input.submission.envelope.recordId,
    submissionCommentNodeId: input.submission.commentNodeId,
    grantId: authorization.grantId,
    epoch: authorization.epoch,
    decidedBy: authorization.coordinator,
    reason,
  };
  validateDispositionPayload(payload);
  return frozenCopy({ recordType: 'record-disposition', payload });
}

export function acceptSubmission(input = {}) {
  if (!hasExactlyKeys(input, ['assignment', 'authority', 'submission'])) {
    throw assignmentError('input');
  }
  return disposition(input, { decision: 'accepted', reason: null });
}

export function rejectSubmission(input = {}) {
  if (!hasExactlyKeys(input, ['assignment', 'authority', 'reason', 'submission'])) {
    throw assignmentError('input');
  }
  validateReason(input.reason);
  return disposition(
    { assignment: input.assignment, authority: input.authority, submission: input.submission },
    { decision: 'rejected', reason: input.reason }
  );
}

export function adoptOutstandingSubmissions(input = {}) {
  const snapshotInput = hasExactlyKeys(input, ['authority', 'snapshot']);
  const arrayInput = hasExactlyKeys(input, ADOPTION_ARRAY_INPUT_KEYS);
  if (!snapshotInput && !arrayInput) throw assignmentError('input');
  const { authority } = input;
  let snapshot;
  const authorization = authorizeCoordinatorAdoption({
    authority,
    operation: 'adopt-submissions',
    ...(snapshotInput
      ? { issue: input.snapshot.issue, repository: input.snapshot.repository }
      : {}),
  });
  if (!authorization.authorized) return blocked('authority');
  if (snapshotInput) {
    snapshot = input.snapshot;
  } else {
    const { assignments, submissions, dispositions } = input;
    if (![assignments, submissions, dispositions].every(Array.isArray)) {
      throw assignmentError('input');
    }
    const recordsById = new Map(
      authorization.capturedRecords.map((record) => [record.envelope.recordId, record])
    );
    const suppliedGroups = [
      [assignments, (record) => record?.envelope?.recordType === 'work-assignment'],
      [submissions, (record) => isWorkAssignmentSubmissionType(record?.envelope?.recordType)],
      [dispositions, (record) => record?.envelope?.recordType === 'record-disposition'],
    ];
    for (const [group, expectedType] of suppliedGroups) {
      if (group.length > MAX_CAPSULE_RECORDS) throw assignmentError('input');
      for (const record of group) {
        if (!expectedType(record)) return blocked('authority');
        const existing = recordsById.get(record.envelope.recordId);
        if (existing !== undefined && !isDeepStrictEqual(existing, record)) {
          return blocked('authority');
        }
        recordsById.set(record.envelope.recordId, record);
      }
    }
    const records = [...recordsById.values()];
    let resolvedArrays;
    try {
      resolvedArrays = resolveSupersession({
        records,
        repository: authorization.repository,
        issue: authorization.issue,
      });
    } catch {
      return blocked('authority');
    }
    const index = structuralIndex(resolvedArrays.records);
    snapshot = {
      repository: authorization.repository,
      issue: authorization.issue,
      expectedHeadRecordId: index.ordered.at(-1)?.envelope.recordId,
      records,
    };
  }
  const validatedSnapshot = validateAdoptionSnapshot(snapshot);
  if (validatedSnapshot.status === 'blocked') return validatedSnapshot;
  const { resolved } = validatedSnapshot;
  const suppliedIndex = structuralIndex(resolved.records);
  const suppliedById = suppliedIndex.byId;
  if (
    authorization.capturedRecords.some(
      (record) => !isDeepStrictEqual(suppliedById.get(record.envelope.recordId), record)
    )
  ) {
    return blocked('authority');
  }
  const capturedIds = new Set(
    authorization.capturedRecords.map(({ envelope }) => envelope.recordId)
  );
  const capturedHeadPosition = suppliedIndex.positions.get(authorization.capturedHeadRecordId);
  if (
    capturedHeadPosition === undefined ||
    suppliedIndex.ordered.some(
      (record, position) =>
        !capturedIds.has(record.envelope.recordId) && position <= capturedHeadPosition
    )
  ) {
    return blocked('authority');
  }
  const replay = replayWorkRecords(authorization, resolved, { adoption: true });
  if (replay.status === 'blocked') return replay;

  const acceptedSubmissionRecordIds = [];
  const rejectedSubmissionRecordIds = [];
  for (const [submissionRecordId, { decision }] of replay.currentDecisions) {
    (decision === 'accepted' ? acceptedSubmissionRecordIds : rejectedSubmissionRecordIds).push(
      submissionRecordId
    );
  }
  acceptedSubmissionRecordIds.sort();
  rejectedSubmissionRecordIds.sort();
  return deepFreeze({
    status: 'ready-to-adopt',
    coordinationProjection: {
      schema: 'aitm.coordination-projection/v1',
      grantId: replay.currentAuthority.grant.grantId,
      epoch: replay.currentAuthority.grant.epoch,
      adoptionState: 'adopted',
    },
    acceptedSubmissionRecordIds,
    rejectedSubmissionRecordIds,
  });
}
