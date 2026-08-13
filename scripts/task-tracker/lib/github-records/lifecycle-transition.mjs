import { createHash } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';

import { appendCapsule, validateCapsuleChain } from './capsule-chain.mjs';
import { authorizeCoordinatorOperation } from './coordination-authority.mjs';
import { renderDeliveryContract, validateContractProjection } from './delivery-contract.mjs';
import { assertNoSecretRecordData, createAitmRecordEnvelope } from './record-envelope.mjs';
import { SINGLETON_KINDS } from './issue-directory.mjs';
import { stateIds } from '../lifecycle-policy/index.mjs';

const LEGACY_READY_FOR_PLAN_STATES = new Set(['assigned', 'on-deck']);

const PAYLOAD_KEYS = [
  'action',
  'branch',
  'contractEpoch',
  'fromState',
  'grantEpoch',
  'grantId',
  'issue',
  'operationId',
  'projections',
  'schema',
  'toState',
];
const PROJECTION_KEYS = [
  'expectedBodyHash',
  'expectedRevision',
  'kind',
  'nextBody',
  'nextBodyHash',
  'nextRevision',
  'singletonCommentNodeId',
];
const HASH_RE = /^sha256:[0-9a-f]{64}$/;
const RECORD_ID_RE = /^[0-7][0-9A-HJKMNP-TV-Z]{25}$/;
const capabilities = new WeakMap();

