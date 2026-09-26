import { createHash } from 'node:crypto';

import { canonicalRecordJson } from './github-records/canonical-json.mjs';
import { createRecordId } from './github-records/record-envelope.mjs';
import { MAX_DELIVERY_COMMIT_MESSAGE_BYTES } from './delivery-attribution.mjs';
import {
  buildDeliveryAttributionProposal,
  renderDeliveryAttributionExceptionComment,
} from './delivery-attribution-exception-record.mjs';
import { validateWorkflowExceptionEnvelope } from './workflow-policy/exception-record.mjs';
import { validateDeliveryWaiverBurn } from './delivery-waiver-journal.mjs';

const INTENT_SCHEMA = 'aitm.delivery-intent/v1';
const INTENT_SCHEMA_V2 = 'aitm.delivery-intent/v2';
const INTENT_SCHEMA_V3 = 'aitm.delivery-intent/v3';
const RECEIPT_SCHEMA_V1 = 'aitm.delivery-receipt/v1';
const RECEIPT_SCHEMA_V2 = 'aitm.delivery-receipt/v2';
const RECEIPT_SCHEMA_V3 = 'aitm.delivery-receipt/v3';
const RECEIPT_SCHEMA_V4 = 'aitm.delivery-receipt/v4';
const RECEIPT_SCHEMA_V5 = 'aitm.delivery-receipt/v5';
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
const METADATA_WARNING_CODES = new Set([
  'missing-merge-attribution-trailer',
  'missing-source-attribution',
]);

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
const WAIVED_INTENT_KEYS = [
  'attributionDisposition',
  'exceptionRecordId',
  'operationId',
  'sourceDigest',
  'proposalDigest',
  'mappings',
];
const GENERIC_WAIVER_KEYS = [
  'deliveryDisposition',
  'waivedRequirementId',
  'waiverRecordId',
  'waiverRevision',
  'deliveryOperationId',
  'waiverReasonDigest',
  'waiverScopeDigest',
  'observedFailureCategory',
  'waiverGrant',
  'providerMergeMethod',
  'observedMergeMethod',
];
const INTENT_KEYS_V3 = [
  ...INTENT_KEYS,
  ...GENERIC_WAIVER_KEYS,
  'originalIntentId',
  'originalIntentCreatedAt',
  'originalIntentDigest',
];
const RECEIPT_KEYS_V1 = [
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
const RECEIPT_KEYS_V2 = [...RECEIPT_KEYS_V1, 'metadataWarnings'];
const WAIVED_RECEIPT_KEYS = ['attributionDisposition', 'exceptionRecordId', 'exceptionRecord'];
const RECEIPT_KEYS_V3 = [...RECEIPT_KEYS_V1, ...WAIVED_RECEIPT_KEYS];
const RECEIPT_KEYS_V4 = [
  ...RECEIPT_KEYS_V1,
  ...GENERIC_WAIVER_KEYS,
  'burn',
  'burnDigest',
  'burnOid',
  'authorityReference',
  'authorizingPrincipal',
  'recordingActor',
  'humanReason',
];
const RECEIPT_KEYS_V5 = [...RECEIPT_KEYS_V1, 'observedIntegration', 'sourceDigest'];
const RECEIPT_INPUT_KEYS_V1 = RECEIPT_KEYS_V1.filter((key) => !['schema', 'result'].includes(key));
const RECEIPT_INPUT_KEYS_V2 = [...RECEIPT_INPUT_KEYS_V1, 'metadataWarnings'];
const RECEIPT_INPUT_KEYS_V3 = [...RECEIPT_INPUT_KEYS_V1, ...WAIVED_RECEIPT_KEYS];
const RECEIPT_INPUT_KEYS_V4 = RECEIPT_KEYS_V4.filter((key) => !['schema', 'result'].includes(key));
const RECEIPT_INPUT_KEYS_V5 = RECEIPT_KEYS_V5.filter((key) => !['schema', 'result'].includes(key));
const PARSED_RECORD_KEYS = ['createdAt', 'id', 'record'];
const CONTEXT_KEYS = ['issueNumber', 'prNumber', 'repository'];
const AUTHORIZED_INTENT_KEYS = [
  'schema',
  'issueNumber',
  'repository',
  'prNumber',
  'expectedHeadSha',
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

function assertMetadataWarnings(warnings) {
  if (
    !Array.isArray(warnings) ||
    warnings.length === 0 ||
    warnings.some(
      (warning) => typeof warning !== 'string' || !METADATA_WARNING_CODES.has(warning)
    ) ||
    new Set(warnings).size !== warnings.length
  ) {
    throw deliveryError('metadata-warnings');
  }
  const sorted = [...warnings].sort();
  if (warnings.some((warning, index) => warning !== sorted[index])) {
    throw deliveryError('metadata-warnings');
  }
}

function assertWaivedIntent(intent) {
  if (intent.attributionDisposition !== 'waived') throw deliveryError('attribution-disposition');
  if (intent.provider === 'external') throw deliveryError('waived-provider');
  assertRecordId(intent.exceptionRecordId, 'exception-record-id');
  assertRecordId(intent.operationId, 'operation-id');
  if (!/^sha256:[0-9a-f]{64}$/.test(intent.sourceDigest)) throw deliveryError('source-digest');
  if (!/^sha256:[0-9a-f]{64}$/.test(intent.proposalDigest)) throw deliveryError('proposal-digest');
  if (!Array.isArray(intent.mappings) || intent.mappings.length === 0) {
    throw deliveryError('mappings');
  }
  const shas = new Set();
  for (const mapping of intent.mappings) {
    if (!hasExactlyKeys(mapping, ['oid', 'messageHeadline', 'issueNumber'])) {
      throw deliveryError('mapping');
    }
    assertSha(mapping.oid, 'mapping-sha');
    assertPositiveInteger(mapping.issueNumber, 'mapping-issue');
    if (
      typeof mapping.messageHeadline !== 'string' ||
      mapping.messageHeadline.length === 0 ||
      !mapping.messageHeadline.isWellFormed() ||
      /[\r\n]/.test(mapping.messageHeadline) ||
      shas.has(mapping.oid)
    )
      throw deliveryError('mapping');
    shas.add(mapping.oid);
  }
}

function assertGenericWaiver(record) {
  if (record.deliveryDisposition !== 'waived') throw deliveryError('delivery-disposition');
  assertRecordId(record.deliveryOperationId, 'delivery-operation-id');
  assertRecordId(record.waiverRecordId, 'waiver-record-id');
  assertPositiveInteger(record.waiverRevision, 'waiver-revision');
  for (const key of ['waiverReasonDigest', 'waiverScopeDigest']) {
    if (!/^sha256:[0-9a-f]{64}$/.test(record[key])) throw deliveryError(key);
  }
  assertBoundedString(record.observedFailureCategory, MAX_FIELD_BYTES, 'failure-category');
  if (record.providerMergeMethod !== null && !MERGE_METHODS.includes(record.providerMergeMethod)) {
    throw deliveryError('provider-merge-method');
  }
  if (!MERGE_METHODS.includes(record.observedMergeMethod))
    throw deliveryError('observed-merge-method');
  if (
    record.providerMergeMethod !== null &&
    record.providerMergeMethod !== record.observedMergeMethod
  )
    throw deliveryError('merge-method-evidence');
  validateWorkflowExceptionEnvelope(record.waiverGrant);
  const grant = record.waiverGrant;
  const scope = grant.payload.deliveryScope;
  if (
    grant.payload.schema !== 'aitm.workflow-exception/v2' ||
    grant.payload.status !== 'active' ||
    grant.recordId !== record.waiverRecordId ||
    grant.payload.revision !== record.waiverRevision ||
    grant.payload.waiverScopeDigest !== record.waiverScopeDigest ||
    `sha256:${sha256(grant.payload.reason)}` !== record.waiverReasonDigest ||
    scope.requirementId !== record.waivedRequirementId ||
    scope.deliveryOperationId !== record.deliveryOperationId ||
    scope.issue !== record.issueNumber ||
    scope.pullRequest !== record.prNumber ||
    scope.acceptedHeadSha !== record.expectedHeadSha ||
    scope.baseRef !== record.baseRef ||
    scope.resolvedTrunkRef !== `origin/${record.baseRef}` ||
    (Object.hasOwn(record, 'repository') && scope.repository !== record.repository)
  )
    throw deliveryError('generic-waiver-correlation');
}

function validateIntent(intent) {
  if (!MERGE_METHODS.includes(intent?.mergeMethod)) throw deliveryError('merge-method');
  canonicalRecordJson(intent);
  const keys =
    intent.schema === INTENT_SCHEMA_V3
      ? INTENT_KEYS_V3
      : intent.schema === INTENT_SCHEMA_V2
        ? [...INTENT_KEYS, ...WAIVED_INTENT_KEYS]
        : INTENT_KEYS;
  if (!hasExactlyKeys(intent, keys)) throw deliveryError('intent-keys');
  if (![INTENT_SCHEMA, INTENT_SCHEMA_V2, INTENT_SCHEMA_V3].includes(intent.schema))
    throw deliveryError('intent-schema');
  if (intent.schema === INTENT_SCHEMA_V2) assertWaivedIntent(intent);
  if (intent.schema === INTENT_SCHEMA_V3) {
    assertGenericWaiver(intent);
    assertRecordId(intent.originalIntentId, 'original-intent-id');
    if (intent.supersedesIntentId !== intent.originalIntentId)
      throw deliveryError('original-intent-link');
    if (!isCanonicalInstant(intent.originalIntentCreatedAt))
      throw deliveryError('original-intent-created-at');
    if (!/^sha256:[0-9a-f]{64}$/.test(intent.originalIntentDigest))
      throw deliveryError('original-intent-digest');
  }
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
  const expectedKeys =
    receipt?.schema === RECEIPT_SCHEMA_V1
      ? RECEIPT_KEYS_V1
      : receipt?.schema === RECEIPT_SCHEMA_V2
        ? RECEIPT_KEYS_V2
        : receipt?.schema === RECEIPT_SCHEMA_V5
          ? Object.hasOwn(receipt, 'metadataWarnings')
            ? [...RECEIPT_KEYS_V5, 'metadataWarnings']
            : RECEIPT_KEYS_V5
          : receipt?.schema === RECEIPT_SCHEMA_V4
            ? RECEIPT_KEYS_V4
            : receipt?.schema === RECEIPT_SCHEMA_V3
              ? Object.hasOwn(receipt, 'metadataWarnings')
                ? [...RECEIPT_KEYS_V3, 'metadataWarnings']
                : RECEIPT_KEYS_V3
              : null;
  if (expectedKeys === null) throw deliveryError('receipt-schema');
  if (!hasExactlyKeys(receipt, expectedKeys)) throw deliveryError('receipt-keys');
  if (receipt.schema === RECEIPT_SCHEMA_V2) assertMetadataWarnings(receipt.metadataWarnings);
  if (receipt.schema === RECEIPT_SCHEMA_V3) {
    if (receipt.attributionDisposition !== 'waived') throw deliveryError('attribution-disposition');
    renderDeliveryAttributionExceptionComment(receipt.exceptionRecord);
    if (receipt.exceptionRecordId !== receipt.exceptionRecord.recordId)
      throw deliveryError('exception-record-id');
    if (receipt.exceptionRecord.kind === 'revocation') throw deliveryError('revoked-exception');
    const proposal = receipt.exceptionRecord.proposal;
    if (
      proposal.issueNumber !== receipt.issueNumber ||
      proposal.prNumber !== receipt.prNumber ||
      proposal.headSha !== receipt.expectedHeadSha ||
      proposal.baseRef !== receipt.baseRef
    )
      throw deliveryError('exception-scope');
    if (Object.hasOwn(receipt, 'metadataWarnings')) {
      assertMetadataWarnings(receipt.metadataWarnings);
      if (
        receipt.metadataWarnings.some((warning) => warning !== 'missing-merge-attribution-trailer')
      )
        throw deliveryError('waived-metadata-warnings');
    }
  }
  if (receipt.schema === RECEIPT_SCHEMA_V5) {
    if (Object.hasOwn(receipt, 'metadataWarnings'))
      assertMetadataWarnings(receipt.metadataWarnings);
    if (!/^sha256:[0-9a-f]{64}$/.test(receipt.sourceDigest)) throw deliveryError('source-digest');
    const proof = receipt.observedIntegration;
    if (
      !hasExactlyKeys(proof, [
        'method',
        'mergeCommitSha',
        'parents',
        'tree',
        'commitTitle',
        'commitMessage',
        'sourceMapping',
        'contentProof',
      ])
    )
      throw deliveryError('observed-integration');
    if (
      proof.method !== receipt.mergeMethod ||
      proof.mergeCommitSha !== receipt.mergeCommitSha ||
      !Array.isArray(proof.parents) ||
      ![1, 2].includes(proof.parents.length) ||
      proof.parents.some((parent) => !SHA_RE.test(parent)) ||
      !SHA_RE.test(proof.tree) ||
      typeof proof.commitTitle !== 'string' ||
      !proof.commitTitle.length ||
      typeof proof.commitMessage !== 'string' ||
      !proof.commitMessage.length ||
      !Array.isArray(proof.sourceMapping) ||
      !proof.sourceMapping.length ||
      proof.sourceMapping.some(
        (entry) =>
          !hasExactlyKeys(entry, ['source', 'integrated']) ||
          !SHA_RE.test(entry.source) ||
          !SHA_RE.test(entry.integrated)
      ) ||
      !hasExactlyKeys(proof.contentProof, [
        'kind',
        'sourceBase',
        'sourceHead',
        'integrationBase',
        'integrationHead',
      ]) ||
      !['equivalent-delta', 'ordered-replay'].includes(proof.contentProof.kind) ||
      ['sourceBase', 'sourceHead', 'integrationBase', 'integrationHead'].some(
        (key) => !SHA_RE.test(proof.contentProof[key])
      ) ||
      proof.contentProof.sourceHead !== receipt.expectedHeadSha ||
      proof.contentProof.integrationHead !== receipt.mergeCommitSha ||
      (proof.method !== 'rebase' && proof.contentProof.integrationBase !== proof.parents[0]) ||
      (proof.method === 'rebase' && proof.contentProof.kind !== 'ordered-replay') ||
      (proof.method !== 'rebase' && proof.contentProof.kind !== 'equivalent-delta')
    ) {
      throw deliveryError('observed-integration');
    }
  }
  if (receipt.schema === RECEIPT_SCHEMA_V4) {
    assertGenericWaiver(receipt);
    validateDeliveryWaiverBurn(receipt.burn, {
      repository: receipt.waiverGrant.repository,
      issue: receipt.issueNumber,
      deliveryOperationId: receipt.deliveryOperationId,
    });
    assertSha(receipt.burnOid, 'burn-oid');
    if (
      receipt.burnDigest !== `sha256:${sha256(canonicalRecordJson(receipt.burn))}` ||
      receipt.burn.intentId !== receipt.intentId ||
      receipt.burn.mergeCommitSha !== receipt.mergeCommitSha ||
      receipt.burn.acceptedHeadSha !== receipt.expectedHeadSha ||
      receipt.burn.grantDigest !== `sha256:${sha256(canonicalRecordJson(receipt.waiverGrant))}` ||
      receipt.burn.waiverRecordId !== receipt.waiverRecordId ||
      receipt.burn.waiverRevision !== receipt.waiverRevision ||
      receipt.burn.waiverScopeDigest !== receipt.waiverScopeDigest ||
      receipt.burn.waiverReasonDigest !== receipt.waiverReasonDigest ||
      receipt.authorityReference !== receipt.waiverGrant.payload.approvalEvidence.reference ||
      receipt.authorizingPrincipal !== receipt.waiverGrant.payload.approvalEvidence.principal ||
      receipt.recordingActor !== receipt.waiverGrant.payload.approvalEvidence.recordingActor ||
      receipt.humanReason !== receipt.waiverGrant.payload.reason
    ) {
      throw deliveryError('receipt-waiver-correlation');
    }
  }
  if (receipt.result !== (receipt.schema === RECEIPT_SCHEMA_V4 ? 'waived' : 'delivered'))
    throw deliveryError('receipt-result');
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
  const waived = Object.hasOwn(input, 'attributionDisposition');
  const generic = Object.hasOwn(input, 'deliveryDisposition');
  const inputKeys = generic
    ? INTENT_KEYS_V3.filter(
        (key) => !['schema', 'state', 'commitTitleSha256', 'commitMessageSha256'].includes(key)
      )
    : waived
      ? [...INTENT_INPUT_KEYS, ...WAIVED_INTENT_KEYS]
      : INTENT_INPUT_KEYS;
  const acceptedKeys =
    input.intentId === undefined ? inputKeys.filter((key) => key !== 'intentId') : inputKeys;
  const normalizedKeys = generic
    ? acceptedKeys.filter(
        (key) => !['commitTitleSha256', 'commitMessageSha256', 'schema', 'state'].includes(key)
      )
    : acceptedKeys;
  if (!hasExactlyKeys(input, normalizedKeys)) throw deliveryError('intent-input-keys');
  const intent = {
    schema: generic ? INTENT_SCHEMA_V3 : waived ? INTENT_SCHEMA_V2 : INTENT_SCHEMA,
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
    ...(waived
      ? Object.fromEntries(
          WAIVED_INTENT_KEYS.map((key) => [
            key,
            key === 'mappings' ? structuredClone(input[key]) : input[key],
          ])
        )
      : {}),
    ...(generic
      ? Object.fromEntries(
          [
            ...GENERIC_WAIVER_KEYS,
            'originalIntentId',
            'originalIntentCreatedAt',
            'originalIntentDigest',
          ].map((key) => [key, key === 'waiverGrant' ? structuredClone(input[key]) : input[key]])
        )
      : {}),
  };
  validateIntent(intent);
  return deepFreeze(intent);
}

export function buildDeliveryReceipt(input = {}) {
  const waived = Object.hasOwn(input, 'attributionDisposition');
  const generic = Object.hasOwn(input, 'deliveryDisposition');
  const warningBearing = Object.hasOwn(input, 'metadataWarnings');
  const observed = Object.hasOwn(input, 'observedIntegration');
  const inputKeys = observed
    ? [...RECEIPT_INPUT_KEYS_V5, ...(warningBearing ? ['metadataWarnings'] : [])]
    : generic
      ? RECEIPT_INPUT_KEYS_V4
      : waived
        ? [...RECEIPT_INPUT_KEYS_V3, ...(warningBearing ? ['metadataWarnings'] : [])]
        : warningBearing
          ? RECEIPT_INPUT_KEYS_V2
          : RECEIPT_INPUT_KEYS_V1;
  if (!hasExactlyKeys(input, inputKeys)) {
    throw deliveryError('receipt-input-keys');
  }
  const receipt = {
    schema: observed
      ? RECEIPT_SCHEMA_V5
      : generic
        ? RECEIPT_SCHEMA_V4
        : waived
          ? RECEIPT_SCHEMA_V3
          : warningBearing
            ? RECEIPT_SCHEMA_V2
            : RECEIPT_SCHEMA_V1,
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
    result: generic ? 'waived' : 'delivered',
    ...(observed
      ? {
          observedIntegration: structuredClone(input.observedIntegration),
          sourceDigest: input.sourceDigest,
        }
      : {}),
    ...(waived
      ? {
          attributionDisposition: input.attributionDisposition,
          exceptionRecordId: input.exceptionRecordId,
          exceptionRecord: structuredClone(input.exceptionRecord),
        }
      : {}),
    ...(generic
      ? Object.fromEntries(
          [
            ...GENERIC_WAIVER_KEYS,
            'burn',
            'burnDigest',
            'burnOid',
            'authorityReference',
            'authorizingPrincipal',
            'recordingActor',
            'humanReason',
          ].map((key) => [
            key,
            ['waiverGrant', 'burn'].includes(key) ? structuredClone(input[key]) : input[key],
          ])
        )
      : {}),
    ...(warningBearing
      ? {
          metadataWarnings: Array.isArray(input.metadataWarnings)
            ? [...input.metadataWarnings]
            : input.metadataWarnings,
        }
      : {}),
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
  const warningMarkdown = Object.hasOwn(receipt, 'metadataWarnings')
    ? `\nMetadata warnings: ${receipt.metadataWarnings.map((warning) => `\`${warning}\``).join(', ')}.`
    : '';
  const genericMarkdown =
    receipt.schema === RECEIPT_SCHEMA_V4
      ? `\nDelivery invariant \`${receipt.waivedRequirementId}\` waived by \`${receipt.waiverRecordId}\` ` +
        `(revision ${receipt.waiverRevision}) for operation \`${receipt.deliveryOperationId}\`. ` +
        `Authority: \`${receipt.authorityReference}\`; principal: \`${receipt.authorizingPrincipal ?? 'unknown'}\`; ` +
        `recorded by \`${receipt.recordingActor}\`. Reason: ${receipt.humanReason.replaceAll('<', '&lt;')} ` +
        `Burn: \`${receipt.burnOid}\`.`
      : '';
  const waiverMarkdown =
    receipt.schema === RECEIPT_SCHEMA_V3
      ? `\nAttribution waived by exception \`${receipt.exceptionRecord.recordId}\` from ` +
        `\`${receipt.exceptionRecord.authority.sourceReference}\` recorded by ` +
        `\`${receipt.exceptionRecord.authority.actor}\`. Intent: \`${receipt.intentId}\`. ` +
        `Mappings: ${receipt.exceptionRecord.proposal.mappings
          .map(
            ({ oid, messageHeadline, issueNumber }) =>
              `\`${oid}\` (${JSON.stringify(messageHeadline)}) → \`#${issueNumber}\``
          )
          .join(', ')}.`
      : '';
  return renderComment(
    RECEIPT_MARKER,
    receipt,
    `Delivery ${receipt.schema === RECEIPT_SCHEMA_V4 ? 'waived' : 'verified'} for PR #${receipt.prNumber} as \`${receipt.mergeCommitSha}\` on \`${receipt.verifiedTrunkRef}\`.${genericMarkdown}${waiverMarkdown}${warningMarkdown}`
  );
}

