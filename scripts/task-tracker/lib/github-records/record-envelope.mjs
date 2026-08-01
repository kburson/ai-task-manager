// cspell:ignore HJKMNP pousr noncanonical

import { createHash } from 'node:crypto';

import { canonicalRecordJson } from './canonical-json.mjs';

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
const MARKER_RE = /<!--\s*aitm-record(?=\s)/g;
const MAX_RECORD_JSON_BYTES = 256 * 1024;
const MAX_COMMENT_BODY_BYTES = 1024 * 1024;
const HASH_RE = /^sha256:[0-9a-f]{64}$/;
const ULID_RE = /^[0-7][0-9A-HJKMNP-TV-Z]{25}$/;
const RECORD_TYPE_RE = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;
const REPOSITORY_RE = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;
const SINGLE_SEGMENT_SECRET_KEYS = new Set([
  'authorization',
  'cookie',
  'cookies',
  'credential',
  'credentials',
  'password',
  'passwd',
  'secret',
  'token',
]);
const BEARER_RE = /\bbearer\s+([A-Za-z0-9._~+/=-]{8,})/i;
const GITHUB_TOKEN_RE = /\b(?:gh[pousr]_[A-Za-z0-9]{16,}|github_pat_[A-Za-z0-9_]{20,})\b/i;
const TOKEN_ENV_NAME_RE =
  /\b[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)*_(?:ACCESS_TOKEN|API_KEY|AUTH_TOKEN|CLIENT_SECRET|PRIVATE_KEY|TOKEN|PASSWORD|CREDENTIALS)\b/;
const PRIVATE_KEY_RE = /-----BEGIN(?: [A-Z0-9]+)* PRIVATE KEY-----/i;

function recordError(category) {
  return new TypeError(`record-envelope:${category}`);
}

function hasExactlyKeys(value, expectedKeys) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const keys = Object.keys(value).sort();
  return (
    keys.length === expectedKeys.length && keys.every((key, index) => key === expectedKeys[index])
  );
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

function isRecordId(value) {
  return typeof value === 'string' && ULID_RE.test(value);
}

function isCanonicalInstant(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)) {
    return false;
  }
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) && new Date(timestamp).toISOString() === value;
}

