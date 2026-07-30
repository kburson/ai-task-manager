import {
  assertFencingToken,
  canonicalRequestJson,
  validateAcquireRequest,
  validateRenewRequest,
  validateSwitchLeaseRequest,
} from '@kburson/aitm-ledger';
import { createHash } from 'node:crypto';

const LEASE_CONTEXT_KEYS = Object.freeze(['projectId', 'leaseId', 'fencingToken', 'worktreeId']);

export const WORK_LEASE_PROJECTIONS = Object.freeze(['session', 'fleet', 'timing', 'github']);
const WORK_LEASE_INTENT_OPERATIONS = Object.freeze(['acquire', 'resume', 'switchLease']);

const SENSITIVE_KEY =
  /authorization|bearer|credentials?|token[_-]?env|secrets?|password|api[_-]?key|access[_-]?token|auth[_-]?token|aitm[_-]?lease[_-]?auth[_-]?token/i;

function nonEmptyString(value, label) {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new TypeError(`${label} must be a non-empty string`);
  }
  return value;
}

function plainObject(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError(`${label} must be an object`);
  }
  return value;
}

function assertNoSecretMaterial(value, location = '$', seen = new Set()) {
  if (typeof value === 'string' && /\bBearer\s+\S+/i.test(value)) {
    throw new TypeError(`secret lease material is forbidden at ${location}`);
  }
  if (!value || typeof value !== 'object') return;
  if (seen.has(value)) return;
  seen.add(value);
  for (const [key, nested] of Object.entries(value)) {
    if (SENSITIVE_KEY.test(key)) {
      throw new TypeError(`secret lease material is forbidden at ${location}.${key}`);
    }
    assertNoSecretMaterial(nested, `${location}.${key}`, seen);
  }
}

function cloneDurableJson(value, location = '$', seen = new Set()) {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      throw new TypeError(`work-lease projection must be durable JSON at ${location}`);
    }
    return value;
  }
  if (typeof value !== 'object') {
    throw new TypeError(`work-lease projection must be durable JSON at ${location}`);
  }
  if (seen.has(value)) {
    throw new TypeError(`work-lease projection must be durable JSON at ${location}`);
  }
  seen.add(value);
  if (Array.isArray(value)) {
    return value.map((item, index) => cloneDurableJson(item, `${location}[${index}]`, seen));
  }
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    throw new TypeError(`work-lease projection must be durable JSON at ${location}`);
  }
  return Object.fromEntries(
    Object.entries(value).map(([key, nested]) => [
      key,
      cloneDurableJson(nested, `${location}.${key}`, seen),
    ])
  );
}

function validateProjectionName(name) {
  if (!WORK_LEASE_PROJECTIONS.includes(name)) {
    throw new TypeError(
      `work-lease projection must be one of ${WORK_LEASE_PROJECTIONS.join(', ')}`
    );
  }
  return name;
}

function projectionIdentity(operation, idempotencyKey, name) {
  return `${operation}:${idempotencyKey}:${name}`;
}

function compensationProjectionIdentity(idempotencyKey, name) {
  return `compensation:${idempotencyKey}:${name}`;
}

