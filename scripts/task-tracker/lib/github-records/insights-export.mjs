import { createHash } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';

import { canonicalRecordJson } from './canonical-json.mjs';
import { validateDeliveryContract } from './delivery-contract.mjs';
import { createIssueDirectory } from './issue-directory.mjs';
import { hashRecordPayload, renderAitmRecord } from './record-envelope.mjs';

const EXPORT_SCHEMA = 'aitm.insights-record-set/v1';
const COLLECTIONS = Object.freeze([
  'repositories',
  'issues',
  'directories',
  'contracts',
  'records',
  'projections',
  'cursorHints',
]);
const PROJECTION_SCHEMAS = Object.freeze({
  coordination: 'aitm.coordination-singleton/v1',
  'evidence-projection': 'aitm.evidence-projection/v1',
  timing: 'aitm.timing-projection/v1',
});

function exportError(category) {
  return new TypeError(`insights-export:${category}`);
}

function exact(value, expectedKeys, category) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw exportError(category);
  }
  const actual = Object.keys(value).sort();
  const expected = [...expectedKeys].sort();
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) {
    throw exportError(category);
  }
}

function opaque(value) {
  return (
    typeof value === 'string' &&
    value.length > 0 &&
    value.length <= 256 &&
    value.trim() === value &&
    ![...value].some((character) => {
      const code = character.charCodeAt(0);
      return code <= 0x1f || code === 0x7f;
    })
  );
}

function instant(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)) {
    return false;
  }
  const milliseconds = Date.parse(value);
  return Number.isFinite(milliseconds) && new Date(milliseconds).toISOString() === value;
}

function requireInstant(value) {
  if (!instant(value)) throw exportError('updated-at');
  return value;
}

function fingerprint(value) {
  return createHash('sha256').update(canonicalRecordJson(value)).digest('hex');
}

