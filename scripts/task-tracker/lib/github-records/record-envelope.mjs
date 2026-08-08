// cspell:ignore HJKMNP ically ization ment noncanonical pousr tion
// cspell:ignore apikey apikeypolicy credentialpolicy fortunecookie passwordpolicy
// cspell:ignore priorauthorization sessioncookiepolicy tokencount
// cspell:ignore accesstoken authconfiguration authheader authmode authorizationheader authvalue basicauth
// cspell:ignore bearertoken bearervalue clientsecret ghpat githubpat githubtoken gitpat oauthtoken
// cspell:ignore refreshtoken secrettoken secretvalue tokenenv
// cspell:ignore authorizationdecision inputtokencount outputtokencount

import { createHash, randomBytes } from 'node:crypto';

import { canonicalRecordJson } from './canonical-json.mjs';
import { validateDeliveryContract } from './delivery-contract.mjs';
import { assertNoCredentialValues, assertNoSecretRecordData } from './record-secret-policy.mjs';
import {
  FORECAST_RECORD_TYPE,
  validateEstimationForecast,
} from '../estimation/forecast-record.mjs';
import { OUTCOME_RECORD_TYPE, validateEstimationOutcome } from '../estimation/outcome-record.mjs';
import { RUBRIC_RECORD_TYPE, validateEstimationRubric } from '../estimation/rubric-record.mjs';

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
const CROCKFORD32 = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
const DELIVERY_CONTRACT_SCHEMA = 'aitm.delivery-contract/v1';
const DELIVERY_CONTRACT_RECORD_TYPE = 'singleton-projection';
const DELIVERY_CONTRACT_SAFE_KEYS = Object.freeze([
  'authorityEpoch',
  'coordinatorGrantId',
  'verificationCommands',
]);

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

function validateEnvelope(envelope, { requireCurrentForecast = false } = {}) {
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
  const isDeliveryContract =
    ['singleton-projection', 'contract-sealed', 'contract-amended'].includes(envelope.recordType) &&
    envelope.payload?.schema === DELIVERY_CONTRACT_SCHEMA;
  if (isDeliveryContract) {
    assertNoSecretRecordData(envelope.payload, {
      safeKeyNames: DELIVERY_CONTRACT_SAFE_KEYS,
    });
    validateDeliveryContract(envelope.payload);
    if (
      envelope.payload.authorityEpoch !== envelope.authority.epoch ||
      envelope.payload.coordinatorGrantId !== envelope.authority.grantId ||
      (envelope.recordType === DELIVERY_CONTRACT_RECORD_TYPE &&
        envelope.payload.recordId !== envelope.recordId)
    ) {
      throw recordError('delivery-contract-authority');
    }
  } else {
    assertNoSecretRecordData(envelope.payload);
  }
  assertNoCredentialValues(envelope);
  if (envelope.recordType === FORECAST_RECORD_TYPE) {
    validateEstimationForecast(envelope.payload, {
      expectedIssue: envelope.issue,
      requireCurrentSchema: requireCurrentForecast,
    });
    if (envelope.payload.supersedesForecastRecordId !== envelope.supersedes) {
      throw recordError('supersedes-mismatch');
    }
  } else if (envelope.recordType === OUTCOME_RECORD_TYPE) {
    validateEstimationOutcome(envelope.payload, { expectedIssue: envelope.issue });
  } else if (envelope.recordType === RUBRIC_RECORD_TYPE) {
    validateEstimationRubric(envelope.payload);
  }
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

export { assertNoSecretRecordData } from './record-secret-policy.mjs';

function encodeBase32(value, length) {
  let remaining = value;
  let encoded = '';
  for (let index = 0; index < length; index += 1) {
    encoded = CROCKFORD32[Number(remaining & 31n)] + encoded;
    remaining >>= 5n;
  }
  if (remaining !== 0n) throw recordError('record-id');
  return encoded;
}

export function createRecordId({ nowMs = Date.now(), randomBytesFn = randomBytes } = {}) {
  if (
    !Number.isSafeInteger(nowMs) ||
    nowMs < 0 ||
    nowMs > 0xffffffffffff ||
    typeof randomBytesFn !== 'function'
  ) {
    throw recordError('record-id');
  }
  const entropy = randomBytesFn(10);
  if (!Buffer.isBuffer(entropy) || entropy.length !== 10) throw recordError('record-id');
  let random = 0n;
  for (const byte of entropy) random = (random << 8n) | BigInt(byte);
  return `${encodeBase32(BigInt(nowMs), 10)}${encodeBase32(random, 16)}`;
}

export function createAitmRecordEnvelope({
  recordType,
  repository,
  issue,
  payload,
  actor,
  epoch = 1,
  predecessor = null,
  supersedes = null,
  createdAt = new Date().toISOString(),
  recordId = createRecordId(),
  grantId = createRecordId(),
} = {}) {
  const envelope = {
    schema: RECORD_SCHEMA,
    recordId,
    recordType,
    repository,
    issue,
    createdAt,
    authority: { grantId, epoch, actor },
    predecessor,
    supersedes,
    payloadHash: hashRecordPayload(payload),
    payload,
  };
  validateEnvelope(envelope, { requireCurrentForecast: true });
  return deepFreeze(envelope);
}

function canonicalCommentRecordJson(envelope) {
  const recordJson = canonicalRecordJson(envelope);
  // HTML comments cannot safely carry a raw double hyphen. JSON's Unicode
  // escape is value-preserving, so command flags such as `--test` and complete
  // marker strings can remain exact after parsing without changing hashes.
  return recordJson.replaceAll('--', '-\\u002d');
}

/**
 * @param {{ envelope: object, visibleMarkdown?: string }} input
 * @returns {string}
 */
export function renderAitmRecord({ envelope, visibleMarkdown = '' } = {}) {
  if (typeof visibleMarkdown !== 'string') throw recordError('visible-markdown');
  if ([...visibleMarkdown.matchAll(MARKER_RE)].length > 0) throw recordError('unsafe-comment');
  validateEnvelope(envelope);
  assertNoCredentialValues(visibleMarkdown);
  const recordJson = canonicalCommentRecordJson(envelope);
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
  if (canonicalCommentRecordJson(envelope) !== recordJson) throw recordError('noncanonical');
  validateEnvelope(envelope);
  assertNoCredentialValues(visibleMarkdown);
  if (envelope.repository !== expectedRepository) throw recordError('repository-mismatch');
  if (envelope.issue !== expectedIssue) throw recordError('issue-mismatch');

  return deepFreeze({ commentNodeId, envelope });
}
