// @story #1734

import { canonicalRecordJson } from '../github-records/canonical-json.mjs';
import { hashRecordPayload } from '../github-records/record-envelope.mjs';
import { assertNoCredentialValues } from '../github-records/record-secret-policy.mjs';
import { COST_RECORD_TYPES, validateCostPayload } from './schema.mjs';

const RECORD_SCHEMA = 'aitm.record/v1';
const ROOT_KEYS = [
  'authority',
  'createdAt',
  'issue',
  'payload',
  'payloadHash',
  'predecessor',
  'recordId',
  'recordType',
  'repository',
  'schema',
  'supersedes',
];
const AUTHORITY_KEYS = ['actor', 'epoch', 'grantId'];
const COST_MARKER = '<!-- aitm-cost-record\n';
const COST_MARKER_RE = /<!-- aitm-cost-record\n/g;
const GENERIC_MARKER_RE = /<!--\s*aitm-record(?=\s)/g;
const MAX_RECORD_JSON_BYTES = 256 * 1024;
const DEFAULT_MAX_COMMENT_BODY_BYTES = 60_000;
const MAX_COMMENT_BODY_BYTES = 60_000;
const HASH_RE = /^sha256:[0-9a-f]{64}$/;
const ULID_RE = /^[0-7][0-9A-HJKMNP-TV-Z]{25}$/;
const REPOSITORY_RE = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;

function costError(category) {
  return new TypeError(`cost:${category}`);
}

function hasExactlyKeys(value, expectedKeys) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const keys = Object.keys(value).sort();
  return (
    keys.length === expectedKeys.length && keys.every((key, index) => key === expectedKeys[index])
  );
}

function isRecordId(value) {
  return typeof value === 'string' && ULID_RE.test(value);
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

function isCanonicalInstant(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)) {
    return false;
  }
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) && new Date(timestamp).toISOString() === value;
}

function assertLink(value, category) {
  if (value !== null && !isRecordId(value)) throw costError(category);
}

function assertBounded(value, maximumBytes, category) {
  if (Buffer.byteLength(value, 'utf8') > maximumBytes) throw costError(category);
}

function normalizeBodyBudget(maxBodyBytes) {
  if (!Number.isSafeInteger(maxBodyBytes) || maxBodyBytes <= 0) throw costError('body-budget');
  return Math.min(maxBodyBytes, MAX_COMMENT_BODY_BYTES);
}