function secretKeySegments(key) {
  return key
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

function hasAdjacentSegments(segments, first, second) {
  return segments.some((segment, index) => segment === first && segments[index + 1] === second);
}

function isSecretTokenSegment(segments, index) {
  if (segments[index] !== 'token') return false;
  const before = segments[index - 1];
  const after = segments[index + 1];
  return (
    ['access', 'api', 'auth', 'github', 'gitlab', 'id', 'npm', 'refresh', 'session'].includes(
      before
    ) || ['backup', 'env', 'environment', 'secret', 'value'].includes(after)
  );
}

function isSecretKey(key) {
  const segments = secretKeySegments(key);
  if (segments.length === 1 && SINGLE_SEGMENT_SECRET_KEYS.has(segments[0])) return true;
  if (segments.some((segment) => ['credential', 'credentials', 'passwd'].includes(segment))) {
    return true;
  }
  if (
    segments.some((segment, index) => segment === 'password' && segments[index + 1] !== 'policy')
  ) {
    return true;
  }
  if (segments.some((segment, index) => isSecretTokenSegment(segments, index))) return true;
  if (hasAdjacentSegments(segments, 'api', 'key')) return true;
  if (hasAdjacentSegments(segments, 'client', 'secret')) return true;
  if (hasAdjacentSegments(segments, 'private', 'key')) return true;
  if (hasAdjacentSegments(segments, 'authorization', 'header')) return true;
  return segments.length === 2 && hasAdjacentSegments(segments, 'session', 'cookie');
}

function containsCredentialSignature(value) {
  const bearer = value.match(BEARER_RE)?.[1];
  return (
    bearer?.length >= 16 ||
    GITHUB_TOKEN_RE.test(value) ||
    TOKEN_ENV_NAME_RE.test(value) ||
    PRIVATE_KEY_RE.test(value)
  );
}

function assertNoSecrets(value) {
  if (typeof value === 'string') {
    if (containsCredentialSignature(value)) throw recordError('secret');
    return;
  }
  if (value === null || typeof value !== 'object') return;

  for (const key of Object.keys(value)) {
    if (isSecretKey(key)) throw recordError('secret');
    assertNoSecrets(value[key]);
  }
}

function assertLink(value, category) {
  if (value !== null && !isRecordId(value)) throw recordError(category);
}

function validateAuthority(authority) {
  if (!hasExactlyKeys(authority, AUTHORITY_KEYS)) throw recordError('authority-keys');
  if (!isRecordId(authority.grantId)) throw recordError('authority-grant-id');
  if (!Number.isInteger(authority.epoch) || authority.epoch <= 0) {
    throw recordError('authority-epoch');
  }
  if (!isOpaqueId(authority.actor)) throw recordError('authority-actor');
}

function validateEnvelope(envelope) {
  canonicalRecordJson(envelope);
  if (envelope === null || typeof envelope !== 'object' || Array.isArray(envelope)) {
    throw recordError('keys');
  }
  if (envelope.schema !== RECORD_SCHEMA) throw recordError('unsupported-schema');
  if (!hasExactlyKeys(envelope, ROOT_KEYS)) throw recordError('keys');
  if (!isRecordId(envelope.recordId)) throw recordError('record-id');
  if (typeof envelope.recordType !== 'string' || !RECORD_TYPE_RE.test(envelope.recordType)) {
    throw recordError('record-type');
  }
  if (typeof envelope.repository !== 'string' || !REPOSITORY_RE.test(envelope.repository)) {
    throw recordError('repository');
  }
  if (!Number.isInteger(envelope.issue) || envelope.issue <= 0) throw recordError('issue');
  if (!isCanonicalInstant(envelope.createdAt)) throw recordError('created-at');
  validateAuthority(envelope.authority);
  assertLink(envelope.predecessor, 'predecessor');
  assertLink(envelope.supersedes, 'supersedes');
  if (
    envelope.authority.grantId === envelope.recordId ||
    envelope.predecessor === envelope.recordId ||
    envelope.supersedes === envelope.recordId
  ) {
    throw recordError('self-link');
  }
  if (typeof envelope.payloadHash !== 'string' || !HASH_RE.test(envelope.payloadHash)) {
    throw recordError('payload-hash');
  }
  assertNoSecrets(envelope);
  if (envelope.payloadHash !== hashRecordPayload(envelope.payload)) {
    throw recordError('hash-mismatch');
  }
  return envelope;
}

function assertBounded(value, maximumBytes, category) {
  if (Buffer.byteLength(value, 'utf8') > maximumBytes) throw recordError(category);
}

function extractRecordJson(body) {
  assertBounded(body, MAX_COMMENT_BODY_BYTES, 'too-large');
  const markers = [...body.matchAll(MARKER_RE)];
  if (markers.length === 0) throw recordError('missing');
  if (markers.length !== 1) throw recordError('duplicate');

  const marker = markers[0];
  if (marker.index !== 0) throw recordError('malformed');
  const payloadStart = marker.index + marker[0].length;
  const payloadEnd = body.indexOf('-->', payloadStart);
  if (payloadEnd === -1) throw recordError('malformed');
  const rawRecordJson = body.slice(payloadStart, payloadEnd);
  assertBounded(rawRecordJson, MAX_RECORD_JSON_BYTES, 'too-large');
  const recordJson = rawRecordJson.trim();
  return { recordJson, visibleMarkdown: body.slice(payloadEnd + 3) };
}

function deepFreeze(value) {
  if (value === null || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

/** @param {unknown} payload */
export function hashRecordPayload(payload) {
  return `sha256:${createHash('sha256').update(canonicalRecordJson(payload)).digest('hex')}`;
}

/**
 * @param {{ envelope: object, visibleMarkdown?: string }} input
 * @returns {string}
 */
export function renderAitmRecord({ envelope, visibleMarkdown = '' } = {}) {
  if (typeof visibleMarkdown !== 'string') throw recordError('visible-markdown');
  if ([...visibleMarkdown.matchAll(MARKER_RE)].length > 0) throw recordError('unsafe-comment');
  validateEnvelope(envelope);
  assertNoSecrets(visibleMarkdown);
  const recordJson = canonicalRecordJson(envelope);
  if (recordJson.includes('--')) throw recordError('unsafe-comment');
  assertBounded(recordJson, MAX_RECORD_JSON_BYTES, 'too-large');
  const body = `<!-- aitm-record\n${recordJson}\n-->\n${visibleMarkdown}`;
  assertBounded(body, MAX_COMMENT_BODY_BYTES, 'too-large');
  return body;
}

/**
 * @param {{ commentNodeId: string, body: string, expectedRepository: string, expectedIssue: number }} input
 * @returns {{ commentNodeId: string, envelope: object }}
 */
export function parseAitmRecord({ commentNodeId, body, expectedRepository, expectedIssue } = {}) {
  if (!isOpaqueId(commentNodeId)) throw recordError('comment-node-id');
  if (typeof body !== 'string') throw recordError('body');
  if (typeof expectedRepository !== 'string') throw recordError('expected-repository');
  if (!Number.isInteger(expectedIssue) || expectedIssue <= 0) throw recordError('expected-issue');

  const { recordJson, visibleMarkdown } = extractRecordJson(body);
  let envelope;
  try {
    envelope = JSON.parse(recordJson);
  } catch {
    throw recordError('malformed');
  }
  if (canonicalRecordJson(envelope) !== recordJson) throw recordError('noncanonical');
  validateEnvelope(envelope);
  assertNoSecrets(visibleMarkdown);
  if (envelope.repository !== expectedRepository) throw recordError('repository-mismatch');
  if (envelope.issue !== expectedIssue) throw recordError('issue-mismatch');

  return deepFreeze({ commentNodeId, envelope });
}
