import { createHash } from 'node:crypto';

import { canonicalRecordJson } from './github-records/canonical-json.mjs';
import { renderDeliveryIntentComment } from './delivery-records.mjs';

const authorizedHashes = new WeakMap();

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