function deepFreeze(value) {
  if (value === null || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

function canonicalCommentRecordJson(envelope) {
  return canonicalRecordJson(envelope).replaceAll('--', '-\\u002d');
}

function validateAuthority(authority) {
  if (!hasExactlyKeys(authority, AUTHORITY_KEYS)) throw costError('authority-keys');
  if (!isRecordId(authority.grantId)) throw costError('authority-grant-id');
  if (!Number.isInteger(authority.epoch) || authority.epoch <= 0)
    throw costError('authority-epoch');
  if (!isOpaqueId(authority.actor)) throw costError('authority-actor');
}

function validateCostEnvelope(envelope) {
  canonicalRecordJson(envelope);
  if (envelope === null || typeof envelope !== 'object' || Array.isArray(envelope)) {
    throw costError('keys');
  }
  if (envelope.schema !== RECORD_SCHEMA) throw costError('unsupported-schema');
  if (!hasExactlyKeys(envelope, ROOT_KEYS)) throw costError('keys');
  if (!isRecordId(envelope.recordId)) throw costError('record-id');
  if (!COST_RECORD_TYPES.includes(envelope.recordType)) throw costError('record-type');
  if (typeof envelope.repository !== 'string' || !REPOSITORY_RE.test(envelope.repository)) {
    throw costError('repository');
  }
  if (!Number.isInteger(envelope.issue) || envelope.issue <= 0) throw costError('issue');
  if (!isCanonicalInstant(envelope.createdAt)) throw costError('created-at');
  validateAuthority(envelope.authority);
  assertLink(envelope.predecessor, 'predecessor');
  assertLink(envelope.supersedes, 'supersedes');
  if (
    envelope.authority.grantId === envelope.recordId ||
    envelope.predecessor === envelope.recordId ||
    envelope.supersedes === envelope.recordId
  ) {
    throw costError('self-link');
  }
  if (typeof envelope.payloadHash !== 'string' || !HASH_RE.test(envelope.payloadHash)) {
    throw costError('payload-hash');
  }
  validateCostPayload(envelope.recordType, envelope.payload);
  assertNoCredentialValues(envelope);
  if (envelope.payloadHash !== hashRecordPayload(envelope.payload))
    throw costError('hash-mismatch');
  return envelope;
}

function extractCostRecordJson(body) {
  assertBounded(body, MAX_COMMENT_BODY_BYTES, 'record-size');
  const markers = [...body.matchAll(COST_MARKER_RE)];
  if (markers.length === 0)
    throw costError(body.includes('aitm-cost-record') ? 'malformed' : 'missing');
  if (markers.length !== 1) throw costError('duplicate');
  const marker = markers[0];
  if (marker.index !== 0) throw costError('malformed');
  const payloadStart = marker.index + COST_MARKER.length;
  const payloadEnd = body.indexOf('\n-->', payloadStart);
  if (payloadEnd === -1) throw costError('malformed');
  const recordJson = body.slice(payloadStart, payloadEnd);
  assertBounded(recordJson, MAX_RECORD_JSON_BYTES, 'record-size');
  return { recordJson, visibleMarkdown: body.slice(payloadEnd + '\n-->'.length + 1) };
}

export function renderCostRecord({
  envelope,
  visibleMarkdown = '',
  maxBodyBytes = DEFAULT_MAX_COMMENT_BODY_BYTES,
} = {}) {
  const bodyBudget = normalizeBodyBudget(maxBodyBytes);
  if (typeof visibleMarkdown !== 'string') throw costError('visible-markdown');
  if ([...visibleMarkdown.matchAll(GENERIC_MARKER_RE)].length > 0)
    throw costError('generic-marker');
  if ([...visibleMarkdown.matchAll(COST_MARKER_RE)].length > 0) throw costError('duplicate');
  validateCostEnvelope(envelope);
  assertNoCredentialValues(visibleMarkdown);
  const recordJson = canonicalCommentRecordJson(envelope);
  assertBounded(recordJson, MAX_RECORD_JSON_BYTES, 'record-size');
  const body = `${COST_MARKER}${recordJson}\n-->\n${visibleMarkdown}`;
  assertBounded(body, bodyBudget, 'record-size');
  return body;
}

export function parseCostRecord({ commentNodeId, body, expectedRepository, expectedIssue } = {}) {
  if (!isOpaqueId(commentNodeId)) throw costError('comment-node-id');
  if (typeof body !== 'string') throw costError('body');
  if (typeof expectedRepository !== 'string') throw costError('expected-repository');
  if (!Number.isInteger(expectedIssue) || expectedIssue <= 0) throw costError('expected-issue');
  if ([...body.matchAll(GENERIC_MARKER_RE)].length > 0) throw costError('generic-marker');

  const { recordJson, visibleMarkdown } = extractCostRecordJson(body);
  let envelope;
  try {
    envelope = JSON.parse(recordJson);
  } catch {
    throw costError('malformed');
  }
  if (canonicalCommentRecordJson(envelope) !== recordJson) throw costError('noncanonical');
  validateCostEnvelope(envelope);
  assertNoCredentialValues(visibleMarkdown);
  if (envelope.repository !== expectedRepository) throw costError('repository-mismatch');
  if (envelope.issue !== expectedIssue) throw costError('issue-mismatch');

  return deepFreeze({ commentNodeId, envelope, visibleMarkdown });
}
