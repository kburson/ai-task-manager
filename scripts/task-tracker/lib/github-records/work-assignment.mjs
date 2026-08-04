import { isDeepStrictEqual } from 'node:util';

import {
  authorizeCoordinatorAdoption,
  authorizeCoordinatorOperation,
} from './coordination-authority.mjs';
import { resolveSupersession, validateCapsuleChain } from './capsule-chain.mjs';
import {
  hasExactlyWorkAssignmentKeys as hasExactlyKeys,
  isWorkAssignmentPlainObject as isPlainDataObject,
  isWorkAssignmentRecordId as isRecordId,
  isWorkAssignmentSubmissionType,
  normalizeWorkAssignmentBranch as normalizeBranch,
  validateWorkAssignmentCorrelatedRecord as validateCorrelatedRecord,
  validateWorkAssignmentDependency as validateDependency,
  validateWorkAssignmentDispositionPayload as validateDispositionPayload,
  validateWorkAssignmentDispositionRecord as validateDispositionRecord,
  validateWorkAssignmentFiles as validateFiles,
  validateWorkAssignmentIdentity as validateIdentity,
  validateWorkAssignmentPayload as validateAssignmentPayload,
  validateWorkAssignmentReason as validateReason,
  validateWorkAssignmentRecord as validateAssignmentRecord,
  validateWorkAssignmentRepository as validateRepository,
  validateWorkAssignmentSubmissionPayload as validateSubmissionPayload,
  validateWorkAssignmentSubsystem as validateSubsystem,
  validateWorkAssignmentVerification as validateVerification,
  workAssignmentError as assignmentError,
} from './work-assignment-validation.mjs';

const ASSIGNMENT_INPUT_KEYS = [
  'authority',
  'branch',
  'coordinator',
  'dependency',
  'files',
  'issue',
  'repository',
  'subsystem',
  'verification',
  'worker',
];
const SNAPSHOT_KEYS = ['expectedHeadRecordId', 'issue', 'records', 'repository'];
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

function activeAuthorization(
  authority,
  { coordinator, issue, operation, branch, repository, grantId, epoch }
) {
  const grant = authority?.grant;
  if (!isPlainDataObject(grant)) return { authorized: false, reason: 'authority' };
  return {
    ...authorizeCoordinatorOperation({
      authority,
      grantId: grantId ?? grant.grantId,
      epoch: epoch ?? grant.epoch,
      coordinator,
      issue,
      operation,
      branch,
      repository,
    }),
    grantId: grant.grantId,
    epoch: grant.epoch,
    coordinator: grant.coordinator,
  };
}

function coordinatorAuthorization(authority, target) {
  if (authority?.status === 'active') return activeAuthorization(authority, target);
  return authorizeCoordinatorAdoption({ authority, ...target });
}

