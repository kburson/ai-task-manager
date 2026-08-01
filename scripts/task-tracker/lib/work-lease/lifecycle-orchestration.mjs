import {
  canonicalRequestDigest,
  canonicalRequestJson,
  parseHttpLeaseResponse,
  validateReplayMutationOutcome,
  validateHandoffRequest,
  validateReleaseRequest,
  validateRenewRequest,
} from '@kburson/aitm-ledger';

import { normalizeWorkLeaseAuthority } from './context.mjs';

const SENSITIVE_KEY =
  /authorization|bearer|credentials?|token[_-]?env|secrets?|password|api[_-]?key|access[_-]?token|auth[_-]?token|aitm[_-]?lease[_-]?auth[_-]?token/i;
const mutationCommitProofs = new WeakMap();

function nonEmptyString(value, label) {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new TypeError(`${label} must be a non-empty string`);
  }
  return value;
}

function canonicalIssue(value) {
  const match = String(value ?? '').match(/^#?([1-9]\d*)$/);
  if (!match) {
    throw new TypeError('lifecycle journal issueId must be a canonical positive decimal');
  }
  return match[1];
}

function object(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError(`${label} must be an object`);
  }
  return value;
}

function exactKeys(value, required, optional, label) {
  object(value, label);
  const actual = Object.keys(value).sort();
  const expected = [...required, ...optional.filter((key) => Object.hasOwn(value, key))].sort();
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) {
    throw new TypeError(`${label} has an unknown shape`);
  }
}

function cloneDurableJson(value, location = '$', seen = new Set()) {
  if (typeof value === 'string') {
    if (/\bBearer\s+\S+/i.test(value)) {
      throw new TypeError(`secret lease material is forbidden at ${location}`);
    }
    return value;
  }
  if (value === null || typeof value === 'boolean') return value;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (!value || typeof value !== 'object' || seen.has(value)) {
    throw new TypeError(`lifecycle journal content must be durable JSON at ${location}`);
  }
  seen.add(value);
  if (Array.isArray(value)) {
    return value.map((entry, index) => cloneDurableJson(entry, `${location}[${index}]`, seen));
  }
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    throw new TypeError(`lifecycle journal content must be durable JSON at ${location}`);
  }
  return Object.fromEntries(
    Object.entries(value).map(([key, entry]) => {
      if (SENSITIVE_KEY.test(key)) {
        throw new TypeError(`secret lease material is forbidden at ${location}.${key}`);
      }
      return [key, cloneDurableJson(entry, `${location}.${key}`, seen)];
    })
  );
}

export function createLifecycleJournal(input) {
  exactKeys(
    input,
    ['operationId', 'action', 'issueId', 'authority', 'projections'],
    [],
    'lifecycle journal initial input'
  );
  const { issueId, authority, projections } = input;
  const operationId = nonEmptyString(
    cloneDurableJson(input.operationId, '$.operationId'),
    'lifecycle journal operationId'
  );
  const action = nonEmptyString(
    cloneDurableJson(input.action, '$.action'),
    'lifecycle journal action'
  );
  const canonicalIssueId = canonicalIssue(issueId);
  const normalizedAuthority = normalizeWorkLeaseAuthority(authority, {
    issueId: canonicalIssueId,
  });
  if (!Array.isArray(projections)) {
    throw new TypeError('lifecycle journal projections must be an array');
  }
  const projectionNames = new Set();

  return {
    schema: 1,
    operationId,
    action,
    issueId: canonicalIssueId,
    authority: normalizedAuthority,
    projections: projections.map((projection, index) => {
      exactKeys(projection, ['name', 'input'], [], `lifecycle journal projection ${index}`);
      const name = nonEmptyString(projection.name, 'lifecycle journal projection name');
      if (projectionNames.has(name)) {
        throw new TypeError('lifecycle journal projection names must be unique');
      }
      projectionNames.add(name);
      return {
        name,
        projectionId: `${operationId}:${name}`,
        input: cloneDurableJson(projection.input, `$.projections.${name}.input`),
        completed: false,
      };
    }),
  };
}