// Bound the complete downstream comments before a user authorizes an exception.
// Quotes maximize JSON escaping for fields that are not known at preparation.
export function upperBoundWaivedDeliveryCommentBytes(proposal) {
  const { proposalDigest } = buildDeliveryAttributionProposal(proposal);
  const recordId = '7'.repeat(26);
  const exceptionRecord = {
    schema: 'aitm.delivery-attribution-exception/v1',
    kind: 'revision',
    recordId,
    predecessorId: recordId,
    proposal,
    proposalDigest,
    authority: {
      sourceReference: '"'.repeat(2048),
      statement: '"'.repeat(4096),
      actor: '"'.repeat(128),
      level: 'host-verified-user-message',
    },
    createdAt: '2000-01-01T00:00:00.000Z',
  };
  const commitTitlePrefix = `[#${proposal.issueNumber}] `;
  const commitTitle = commitTitlePrefix + '"'.repeat(MAX_TITLE_BYTES - commitTitlePrefix.length);
  const messagePrefix = `PR #${proposal.prNumber} ${proposal.headSha} ${proposal.attributionTokens
    .map((token) => `[${token}]`)
    .join(' ')} `;
  const commitMessage =
    messagePrefix + '"'.repeat(MAX_DELIVERY_COMMIT_MESSAGE_BYTES - messagePrefix.length);
  const intent = buildDeliveryIntent({
    intentId: recordId,
    supersedesIntentId: '6'.repeat(26),
    issueNumber: proposal.issueNumber,
    repository: proposal.repository,
    prNumber: proposal.prNumber,
    baseRef: proposal.baseRef,
    headRef: proposal.headRef,
    expectedHeadSha: proposal.headSha,
    mergeMethod: 'squash',
    attributionTokens: proposal.attributionTokens,
    commitTitle,
    commitMessage,
    provider: '"'.repeat(MAX_FIELD_BYTES),
    sessionId: '"'.repeat(MAX_FIELD_BYTES),
    clientCreatedAt: '9999-12-31T23:59:59.999Z',
    attributionDisposition: 'waived',
    exceptionRecordId: recordId,
    operationId: proposal.operationId,
    sourceDigest: proposal.sourceDigest,
    proposalDigest,
    mappings: proposal.mappings,
  });
  const receipt = buildDeliveryReceipt({
    intentId: recordId,
    issueNumber: proposal.issueNumber,
    prNumber: proposal.prNumber,
    expectedHeadSha: proposal.headSha,
    mergeCommitSha: 'f'.repeat(40),
    baseRef: proposal.baseRef,
    mergeMethod: 'squash',
    verifiedTrunkRef: `origin/${proposal.baseRef}`,
    provider: '"'.repeat(MAX_FIELD_BYTES),
    sessionId: '"'.repeat(MAX_FIELD_BYTES),
    verifiedAt: '9999-12-31T23:59:59.999Z',
    attributionDisposition: 'waived',
    exceptionRecordId: recordId,
    exceptionRecord,
    metadataWarnings: ['missing-merge-attribution-trailer'],
  });
  const bytes = Math.max(
    Buffer.byteLength(renderDeliveryIntentComment(intent), 'utf8'),
    Buffer.byteLength(renderDeliveryReceiptComment(receipt), 'utf8')
  );
  if (bytes > 60 * 1024) throw deliveryError('comment-upper-bound');
  return bytes;
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
  if ([INTENT_SCHEMA, INTENT_SCHEMA_V2, INTENT_SCHEMA_V3].includes(parsed.record?.schema)) {
    return validateIntent(parsed.record);
  }
  if (
    [
      RECEIPT_SCHEMA_V1,
      RECEIPT_SCHEMA_V2,
      RECEIPT_SCHEMA_V3,
      RECEIPT_SCHEMA_V4,
      RECEIPT_SCHEMA_V5,
    ].includes(parsed.record?.schema)
  ) {
    return validateReceipt(parsed.record);
  }
  throw deliveryError('project-record');
}

