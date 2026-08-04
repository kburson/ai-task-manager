import { isDeepStrictEqual } from 'node:util';

import {
  authorizeCoordinatorAdoption,
  authorizeCoordinatorOperation,
} from './coordination-authority.mjs';
import { assertNoSecretRecordData, renderAitmRecord } from './record-envelope.mjs';

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
const SUBMISSION_TYPES = new Set([
  'execution-result',
  'verification-evidence',
  'review-result',
  'handoff',
]);
const ULID_RE = /^[0-7][0-9A-HJKMNP-TV-Z]{25}$/;
const SHA_RE = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/;
const SUBSYSTEM_RE = /^[A-Za-z0-9](?:[A-Za-z0-9._-]{0,127})$/;
const MAX_RESULT_BYTES = 256 * 1024;

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

function deepFreeze(value) {
  if (value === null || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

function frozenCopy(value) {
  return deepFreeze(structuredClone(value));
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
      /^[A-Za-z]:\//.test(file) ||
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
    !isRecordId(payload.grantId) ||
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
  if (payload.files.length === 0 && payload.subsystem === null) throw assignmentError('submission');
  validateDependency(payload.dependency, 'submission');
  validateVerification(payload.verification, 'submission');
  validateIdentity(payload.worker, 'submission');
  validateResult(payload.result);
  return payload;
}

function blocked(reason) {
  return deepFreeze({ status: 'blocked', diagnostic: { reason } });
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
    !isRecordId(payload.grantId) ||
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

function activeAuthorization(authority, { coordinator, issue, operation, branch }) {
  const grant = authority?.grant;
  if (!isPlainDataObject(grant)) return { authorized: false, reason: 'authority' };
  return {
    ...authorizeCoordinatorOperation({
      authority,
      grantId: grant.grantId,
      epoch: grant.epoch,
      coordinator,
      issue,
      operation,
      branch,
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
  const authorization = activeAuthorization(authority, {
    coordinator,
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

export function evaluateAssignment(input = {}) {
  if (!hasExactlyKeys(input, ['assignment', 'authority', 'submission'])) {
    throw assignmentError('input');
  }
  const assignment = validateAssignmentRecord(input.assignment);
  const submission = validateCorrelatedRecord(input.submission, 'submission');
  if (!SUBMISSION_TYPES.has(submission.envelope.recordType)) {
    return blocked('unsupported-submission-type');
  }
  const assignmentPayload = assignment.envelope.payload;
  const submissionPayload = validateSubmissionPayload(submission.envelope.payload);
  const authorization = coordinatorAuthorization(input.authority, {
    coordinator: assignmentPayload.coordinator,
    issue: assignmentPayload.issue,
    operation: 'dispose-submission',
    branch: assignmentPayload.branch,
  });
  if (!authorization.authorized) return blocked('authority');
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
  if (!hasExactlyKeys(input, ['assignments', 'authority', 'dispositions', 'submissions'])) {
    throw assignmentError('input');
  }
  const { assignments, authority, dispositions, submissions } = input;
  if (![assignments, submissions, dispositions].every(Array.isArray)) {
    throw assignmentError('input');
  }
  const authorization = authorizeCoordinatorAdoption({
    authority,
    operation: 'adopt-submissions',
  });
  if (!authorization.authorized) return blocked('authority');

  const assignmentRecords = assignments.map(validateAssignmentRecord);
  const submissionRecords = submissions.map((record) => {
    validateCorrelatedRecord(record, 'submission');
    if (!SUBMISSION_TYPES.has(record.envelope.recordType)) throw assignmentError('submission');
    validateSubmissionPayload(record.envelope.payload);
    return record;
  });
  const dispositionRecords = dispositions.map(validateDispositionRecord);
  const allRecords = [...assignmentRecords, ...submissionRecords, ...dispositionRecords];
  const recordIds = allRecords.map((record) => record.envelope.recordId);
  if (new Set(recordIds).size !== recordIds.length) return blocked('duplicate-record');
  const successorCounts = new Map();
  let roots = 0;
  for (const record of allRecords) {
    const { predecessor, supersedes } = record.envelope;
    if (predecessor === null) {
      roots += 1;
    } else {
      successorCounts.set(predecessor, (successorCounts.get(predecessor) ?? 0) + 1);
    }
    if (supersedes !== null && recordIds.includes(supersedes)) {
      return blocked('superseded-history');
    }
  }
  if (roots > 1) return blocked('multiple-roots');
  if ([...successorCounts.values()].some((count) => count > 1)) {
    return blocked('forked-history');
  }

  const assignmentsById = new Map(
    assignmentRecords.map((record) => [record.envelope.recordId, record])
  );
  const evaluations = new Map();
  for (const submission of submissionRecords) {
    const assignment = assignmentsById.get(submission.envelope.payload.assignmentRecordId);
    if (assignment === undefined) return blocked('unknown-assignment');
    const evaluation = evaluateAssignment({ assignment, submission, authority });
    if (evaluation.status === 'blocked') return blocked(evaluation.diagnostic.reason);
    evaluations.set(submission.envelope.recordId, { assignment, submission, evaluation });
  }

  const decisions = new Map();
  for (const dispositionRecord of dispositionRecords) {
    const payload = dispositionRecord.envelope.payload;
    const target = evaluations.get(payload.submissionRecordId);
    if (target === undefined) return blocked('unknown-disposition');
    if (decisions.has(payload.submissionRecordId)) return blocked('duplicate-disposition');
    if (
      payload.issue !== target.assignment.envelope.payload.issue ||
      payload.assignmentRecordId !== target.assignment.envelope.recordId ||
      payload.assignmentCommentNodeId !== target.assignment.commentNodeId ||
      payload.submissionCommentNodeId !== target.submission.commentNodeId
    ) {
      return blocked('disposition-provenance');
    }
    if (
      payload.grantId !== authorization.grantId ||
      payload.epoch !== authorization.epoch ||
      !isDeepStrictEqual(payload.decidedBy, authorization.coordinator) ||
      dispositionRecord.envelope.issue !== payload.issue ||
      dispositionRecord.envelope.repository !== target.assignment.envelope.repository ||
      dispositionRecord.envelope.authority.grantId !== authorization.grantId ||
      dispositionRecord.envelope.authority.epoch !== authorization.epoch ||
      dispositionRecord.envelope.authority.actor !== authorization.coordinator.actor
    ) {
      return blocked('disposition-authority');
    }
    if (payload.decision === 'accepted' && target.evaluation.status !== 'matched') {
      return blocked('invalid-acceptance');
    }
    decisions.set(payload.submissionRecordId, payload.decision);
  }
  if (dispositionRecords.length !== submissionRecords.length) return blocked('missing-disposition');
  for (const submissionRecordId of evaluations.keys()) {
    if (!decisions.has(submissionRecordId)) return blocked('missing-disposition');
  }

  const selected = (decision) =>
    [...decisions]
      .filter(([, candidate]) => candidate === decision)
      .map(([submissionRecordId]) => submissionRecordId)
      .sort();
  return deepFreeze({
    status: 'ready-to-adopt',
    coordinationProjection: {
      schema: 'aitm.coordination-projection/v1',
      grantId: authorization.grantId,
      epoch: authorization.epoch,
      adoptionState: 'adopted',
    },
    acceptedSubmissionRecordIds: selected('accepted'),
    rejectedSubmissionRecordIds: selected('rejected'),
  });
}
