import { createHash } from 'node:crypto';

import { canonicalRecordJson } from './github-records/canonical-json.mjs';
import { createRecordId } from './github-records/record-envelope.mjs';
import { MAX_DELIVERY_COMMIT_MESSAGE_BYTES } from './delivery-attribution.mjs';

const INTENT_SCHEMA = 'aitm.delivery-intent/v1';
const RECEIPT_SCHEMA = 'aitm.delivery-receipt/v1';
const INTENT_MARKER = 'aitm-delivery-intent';
const RECEIPT_MARKER = 'aitm-delivery-receipt';
const HIDDEN_MARKER_RE = /^<!--\s*aitm-delivery-(?:intent|receipt)(?=\s)/gm;
const MISPLACED_MARKER_RE = /<!--\s*aitm-delivery-(?:intent|receipt)(?=\s)/;
const SHA_RE = /^[0-9a-f]{40}$/;
const HASH_RE = /^[0-9a-f]{64}$/;
const ULID_RE = /^[0-7][0-9A-HJKMNP-TV-Z]{25}$/;
const REPOSITORY_RE = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;
const ATTRIBUTION_TOKEN_RE = /^#[1-9][0-9]*$/;
const MERGE_METHODS = ['merge', 'squash', 'rebase'];
const MAX_COMMENT_BODY_BYTES = 1024 * 1024;
const MAX_RECORD_JSON_BYTES = 256 * 1024;
const MAX_FIELD_BYTES = 1024;
const MAX_TITLE_BYTES = 256;
const MAX_RECORDS = 4096;
const MAX_ATTRIBUTION_TOKENS = 256;

/** Maximum UTF-8 bytes retained for the durable `owner/repository` identity. */
export const MAX_DELIVERY_REPOSITORY_BYTES = 256;

const INTENT_KEYS = [
  'attributionTokens',
  'baseRef',
  'clientCreatedAt',
  'commitMessage',
  'commitMessageSha256',
  'commitTitle',
  'commitTitleSha256',
  'expectedHeadSha',
  'headRef',
  'intentId',
  'issueNumber',
  'mergeMethod',
  'prNumber',
  'provider',
  'repository',
  'schema',
  'sessionId',
  'state',
  'supersedesIntentId',
];
const INTENT_INPUT_KEYS = INTENT_KEYS.filter(
  (key) => !['schema', 'state', 'commitTitleSha256', 'commitMessageSha256'].includes(key)
);
const RECEIPT_KEYS = [
  'baseRef',
  'expectedHeadSha',
  'intentId',
  'issueNumber',
  'mergeCommitSha',
  'mergeMethod',
  'prNumber',
  'provider',
  'result',
  'schema',
  'sessionId',
  'verifiedAt',
  'verifiedTrunkRef',
];
const RECEIPT_INPUT_KEYS = RECEIPT_KEYS.filter((key) => !['schema', 'result'].includes(key));
const PARSED_RECORD_KEYS = ['createdAt', 'id', 'record'];
const CONTEXT_KEYS = ['issueNumber', 'prNumber', 'repository'];
const AUTHORIZED_INTENT_KEYS = [
  'attributionTokens',
  'baseRef',
  'commitMessage',
  'commitMessageSha256',
  'commitTitle',
  'commitTitleSha256',
  'headRef',
  'mergeMethod',
];

function deliveryError(category) {
  return new TypeError(`delivery-records:${category}`);
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

function hasExactlyKeys(value, expectedKeys) {
  if (!isPlainDataObject(value)) return false;
  const actual = Object.keys(value).sort();
  const expected = [...expectedKeys].sort();
  return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
}

function deepFreeze(value) {
  if (value === null || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function isCanonicalInstant(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)) {
    return false;
  }
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) && new Date(timestamp).toISOString() === value;
}

function hasForbiddenControl(value, { allowLineFeed = false } = {}) {
  return [...value].some((character) => {
    const code = character.charCodeAt(0);
    return (code <= 0x1f && !(allowLineFeed && code === 0x0a)) || code === 0x7f;
  });
}

function assertBoundedString(value, maximumBytes, category, options = {}) {
  if (
    typeof value !== 'string' ||
    value.length === 0 ||
    value !== value.trim() ||
    !value.isWellFormed() ||
    hasForbiddenControl(value, options) ||
    Buffer.byteLength(value, 'utf8') > maximumBytes
  ) {
    throw deliveryError(category);
  }
  return value;
}

function assertPositiveInteger(value, category) {
  if (!Number.isSafeInteger(value) || value <= 0) throw deliveryError(category);
}