export function createWorkAssignment(input = {}) {
  if (!hasExactlyKeys(input, ASSIGNMENT_INPUT_KEYS)) throw assignmentError('assignment');
  const {
    authority,
    coordinator,
    issue,
    repository,
    files,
    subsystem,
    dependency,
    verification,
    worker,
  } = input;
  validateIdentity(coordinator, 'assignment');
  validateIdentity(worker, 'assignment');
  if (!Number.isInteger(issue) || issue <= 0) throw assignmentError('assignment');
  validateRepository(repository);
  const branch = normalizeBranch(input.branch);
  validateFiles(files, 'assignment');
  validateSubsystem(subsystem, 'assignment');
  if (files.length === 0 && subsystem === null) throw assignmentError('assignment');
  validateDependency(dependency, 'assignment');
  validateVerification(verification, 'assignment');
  const authorization = activeAuthorization(authority, {
    coordinator,
    issue,
    operation: 'assign-work',
    branch,
    repository,
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
    coordinator: assignmentPayload.coordinator,
    issue: assignmentPayload.issue,
    operation: 'dispose-submission',
    branch: assignmentPayload.branch,
    repository: assignment.envelope.repository,
    grantId: assignmentPayload.grantId,
    epoch: assignmentPayload.epoch,
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
  if (!hasExactlyKeys(input, ['authority', 'snapshot'])) {
    throw assignmentError('input');
  }
  const { authority, snapshot } = input;
  const validatedSnapshot = validateAdoptionSnapshot(snapshot);
  if (validatedSnapshot.status === 'blocked') return validatedSnapshot;
  const { resolved } = validatedSnapshot;
  const authorization = authorizeCoordinatorAdoption({
    authority,
    issue: snapshot.issue,
    repository: snapshot.repository,
    operation: 'adopt-submissions',
    records: resolved.records,
  });
  if (!authorization.authorized) return blocked('authority');

  const recordPositions = new Map();
  const assignmentsById = new Map();
  const submissionRecords = [];
  const dispositionRecords = [];
  for (const [index, record] of resolved.effectiveRecords.entries()) {
    recordPositions.set(record.envelope.recordId, index);
    if (record.envelope.recordType === 'work-assignment') {
      validateAssignmentRecord(record);
      assignmentsById.set(record.envelope.recordId, record);
    } else if (isWorkAssignmentSubmissionType(record.envelope.recordType)) {
      validateCorrelatedRecord(record, 'submission');
      validateSubmissionPayload(record.envelope.payload);
      submissionRecords.push(record);
    } else if (record.envelope.recordType === 'record-disposition') {
      dispositionRecords.push(record);
    }
  }
  const revocationPosition = recordPositions.get(authorization.replacementRevocationRecordId);
  const replacementPosition = recordPositions.get(authorization.replacementGrantRecordId);
  if (
    revocationPosition === undefined ||
    replacementPosition === undefined ||
    revocationPosition >= replacementPosition
  ) {
    return blocked('replacement-boundary');
  }

  const allowedBranches = new Set(authorization.branchBoundary);
  const allowedIssues = new Set(authorization.scopeIssueIds);
  const eligibleAssignments = new Map();
  for (const [recordId, assignment] of assignmentsById) {
    const payload = assignment.envelope.payload;
    const position = recordPositions.get(recordId);
    if (
      position < revocationPosition &&
      payload.grantId === authorization.predecessorGrantId &&
      payload.epoch === authorization.predecessorEpoch &&
      isDeepStrictEqual(payload.coordinator, authorization.predecessorCoordinator) &&
      allowedIssues.has(payload.issue) &&
      allowedBranches.has(payload.branch)
    ) {
      eligibleAssignments.set(recordId, assignment);
    }
  }
  const evaluations = new Map();
  for (const submission of submissionRecords) {
    const assignment = eligibleAssignments.get(submission.envelope.payload.assignmentRecordId);
    if (assignment === undefined) return blocked('assignment-order');
    if (
      recordPositions.get(assignment.envelope.recordId) >=
      recordPositions.get(submission.envelope.recordId)
    ) {
      return blocked('submission-order');
    }
    const evaluation = evaluateSubmissionBounds(assignment, submission);
    if (evaluation.status === 'blocked') return blocked(evaluation.diagnostic.reason);
    evaluations.set(submission.envelope.recordId, { assignment, submission, evaluation });
  }

  const historicalDecisions = new Map();
  const replacementDecisions = new Map();
  for (const candidate of dispositionRecords) {
    const target = evaluations.get(candidate.envelope.payload?.submissionRecordId);
    if (target === undefined) continue;
    const dispositionRecord = validateDispositionRecord(candidate);
    const payload = dispositionRecord.envelope.payload;
    if (
      payload.issue !== target.assignment.envelope.payload.issue ||
      payload.assignmentRecordId !== target.assignment.envelope.recordId ||
      payload.assignmentCommentNodeId !== target.assignment.commentNodeId ||
      payload.submissionCommentNodeId !== target.submission.commentNodeId
    ) {
      return blocked('disposition-provenance');
    }
    const dispositionPosition = recordPositions.get(dispositionRecord.envelope.recordId);
    const submissionPosition = recordPositions.get(target.submission.envelope.recordId);
    if (dispositionPosition <= submissionPosition) return blocked('disposition-order');
    const historical = dispositionPosition < revocationPosition;
    const replacement = dispositionPosition > replacementPosition;
    if (!historical && !replacement) return blocked('disposition-order');
    const expectedGrantId = historical ? authorization.predecessorGrantId : authorization.grantId;
    const expectedEpoch = historical ? authorization.predecessorEpoch : authorization.epoch;
    const expectedCoordinator = historical
      ? authorization.predecessorCoordinator
      : authorization.coordinator;
    if (
      payload.grantId !== expectedGrantId ||
      payload.epoch !== expectedEpoch ||
      !isDeepStrictEqual(payload.decidedBy, expectedCoordinator) ||
      dispositionRecord.envelope.issue !== payload.issue ||
      dispositionRecord.envelope.repository !== target.assignment.envelope.repository ||
      dispositionRecord.envelope.authority.grantId !== expectedGrantId ||
      dispositionRecord.envelope.authority.epoch !== expectedEpoch ||
      dispositionRecord.envelope.authority.actor !== expectedCoordinator.actor
    ) {
      return blocked('disposition-authority');
    }
    if (payload.decision === 'accepted' && target.evaluation.status !== 'matched') {
      return blocked('invalid-acceptance');
    }
    const decisions = historical ? historicalDecisions : replacementDecisions;
    if (decisions.has(payload.submissionRecordId)) return blocked('duplicate-disposition');
    decisions.set(payload.submissionRecordId, payload.decision);
  }
  for (const submissionRecordId of evaluations.keys()) {
    if (historicalDecisions.has(submissionRecordId)) {
      if (replacementDecisions.has(submissionRecordId)) return blocked('duplicate-disposition');
      continue;
    }
    if (!replacementDecisions.has(submissionRecordId)) return blocked('missing-disposition');
  }

  const acceptedSubmissionRecordIds = [];
  const rejectedSubmissionRecordIds = [];
  for (const [submissionRecordId, decision] of replacementDecisions) {
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
      grantId: authorization.grantId,
      epoch: authorization.epoch,
      adoptionState: 'adopted',
    },
    acceptedSubmissionRecordIds,
    rejectedSubmissionRecordIds,
  });
}