function dedupeKey(intent) {
  return `${intent.repository}\u0000${intent.issueNumber}\u0000${intent.prNumber}\u0000${intent.expectedHeadSha}`;
}

export function authorizedIntentBytes(intent) {
  return canonicalRecordJson(
    Object.fromEntries(
      [
        ...AUTHORIZED_INTENT_KEYS,
        ...(intent.schema === INTENT_SCHEMA_V2 ? WAIVED_INTENT_KEYS : []),
        ...(intent.schema === INTENT_SCHEMA_V3
          ? [
              ...GENERIC_WAIVER_KEYS,
              'originalIntentId',
              'originalIntentCreatedAt',
              'originalIntentDigest',
            ]
          : []),
      ].map((key) => [key, intent[key]])
    )
  );
}

function validateIntentGraph(intents) {
  const byId = new Map();
  const byDedupeKey = new Map();
  const byOperationId = new Map();
  const successors = new Map();
  for (const parsed of intents) {
    const intent = parsed.record;
    if (byId.has(intent.intentId)) throw deliveryError('duplicate-intent-id');
    if ([INTENT_SCHEMA_V2, INTENT_SCHEMA_V3].includes(intent.schema)) {
      const operationId =
        intent.schema === INTENT_SCHEMA_V3 ? intent.deliveryOperationId : intent.operationId;
      if (byOperationId.has(operationId)) throw deliveryError('operation-reuse');
      byOperationId.set(operationId, intent.intentId);
    }
    byId.set(intent.intentId, parsed);
    const key = dedupeKey(intent);
    const authorizedBytes = authorizedIntentBytes(intent);
    const existingBytes = byDedupeKey.get(key);
    if (
      existingBytes !== undefined &&
      existingBytes !== authorizedBytes &&
      intent.schema !== INTENT_SCHEMA_V3
    ) {
      throw deliveryError('same-key-divergence');
    }
    byDedupeKey.set(key, authorizedBytes);
  }
  for (const parsed of intents) {
    const { intentId, supersedesIntentId } = parsed.record;
    if (supersedesIntentId === null) continue;
    if (!byId.has(supersedesIntentId)) throw deliveryError('missing-superseded-intent');
    if (parsed.record.schema === INTENT_SCHEMA_V3) {
      const original = byId.get(supersedesIntentId);
      if (
        original.record.schema !== INTENT_SCHEMA ||
        parsed.record.originalIntentId !== original.record.intentId ||
        parsed.record.originalIntentCreatedAt !== original.createdAt ||
        Date.parse(parsed.createdAt) <= Date.parse(original.createdAt) ||
        parsed.record.originalIntentDigest !==
          `sha256:${sha256(canonicalRecordJson(original.record))}` ||
        AUTHORIZED_INTENT_KEYS.filter((key) => key !== 'schema').some(
          (key) =>
            canonicalRecordJson(parsed.record[key]) !== canonicalRecordJson(original.record[key])
        )
      ) {
        throw deliveryError('generic-supersession');
      }
    }
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
      (receipt.schema !== RECEIPT_SCHEMA_V5 && receipt.mergeMethod !== intent.mergeMethod) ||
      ((intent.schema === INTENT_SCHEMA_V3 || receipt.schema === RECEIPT_SCHEMA_V5) &&
        (receipt.provider !== intent.provider || receipt.sessionId !== intent.sessionId))
    ) {
      throw deliveryError('receipt-correlation');
    }
    if (intent.schema === INTENT_SCHEMA_V3) {
      if (
        receipt.schema !== RECEIPT_SCHEMA_V4 ||
        GENERIC_WAIVER_KEYS.some(
          (key) => canonicalRecordJson(receipt[key]) !== canonicalRecordJson(intent[key])
        ) ||
        receipt.burn.authorizedAt < intent.originalIntentCreatedAt
      ) {
        throw deliveryError('receipt-waiver-correlation');
      }
    } else if (intent.schema === INTENT_SCHEMA_V2) {
      if (
        receipt.schema !== RECEIPT_SCHEMA_V3 ||
        receipt.exceptionRecordId !== intent.exceptionRecordId ||
        receipt.exceptionRecord.proposal.operationId !== intent.operationId ||
        receipt.exceptionRecord.proposal.sourceDigest !== intent.sourceDigest ||
        receipt.exceptionRecord.proposalDigest !== intent.proposalDigest ||
        canonicalRecordJson(receipt.exceptionRecord.proposal.mappings) !==
          canonicalRecordJson(intent.mappings) ||
        canonicalRecordJson(receipt.exceptionRecord.proposal.attributionTokens) !==
          canonicalRecordJson(intent.attributionTokens)
      )
        throw deliveryError('receipt-waiver-correlation');
    } else if (
      [RECEIPT_SCHEMA_V3, RECEIPT_SCHEMA_V4].includes(receipt.schema) ||
      (receipt.schema === RECEIPT_SCHEMA_V5 && intent.schema !== INTENT_SCHEMA)
    ) {
      throw deliveryError('receipt-waiver-correlation');
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
    if ([INTENT_SCHEMA, INTENT_SCHEMA_V2, INTENT_SCHEMA_V3].includes(record.schema)) {
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
  const intents = copies.filter(({ record }) =>
    [INTENT_SCHEMA, INTENT_SCHEMA_V2, INTENT_SCHEMA_V3].includes(record.schema)
  );
  const receipts = copies.filter(({ record }) =>
    [
      RECEIPT_SCHEMA_V1,
      RECEIPT_SCHEMA_V2,
      RECEIPT_SCHEMA_V3,
      RECEIPT_SCHEMA_V4,
      RECEIPT_SCHEMA_V5,
    ].includes(record.schema)
  );
  const graph = validateIntentGraph(intents);
  const receiptsByIntentId = validateReceipts(receipts, graph.byId);
  for (const { record } of intents) {
    if (record.schema === INTENT_SCHEMA_V3 && receiptsByIntentId.has(record.originalIntentId)) {
      throw deliveryError('receipted-predecessor');
    }
  }
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