function deepFreeze(value) {
  if (value === null || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

function normalized(value) {
  canonicalRecordJson(value);
  return structuredClone(value);
}

function deduplicate(items, { key, updatedAt, validate }) {
  const observations = new Map();
  for (const raw of items) {
    const entry = validate(raw);
    const identity = key(entry);
    if (!opaque(identity)) throw exportError('identity');
    const timestamp = requireInstant(updatedAt(entry));
    const hash = fingerprint(entry);
    const current = observations.get(identity);
    if (current === undefined || timestamp > current.timestamp) {
      observations.set(identity, { entry, timestamp, hash });
      continue;
    }
    if (timestamp === current.timestamp && hash !== current.hash) throw exportError('conflict');
  }
  return [...observations.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([, value]) => value.entry);
}

function validateRepository(raw) {
  exact(raw, ['nameWithOwner', 'repositoryNodeId', 'updatedAt'], 'repository');
  if (
    !opaque(raw.repositoryNodeId) ||
    typeof raw.nameWithOwner !== 'string' ||
    !/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(raw.nameWithOwner)
  ) {
    throw exportError('repository');
  }
  requireInstant(raw.updatedAt);
  return normalized(raw);
}

function validateIssue(raw) {
  exact(raw, ['issueNodeId', 'number', 'repositoryNodeId', 'updatedAt'], 'issue');
  if (
    !opaque(raw.issueNodeId) ||
    !opaque(raw.repositoryNodeId) ||
    !Number.isSafeInteger(raw.number) ||
    raw.number <= 0
  ) {
    throw exportError('issue');
  }
  requireInstant(raw.updatedAt);
  return normalized(raw);
}

function validateDirectory(raw) {
  exact(raw, ['directory', 'issueNodeId', 'updatedAt'], 'directory');
  if (!opaque(raw.issueNodeId)) throw exportError('directory');
  requireInstant(raw.updatedAt);
  let expected;
  try {
    expected = createIssueDirectory({
      issueNodeId: raw.issueNodeId,
      singletons: raw.directory?.singletons,
    });
  } catch (error) {
    throw exportError('directory', { cause: error });
  }
  if (!isDeepStrictEqual(raw.directory, expected)) throw exportError('directory');
  return normalized(raw);
}

function validateContract(raw) {
  exact(raw, ['commentNodeId', 'contract', 'issueNodeId', 'payloadHash', 'updatedAt'], 'contract');
  if (!opaque(raw.issueNodeId) || !opaque(raw.commentNodeId)) throw exportError('contract');
  requireInstant(raw.updatedAt);
  try {
    validateDeliveryContract(raw.contract);
  } catch (error) {
    throw new TypeError('insights-export:contract', { cause: error });
  }
  if (raw.payloadHash !== hashRecordPayload(raw.contract)) throw exportError('payload-hash');
  return normalized(raw);
}

function validateRecord(raw) {
  exact(raw, ['commentNodeId', 'envelope', 'updatedAt'], 'record');
  if (!opaque(raw.commentNodeId)) throw exportError('record');
  requireInstant(raw.updatedAt);
  try {
    renderAitmRecord({ envelope: raw.envelope });
  } catch (error) {
    throw new TypeError('insights-export:record', { cause: error });
  }
  return normalized(raw);
}

function validateRecordIdentities(items) {
  const byComment = new Map();
  const byRecordId = new Map();
  return items.map((raw) => {
    const entry = validateRecord(raw);
    const recordId = entry.envelope.recordId;
    const knownRecordId = byComment.get(entry.commentNodeId);
    const knownComment = byRecordId.get(recordId);
    if (
      (knownRecordId !== undefined && knownRecordId !== recordId) ||
      (knownComment !== undefined && knownComment !== entry.commentNodeId)
    ) {
      throw exportError('record-id');
    }
    byComment.set(entry.commentNodeId, recordId);
    byRecordId.set(recordId, entry.commentNodeId);
    return entry;
  });
}

function validateProjection(raw) {
  exact(
    raw,
    ['commentNodeId', 'issueNodeId', 'kind', 'payloadHash', 'projection', 'updatedAt'],
    'projection'
  );
  if (
    !opaque(raw.issueNodeId) ||
    !opaque(raw.commentNodeId) ||
    PROJECTION_SCHEMAS[raw.kind] !== raw.projection?.schema ||
    !Number.isSafeInteger(raw.projection?.revision) ||
    raw.projection.revision <= 0
  ) {
    throw exportError('projection');
  }
  requireInstant(raw.updatedAt);
  if (raw.payloadHash !== hashRecordPayload(raw.projection)) throw exportError('payload-hash');
  return normalized(raw);
}

function validateCursor(raw) {
  exact(
    raw,
    ['commentsUpdatedAt', 'issuesUpdatedAt', 'overlapSeconds', 'repositoryNodeId'],
    'cursor'
  );
  if (
    !opaque(raw.repositoryNodeId) ||
    !Number.isSafeInteger(raw.overlapSeconds) ||
    raw.overlapSeconds <= 0 ||
    !instant(raw.issuesUpdatedAt) ||
    !instant(raw.commentsUpdatedAt)
  ) {
    throw exportError('cursor');
  }
  return normalized(raw);
}

function validateInput(input) {
  if (input === null || typeof input !== 'object' || Array.isArray(input)) {
    throw exportError('input');
  }
  for (const collection of COLLECTIONS) {
    if (!Array.isArray(input[collection])) throw exportError('input');
  }
}

function assertReferences(recordSet) {
  const repositories = new Map(
    recordSet.repositories.map((entry) => [entry.repositoryNodeId, entry])
  );
  const issues = new Map(recordSet.issues.map((entry) => [entry.issueNodeId, entry]));
  const recordsByComment = new Map(recordSet.records.map((entry) => [entry.commentNodeId, entry]));
  for (const issue of recordSet.issues) {
    if (!repositories.has(issue.repositoryNodeId)) throw exportError('repository-reference');
  }
  for (const collection of ['directories', 'contracts', 'projections']) {
    for (const entry of recordSet[collection]) {
      if (!issues.has(entry.issueNodeId)) throw exportError('issue-reference');
    }
  }
  for (const directoryEntry of recordSet.directories) {
    for (const commentNodeId of Object.values(directoryEntry.directory.singletons)) {
      if (!recordsByComment.has(commentNodeId)) throw exportError('directory-reference');
    }
  }
  for (const contract of recordSet.contracts) {
    const record = recordsByComment.get(contract.commentNodeId);
    if (
      record?.envelope.payloadHash !== contract.payloadHash ||
      !isDeepStrictEqual(record.envelope.payload, contract.contract)
    ) {
      throw exportError('contract-reference');
    }
  }
  for (const projection of recordSet.projections) {
    const record = recordsByComment.get(projection.commentNodeId);
    if (
      record?.envelope.payloadHash !== projection.payloadHash ||
      !isDeepStrictEqual(record.envelope.payload, projection.projection)
    ) {
      throw exportError('projection-reference');
    }
  }
  const recordIds = new Map();
  for (const record of recordSet.records) {
    const prior = recordIds.get(record.envelope.recordId);
    if (prior !== undefined && prior !== record.commentNodeId) throw exportError('record-id');
    recordIds.set(record.envelope.recordId, record.commentNodeId);
    const issue = [...issues.values()].find(
      (candidate) =>
        candidate.number === record.envelope.issue &&
        repositories.get(candidate.repositoryNodeId)?.nameWithOwner === record.envelope.repository
    );
    if (issue === undefined) throw exportError('record-reference');
  }
  for (const contract of recordSet.contracts) {
    if (contract.contract.acceptedRecordIds.some((recordId) => !recordIds.has(recordId))) {
      throw exportError('accepted-record-reference');
    }
  }
  for (const projection of recordSet.projections) {
    const accepted = projection.projection.acceptedRecords;
    if (Array.isArray(accepted) && accepted.some(({ recordId }) => !recordIds.has(recordId))) {
      throw exportError('accepted-record-reference');
    }
  }
  for (const cursor of recordSet.cursorHints) {
    if (!repositories.has(cursor.repositoryNodeId)) throw exportError('cursor-reference');
  }
}

export function exportInsightsRecordSet(input = {}) {
  validateInput(input);
  const validatedRecords = validateRecordIdentities(input.records);
  const result = {
    schema: EXPORT_SCHEMA,
    repositories: deduplicate(input.repositories, {
      key: (entry) => entry.repositoryNodeId,
      updatedAt: (entry) => entry.updatedAt,
      validate: validateRepository,
    }),
    issues: deduplicate(input.issues, {
      key: (entry) => entry.issueNodeId,
      updatedAt: (entry) => entry.updatedAt,
      validate: validateIssue,
    }),
    directories: deduplicate(input.directories, {
      key: (entry) => entry.issueNodeId,
      updatedAt: (entry) => entry.updatedAt,
      validate: validateDirectory,
    }),
    contracts: deduplicate(input.contracts, {
      key: (entry) => entry.issueNodeId,
      updatedAt: (entry) => entry.updatedAt,
      validate: validateContract,
    }),
    records: deduplicate(validatedRecords, {
      key: (entry) => entry.commentNodeId,
      updatedAt: (entry) => entry.updatedAt,
      validate: (entry) => entry,
    }),
    projections: deduplicate(input.projections, {
      key: (entry) => `${entry.issueNodeId}:${entry.kind}`,
      updatedAt: (entry) => entry.updatedAt,
      validate: validateProjection,
    }),
    cursorHints: deduplicate(input.cursorHints, {
      key: (entry) => entry.repositoryNodeId,
      updatedAt: (entry) =>
        entry.issuesUpdatedAt > entry.commentsUpdatedAt
          ? entry.issuesUpdatedAt
          : entry.commentsUpdatedAt,
      validate: validateCursor,
    }),
  };
  assertReferences(result);
  return deepFreeze(result);
}

export function mergeInsightsRecordSets(...recordSets) {
  if (recordSets.length === 0) throw exportError('input');
  const merged = Object.fromEntries(COLLECTIONS.map((collection) => [collection, []]));
  for (const recordSet of recordSets) {
    if (recordSet?.schema !== undefined && recordSet.schema !== EXPORT_SCHEMA) {
      throw exportError('schema');
    }
    validateInput(recordSet);
    for (const collection of COLLECTIONS) {
      merged[collection].push(...recordSet[collection]);
    }
  }
  return exportInsightsRecordSet(merged);
}
