// @story #1439
// Canonical durable authorization for explicit no-commit issue kinds.

import { canonicalRecordJson } from './github-records/canonical-json.mjs';
import { createRecordId } from './github-records/record-envelope.mjs';
import { NO_COMMIT_KINDS } from './issue-kind.mjs';

const SCHEMA = 'aitm.no-commit-delivery/v1';
const MARKER = 'aitm-no-commit-delivery';
const SHA_RE = /^[0-9a-f]{40}$/;
const ULID_RE = /^[0-7][0-9A-HJKMNP-TV-Z]{25}$/;
const REPOSITORY_RE = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;
const RECORD_KEYS = [
  'acceptedSha',
  'deliverableUrl',
  'issueKind',
  'issueNumber',
  'provider',
  'recordId',
  'repository',
  'result',
  'schema',
  'sessionId',
  'verifiedAt',
];
const INPUT_KEYS = RECORD_KEYS.filter((key) => !['result', 'schema'].includes(key));

function fail(category) {
  throw new TypeError(`no-commit-delivery-record:${category}`);
}

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function hasExactlyKeys(value, keys) {
  if (!isObject(value)) return false;
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
}

function bounded(value, category, maximum = 1024) {
  const hasControl =
    typeof value === 'string' &&
    [...value].some((character) => {
      const code = character.charCodeAt(0);
      return code <= 0x1f || code === 0x7f;
    });
  if (
    typeof value !== 'string' ||
    value.length === 0 ||
    value !== value.trim() ||
    !value.isWellFormed() ||
    Buffer.byteLength(value, 'utf8') > maximum ||
    hasControl
  ) {
    fail(category);
  }
}

function canonicalInstant(value) {
  if (typeof value !== 'string') return false;
  const parsed = Date.parse(value);
  return (
    Number.isFinite(parsed) &&
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value) &&
    new Date(parsed).toISOString() === value
  );
}

function validate(record) {
  canonicalRecordJson(record);
  if (!hasExactlyKeys(record, RECORD_KEYS)) fail('keys');
  if (record.schema !== SCHEMA || record.result !== 'delivered') fail('schema');
  if (!ULID_RE.test(record.recordId || '')) fail('record-id');
  if (!Number.isSafeInteger(record.issueNumber) || record.issueNumber <= 0) fail('issue-number');
  if (!REPOSITORY_RE.test(record.repository || '')) fail('repository');
  if (!NO_COMMIT_KINDS.has(record.issueKind)) fail('issue-kind');
  try {
    const url = new URL(record.deliverableUrl);
    if (url.protocol !== 'https:' || url.href !== record.deliverableUrl) fail('deliverable-url');
  } catch {
    fail('deliverable-url');
  }
  if (!SHA_RE.test(record.acceptedSha || '')) fail('accepted-sha');
  bounded(record.provider, 'provider');
  bounded(record.sessionId, 'session-id');
  if (!canonicalInstant(record.verifiedAt)) fail('verified-at');
  return record;
}

export function buildNoCommitDeliveryRecord(input = {}) {
  const accepted =
    input.recordId === undefined ? INPUT_KEYS.filter((key) => key !== 'recordId') : INPUT_KEYS;
  if (!hasExactlyKeys(input, accepted)) fail('input-keys');
  const record = {
    schema: SCHEMA,
    recordId: input.recordId ?? createRecordId(),
    repository: input.repository,
    issueNumber: input.issueNumber,
    issueKind: input.issueKind,
    deliverableUrl: input.deliverableUrl,
    acceptedSha: input.acceptedSha,
    provider: input.provider,
    sessionId: input.sessionId,
    verifiedAt: input.verifiedAt,
    result: 'delivered',
  };
  validate(record);
  return Object.freeze(record);
}

export function renderNoCommitDeliveryComment(record) {
  validate(record);
  const json = canonicalRecordJson(record).replaceAll('--', '-\\u002d');
  return `<!-- ${MARKER} ${json} -->\nNo-commit delivery authorized from ${record.deliverableUrl} at \`${record.acceptedSha}\`.`;
}

export function parseNoCommitDeliveryComment(comment) {
  if (!isObject(comment) || !hasExactlyKeys(comment, ['body', 'createdAt', 'id'])) fail('comment');
  bounded(comment.id, 'comment-id');
  if (!canonicalInstant(comment.createdAt)) fail('comment-created-at');
  if (typeof comment.body !== 'string') fail('comment-body');
  if (!comment.body.includes(`<!-- ${MARKER} `)) return null;
  const match = comment.body.match(new RegExp(`^<!-- ${MARKER} ([^\\r\\n]+) -->`));
  if (!match || comment.body.slice(match[0].length).includes(`<!-- ${MARKER} `)) fail('marker');
  let record;
  try {
    record = JSON.parse(match[1]);
  } catch {
    fail('marker');
  }
  if (canonicalRecordJson(record).replaceAll('--', '-\\u002d') !== match[1]) fail('canonical');
  validate(record);
  return Object.freeze({ id: comment.id, createdAt: comment.createdAt, record });
}

export function projectNoCommitDeliveryRecords(records) {
  if (!Array.isArray(records)) fail('projection');
  const parsed = records.filter(Boolean);
  for (const item of parsed) {
    if (!isObject(item) || !isObject(item.record)) fail('projection');
    validate(item.record);
  }
  if (parsed.length > 1) {
    const bytes = new Set(parsed.map(({ record }) => canonicalRecordJson(record)));
    fail(bytes.size === 1 ? 'duplicate' : 'conflicting');
  }
  return Object.freeze({ records: Object.freeze([...parsed]), record: parsed[0] ?? null });
}

export function sameNoCommitDeliveryAuthority(left, right) {
  const keys = ['repository', 'issueNumber', 'issueKind', 'deliverableUrl', 'acceptedSha'];
  return keys.every((key) => left?.[key] === right?.[key]);
}
