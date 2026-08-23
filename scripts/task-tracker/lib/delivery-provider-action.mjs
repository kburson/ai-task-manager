import { createHash } from 'node:crypto';

import { canonicalRecordJson } from './github-records/canonical-json.mjs';
import { renderDeliveryIntentComment } from './delivery-records.mjs';

const authorizedHashes = new WeakMap();
const ACTION_KEYS = [
  'action',
  'baseRef',
  'commitMessage',
  'commitTitle',
  'expectedHeadSha',
  'headRef',
  'intentId',
  'issueNumber',
  'mergeMethod',
  'prNumber',
  'repository',
  'schema',
];
const SHA_RE = /^[0-9a-f]{40}$/;
const ULID_RE = /^[0-7][0-9A-HJKMNP-TV-Z]{25}$/;
const REPOSITORY_RE = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;
const MERGE_METHODS = new Set(['merge', 'squash', 'rebase']);

function actionError(category, cause) {
  return new TypeError(
    `delivery-provider-action:${category}`,
    cause === undefined ? undefined : { cause }
  );
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function assertIntentHashes(intent) {
  if (
    typeof intent?.commitTitle !== 'string' ||
    typeof intent?.commitMessage !== 'string' ||
    sha256(intent.commitTitle) !== intent.commitTitleSha256 ||
    sha256(intent.commitMessage) !== intent.commitMessageSha256
  ) {
    throw actionError('commit-hash-mismatch');
  }
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

function validRef(value) {
  return (
    typeof value === 'string' &&
    value.length > 0 &&
    value === value.trim() &&
    !value.startsWith('/') &&
    !value.endsWith('/') &&
    !value.includes('//') &&
    !value.includes('..') &&
    !/[~^:?*[\\\s]/.test(value)
  );
}

export function validateProviderAction(action) {
  if (!hasExactKeys(action, ACTION_KEYS)) throw actionError('action-keys');
  if (action.schema !== 1 || action.action !== 'github.merge-pull-request') {
    throw actionError('action-schema');
  }
  if (!ULID_RE.test(action.intentId)) throw actionError('intent-id');
  if (!REPOSITORY_RE.test(action.repository)) throw actionError('repository');
  if (!Number.isSafeInteger(action.issueNumber) || action.issueNumber <= 0) {
    throw actionError('issue-number');
  }
  if (!Number.isSafeInteger(action.prNumber) || action.prNumber <= 0) {
    throw actionError('pr-number');
  }
  if (!validRef(action.baseRef) || !validRef(action.headRef)) throw actionError('ref');
  if (!SHA_RE.test(action.expectedHeadSha)) throw actionError('expected-head-sha');
  if (!MERGE_METHODS.has(action.mergeMethod)) throw actionError('merge-method');
  if (
    typeof action.commitTitle !== 'string' ||
    action.commitTitle.length === 0 ||
    !action.commitTitle.startsWith(`[#${action.issueNumber}]`) ||
    typeof action.commitMessage !== 'string' ||
    action.commitMessage.length === 0 ||
    !action.commitMessage.includes(`PR #${action.prNumber}`) ||
    !action.commitMessage.includes(action.expectedHeadSha)
  ) {
    throw actionError('commit-bytes');
  }
  canonicalRecordJson(action);
  return action;
}

export function buildProviderAction(intent) {
  assertIntentHashes(intent);
  try {
    renderDeliveryIntentComment(intent);
  } catch (error) {
    throw actionError('intent', error);
  }

  const action = Object.freeze({
    schema: 1,
    intentId: intent.intentId,
    action: 'github.merge-pull-request',
    repository: intent.repository,
    issueNumber: intent.issueNumber,
    prNumber: intent.prNumber,
    baseRef: intent.baseRef,
    headRef: intent.headRef,
    expectedHeadSha: intent.expectedHeadSha,
    mergeMethod: intent.mergeMethod,
    commitTitle: intent.commitTitle,
    commitMessage: intent.commitMessage,
  });
  validateProviderAction(action);
  authorizedHashes.set(action, {
    commitTitleSha256: intent.commitTitleSha256,
    commitMessageSha256: intent.commitMessageSha256,
  });
  return action;
}

export function serializeProviderActionRequired(action) {
  const hashes = authorizedHashes.get(action);
  if (hashes === undefined) throw actionError('untrusted-action');
  if (
    sha256(action.commitTitle) !== hashes.commitTitleSha256 ||
    sha256(action.commitMessage) !== hashes.commitMessageSha256
  ) {
    throw actionError('commit-hash-mismatch');
  }
  return `AITM_PROVIDER_ACTION_REQUIRED: ${canonicalRecordJson(action)}`;
}
