import { isCapsuleRecordType, resolveSupersession } from './capsule-chain.mjs';
import { resolveContractSource } from './contract-source.mjs';
import { listIssueCommentsSince } from './github-comment-store.mjs';

const EVIDENCE_PAYLOAD_KEYS = [
  'commitSha',
  'contractEpoch',
  'evidenceKind',
  'provenance',
  'result',
  'schema',
];
export const LIFECYCLE_EVIDENCE_SCHEMA = 'aitm.lifecycle-evidence/v1';
const SHA_RE = /^[0-9a-f]{40}$/;
const EVIDENCE_RULES = Object.freeze({
  'verification-evidence': Object.freeze(['test|passed|agent']),
  'review-result': Object.freeze([
    'review|passed|agent',
    'approval|approved|human',
    'approval|approved|full-auto',
  ]),
});

export class LifecycleGateSourceError extends TypeError {
  constructor(category, cause) {
    super(`lifecycle-gate-source:${category}`, cause === undefined ? undefined : { cause });
    this.name = 'LifecycleGateSourceError';
    this.category = category;
  }
}

function fail(category, cause) {
  throw new LifecycleGateSourceError(category, cause);
}

function deepFreeze(value) {
  if (value === null || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

function isPlainObject(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function hasExactKeys(value, keys) {
  if (!isPlainObject(value)) return false;
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
}

function assertInput({ repository, issue, contractSource, records, expectedSha }) {
  if (
    typeof repository !== 'string' ||
    !/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository) ||
    !Number.isInteger(issue) ||
    issue <= 0 ||
    !isPlainObject(contractSource) ||
    !['legacy-body/v1', 'github-records/v1'].includes(contractSource.sourceKind) ||
    !Array.isArray(records) ||
    typeof expectedSha !== 'string' ||
    !SHA_RE.test(expectedSha)
  ) {
    fail('input');
  }
}

function projectEvidence(record, { contractEpoch, authority, expectedSha }) {
  const { envelope } = record;
  const rules = EVIDENCE_RULES[envelope.recordType];
  const payload = envelope.payload;
  if (
    rules === undefined ||
    !hasExactKeys(payload, EVIDENCE_PAYLOAD_KEYS) ||
    payload.schema !== LIFECYCLE_EVIDENCE_SCHEMA ||
    !rules.includes(`${payload.evidenceKind}|${payload.result}|${payload.provenance}`)
  ) {
    fail('evidence');
  }
  if (payload.contractEpoch !== contractEpoch) fail('contract-epoch');
  if (payload.commitSha !== expectedSha) fail('sha');
  if (
    envelope.authority.grantId !== authority.coordinatorGrantId ||
    envelope.authority.epoch !== authority.authorityEpoch
  ) {
    fail('authority');
  }
  return {
    recordId: envelope.recordId,
    recordType: envelope.recordType,
    evidenceKind: payload.evidenceKind,
    result: payload.result,
    contractEpoch: payload.contractEpoch,
    commitSha: payload.commitSha,
    provenance: payload.provenance,
    authority: { ...envelope.authority },
  };
}

export function projectLifecycleGateEvidence({
  repository,
  issue,
  contractSource,
  records = [],
  expectedSha,
} = {}) {
  assertInput({ repository, issue, contractSource, records, expectedSha });
  if (contractSource.sourceKind === 'legacy-body/v1') {
    return deepFreeze({
      sourceKind: contractSource.sourceKind,
      expectedSha,
      evidence: [],
      acceptedRecordIds: [],
      authority: null,
    });
  }
  const acceptedRecordIds = contractSource.contract?.acceptedRecordIds;
  const authority = contractSource.authority;
  if (!Array.isArray(acceptedRecordIds) || !isPlainObject(authority)) fail('contract');
  let resolved;
  try {
    resolved = resolveSupersession({ records, repository, issue });
  } catch (error) {
    fail('records', error);
  }
  const effectiveById = new Map(
    resolved.effectiveRecords.map((record) => [record.envelope.recordId, record])
  );
  const allRecordIds = new Set(resolved.records.map((record) => record.envelope.recordId));
  const supersededRecordIds = new Set(resolved.supersededRecordIds);
  const acceptedRecords = acceptedRecordIds.map((recordId) => {
    if (!allRecordIds.has(recordId)) fail('accepted-record-missing');
    if (supersededRecordIds.has(recordId)) fail('accepted-record-superseded');
    const record = effectiveById.get(recordId);
    if (record === undefined) fail('accepted-record-missing');
    return record;
  });
  const evidence = acceptedRecords
    .filter((record) => EVIDENCE_RULES[record.envelope.recordType] !== undefined)
    .map((record) =>
      projectEvidence(record, {
        contractEpoch: authority.contractEpoch,
        authority,
        expectedSha,
      })
    );
  return deepFreeze({
    sourceKind: contractSource.sourceKind,
    expectedSha,
    evidence,
    acceptedRecordIds: [...acceptedRecordIds],
    authority: { ...authority },
  });
}

export async function resolveLifecycleGateEvidence({
  repository,
  issue,
  issueBody,
  expectedSha,
  graphql,
  readContractRecord,
  deps = {},
} = {}) {
  const resolve = deps.resolveContractSource ?? resolveContractSource;
  let contractSource;
  try {
    contractSource = await resolve({
      repository,
      issue,
      issueBody,
      graphql,
      readContractRecord,
    });
  } catch (error) {
    fail('contract-source', error);
  }
  let records = [];
  if (contractSource.sourceKind === 'github-records/v1') {
    const list =
      deps.listIssueRecords ??
      ((input) => listIssueCommentsSince({ ...input, since: '1970-01-01T00:00:00.000Z' }));
    try {
      records = await list({ repository, issue, graphql });
    } catch (error) {
      fail('unavailable', error);
    }
    if (!Array.isArray(records)) fail('unavailable');
    records = records.filter((record) => isCapsuleRecordType(record?.envelope?.recordType));
  }
  return projectLifecycleGateEvidence({
    repository,
    issue,
    contractSource,
    records,
    expectedSha,
  });
}
