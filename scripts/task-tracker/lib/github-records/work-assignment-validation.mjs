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
const REPOSITORY_RE = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;
const MAX_RESULT_BYTES = 256 * 1024;

const SUBMISSION_TYPES = new Set([
  'execution-result',
  'verification-evidence',
  'review-result',
  'handoff',
]);

export function isWorkAssignmentSubmissionType(recordType) {
  return SUBMISSION_TYPES.has(recordType);
}

export function workAssignmentError(category) {
  return new TypeError(`work-assignment:${category}`);
}

export function validateWorkAssignmentRepository(repository) {
  if (typeof repository !== 'string' || !REPOSITORY_RE.test(repository)) {
    throw workAssignmentError('assignment');
  }
  return repository;
}

export function isWorkAssignmentPlainObject(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) return false;
  return Reflect.ownKeys(value).every((key) => {
    if (typeof key !== 'string') return false;
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    return descriptor?.enumerable === true && Object.hasOwn(descriptor, 'value');
  });
}

export function hasExactlyWorkAssignmentKeys(value, keys) {
  if (!isWorkAssignmentPlainObject(value)) return false;
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
}

export function isWorkAssignmentOpaqueId(value) {
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

export function isWorkAssignmentRecordId(value) {
  return typeof value === 'string' && ULID_RE.test(value);
}

export function normalizeWorkAssignmentBranch(value, category = 'assignment') {
  if (!isWorkAssignmentOpaqueId(value)) throw workAssignmentError(category);
  const branch = value.startsWith('refs/heads/') ? value.slice('refs/heads/'.length) : value;
  if (!branch || branch.startsWith('/') || branch.endsWith('/') || branch.includes('//')) {
    throw workAssignmentError(category);
  }
  return branch;
}

export function validateWorkAssignmentIdentity(value, category) {
  if (
    !hasExactlyWorkAssignmentKeys(value, IDENTITY_KEYS) ||
    !Object.values(value).every(isWorkAssignmentOpaqueId)
  ) {
    throw workAssignmentError(category);
  }
  return value;
}

export function validateWorkAssignmentFiles(files, category) {
  if (!Array.isArray(files) || files.length > 256) throw workAssignmentError(category);
  for (const file of files) {
    if (
      !isWorkAssignmentOpaqueId(file) ||
      file.length > 1024 ||
      file.startsWith('/') ||
      /^[A-Za-z]:/.test(file) ||
      file.includes('\\') ||
      file.split('/').some((segment) => segment === '' || segment === '.' || segment === '..')
    ) {
      throw workAssignmentError(category);
    }
  }
  if (new Set(files).size !== files.length) throw workAssignmentError(category);
  return files;
}

export function validateWorkAssignmentSubsystem(subsystem, category) {
  if (subsystem !== null && (typeof subsystem !== 'string' || !SUBSYSTEM_RE.test(subsystem))) {
    throw workAssignmentError(category);
  }
  return subsystem;
}

export function validateWorkAssignmentDependency(dependency, category) {
  if (
    !hasExactlyWorkAssignmentKeys(dependency, DEPENDENCY_KEYS) ||
    typeof dependency.baselineSha !== 'string' ||
    !SHA_RE.test(dependency.baselineSha) ||
    !Array.isArray(dependency.recordIds) ||
    dependency.recordIds.length > 256 ||
    dependency.recordIds.some((recordId) => !isWorkAssignmentRecordId(recordId)) ||
    new Set(dependency.recordIds).size !== dependency.recordIds.length
  ) {
    throw workAssignmentError(category);
  }
  return dependency;
}

export function validateWorkAssignmentVerification(verification, category) {
  if (
    !hasExactlyWorkAssignmentKeys(verification, VERIFICATION_KEYS) ||
    !Number.isInteger(verification.contractEpoch) ||
    verification.contractEpoch <= 0 ||
    !Array.isArray(verification.verifierIds) ||
    verification.verifierIds.length === 0 ||
    verification.verifierIds.length > 256 ||
    verification.verifierIds.some((verifierId) => !isWorkAssignmentOpaqueId(verifierId)) ||
    new Set(verification.verifierIds).size !== verification.verifierIds.length
  ) {
    throw workAssignmentError(category);
  }
  return verification;
}

export function validateWorkAssignmentPayload(payload, category = 'assignment') {
  try {
    assertNoSecretRecordData(payload);
  } catch {
    throw workAssignmentError(category);
  }
  if (
    !hasExactlyWorkAssignmentKeys(payload, ASSIGNMENT_KEYS) ||
    payload.schema !== 'aitm.work-assignment/v1' ||
    !Number.isInteger(payload.issue) ||
    payload.issue <= 0 ||
    !isWorkAssignmentRecordId(payload.grantId) ||
    !Number.isInteger(payload.epoch) ||
    payload.epoch <= 0
  ) {
    throw workAssignmentError(category);
  }
  const normalizedBranch = normalizeWorkAssignmentBranch(payload.branch, category);
  if (normalizedBranch !== payload.branch) throw workAssignmentError(category);
  validateWorkAssignmentFiles(payload.files, category);
  validateWorkAssignmentSubsystem(payload.subsystem, category);
  if (payload.files.length === 0 && payload.subsystem === null) {
    throw workAssignmentError(category);
  }
  validateWorkAssignmentDependency(payload.dependency, category);
  validateWorkAssignmentVerification(payload.verification, category);
  validateWorkAssignmentIdentity(payload.worker, category);
  validateWorkAssignmentIdentity(payload.coordinator, category);
  return payload;
}

export function validateWorkAssignmentCorrelatedRecord(record, category) {
  if (
    !hasExactlyWorkAssignmentKeys(record, RECORD_KEYS) ||
    !isWorkAssignmentOpaqueId(record.commentNodeId)
  ) {
    throw workAssignmentError(category);
  }
  try {
    renderAitmRecord({ envelope: record.envelope, visibleMarkdown: '' });
  } catch {
    throw workAssignmentError(category);
  }
  return record;
}

export function validateWorkAssignmentRecord(record) {
  validateWorkAssignmentCorrelatedRecord(record, 'assignment');
  if (record.envelope.recordType !== 'work-assignment') {
    throw workAssignmentError('assignment');
  }
  const payload = validateWorkAssignmentPayload(record.envelope.payload);
  if (
    record.envelope.issue !== payload.issue ||
    record.envelope.authority.actor !== payload.coordinator.actor ||
    record.envelope.authority.grantId !== payload.grantId ||
    record.envelope.authority.epoch !== payload.epoch
  ) {
    throw workAssignmentError('assignment');
  }
  return record;
}

export function validateWorkAssignmentResult(result) {
  try {
    assertNoSecretRecordData(result);
    if (Buffer.byteLength(JSON.stringify(result), 'utf8') > MAX_RESULT_BYTES) {
      throw workAssignmentError('submission');
    }
  } catch {
    throw workAssignmentError('submission');
  }
  return result;
}

export function validateWorkAssignmentSubmissionPayload(payload) {
  try {
    assertNoSecretRecordData(payload);
  } catch {
    throw workAssignmentError('submission');
  }
  if (
    !hasExactlyWorkAssignmentKeys(payload, SUBMISSION_KEYS) ||
    payload.schema !== 'aitm.worker-submission/v1' ||
    payload.status !== 'submitted' ||
    !isWorkAssignmentRecordId(payload.assignmentRecordId) ||
    !Number.isInteger(payload.issue) ||
    payload.issue <= 0
  ) {
    throw workAssignmentError('submission');
  }
  const normalizedBranch = normalizeWorkAssignmentBranch(payload.branch, 'submission');
  if (normalizedBranch !== payload.branch) throw workAssignmentError('submission');
  validateWorkAssignmentFiles(payload.files, 'submission');
  validateWorkAssignmentSubsystem(payload.subsystem, 'submission');
  if (payload.files.length === 0 && payload.subsystem === null) {
    throw workAssignmentError('submission');
  }
  validateWorkAssignmentDependency(payload.dependency, 'submission');
  validateWorkAssignmentVerification(payload.verification, 'submission');
  validateWorkAssignmentIdentity(payload.worker, 'submission');
  validateWorkAssignmentResult(payload.result);
  return payload;
}

export function validateWorkAssignmentReason(reason) {
  if (!isWorkAssignmentOpaqueId(reason) || reason.length > 2048) {
    throw workAssignmentError('reason');
  }
  try {
    assertNoSecretRecordData(reason);
  } catch {
    throw workAssignmentError('reason');
  }
  return reason;
}

export function validateWorkAssignmentDispositionPayload(payload) {
  try {
    assertNoSecretRecordData(payload);
  } catch {
    throw workAssignmentError('disposition');
  }
  if (
    !hasExactlyWorkAssignmentKeys(payload, DISPOSITION_KEYS) ||
    payload.schema !== 'aitm.record-disposition/v1' ||
    !['accepted', 'rejected'].includes(payload.decision) ||
    !Number.isInteger(payload.issue) ||
    payload.issue <= 0 ||
    !isWorkAssignmentRecordId(payload.assignmentRecordId) ||
    !isWorkAssignmentOpaqueId(payload.assignmentCommentNodeId) ||
    !isWorkAssignmentRecordId(payload.submissionRecordId) ||
    !isWorkAssignmentOpaqueId(payload.submissionCommentNodeId) ||
    !isWorkAssignmentRecordId(payload.grantId) ||
    !Number.isInteger(payload.epoch) ||
    payload.epoch <= 0
  ) {
    throw workAssignmentError('disposition');
  }
  validateWorkAssignmentIdentity(payload.decidedBy, 'disposition');
  if (payload.decision === 'accepted' && payload.reason !== null) {
    throw workAssignmentError('disposition');
  }
  if (payload.decision === 'rejected') validateWorkAssignmentReason(payload.reason);
  return payload;
}

export function validateWorkAssignmentDispositionRecord(record) {
  validateWorkAssignmentCorrelatedRecord(record, 'disposition');
  if (record.envelope.recordType !== 'record-disposition') {
    throw workAssignmentError('disposition');
  }
  validateWorkAssignmentDispositionPayload(record.envelope.payload);
  return record;
}
