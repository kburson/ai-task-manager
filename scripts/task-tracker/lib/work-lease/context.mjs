import {
  assertFencingToken,
  canonicalRequestJson,
  validateAcquireRequest,
  validateSwitchLeaseRequest,
} from '@kburson/aitm-ledger';

const LEASE_CONTEXT_KEYS = Object.freeze(['projectId', 'leaseId', 'fencingToken', 'worktreeId']);

export const WORK_LEASE_PROJECTIONS = Object.freeze(['session', 'fleet', 'timing', 'github']);

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

export function createWorkLeaseIntent({ operation, request, projectionInputs = {} }) {
  if (!['acquire', 'switchLease'].includes(operation)) {
    throw new TypeError('work-lease intent operation must be acquire or switchLease');
  }
  assertNoSecretMaterial(request);
  assertNoSecretMaterial(projectionInputs);
  if (operation === 'acquire') validateAcquireRequest(request);
  else validateSwitchLeaseRequest(request);
  plainObject(projectionInputs, 'projectionInputs');

  const projections = {};
  for (const [name, input] of Object.entries(projectionInputs)) {
    validateProjectionName(name);
    projections[name] = {
      input: cloneDurableJson(input),
      completed: false,
    };
  }

  return {
    operation,
    canonicalRequest: canonicalRequestJson(request),
    idempotencyKey: request.idempotencyKey,
    projections,
  };
}

export function readWorkLeaseIntentRequest(intent) {
  plainObject(intent, 'work-lease intent');
  nonEmptyString(intent.canonicalRequest, 'work-lease intent canonicalRequest');
  return JSON.parse(intent.canonicalRequest);
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
        completed: false,
      },
    },
  };
}

export function checkpointIntentProjection(
  intent,
  name,
  expectedTransitionId,
  completedAt = new Date().toISOString()
) {
  plainObject(intent, 'work-lease intent');
  validateProjectionName(name);
  assertIntentTransition(intent, expectedTransitionId);
  if (intent.receipt === undefined) {
    throw new Error('work-lease intent receipt must be persisted before projection checkpoints');
  }
  const projection = intent.projections?.[name];
  if (!projection) {
    throw new Error(`work-lease projection ${name} has no persisted input`);
  }
  if (projection.completed === true) return intent;
  nonEmptyString(completedAt, 'work-lease projection completedAt');
  return {
    ...intent,
    projections: {
      ...intent.projections,
      [name]: {
        ...projection,
        completed: true,
        completedAt,
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
