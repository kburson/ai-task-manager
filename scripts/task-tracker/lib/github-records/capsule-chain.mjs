import { isDeepStrictEqual } from 'node:util';

import { renderAitmRecord } from './record-envelope.mjs';

const CAPSULE_TYPES = new Set([
  'coordinator-grant',
  'coordinator-revocation',
  'work-assignment',
  'execution-result',
  'verification-evidence',
  'review-result',
  'record-disposition',
  'contract-sealed',
  'contract-amended',
  'lifecycle-transition',
  'handoff',
  'integration-result',
  'conflict-resolution',
  'repair-result',
]);

function chainError(category) {
  return new TypeError(`capsule-chain:${category}`);
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

function assertContext({ repository, issue }) {
  if (
    typeof repository !== 'string' ||
    !/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository) ||
    !Number.isInteger(issue) ||
    issue <= 0
  ) {
    throw chainError('input');
  }
}

function assertRecord(record, { repository, issue }) {
  if (!isPlainDataObject(record) || !isPlainDataObject(record.envelope)) {
    throw chainError('record');
  }
  if (record.envelope.predecessor === record.envelope.recordId) throw chainError('self-link');
  if (record.envelope.supersedes === record.envelope.recordId) {
    throw chainError('self-supersedes');
  }
  try {
    renderAitmRecord({ envelope: record.envelope, visibleMarkdown: '' });
  } catch {
    throw chainError('record');
  }
  if (record.envelope.repository !== repository || record.envelope.issue !== issue) {
    throw chainError('identity');
  }
  if (!CAPSULE_TYPES.has(record.envelope.recordType)) throw chainError('record-type');
  return record;
}

function buildIndex(records, context) {
  if (!Array.isArray(records)) throw chainError('input');
  const byId = new Map();
  for (const record of records) {
    assertRecord(record, context);
    const { recordId } = record.envelope;
    if (byId.has(recordId)) throw chainError('duplicate-record-id');
    byId.set(recordId, record);
  }
  return byId;
}

function validatePredecessors(byId) {
  const successors = new Map();
  const roots = [];
  for (const record of byId.values()) {
    const { predecessor, recordId } = record.envelope;
    if (predecessor === null) {
      roots.push(recordId);
      continue;
    }
    if (predecessor === recordId) throw chainError('self-link');
    if (!byId.has(predecessor)) throw chainError('missing-predecessor');
    const entries = successors.get(predecessor) ?? [];
    entries.push(recordId);
    successors.set(predecessor, entries);
  }
  const visiting = new Set();
  const visited = new Set();
  const visit = (recordId) => {
    if (visiting.has(recordId)) throw chainError('predecessor-cycle');
    if (visited.has(recordId)) return;
    visiting.add(recordId);
    const predecessor = byId.get(recordId).envelope.predecessor;
    if (predecessor !== null) visit(predecessor);
    visiting.delete(recordId);
    visited.add(recordId);
  };
  for (const recordId of byId.keys()) visit(recordId);
  if (byId.size > 0 && roots.length !== 1) throw chainError('multiple-roots');
  return successors;
}

function forkDiagnostics(successors) {
  return [...successors.entries()]
    .filter(([, recordIds]) => recordIds.length > 1)
    .map(([predecessorRecordId, recordIds]) =>
      Object.freeze({
        status: 'blocked',
        predecessorRecordId,
        successorRecordIds: Object.freeze([...recordIds].sort()),
      })
    )
    .sort((left, right) => left.predecessorRecordId.localeCompare(right.predecessorRecordId));
}

function structuralRecordOrder(byId, successors) {
  if (byId.size === 0) return [];
  const root = [...byId.values()].find((record) => record.envelope.predecessor === null);
  const ordered = [];
  let current = root;
  while (current !== undefined) {
    ordered.push(current);
    const next = successors.get(current.envelope.recordId) ?? [];
    if (next.length === 0) break;
    if (next.length > 1) throw chainError('fork');
    current = byId.get(next[0]);
  }
  return ordered;
}

function validateSupersession(byId) {
  const superseders = new Map();
  for (const record of byId.values()) {
    const { recordId, supersedes } = record.envelope;
    if (supersedes === null) continue;
    if (supersedes === recordId) throw chainError('self-supersedes');
    const target = byId.get(supersedes);
    if (target === undefined) throw chainError('missing-supersedes');
    if (target.envelope.recordType !== record.envelope.recordType) {
      throw chainError('incompatible-supersession');
    }
    const entries = superseders.get(supersedes) ?? [];
    entries.push(recordId);
    if (entries.length > 1) throw chainError('multiple-superseders');
    superseders.set(supersedes, entries);
  }
  const visiting = new Set();
  const visited = new Set();
  const visit = (recordId) => {
    if (visiting.has(recordId)) throw chainError('supersession-cycle');
    if (visited.has(recordId)) return;
    visiting.add(recordId);
    const supersedes = byId.get(recordId).envelope.supersedes;
    if (supersedes !== null) visit(supersedes);
    visiting.delete(recordId);
    visited.add(recordId);
  };
  for (const recordId of byId.keys()) visit(recordId);
  return superseders;
}