export function normalizeLifecycleJournal(value) {
  exactKeys(
    value,
    ['schema', 'operationId', 'action', 'issueId', 'authority', 'projections'],
    ['request', 'receipt'],
    'lifecycle journal'
  );
  if (value.schema !== 1) throw new TypeError('lifecycle journal schema must be 1');
  const operationId = nonEmptyString(
    cloneDurableJson(value.operationId, '$.operationId'),
    'lifecycle journal operationId'
  );
  const action = nonEmptyString(
    cloneDurableJson(value.action, '$.action'),
    'lifecycle journal action'
  );
  const issueId = canonicalIssue(value.issueId);
  const authority = normalizeWorkLeaseAuthority(value.authority, { issueId });
  if (!Array.isArray(value.projections)) {
    throw new TypeError('lifecycle journal projections must be an array');
  }
  const names = new Set();
  const projections = value.projections.map((projection, index) => {
    exactKeys(
      projection,
      ['name', 'projectionId', 'input', 'completed'],
      ['proof'],
      `lifecycle journal projection ${index}`
    );
    const name = nonEmptyString(
      cloneDurableJson(projection.name, `$.projections[${index}].name`),
      'lifecycle journal projection name'
    );
    if (names.has(name)) throw new TypeError('lifecycle journal projection names must be unique');
    names.add(name);
    if (projection.projectionId !== `${operationId}:${name}`) {
      throw new TypeError('lifecycle journal projection identity does not match');
    }
    if (typeof projection.completed !== 'boolean') {
      throw new TypeError('lifecycle journal projection completed must be boolean');
    }
    if (projection.completed !== Object.hasOwn(projection, 'proof')) {
      throw new TypeError('lifecycle journal completed projection must contain one proof');
    }
    return {
      name,
      projectionId: projection.projectionId,
      input: cloneDurableJson(projection.input, `$.projections[${index}].input`),
      completed: projection.completed,
      ...(projection.completed
        ? { proof: cloneDurableJson(projection.proof, `$.projections[${index}].proof`) }
        : {}),
    };
  });
  let normalized = { schema: 1, operationId, action, issueId, authority, projections };
  if (Object.hasOwn(value, 'request')) {
    exactKeys(
      value.request,
      ['operation', 'idempotencyKey', 'canonicalRequest'],
      [],
      'lifecycle journal request'
    );
    const rawRequest = JSON.parse(value.request.canonicalRequest);
    if (canonicalRequestJson(rawRequest) !== value.request.canonicalRequest) {
      throw new TypeError('lifecycle journal request bytes are not canonical');
    }
    normalized = attachLifecycleRequest(normalized, value.request.operation, rawRequest);
    if (normalized.request.idempotencyKey !== value.request.idempotencyKey) {
      throw new TypeError('lifecycle journal request identity does not match');
    }
  }
  if (Object.hasOwn(value, 'receipt')) {
    normalized = attachLifecycleReceipt(normalized, value.receipt);
  }
  return normalized;
}

export function assertLifecycleJournalTransition(currentInput, nextInput) {
  const current = normalizeLifecycleJournal(currentInput);
  const next = normalizeLifecycleJournal(nextInput);
  const stable = (journal) => ({
    schema: journal.schema,
    operationId: journal.operationId,
    action: journal.action,
    issueId: journal.issueId,
    authority: journal.authority,
    projections: journal.projections.map(({ name, projectionId, input }) => ({
      name,
      projectionId,
      input,
    })),
  });
  if (canonicalRequestJson(stable(current)) !== canonicalRequestJson(stable(next))) {
    throw new Error('lifecycle journal immutable fields cannot be overwritten');
  }
  for (let index = 0; index < current.projections.length; index += 1) {
    if (
      current.projections[index].completed &&
      canonicalRequestJson(current.projections[index]) !==
        canonicalRequestJson(next.projections[index])
    ) {
      throw new Error('lifecycle journal completed checkpoint cannot be overwritten');
    }
  }
  if (
    current.request &&
    canonicalRequestJson(current.request) !== canonicalRequestJson(next.request)
  ) {
    throw new Error('lifecycle journal request cannot be overwritten');
  }
  if (
    current.receipt &&
    canonicalRequestJson(current.receipt) !== canonicalRequestJson(next.receipt)
  ) {
    throw new Error('lifecycle journal receipt cannot be overwritten');
  }
  if (!current.request && next.receipt) {
    throw new Error('lifecycle journal request must be persisted before receipt transition');
  }
  return next;
}

export function checkpointLifecycleProjection(journal, projectionName, proof) {
  const durableProof = cloneDurableJson(proof, '$.projection.proof');
  const index = journal?.projections?.findIndex(({ name }) => name === projectionName) ?? -1;
  if (index === -1) {
    throw new TypeError('lifecycle journal projection is not persisted');
  }
  if (journal.projections.slice(0, index).some(({ completed }) => !completed)) {
    throw new Error('lifecycle journal prior projections must be complete');
  }
  const projection = journal.projections[index];
  if (projection.completed) {
    if (JSON.stringify(projection.proof) !== JSON.stringify(durableProof)) {
      throw new Error('lifecycle journal checkpoint cannot be overwritten');
    }
    return journal;
  }
  const projections = journal.projections.map((entry, entryIndex) =>
    entryIndex === index ? { ...entry, completed: true, proof: durableProof } : entry
  );
  return { ...journal, projections };
}