function canonicalIssue(value) {
  const match = String(value ?? '').match(/^#?([1-9]\d*)$/);
  if (!match) throw new TypeError('work-lease intent issueId must be a canonical positive decimal');
  return match[1];
}

function validateIntentRequest(operation, request) {
  if (operation === 'acquire') validateAcquireRequest(request);
  else if (operation === 'resume') validateRenewRequest(request);
  else {
    validateSwitchLeaseRequest(request);
    if (request.target.requestedAt !== request.switchedAt) {
      throw new TypeError('work-lease switch target timestamp must match switchedAt');
    }
  }
}

function snapshotDigest(present, bytesBase64 = '') {
  return createHash('sha256')
    .update(present ? `present\0${bytesBase64}` : 'absent')
    .digest('hex');
}

export function createPriorSessionSnapshot(snapshot) {
  plainObject(snapshot, 'prior session snapshot');
  if (snapshot.present === false) {
    return Object.freeze({
      present: false,
      digest: snapshotDigest(false),
    });
  }
  if (snapshot.present !== true || !Buffer.isBuffer(snapshot.bytes)) {
    throw new TypeError('present prior session snapshot must contain raw bytes');
  }
  const bytesBase64 = snapshot.bytes.toString('base64');
  let decoded;
  try {
    decoded = JSON.parse(snapshot.bytes.toString('utf8'));
  } catch {
    throw new TypeError('prior session snapshot must contain valid JSON');
  }
  assertNoSecretMaterial(decoded, '$.priorSessionSnapshot');
  return Object.freeze({
    present: true,
    bytesBase64,
    digest: snapshotDigest(true, bytesBase64),
  });
}

export function normalizePriorSessionSnapshot(value) {
  plainObject(value, 'prior session snapshot');
  if (value.present === false) {
    const keys = Object.keys(value).sort();
    if (keys.join(',') !== 'digest,present' || value.digest !== snapshotDigest(false)) {
      throw new TypeError('absent prior session snapshot is malformed');
    }
    return Object.freeze({ present: false, digest: value.digest });
  }
  if (value.present !== true) {
    throw new TypeError('prior session snapshot presence is malformed');
  }
  const keys = Object.keys(value).sort();
  if (keys.join(',') !== 'bytesBase64,digest,present') {
    throw new TypeError('present prior session snapshot is malformed');
  }
  if (typeof value.bytesBase64 !== 'string' || !/^[A-Za-z0-9+/]*={0,2}$/.test(value.bytesBase64)) {
    throw new TypeError('prior session snapshot bytes are malformed');
  }
  if (value.digest !== snapshotDigest(true, value.bytesBase64)) {
    throw new TypeError('prior session snapshot digest does not match');
  }
  let decoded;
  try {
    const bytes = Buffer.from(value.bytesBase64, 'base64');
    if (bytes.toString('base64') !== value.bytesBase64) {
      throw new Error('base64 encoding is not canonical');
    }
    decoded = JSON.parse(bytes.toString('utf8'));
  } catch {
    throw new TypeError('prior session snapshot must contain valid JSON');
  }
  assertNoSecretMaterial(decoded, '$.priorSessionSnapshot');
  return Object.freeze({
    present: true,
    bytesBase64: value.bytesBase64,
    digest: value.digest,
  });
}

function validateProjectionProof(proof, name, projectionId) {
  plainObject(proof, 'work-lease reconciliation proof');
  if (
    proof.reconciled !== true ||
    proof.projectionName !== name ||
    proof.projectionId !== projectionId
  ) {
    throw new Error(`work-lease ${name} reconciliation proof does not match`);
  }
  assertNoSecretMaterial(proof);
  return cloneDurableJson(proof);
}

function validateSwitchReceiptCorrelation(receipt, request, label) {
  plainObject(receipt, `${label} receipt`);
  const lease = plainObject(receipt.lease, `${label} receipt lease`);
  const transition = plainObject(receipt.transition, `${label} receipt transition`);
  if (
    lease.projectId !== request.projectId ||
    lease.issueId !== request.target.issueId ||
    lease.mode !== 'write' ||
    lease.state !== 'active' ||
    lease.leaseId === request.leaseId ||
    canonicalRequestJson(lease.holder) !== canonicalRequestJson(request.target.holder)
  ) {
    throw new Error(`${label} receipt target lease does not match request`);
  }
  try {
    if (BigInt(lease.fencingToken) <= BigInt(request.fencingToken)) {
      throw new Error('not advanced');
    }
  } catch {
    throw new Error(`${label} receipt target fence did not advance`);
  }
  const expectedExpiresAt = new Date(
    Date.parse(request.switchedAt) + request.target.ttlMs
  ).toISOString();
  if (
    lease.acquiredAt !== request.switchedAt ||
    lease.heartbeatAt !== request.switchedAt ||
    lease.expiresAt !== expectedExpiresAt
  ) {
    throw new Error(`${label} receipt target chronology does not match request`);
  }
  if (
    typeof transition.transitionId !== 'string' ||
    transition.transitionId.trim() === '' ||
    transition.fromIssueId !== request.issueId ||
    transition.fromLeaseId !== request.leaseId ||
    transition.fromToken !== request.fencingToken ||
    transition.toIssueId !== request.target.issueId
  ) {
    throw new Error(`${label} receipt transition does not match request`);
  }
}

export function normalizeLeaseContext(value) {
  plainObject(value, 'lease context');
  const keys = Object.keys(value).sort();
  const expected = [...LEASE_CONTEXT_KEYS].sort();
  if (keys.length !== expected.length || keys.some((key, index) => key !== expected[index])) {
    throw new TypeError(
      'lease context must contain exactly projectId, leaseId, fencingToken, and worktreeId'
    );
  }
  const context = {
    projectId: nonEmptyString(value.projectId, 'lease context projectId'),
    leaseId: nonEmptyString(value.leaseId, 'lease context leaseId'),
    fencingToken: assertFencingToken(value.fencingToken),
    worktreeId: nonEmptyString(value.worktreeId, 'lease context worktreeId'),
  };
  return Object.freeze(context);
}

export function leaseContextEnvironment(value) {
  if (value == null) return {};
  const lease = normalizeLeaseContext(value);
  return {
    AITM_LEASE_ID: lease.leaseId,
    AITM_FENCING_TOKEN: lease.fencingToken,
  };
}

export function createWorkLeaseIntent({
  operation,
  issueId,
  request,
  projectionInputs = {},
  priorSessionSnapshot,
}) {
  if (!WORK_LEASE_INTENT_OPERATIONS.includes(operation)) {
    throw new TypeError('work-lease intent operation must be acquire, resume, or switchLease');
  }
  assertNoSecretMaterial(request);
  assertNoSecretMaterial(projectionInputs);
  validateIntentRequest(operation, request);
  const resumeIssueId = operation === 'resume' ? canonicalIssue(issueId) : undefined;
  plainObject(projectionInputs, 'projectionInputs');
  const durableSnapshot = normalizePriorSessionSnapshot(priorSessionSnapshot);

  const projections = {};
  for (const [name, input] of Object.entries(projectionInputs)) {
    validateProjectionName(name);
    projections[name] = {
      input: cloneDurableJson(input),
      projectionId: projectionIdentity(operation, request.idempotencyKey, name),
      completed: false,
    };
  }

  return {
    operation,
    ...(resumeIssueId === undefined ? {} : { issueId: resumeIssueId }),
    canonicalRequest: canonicalRequestJson(request),
    idempotencyKey: request.idempotencyKey,
    priorSessionSnapshot: durableSnapshot,
    projections,
  };
}

export function readWorkLeaseIntentRequest(intent) {
  plainObject(intent, 'work-lease intent');
  nonEmptyString(intent.canonicalRequest, 'work-lease intent canonicalRequest');
  return JSON.parse(intent.canonicalRequest);
}

export function validateWorkLeaseIntent(intent, { requireAllProjections = false } = {}) {
  plainObject(intent, 'work-lease intent');
  assertNoSecretMaterial(intent);
  if (!WORK_LEASE_INTENT_OPERATIONS.includes(intent.operation)) {
    throw new TypeError('work-lease intent operation is malformed');
  }
  const request = readWorkLeaseIntentRequest(intent);
  validateIntentRequest(intent.operation, request);
  if (intent.operation === 'resume') canonicalIssue(intent.issueId);
  if (intent.idempotencyKey !== request.idempotencyKey) {
    throw new Error('work-lease intent idempotency identity does not match');
  }
  normalizePriorSessionSnapshot(intent.priorSessionSnapshot);
  plainObject(intent.projections, 'work-lease intent projections');
  if (requireAllProjections) {
    const names = Object.keys(intent.projections).sort();
    if (
      names.length !== WORK_LEASE_PROJECTIONS.length ||
      names.some((name, index) => name !== [...WORK_LEASE_PROJECTIONS].sort()[index])
    ) {
      throw new Error('work-lease intent requires all four persisted projections');
    }
  }
  for (const [name, projection] of Object.entries(intent.projections)) {
    validateProjectionName(name);
    plainObject(projection, `work-lease ${name} projection`);
    if (!Object.hasOwn(projection, 'input')) {
      throw new Error(`work-lease ${name} projection input is missing`);
    }
    cloneDurableJson(projection.input);
    const expectedId = projectionIdentity(intent.operation, request.idempotencyKey, name);
    if (projection.projectionId !== expectedId) {
      throw new Error(`work-lease ${name} projection identity does not match`);
    }
    if (typeof projection.completed !== 'boolean') {
      throw new Error(`work-lease ${name} projection completion is malformed`);
    }
    if (projection.completed) {
      validateProjectionProof(projection.reconciliationProof, name, projection.projectionId);
      nonEmptyString(projection.completedAt, `work-lease ${name} projection completedAt`);
    }
  }
  if (intent.forwardPhase !== undefined) {
    if (intent.operation !== 'switchLease' || intent.receipt === undefined) {
      throw new Error('work-lease forward phase requires a persisted switch receipt');
    }
    const forwardPhase = plainObject(intent.forwardPhase, 'work-lease forward phase');
    if (forwardPhase.transitionId !== intent.transitionId) {
      throw new Error('work-lease forward phase transition does not match');
    }
    nonEmptyString(forwardPhase.committedAt, 'work-lease forward phase committedAt');
    const githubProjectionId = intent.projections.github?.projectionId;
    validateProjectionProof(forwardPhase.claimProof, 'github-claim', githubProjectionId);
  } else if (
    intent.operation === 'switchLease' &&
    Object.values(intent.projections).some((projection) => projection.completed === true)
  ) {
    throw new Error('work-lease switch projection requires a committed forward phase');
  }
  if (intent.forwardPhase !== undefined && intent.compensation !== undefined) {
    throw new Error('work-lease forward phase and compensation are mutually exclusive');
  }
  if (intent.compensation !== undefined) {
    validateWorkLeaseCompensation(intent, { requireAllProjections });
  }
  return request;
}

export function attachIntentForwardPhase(
  intent,
  { claimProof, transitionId, committedAt = new Date().toISOString() } = {}
) {
  validateWorkLeaseIntent(intent, { requireAllProjections: true });
  if (intent.operation !== 'switchLease' || intent.receipt === undefined) {
    throw new Error('work-lease forward phase requires a persisted switch receipt');
  }
  if (intent.compensation !== undefined || intent.transitionId !== transitionId) {
    throw new Error('work-lease forward phase cannot start from this recovery state');
  }
  const githubProjectionId = intent.projections.github.projectionId;
  const durableProof = validateProjectionProof(claimProof, 'github-claim', githubProjectionId);
  nonEmptyString(committedAt, 'work-lease forward phase committedAt');
  const forwardPhase = {
    transitionId,
    committedAt,
    claimProof: durableProof,
  };
  if (intent.forwardPhase !== undefined) {
    if (canonicalRequestJson(intent.forwardPhase) === canonicalRequestJson(forwardPhase)) {
      return intent;
    }
    throw new Error('work-lease forward phase cannot be overwritten');
  }
  return { ...intent, forwardPhase };
}

export function validateWorkLeaseCompensation(intent, { requireAllProjections = false } = {}) {
  plainObject(intent, 'work-lease intent');
  if (intent.operation !== 'switchLease' || intent.receipt === undefined) {
    throw new Error('work-lease compensation requires a persisted switch receipt');
  }
  const compensation = plainObject(intent.compensation, 'work-lease compensation');
  assertNoSecretMaterial(compensation);
  nonEmptyString(compensation.reason, 'work-lease compensation reason');
  if (compensation.forwardTransitionId !== intent.transitionId) {
    throw new Error('work-lease compensation forward transition does not match');
  }
  nonEmptyString(compensation.canonicalRequest, 'work-lease compensation canonicalRequest');
  const request = JSON.parse(compensation.canonicalRequest);
  validateIntentRequest('switchLease', request);
  if (compensation.idempotencyKey !== request.idempotencyKey) {
    throw new Error('work-lease compensation idempotency identity does not match');
  }
  plainObject(compensation.projections, 'work-lease compensation projections');
  if (requireAllProjections) {
    const names = Object.keys(compensation.projections).sort();
    if (
      names.length !== WORK_LEASE_PROJECTIONS.length ||
      names.some((name, index) => name !== [...WORK_LEASE_PROJECTIONS].sort()[index])
    ) {
      throw new Error('work-lease compensation requires all four persisted projections');
    }
  }
  for (const [name, projection] of Object.entries(compensation.projections)) {
    validateProjectionName(name);
    plainObject(projection, `work-lease compensation ${name} projection`);
    if (!Object.hasOwn(projection, 'input')) {
      throw new Error(`work-lease compensation ${name} projection input is missing`);
    }
    cloneDurableJson(projection.input);
    const expectedId = compensationProjectionIdentity(request.idempotencyKey, name);
    if (projection.projectionId !== expectedId) {
      throw new Error(`work-lease compensation ${name} projection identity does not match`);
    }
    if (typeof projection.completed !== 'boolean') {
      throw new Error(`work-lease compensation ${name} projection completion is malformed`);
    }
    if (projection.completed) {
      validateProjectionProof(projection.reconciliationProof, name, projection.projectionId);
      nonEmptyString(
        projection.completedAt,
        `work-lease compensation ${name} projection completedAt`
      );
    }
  }
  if (compensation.receipt !== undefined) {
    const receiptTransitionId = compensation.receipt?.transition?.transitionId;
    nonEmptyString(receiptTransitionId, 'work-lease compensation receipt transitionId');
    if (compensation.transitionId !== receiptTransitionId) {
      throw new Error('work-lease compensation receipt transition does not match');
    }
    validateSwitchReceiptCorrelation(compensation.receipt, request, 'work-lease compensation');
  } else if (compensation.transitionId !== undefined) {
    throw new Error('work-lease compensation transition requires a receipt');
  }
  return request;
}

export function attachIntentCompensation(intent, { request, reason, projectionInputs } = {}) {
  validateWorkLeaseIntent(intent, { requireAllProjections: true });
  if (intent.operation !== 'switchLease' || intent.receipt === undefined) {
    throw new Error('work-lease compensation requires a persisted switch receipt');
  }
  if (
    intent.forwardPhase !== undefined ||
    Object.values(intent.projections).some((projection) => projection.completed === true)
  ) {
    throw new Error('work-lease compensation is forbidden after forward phase commitment');
  }
  assertNoSecretMaterial(request);
  assertNoSecretMaterial(projectionInputs);
  validateIntentRequest('switchLease', request);
  if (reason !== 'target-ineligible-after-switch') {
    throw new Error('work-lease compensation reason is invalid');
  }
  plainObject(projectionInputs, 'work-lease compensation projection inputs');
  const forwardRequest = readWorkLeaseIntentRequest(intent);
  const forwardReceipt = intent.receipt;
  const forwardTransitionId = intent.transitionId;
  const expectedRequest = {
    projectId: forwardRequest.projectId,
    issueId: forwardRequest.target.issueId,
    leaseId: forwardReceipt?.lease?.leaseId,
    fencingToken: forwardReceipt?.lease?.fencingToken,
    idempotencyKey: `compensate:${forwardTransitionId}`,
    switchedAt: forwardRequest.switchedAt,
    target: {
      projectId: forwardRequest.projectId,
      issueId: forwardRequest.issueId,
      mode: 'write',
      idempotencyKey: `compensate-target:${forwardTransitionId}`,
      requestedAt: forwardRequest.switchedAt,
      ttlMs: forwardRequest.target.ttlMs,
      holder: forwardRequest.target.holder,
    },
  };
  if (canonicalRequestJson(request) !== canonicalRequestJson(expectedRequest)) {
    throw new Error(
      'work-lease compensation request does not match the immutable forward transition'
    );
  }
  const projections = {};
  for (const [name, input] of Object.entries(projectionInputs)) {
    validateProjectionName(name);
    projections[name] = {
      input: cloneDurableJson(input),
      projectionId: compensationProjectionIdentity(request.idempotencyKey, name),
      completed: false,
    };
  }
  const compensation = {
    canonicalRequest: canonicalRequestJson(request),
    idempotencyKey: request.idempotencyKey,
    forwardTransitionId: intent.transitionId,
    reason,
    projections,
  };
  if (intent.compensation !== undefined) {
    if (canonicalRequestJson(intent.compensation) === canonicalRequestJson(compensation)) {
      return intent;
    }
    throw new Error('work-lease compensation cannot be overwritten');
  }
  return { ...intent, compensation };
}

export function attachIntentCompensationReceipt(intent, { receipt, transitionId } = {}) {
  validateWorkLeaseIntent(intent, { requireAllProjections: true });
  const compensation = plainObject(intent.compensation, 'work-lease compensation');
  if (receipt === undefined) {
    throw new TypeError('work-lease compensation receipt is required');
  }
  assertNoSecretMaterial(receipt);
  const durableReceipt = cloneDurableJson(receipt);
  const receiptTransitionId = durableReceipt?.transition?.transitionId;
  const persistedTransitionId = transitionId ?? receiptTransitionId;
  nonEmptyString(persistedTransitionId, 'work-lease compensation transitionId');
  if (
    receiptTransitionId !== undefined &&
    transitionId !== undefined &&
    receiptTransitionId !== transitionId
  ) {
    throw new Error('work-lease compensation receipt transition does not match');
  }
  if (compensation.receipt !== undefined) {
    if (
      canonicalRequestJson(compensation.receipt) === canonicalRequestJson(durableReceipt) &&
      compensation.transitionId === persistedTransitionId
    ) {
      return intent;
    }
    throw new Error('work-lease compensation receipt cannot be overwritten');
  }
  return {
    ...intent,
    compensation: {
      ...compensation,
      receipt: durableReceipt,
      transitionId: persistedTransitionId,
    },
  };
}

export function checkpointIntentCompensationProjection(
  intent,
  name,
  reconciliationProof,
  expectedTransitionId,
  completedAt = new Date().toISOString()
) {
  validateWorkLeaseIntent(intent, { requireAllProjections: true });
  validateProjectionName(name);
  const compensation = plainObject(intent.compensation, 'work-lease compensation');
  if (compensation.receipt === undefined || compensation.transitionId !== expectedTransitionId) {
    throw new Error('work-lease compensation transition does not match');
  }
  const projection = compensation.projections?.[name];
  if (!projection) {
    throw new Error(`work-lease compensation projection ${name} has no persisted input`);
  }
  const durableProof = validateProjectionProof(reconciliationProof, name, projection.projectionId);
  if (projection.completed === true) return intent;
  nonEmptyString(completedAt, 'work-lease compensation projection completedAt');
  return {
    ...intent,
    compensation: {
      ...compensation,
      projections: {
        ...compensation.projections,
        [name]: {
          ...projection,
          completed: true,
          completedAt,
          reconciliationProof: durableProof,
        },
      },
    },
  };
}

export function workLeaseCompensationReconciled(intent) {
  if (intent?.compensation?.receipt === undefined) return false;
  return WORK_LEASE_PROJECTIONS.every(
    (name) => intent.compensation.projections?.[name]?.completed === true
  );
}

export function attachIntentReceipt(intent, { receipt, transitionId } = {}) {
  plainObject(intent, 'work-lease intent');
  if (receipt === undefined) {
    throw new TypeError('work-lease intent receipt is required');
  }
  assertNoSecretMaterial(receipt);
  const durableReceipt = cloneDurableJson(receipt);
  const receiptTransitionId = durableReceipt?.transition?.transitionId;
  const persistedTransitionId = transitionId ?? receiptTransitionId;
  if (persistedTransitionId !== undefined) {
    nonEmptyString(persistedTransitionId, 'work-lease intent transitionId');
  }
  if (
    transitionId !== undefined &&
    receiptTransitionId !== undefined &&
    transitionId !== receiptTransitionId
  ) {
    throw new Error('work-lease receipt transition does not match');
  }
  if (intent.receipt !== undefined) {
    if (
      canonicalRequestJson(intent.receipt) === canonicalRequestJson(durableReceipt) &&
      intent.transitionId === persistedTransitionId
    ) {
      return intent;
    }
    throw new Error('work-lease intent receipt cannot be overwritten');
  }
  return {
    ...intent,
    receipt: durableReceipt,
    ...(persistedTransitionId === undefined ? {} : { transitionId: persistedTransitionId }),
  };
}

export function setIntentProjectionInput(intent, name, input, expectedTransitionId) {
  plainObject(intent, 'work-lease intent');
  validateProjectionName(name);
  assertNoSecretMaterial(input);
  assertIntentTransition(intent, expectedTransitionId);
  const durableInput = cloneDurableJson(input);
  const existing = intent.projections?.[name];
  if (existing) {
    if (canonicalRequestJson(existing.input) === canonicalRequestJson(durableInput)) {
      return intent;
    }
    throw new Error(`work-lease projection input cannot be overwritten for ${name}`);
  }
  return {
    ...intent,
    projections: {
      ...intent.projections,
      [name]: {
        input: durableInput,
        projectionId: projectionIdentity(intent.operation, intent.idempotencyKey, name),
        completed: false,
      },
    },
  };
}

export function checkpointIntentProjection(
  intent,
  name,
  reconciliationProof,
  expectedTransitionId,
  completedAt = new Date().toISOString()
) {
  plainObject(intent, 'work-lease intent');
  validateProjectionName(name);
  assertIntentTransition(intent, expectedTransitionId);
  if (intent.receipt === undefined) {
    throw new Error('work-lease intent receipt must be persisted before projection checkpoints');
  }
  if (intent.operation === 'switchLease' && intent.forwardPhase === undefined) {
    throw new Error('work-lease switch forward phase must commit before projection checkpoints');
  }
  const projection = intent.projections?.[name];
  if (!projection) {
    throw new Error(`work-lease projection ${name} has no persisted input`);
  }
  const durableProof = validateProjectionProof(reconciliationProof, name, projection.projectionId);
  if (projection.completed === true) {
    validateProjectionProof(projection.reconciliationProof, name, projection.projectionId);
    return intent;
  }
  nonEmptyString(completedAt, 'work-lease projection completedAt');
  return {
    ...intent,
    projections: {
      ...intent.projections,
      [name]: {
        ...projection,
        completed: true,
        completedAt,
        reconciliationProof: durableProof,
      },
    },
  };
}

export function workLeaseIntentReconciled(intent) {
  if (!intent || typeof intent !== 'object' || intent.receipt === undefined) return false;
  return WORK_LEASE_PROJECTIONS.every((name) => intent.projections?.[name]?.completed === true);
}

export function workLeaseIntentsEqual(left, right) {
  return canonicalRequestJson(left) === canonicalRequestJson(right);
}

export function assertIntentTransition(intent, expectedTransitionId) {
  const actual = intent?.transitionId;
  if (actual === undefined) {
    if (expectedTransitionId !== undefined && expectedTransitionId !== null) {
      throw new Error('work-lease intent transition does not match');
    }
    return;
  }
  if (actual !== expectedTransitionId) {
    throw new Error('work-lease intent transition does not match');
  }
}