function assertRecordId(value, category) {
  if (typeof value !== 'string' || !ULID_RE.test(value)) throw deliveryError(category);
}

function assertSha(value, category) {
  if (typeof value !== 'string' || !SHA_RE.test(value)) throw deliveryError(category);
}

function assertHash(value, category) {
  if (typeof value !== 'string' || !HASH_RE.test(value)) throw deliveryError(category);
}

function assertRepository(value) {
  if (
    typeof value !== 'string' ||
    Buffer.byteLength(value, 'utf8') > MAX_DELIVERY_REPOSITORY_BYTES ||
    !REPOSITORY_RE.test(value)
  ) {
    throw deliveryError('repository');
  }
}

function assertRef(value, category) {
  assertBoundedString(value, MAX_FIELD_BYTES, category);
  if (
    value.startsWith('/') ||
    value.endsWith('/') ||
    value.includes('//') ||
    value.includes('..') ||
    /[~^:?*[\\\s]/.test(value)
  ) {
    throw deliveryError(category);
  }
}

function assertAttributionTokens(tokens, issueNumber) {
  if (
    !Array.isArray(tokens) ||
    tokens.length === 0 ||
    tokens.length > MAX_ATTRIBUTION_TOKENS ||
    tokens.some((token) => typeof token !== 'string' || !ATTRIBUTION_TOKEN_RE.test(token)) ||
    new Set(tokens).size !== tokens.length
  ) {
    throw deliveryError('attribution-tokens');
  }
  const sorted = [...tokens].sort();
  if (tokens.some((token, index) => token !== sorted[index])) {
    throw deliveryError('attribution-tokens');
  }
  if (!tokens.includes(`#${issueNumber}`)) throw deliveryError('issue-attribution');
}

function validateIntent(intent) {
  if (!MERGE_METHODS.includes(intent?.mergeMethod)) throw deliveryError('merge-method');
  canonicalRecordJson(intent);
  if (!hasExactlyKeys(intent, INTENT_KEYS)) throw deliveryError('intent-keys');
  if (intent.schema !== INTENT_SCHEMA) throw deliveryError('intent-schema');
  if (intent.state !== 'pending') throw deliveryError('intent-state');
  assertRecordId(intent.intentId, 'intent-id');
  if (intent.supersedesIntentId !== null) {
    assertRecordId(intent.supersedesIntentId, 'supersedes-intent-id');
    if (intent.supersedesIntentId === intent.intentId) throw deliveryError('self-supersession');
  }
  assertPositiveInteger(intent.issueNumber, 'issue-number');
  assertRepository(intent.repository);
  assertPositiveInteger(intent.prNumber, 'pr-number');
  assertRef(intent.baseRef, 'base-ref');
  assertRef(intent.headRef, 'head-ref');
  assertSha(intent.expectedHeadSha, 'expected-head-sha');
  assertAttributionTokens(intent.attributionTokens, intent.issueNumber);
  assertBoundedString(intent.commitTitle, MAX_TITLE_BYTES, 'commit-title');
  assertBoundedString(intent.commitMessage, MAX_DELIVERY_COMMIT_MESSAGE_BYTES, 'commit-message', {
    allowLineFeed: true,
  });
  assertHash(intent.commitTitleSha256, 'commit-title-hash');
  assertHash(intent.commitMessageSha256, 'commit-message-hash');
  if (
    sha256(intent.commitTitle) !== intent.commitTitleSha256 ||
    sha256(intent.commitMessage) !== intent.commitMessageSha256
  ) {
    throw deliveryError('commit-hash-mismatch');
  }
  if (intent.provider !== 'external') {
    if (!intent.commitTitle.startsWith(`[#${intent.issueNumber}]`)) {
      throw deliveryError('commit-title-attribution');
    }
    if (
      !intent.commitMessage.includes(`PR #${intent.prNumber}`) ||
      !intent.commitMessage.includes(intent.expectedHeadSha) ||
      intent.attributionTokens.some((token) => !intent.commitMessage.includes(`[${token}]`))
    ) {
      throw deliveryError('commit-message-correlation');
    }
  }
  assertBoundedString(intent.provider, MAX_FIELD_BYTES, 'provider');
  assertBoundedString(intent.sessionId, MAX_FIELD_BYTES, 'session-id');
  if (!isCanonicalInstant(intent.clientCreatedAt)) throw deliveryError('client-created-at');
  return intent;
}

function validateReceipt(receipt) {
  if (!MERGE_METHODS.includes(receipt?.mergeMethod)) throw deliveryError('merge-method');
  canonicalRecordJson(receipt);
  if (!hasExactlyKeys(receipt, RECEIPT_KEYS)) throw deliveryError('receipt-keys');
  if (receipt.schema !== RECEIPT_SCHEMA) throw deliveryError('receipt-schema');
  if (receipt.result !== 'delivered') throw deliveryError('receipt-result');
  assertRecordId(receipt.intentId, 'intent-id');
  assertPositiveInteger(receipt.issueNumber, 'issue-number');
  assertPositiveInteger(receipt.prNumber, 'pr-number');
  assertSha(receipt.expectedHeadSha, 'expected-head-sha');
  assertSha(receipt.mergeCommitSha, 'merge-commit-sha');
  assertRef(receipt.baseRef, 'base-ref');
  if (receipt.verifiedTrunkRef !== `origin/${receipt.baseRef}`) {
    throw deliveryError('verified-trunk-ref');
  }
  assertBoundedString(receipt.provider, MAX_FIELD_BYTES, 'provider');
  assertBoundedString(receipt.sessionId, MAX_FIELD_BYTES, 'session-id');
  if (!isCanonicalInstant(receipt.verifiedAt)) throw deliveryError('verified-at');
  return receipt;
}

export function buildDeliveryIntent(input = {}) {
  const acceptedKeys =
    input.intentId === undefined
      ? INTENT_INPUT_KEYS.filter((key) => key !== 'intentId')
      : INTENT_INPUT_KEYS;
  if (!hasExactlyKeys(input, acceptedKeys)) throw deliveryError('intent-input-keys');
  const intent = {
    schema: INTENT_SCHEMA,
    state: 'pending',
    intentId: input.intentId ?? createRecordId(),
    supersedesIntentId: input.supersedesIntentId,
    issueNumber: input.issueNumber,
    repository: input.repository,
    prNumber: input.prNumber,
    baseRef: input.baseRef,
    headRef: input.headRef,
    expectedHeadSha: input.expectedHeadSha,
    mergeMethod: input.mergeMethod,
    attributionTokens: Array.isArray(input.attributionTokens)
      ? [...input.attributionTokens]
      : input.attributionTokens,
    commitTitle: input.commitTitle,
    commitMessage: input.commitMessage,
    commitTitleSha256: typeof input.commitTitle === 'string' ? sha256(input.commitTitle) : '',
    commitMessageSha256: typeof input.commitMessage === 'string' ? sha256(input.commitMessage) : '',
    provider: input.provider,
    sessionId: input.sessionId,
    clientCreatedAt: input.clientCreatedAt,
  };
  validateIntent(intent);
  return deepFreeze(intent);
}

export function buildDeliveryReceipt(input = {}) {
  if (!hasExactlyKeys(input, RECEIPT_INPUT_KEYS)) throw deliveryError('receipt-input-keys');
  const receipt = {
    schema: RECEIPT_SCHEMA,
    intentId: input.intentId,
    issueNumber: input.issueNumber,
    prNumber: input.prNumber,
    expectedHeadSha: input.expectedHeadSha,
    mergeCommitSha: input.mergeCommitSha,
    baseRef: input.baseRef,
    mergeMethod: input.mergeMethod,
    verifiedTrunkRef: input.verifiedTrunkRef,
    provider: input.provider,
    sessionId: input.sessionId,
    verifiedAt: input.verifiedAt,
    result: 'delivered',
  };
  validateReceipt(receipt);
  return deepFreeze(receipt);
}

function canonicalCommentJson(record) {
  return canonicalRecordJson(record).replaceAll('--', '-\\u002d');
}

function renderComment(marker, record, visibleMarkdown) {
  const recordJson = canonicalCommentJson(record);
  if (Buffer.byteLength(recordJson, 'utf8') > MAX_RECORD_JSON_BYTES) {
    throw deliveryError('record-too-large');
  }
  const body = `<!-- ${marker} ${recordJson} -->\n${visibleMarkdown}`;
  if (Buffer.byteLength(body, 'utf8') > MAX_COMMENT_BODY_BYTES) {
    throw deliveryError('comment-too-large');
  }
  return body;
}

export function renderDeliveryIntentComment(intent) {
  validateIntent(intent);
  return renderComment(
    INTENT_MARKER,
    intent,
    `Delivery pending for PR #${intent.prNumber} at \`${intent.expectedHeadSha}\`.`
  );
}

export function renderDeliveryReceiptComment(receipt) {
  validateReceipt(receipt);
  return renderComment(
    RECEIPT_MARKER,
    receipt,
    `Delivery verified for PR #${receipt.prNumber} as \`${receipt.mergeCommitSha}\` on \`${receipt.verifiedTrunkRef}\`.`
  );
}

function validateContext(context) {
  if (!hasExactlyKeys(context, CONTEXT_KEYS)) throw deliveryError('context');
  assertRepository(context.repository);
  assertPositiveInteger(context.issueNumber, 'context-issue-number');
  assertPositiveInteger(context.prNumber, 'context-pr-number');
}

function parseMarker(body) {
  if (typeof body !== 'string') throw deliveryError('comment-body');
  if (Buffer.byteLength(body, 'utf8') > MAX_COMMENT_BODY_BYTES) {
    throw deliveryError('comment-too-large');
  }
  const hiddenMarkers = [...body.matchAll(HIDDEN_MARKER_RE)];
  if (hiddenMarkers.length === 0) {
    if (MISPLACED_MARKER_RE.test(body)) throw deliveryError('malformed-marker');
    return null;
  }
  if (hiddenMarkers.length !== 1 || hiddenMarkers[0].index !== 0) {
    throw deliveryError('malformed-marker');
  }
  const match = body.match(/^<!-- (aitm-delivery-(intent|receipt)) ([^\r\n]+) -->/);
  if (match === null) throw deliveryError('malformed-marker');
  if (MISPLACED_MARKER_RE.test(body.slice(match[0].length))) {
    throw deliveryError('malformed-marker');
  }
  const recordJson = match[3];
  if (Buffer.byteLength(recordJson, 'utf8') > MAX_RECORD_JSON_BYTES) {
    throw deliveryError('record-too-large');
  }
  let record;
  try {
    record = JSON.parse(recordJson);
  } catch {
    throw deliveryError('malformed-marker');
  }
  if (canonicalCommentJson(record) !== recordJson) throw deliveryError('noncanonical-record');
  return { kind: match[2], record };
}

function parseDeliveryCommentWithPrPolicy(comment, context, { allowHistoricalPr }) {
  if (!isPlainDataObject(comment)) throw deliveryError('comment');
  assertBoundedString(comment.id, MAX_FIELD_BYTES, 'comment-id');
  if (!isCanonicalInstant(comment.createdAt)) throw deliveryError('comment-created-at');
  if (!hasExactlyKeys(comment, ['body', 'createdAt', 'id'])) throw deliveryError('comment-keys');
  validateContext(context);
  const parsed = parseMarker(comment.body);
  if (parsed === null) return null;
  if (parsed.kind === 'intent') validateIntent(parsed.record);
  else validateReceipt(parsed.record);
  if (
    parsed.record.issueNumber !== context.issueNumber ||
    (parsed.kind === 'intent' && parsed.record.repository !== context.repository)
  ) {
    throw deliveryError('context-mismatch');
  }
  if (parsed.record.prNumber !== context.prNumber) {
    if (allowHistoricalPr) return null;
    throw deliveryError('context-mismatch');
  }
  return deepFreeze({ id: comment.id, createdAt: comment.createdAt, record: parsed.record });
}

export function parseDeliveryComment(comment, context) {
  return parseDeliveryCommentWithPrPolicy(comment, context, { allowHistoricalPr: false });
}

export function parseDeliveryCommentForPullRequest(comment, context) {
  return parseDeliveryCommentWithPrPolicy(comment, context, { allowHistoricalPr: true });
}

function validateParsedRecord(parsed) {
  if (!hasExactlyKeys(parsed, PARSED_RECORD_KEYS)) throw deliveryError('project-record');
  assertBoundedString(parsed.id, MAX_FIELD_BYTES, 'comment-id');
  if (!isCanonicalInstant(parsed.createdAt)) throw deliveryError('comment-created-at');
  if (parsed.record?.schema === INTENT_SCHEMA) return validateIntent(parsed.record);
  if (parsed.record?.schema === RECEIPT_SCHEMA) return validateReceipt(parsed.record);
  throw deliveryError('project-record');
}

function dedupeKey(intent) {
  return `${intent.repository}\u0000${intent.issueNumber}\u0000${intent.prNumber}\u0000${intent.expectedHeadSha}`;
}

function authorizedIntentBytes(intent) {
  return canonicalRecordJson(
    Object.fromEntries(AUTHORIZED_INTENT_KEYS.map((key) => [key, intent[key]]))
  );
}

function validateIntentGraph(intents) {
  const byId = new Map();
  const byDedupeKey = new Map();
  const successors = new Map();
  for (const parsed of intents) {
    const intent = parsed.record;
    if (byId.has(intent.intentId)) throw deliveryError('duplicate-intent-id');
    byId.set(intent.intentId, parsed);
    const key = dedupeKey(intent);
    const authorizedBytes = authorizedIntentBytes(intent);
    const existingBytes = byDedupeKey.get(key);
    if (existingBytes !== undefined && existingBytes !== authorizedBytes) {
      throw deliveryError('same-key-divergence');
    }
    byDedupeKey.set(key, authorizedBytes);
  }
  for (const parsed of intents) {
    const { intentId, supersedesIntentId } = parsed.record;
    if (supersedesIntentId === null) continue;
    if (!byId.has(supersedesIntentId)) throw deliveryError('missing-superseded-intent');
    const next = successors.get(supersedesIntentId) ?? [];
    next.push(intentId);
    if (next.length > 1) throw deliveryError('supersession-fork');
    successors.set(supersedesIntentId, next);
  }
  const visiting = new Set();
  const visited = new Set();
  const visit = (intentId) => {
    if (visiting.has(intentId)) throw deliveryError('supersession-cycle');
    if (visited.has(intentId)) return;
    visiting.add(intentId);
    const target = byId.get(intentId).record.supersedesIntentId;
    if (target !== null) visit(target);
    visiting.delete(intentId);
    visited.add(intentId);
  };
  for (const intentId of byId.keys()) visit(intentId);
  const referenced = new Set(successors.keys());
  const live = intents.filter(({ record }) => !referenced.has(record.intentId));
  if (live.length > 1) throw deliveryError('multiple-live-intents');
  let chronologicalLiveIntentId = null;
  for (const { record } of intents) {
    if (record.supersedesIntentId !== chronologicalLiveIntentId) {
      throw deliveryError('supersession-order');
    }
    chronologicalLiveIntentId = record.intentId;
  }
  return { byId, referenced, liveIntent: live[0] ?? null };
}

function validateReceipts(receipts, intentsById) {
  const byIntentId = new Map();
  for (const parsed of receipts) {
    const receipt = parsed.record;
    const intent = intentsById.get(receipt.intentId)?.record;
    if (intent === undefined) throw deliveryError('missing-receipt-intent');
    if (
      receipt.issueNumber !== intent.issueNumber ||
      receipt.prNumber !== intent.prNumber ||
      receipt.expectedHeadSha !== intent.expectedHeadSha ||
      receipt.baseRef !== intent.baseRef ||
      receipt.mergeMethod !== intent.mergeMethod
    ) {
      throw deliveryError('receipt-correlation');
    }
    const existing = byIntentId.get(receipt.intentId);
    if (existing !== undefined) {
      if (canonicalRecordJson(existing.record) === canonicalRecordJson(receipt)) {
        throw deliveryError('duplicate-receipt');
      }
      throw deliveryError('receipt-conflict');
    }
    byIntentId.set(receipt.intentId, parsed);
  }
  return byIntentId;
}

function validateReceiptOrder(records) {
  const seenIntentIds = new Set();
  for (const { record } of records) {
    if (record.schema === INTENT_SCHEMA) {
      seenIntentIds.add(record.intentId);
    } else if (!seenIntentIds.has(record.intentId)) {
      throw deliveryError('receipt-order');
    }
  }
}

export function projectDeliveryRecords(records) {
  if (!Array.isArray(records) || records.length > MAX_RECORDS) {
    throw deliveryError('project-input');
  }
  const commentIds = new Set();
  const copies = records.map((parsed) => {
    validateParsedRecord(parsed);
    if (commentIds.has(parsed.id)) throw deliveryError('duplicate-comment-id');
    commentIds.add(parsed.id);
    return deepFreeze(structuredClone(parsed));
  });
  const intents = copies.filter(({ record }) => record.schema === INTENT_SCHEMA);
  const receipts = copies.filter(({ record }) => record.schema === RECEIPT_SCHEMA);
  const graph = validateIntentGraph(intents);
  const receiptsByIntentId = validateReceipts(receipts, graph.byId);
  validateReceiptOrder(copies);
  const projectedIntents = intents.map((parsed) =>
    deepFreeze({
      ...parsed,
      effectiveState: graph.referenced.has(parsed.record.intentId) ? 'superseded' : 'pending',
    })
  );
  const liveIntent =
    graph.liveIntent === null
      ? null
      : projectedIntents.find(({ record }) => record.intentId === graph.liveIntent.record.intentId);
  const matchingReceipt =
    liveIntent === null ? null : (receiptsByIntentId.get(liveIntent.record.intentId) ?? null);
  return deepFreeze({
    intents: projectedIntents,
    receipts,
    liveIntent,
    matchingReceipt,
  });
}
