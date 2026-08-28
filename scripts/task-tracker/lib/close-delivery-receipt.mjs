// @story #939
// Pure close-time authorization from a verified delivery receipt. This module
// does no I/O: callers must supply the current live PR snapshot and the strict
// Task 1 projection.

import { canonicalRecordJson } from './github-records/canonical-json.mjs';
import { buildDeliveryReceipt } from './delivery-records.mjs';
import { verifyDeliveredPullRequest } from './delivery-verification.mjs';

export { resolveAcceptedDeliveryHead } from './delivery-authority.mjs';

const SHA_RE = /^[0-9a-f]{40}$/;

export class CloseDeliveryReceiptError extends TypeError {
  constructor(category) {
    super(`close-delivery-receipt:${category}`);
    this.name = 'CloseDeliveryReceiptError';
    this.category = category;
  }
}

function fail(category) {
  throw new CloseDeliveryReceiptError(category);
}

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function frozenResult(value) {
  return Object.freeze(value);
}

export function requireDeliveryReceipt({
  issueNumber,
  lineage,
  branch,
  acceptedSha,
  pullRequests,
  records,
} = {}) {
  if (!Number.isSafeInteger(issueNumber) || issueNumber <= 0) fail('input');
  if (!isObject(lineage) || typeof lineage.deliveryTarget !== 'string') fail('input');
  if (typeof branch !== 'string' || branch.length === 0) fail('input');

  // Children deliver to their epic branch under the pre-existing merge-back
  // contract. A top-level task already running on its delivery target is the
  // explicitly authorized no-PR local-trunk lane.
  if (lineage.parentIssueNumber !== null) {
    if (!Number.isSafeInteger(lineage.parentIssueNumber) || lineage.parentIssueNumber <= 0) {
      fail('lineage');
    }
    return frozenResult({ skipped: true, receipt: null });
  }
  if (
    Array.isArray(pullRequests) &&
    pullRequests.length === 0 &&
    branch === lineage.deliveryTarget &&
    lineage.localTrunkLaneAuthorized === true
  ) {
    return frozenResult({ skipped: true, receipt: null });
  }

  if (!SHA_RE.test(acceptedSha || '')) fail('head-mismatch');
  if (!Array.isArray(pullRequests)) fail('ambiguous-pr');
  const exactHeadPullRequests = pullRequests.filter(
    (pullRequest) => isObject(pullRequest) && pullRequest.headRefOid === acceptedSha
  );
  if (exactHeadPullRequests.length !== 1) fail('ambiguous-pr');
  const pr = exactHeadPullRequests[0];
  if (!isObject(pr) || !Number.isSafeInteger(pr.number) || pr.number <= 0) fail('ambiguous-pr');
  if (pr.merged !== true && String(pr.state || '').toUpperCase() !== 'MERGED') fail('not-merged');
  if (pr.headRefName !== branch) fail('branch-mismatch');
  if (pr.headRefOid !== acceptedSha) fail('head-mismatch');
  if (pr.baseRefName !== lineage.deliveryTarget) fail('base-mismatch');
  if (!SHA_RE.test(pr.mergeCommitSha || '')) fail('merge-commit-missing');

  if (!isObject(records) || !Array.isArray(records.intents) || !Array.isArray(records.receipts)) {
    fail('malformed');
  }
  const projected = records.matchingReceipt;
  if (!isObject(projected) || !isObject(projected.record)) fail('missing');
  const receipt = projected.record;
  const sameIntentReceipts = records.receipts.filter(
    (candidate) => candidate?.record?.intentId === receipt.intentId
  );
  if (sameIntentReceipts.length > 1) {
    const bytes = new Set(sameIntentReceipts.map((candidate) => JSON.stringify(candidate.record)));
    fail(bytes.size === 1 ? 'duplicate' : 'conflicting');
  }
  if (
    sameIntentReceipts.length !== 1 ||
    JSON.stringify(sameIntentReceipts[0].record) !== JSON.stringify(receipt) ||
    records.liveIntent?.record?.intentId !== receipt.intentId
  ) {
    fail('malformed');
  }
  if (receipt.issueNumber !== issueNumber) fail('issue-mismatch');
  if (receipt.prNumber !== pr.number) fail('pr-mismatch');
  if (receipt.expectedHeadSha !== acceptedSha) fail('head-mismatch');
  if (receipt.mergeCommitSha !== pr.mergeCommitSha) fail('merge-commit-mismatch');
  if (receipt.baseRef !== lineage.deliveryTarget) fail('base-mismatch');
  if (receipt.result !== 'delivered') fail('malformed');
  return frozenResult({ skipped: false, receipt });
}

export async function verifyCloseDeliveryReceipt({
  gateInput,
  receiptGate,
  testReceiptSha,
  acceptedReviewSha,
  deps,
} = {}) {
  if (receiptGate?.skipped === true) return frozenResult({ skipped: true, receipt: null });
  const receipt = receiptGate?.receipt;
  const liveIntent = gateInput?.records?.liveIntent;
  const intent = liveIntent?.record;
  const pullRequest = gateInput?.pullRequest;
  if (!isObject(receipt) || !isObject(intent) || !isObject(pullRequest)) fail('fresh-input');
  const verified = await verifyDeliveredPullRequest({
    acceptedSha: gateInput.acceptedSha,
    acceptedReviewSha,
    attributingCommits: deps?.attributingCommits,
    fetchOriginTrunk: deps?.fetchOriginTrunk,
    inspectMergeCommit: deps?.inspectMergeCommit,
    intent,
    intentCreatedAt: liveIntent.createdAt,
    isAncestor: deps?.isAncestor,
    localHeadSha: gateInput.observedLocalHeadSha,
    pullRequest: {
      ...pullRequest,
      headRefDeleted: false,
      mergeMethod: pullRequest.mergeMethod ?? intent.mergeMethod,
    },
    recovery: gateInput.headRelation === 'advanced',
    testReceiptSha,
  });
  if (
    canonicalRecordJson(buildDeliveryReceipt(verified.receiptInput)) !==
    canonicalRecordJson(receipt)
  ) {
    fail('fresh-receipt-mismatch');
  }
  return frozenResult({ skipped: false, receipt, verification: verified });
}