function validated({ records, repository, issue }) {
  assertContext({ repository, issue });
  const byId = buildIndex(records, { repository, issue });
  const successors = validatePredecessors(byId);
  const superseders = validateSupersession(byId);
  return { byId, successors, superseders };
}

export function validateCapsuleChain({ records, repository, issue } = {}) {
  const { successors } = validated({ records, repository, issue });
  return Object.freeze({
    records: Object.freeze([...records]),
    forks: Object.freeze(forkDiagnostics(successors)),
  });
}

export function detectRecordFork({ records, repository, issue } = {}) {
  const { successors } = validated({ records, repository, issue });
  return forkDiagnostics(successors)[0] ?? null;
}

export function resolveSupersession({ records, repository, issue } = {}) {
  const { byId, successors } = validated({ records, repository, issue });
  if (forkDiagnostics(successors).length > 0) throw chainError('fork');
  const supersededRecordIds = new Set();
  for (const record of byId.values()) {
    if (record.envelope.supersedes !== null) supersededRecordIds.add(record.envelope.supersedes);
  }
  return Object.freeze({
    records: Object.freeze([...records]),
    effectiveRecords: Object.freeze(
      structuralRecordOrder(byId, successors).filter(
        (record) => !supersededRecordIds.has(record.envelope.recordId)
      )
    ),
    supersededRecordIds: Object.freeze([...supersededRecordIds].sort()),
  });
}

function resolveHead(records, successors) {
  if (records.length === 0) return null;
  const heads = records
    .map(({ envelope }) => envelope.recordId)
    .filter((recordId) => !successors.has(recordId));
  if (heads.length !== 1) throw chainError('ambiguous-head');
  return heads[0];
}

function assertAppendDeps(deps) {
  if (
    !isPlainDataObject(deps) ||
    typeof deps.listIssueComments !== 'function' ||
    typeof deps.createIssueComment !== 'function' ||
    typeof deps.readBackComment !== 'function'
  ) {
    throw chainError('input');
  }
}

export async function appendCapsule({
  repository,
  issue,
  expectedHeadRecordId,
  candidate,
  deps,
} = {}) {
  assertContext({ repository, issue });
  assertAppendDeps(deps);
  if (!isPlainDataObject(candidate) || typeof candidate.visibleMarkdown !== 'string') {
    throw chainError('candidate');
  }
  assertRecord({ envelope: candidate.envelope }, { repository, issue });
  let records;
  try {
    records = await deps.listIssueComments({ repository, issue });
  } catch {
    throw chainError('store');
  }
  const initial = validated({ records, repository, issue });
  if (forkDiagnostics(initial.successors).length > 0) throw chainError('fork');
  const head = resolveHead(records, initial.successors);
  if (expectedHeadRecordId !== head || candidate.envelope.predecessor !== expectedHeadRecordId) {
    throw chainError('stale-head');
  }
  const candidateChain = validateCapsuleChain({
    records: [...records, { envelope: candidate.envelope }],
    repository,
    issue,
  });
  if (candidateChain.forks.length > 0) throw chainError('fork');
  const body = renderAitmRecord({
    envelope: candidate.envelope,
    visibleMarkdown: candidate.visibleMarkdown,
  });
  let created;
  try {
    created = await deps.createIssueComment({ repository, issue, body });
  } catch {
    throw chainError('store');
  }
  if (!isPlainDataObject(created) || typeof created.commentNodeId !== 'string') {
    throw chainError('readback-mismatch');
  }
  let readBack;
  try {
    readBack = await deps.readBackComment({
      commentNodeId: created.commentNodeId,
      repository,
      issue,
    });
  } catch {
    throw chainError('store');
  }
  try {
    assertRecord(readBack, { repository, issue });
  } catch {
    throw chainError('readback-mismatch');
  }
  if (
    readBack.commentNodeId !== created.commentNodeId ||
    readBack.body !== body ||
    !isDeepStrictEqual(readBack.envelope, candidate.envelope)
  ) {
    throw chainError('readback-mismatch');
  }
  let finalRecords;
  try {
    finalRecords = await deps.listIssueComments({ repository, issue });
  } catch {
    throw chainError('store');
  }
  const chain = validateCapsuleChain({ records: finalRecords, repository, issue });
  if (chain.forks.length > 0) throw chainError('fork');
  const createdRecords = finalRecords.filter(
    (record) => record.envelope.recordId === candidate.envelope.recordId
  );
  if (
    createdRecords.length !== 1 ||
    !isDeepStrictEqual(createdRecords[0].envelope, candidate.envelope)
  ) {
    throw chainError('readback-mismatch');
  }
  return Object.freeze({ record: createdRecords[0], chain });
}
