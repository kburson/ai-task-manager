// @story #1497
import {
  canonical,
  hash,
  exact,
  fail,
  textValue,
  uuidValue,
  repository,
  digestValue,
  frozen,
} from './value.mjs';
import { validatePayload, validateInstant } from './record-schema.mjs';
export { hash as evidenceDigest } from './value.mjs';
const envelopeKeys = [
  'schema',
  'recordId',
  'recordType',
  'repositoryId',
  'issueNumber',
  'cycleId',
  'operationId',
  'predecessorId',
  'actor',
  'recordedAt',
  'payload',
];
export function recordDigest(record) {
  const { recordId: _id, ...material } = record;
  return hash(material);
}
export function validateRecord(record) {
  exact(record, envelopeKeys);
  if (record.schema !== 'aitm.evidence-record/v2') fail('record-schema');
  repository(record.repositoryId);
  if (!Number.isSafeInteger(record.issueNumber) || record.issueNumber <= 0) fail('issue');
  uuidValue(record.cycleId, 'cycle');
  uuidValue(record.operationId, 'operation');
  if (record.predecessorId !== null) digestValue(record.predecessorId, 'predecessor');
  exact(record.actor, ['id', 'kind'], 'actor-keys');
  textValue(record.actor.id, 'actor');
  if (!['user', 'runner'].includes(record.actor.kind)) fail('actor-kind');
  validateInstant(record.recordedAt);
  validatePayload(record.recordType, record.payload);
  if (record.recordId !== recordDigest(record)) fail('record-digest');
  return frozen(structuredClone(record));
}
export function createRecord(envelopeWithoutId) {
  exact(
    envelopeWithoutId,
    envelopeKeys.filter((k) => k !== 'recordId')
  );
  return validateRecord({ ...envelopeWithoutId, recordId: recordDigest(envelopeWithoutId) });
}
export function encodeRecord(record) {
  const body = `<!-- aitm-evidence-record data="${Buffer.from(canonical(validateRecord(record))).toString('base64url')}" -->`;
  if (Buffer.byteLength(body) > 60000) fail('record-budget');
  return body;
}
export function decodeRecord(comment, context = {}) {
  const body = typeof comment === 'string' ? comment : comment?.body;
  const match = /^<!-- aitm-evidence-record data="([A-Za-z0-9_-]+)" -->$/.exec(body || '');
  if (!match) fail('record-marker');
  let value;
  try {
    value = JSON.parse(Buffer.from(match[1], 'base64url').toString('utf8'));
  } catch {
    fail('record-json');
  }
  const record = validateRecord(value);
  if (encodeRecord(record) !== body) fail('record-noncanonical');
  if (context.repositoryId && canonical(record.repositoryId) !== canonical(context.repositoryId))
    fail('repository-mismatch');
  if (context.issueNumber && record.issueNumber !== context.issueNumber) fail('issue-mismatch');
  if (context.cycleId && record.cycleId !== context.cycleId) fail('cycle-mismatch');
  return record;
}