function transitionError(category) {
  return new TypeError(`lifecycle-transition:${category}`);
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

function hasExactlyKeys(value, expected) {
  if (!isPlainDataObject(value)) return false;
  const actual = Object.keys(value).sort();
  const keys = [...expected].sort();
  return actual.length === keys.length && actual.every((key, index) => key === keys[index]);
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

function deepFreeze(value) {
  if (value === null || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

function projectionBodyHash(body) {
  return `sha256:${createHash('sha256').update(body).digest('hex')}`;
}

function validateProjection(projection) {
  if (
    !hasExactlyKeys(projection, PROJECTION_KEYS) ||
    !SINGLETON_KINDS.includes(projection.kind) ||
    !isOpaqueId(projection.singletonCommentNodeId) ||
    !Number.isSafeInteger(projection.expectedRevision) ||
    projection.expectedRevision <= 0 ||
    !Number.isSafeInteger(projection.nextRevision) ||
    projection.nextRevision !== projection.expectedRevision + 1 ||
    !HASH_RE.test(projection.expectedBodyHash) ||
    !HASH_RE.test(projection.nextBodyHash) ||
    typeof projection.nextBody !== 'string' ||
    projection.nextBody.length === 0 ||
    projection.nextBodyHash !== projectionBodyHash(projection.nextBody)
  ) {
    throw transitionError('projection');
  }
  return projection;
}

function validatePayload(payload, expectedIssue) {
  try {
    assertNoSecretRecordData(payload);
  } catch {
    throw transitionError('secret');
  }
  // Payload state ids remain exact-canonical. The sole exception is the exact
  // historical slug retained in immutable v1 capsules; replay-only enforcement
  // happens after the record chain is loaded below.
  const fromState = LEGACY_READY_FOR_PLAN_STATES.has(payload?.fromState)
    ? 'ready-for-plan'
    : payload?.fromState;
  const toState = LEGACY_READY_FOR_PLAN_STATES.has(payload?.toState)
    ? 'ready-for-plan'
    : payload?.toState;
  if (
    !hasExactlyKeys(payload, PAYLOAD_KEYS) ||
    payload.schema !== 'aitm.lifecycle-transition/v1' ||
    payload.issue !== expectedIssue ||
    !isOpaqueId(payload.operationId) ||
    !isOpaqueId(payload.action) ||
    !stateIds().includes(fromState) ||
    !stateIds().includes(toState) ||
    fromState === toState ||
    !isOpaqueId(payload.branch) ||
    !RECORD_ID_RE.test(payload.grantId) ||
    !Number.isSafeInteger(payload.grantEpoch) ||
    payload.grantEpoch <= 0 ||
    !Number.isSafeInteger(payload.contractEpoch) ||
    payload.contractEpoch <= 0 ||
    !Array.isArray(payload.projections) ||
    payload.projections.length === 0 ||
    payload.projections.length > SINGLETON_KINDS.length
  ) {
    throw transitionError('payload');
  }
  for (const projection of payload.projections) validateProjection(projection);
  if (new Set(payload.projections.map(({ kind }) => kind)).size !== payload.projections.length) {
    throw transitionError('projection-kind');
  }
  if (
    new Set(payload.projections.map(({ singletonCommentNodeId }) => singletonCommentNodeId))
      .size !== payload.projections.length
  ) {
    throw transitionError('projection-identity');
  }
  return deepFreeze(structuredClone(payload));
}

function hasLegacyAssignedState(payload) {
  return (
    LEGACY_READY_FOR_PLAN_STATES.has(payload.fromState) ||
    LEGACY_READY_FOR_PLAN_STATES.has(payload.toState)
  );
}

function validateContract(contract, payload) {
  try {
    const rendered = renderDeliveryContract({ contract });
    validateContractProjection({ contract, markdown: rendered.markdown });
  } catch {
    throw transitionError('contract');
  }
  if (
    contract.status !== 'sealed' ||
    contract.contractEpoch !== payload.contractEpoch ||
    contract.authorityEpoch !== payload.grantEpoch ||
    contract.coordinatorGrantId !== payload.grantId
  ) {
    throw transitionError('contract');
  }
}

function resolveHead(records) {
  if (records.length === 0) return null;
  const predecessors = new Set(
    records.map(({ envelope }) => envelope.predecessor).filter((recordId) => recordId !== null)
  );
  const heads = records.filter(({ envelope }) => !predecessors.has(envelope.recordId));
  if (heads.length !== 1) throw transitionError('head');
  return heads[0];
}

function validateRecords(records, repository, issue) {
  let chain;
  try {
    chain = validateCapsuleChain({ records, repository, issue });
  } catch (error) {
    if (error instanceof TypeError && /capsule-chain:(?:fork|multiple-roots)/.test(error.message)) {
      throw transitionError('fork');
    }
    throw transitionError('chain');
  }
  if (chain.forks.length > 0) throw transitionError('fork');
  return chain.records;
}

function findExistingTransition(records, payload) {
  const candidates = records.filter(
    ({ envelope }) =>
      envelope.recordType === 'lifecycle-transition' &&
      envelope.payload?.operationId === payload.operationId
  );
  if (candidates.length === 0) return null;
  if (candidates.length !== 1) throw transitionError('operation-conflict');
  const candidate = candidates[0];
  if (
    !isDeepStrictEqual(candidate.envelope.payload, payload) ||
    candidate.envelope.authority.grantId !== payload.grantId ||
    candidate.envelope.authority.epoch !== payload.grantEpoch
  ) {
    throw transitionError('operation-conflict');
  }
  return candidate;
}

function createCapability(data) {
  const capability = Object.freeze({});
  capabilities.set(capability, deepFreeze(data));
  return capability;
}

/** @internal Authenticate and inspect a live, module-issued transition capability. */
export function assertTransitionAuthorityCapability(capability, { requireDurable = false } = {}) {
  const data = capabilities.get(capability);
  if (data === undefined || (requireDurable && data.transitionRecord === null)) {
    throw transitionError('capability');
  }
  return data;
}

export function validateTransitionAuthority({
  repository,
  issue,
  payload: payloadInput,
  authority,
  coordinator,
  contract,
  records,
} = {}) {
  if (
    typeof repository !== 'string' ||
    !/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository) ||
    !Number.isInteger(issue) ||
    issue <= 0 ||
    !Array.isArray(records)
  ) {
    throw transitionError('input');
  }
  const payload = validatePayload(payloadInput, issue);
  validateContract(contract, payload);
  const authorization = authorizeCoordinatorOperation({
    authority,
    grantId: payload.grantId,
    epoch: payload.grantEpoch,
    coordinator,
    issue,
    operation: payload.action,
    branch: payload.branch,
  });
  if (!authorization.authorized) throw transitionError('authority');
  const validatedRecords = validateRecords(records, repository, issue);
  const head = resolveHead(validatedRecords);
  const transitionRecord = findExistingTransition(validatedRecords, payload);
  // Immutable v1 capsules may contain the historical second-state slug.  It is
  // accepted only as an exact replay of a record whose payload hash already
  // covers those bytes; no new transition may emit the retired spelling.
  if (hasLegacyAssignedState(payload) && transitionRecord === null) {
    throw transitionError('legacy-state');
  }
  if (transitionRecord !== null && head.envelope.recordId !== transitionRecord.envelope.recordId) {
    throw transitionError('stale-transition');
  }
  return createCapability({
    repository,
    issue,
    payload,
    coordinator: structuredClone(coordinator),
    expectedHeadRecordId:
      transitionRecord === null
        ? (head?.envelope.recordId ?? null)
        : transitionRecord.envelope.predecessor,
    transitionRecord,
  });
}

async function emitCrash(crashAt, phase) {
  if (typeof crashAt === 'function') await crashAt({ phase });
}

function assertAppendDependencies(deps) {
  if (
    !isPlainDataObject(deps) ||
    typeof deps.listIssueComments !== 'function' ||
    typeof deps.createIssueComment !== 'function' ||
    typeof deps.readBackComment !== 'function'
  ) {
    throw transitionError('deps');
  }
}

async function appendAuthorized({
  repository,
  issue,
  transitionAuthority,
  recordId,
  createdAt,
  deps,
  crashAt,
}) {
  const data = assertTransitionAuthorityCapability(transitionAuthority);
  if (data.repository !== repository || data.issue !== issue) throw transitionError('capability');
  assertAppendDependencies(deps);
  let records;
  try {
    records = await deps.listIssueComments({ repository, issue });
  } catch {
    throw transitionError('store');
  }
  const validatedRecords = validateRecords(records, repository, issue);
  const existing = findExistingTransition(validatedRecords, data.payload);
  if (data.transitionRecord !== null && existing === null) {
    throw transitionError('stale-transition');
  }
  if (existing !== null) {
    if (existing.envelope.predecessor !== data.expectedHeadRecordId) {
      throw transitionError('operation-conflict');
    }
    const replayAuthority = createCapability({ ...data, transitionRecord: existing });
    return Object.freeze({
      record: existing,
      replayed: true,
      transitionAuthority: replayAuthority,
    });
  }
  const envelope = createAitmRecordEnvelope({
    recordType: 'lifecycle-transition',
    repository,
    issue,
    payload: data.payload,
    actor: data.coordinator.actor,
    epoch: data.payload.grantEpoch,
    grantId: data.payload.grantId,
    predecessor: data.expectedHeadRecordId,
    supersedes: null,
    recordId,
    createdAt,
  });
  await emitCrash(crashAt, 'before-capsule');
  let appendCrash = null;
  const appendDeps = {
    ...deps,
    async createIssueComment(input) {
      const created = await deps.createIssueComment(input);
      try {
        await emitCrash(crashAt, 'after-capsule');
      } catch (error) {
        appendCrash = error;
        throw error;
      }
      return created;
    },
  };
  let appended;
  try {
    appended = await appendCapsule({
      repository,
      issue,
      expectedHeadRecordId: data.expectedHeadRecordId,
      candidate: {
        envelope,
        visibleMarkdown: `AITM lifecycle transition: ${data.payload.fromState} → ${data.payload.toState}.\n`,
      },
      deps: appendDeps,
    });
  } catch (error) {
    if (appendCrash !== null) throw appendCrash;
    throw error;
  }
  await emitCrash(crashAt, 'after-capsule-readback');
  const repairAuthority = createCapability({ ...data, transitionRecord: appended.record });
  return Object.freeze({
    record: appended.record,
    replayed: false,
    transitionAuthority: repairAuthority,
  });
}

export function appendLifecycleTransition(input = {}) {
  assertTransitionAuthorityCapability(input.transitionAuthority);
  return appendAuthorized(input);
}