export function attachLifecycleRequest(journal, operation, request) {
  if (journal?.projections?.some(({ completed }) => !completed)) {
    throw new Error('lifecycle journal projections must be complete before request attachment');
  }
  const durableRequest = cloneDurableJson(request, '$.request');
  if (operation === 'renew') validateRenewRequest(durableRequest);
  else if (operation === 'release') validateReleaseRequest(durableRequest);
  else if (operation === 'handoff') validateHandoffRequest(durableRequest);
  else throw new TypeError('lifecycle journal operation must be renew, release, or handoff');

  const { lease, holder, binding } = normalizeWorkLeaseAuthority(journal.authority, {
    issueId: journal.issueId,
  });
  if (
    durableRequest.projectId !== lease.projectId ||
    durableRequest.leaseId !== lease.leaseId ||
    durableRequest.fencingToken !== lease.fencingToken ||
    canonicalRequestJson(durableRequest.holder) !== canonicalRequestJson(holder) ||
    canonicalRequestJson(durableRequest.binding) !== canonicalRequestJson(binding)
  ) {
    throw new Error('lifecycle journal request does not match persisted authority');
  }

  const attached = {
    operation,
    idempotencyKey: durableRequest.idempotencyKey,
    canonicalRequest: canonicalRequestJson(durableRequest),
  };
  if (journal.request) {
    if (canonicalRequestJson(journal.request) !== canonicalRequestJson(attached)) {
      throw new Error('lifecycle journal request cannot be overwritten');
    }
    return journal;
  }
  return { ...journal, request: attached };
}

function replaySelector(requestAttachment) {
  const request = JSON.parse(requestAttachment.canonicalRequest);
  return {
    projectId: request.projectId,
    operation: requestAttachment.operation,
    idempotencyKey: requestAttachment.idempotencyKey,
    requestDigest: canonicalRequestDigest(request),
  };
}

export function attachLifecycleReceipt(journal, receipt) {
  if (!journal?.request) {
    throw new Error('lifecycle journal request must be attached before receipt');
  }
  const durableReceipt = cloneDurableJson(receipt, '$.receipt');
  const correlatedReceipt = parseHttpLeaseResponse({
    operation: journal.request.operation,
    status: 200,
    payload: { result: durableReceipt },
    request: JSON.parse(journal.request.canonicalRequest),
  });
  if (journal.receipt) {
    if (canonicalRequestJson(journal.receipt) !== canonicalRequestJson(correlatedReceipt)) {
      throw new Error('lifecycle journal receipt cannot be overwritten');
    }
    return journal;
  }
  return { ...journal, receipt: correlatedReceipt };
}

export async function authenticateLifecycleMutationCommit({ journal, store } = {}) {
  const normalized = normalizeLifecycleJournal(journal);
  if (!normalized.request || !normalized.receipt || typeof store?.replayMutation !== 'function') {
    throw new Error('lifecycle journal mutation replay authority is unavailable');
  }
  const selector = replaySelector(normalized.request);
  const outcome = validateReplayMutationOutcome(await store.replayMutation(selector), selector);
  if (
    outcome.outcome !== 'committed' ||
    canonicalRequestJson(outcome.result) !== canonicalRequestJson(normalized.receipt)
  ) {
    throw new Error('lifecycle journal mutation replay did not return the exact committed receipt');
  }
  const proof = Object.freeze(Object.create(null));
  mutationCommitProofs.set(
    proof,
    Object.freeze({
      journalJson: canonicalRequestJson(normalized),
    })
  );
  return proof;
}

export function assertLifecycleMutationCommitAuthority(proof, journal) {
  const actual = mutationCommitProofs.get(proof);
  if (!actual) {
    throw new Error('proof is not a live in-memory mutation commit proof');
  }
  if (actual.journalJson !== canonicalRequestJson(normalizeLifecycleJournal(journal))) {
    throw new Error('mutation commit proof does not match the lifecycle journal');
  }
  return proof;
}

export function completeLifecycleCleanup({ journal, commitAuthority, clear } = {}) {
  const normalized = normalizeLifecycleJournal(journal);
  if (normalized.projections.some(({ completed }) => !completed)) {
    throw new Error('lifecycle journal projections must be complete before cleanup');
  }
  assertLifecycleMutationCommitAuthority(commitAuthority, normalized);
  if (typeof clear !== 'function') {
    throw new TypeError('lifecycle journal fenced clear is unavailable');
  }
  const cleared = clear({
    journal: normalized,
    operationId: normalized.operationId,
    leaseId: normalized.authority.lease.leaseId,
    fencingToken: normalized.authority.lease.fencingToken,
  });
  if (cleared !== true) {
    throw new Error('lifecycle journal fenced clear did not match persisted authority');
  }
  return true;
}
