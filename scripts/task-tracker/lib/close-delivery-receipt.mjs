// @story #939
// Pure close-time authorization from a verified delivery receipt. This module
// does no I/O: callers must supply the current live PR snapshot and the strict
// Task 1 projection.

import { canonicalRecordJson } from './github-records/canonical-json.mjs';
import {
  buildDeliveryReceipt,
  renderDeliveryIntentComment,
  renderDeliveryReceiptComment,
} from './delivery-records.mjs';
import { verifyDeliveredPullRequest } from './delivery-verification.mjs';
import {
  isIssueResidentDeliveryKind,
  parseDeliverablePosted,
  parseIssueKind,
} from './issue-kind.mjs';
import { validateRecord } from './evidence-v2/codec.mjs';
import { validatePinnedWaiverEvidence } from './delivery-waiver-evidence.mjs';
import { verifyHistoricalDeliveryWaiverAuthority } from './delivery-waiver-transaction.mjs';

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
  repository,
  body,
  lineage,
  branch,
  acceptedSha,
  pullRequests,
  records,
  noCommitRecords,
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

  // A root epic is coordination-only during Develop/Test, but its aggregate
  // child history is commit-bearing delivery at the root boundary. It must use
  // the same merged-PR receipt as other top-level branch work; a posted epic
  // deliverable cannot prove that the epic branch reached trunk (#1632).
  if (
    isIssueResidentDeliveryKind(body) &&
    Array.isArray(pullRequests) &&
    pullRequests.length === 0
  ) {
    const deliverable = parseDeliverablePosted(body);
    if (!deliverable) fail('no-commit-deliverable');
    if (typeof repository !== 'string' || repository.length === 0) fail('input');
    if (!SHA_RE.test(acceptedSha || '')) fail('head-mismatch');
    if (!isObject(noCommitRecords) || !Array.isArray(noCommitRecords.records)) fail('malformed');
    if (noCommitRecords.records.length === 0 || noCommitRecords.record === null) fail('missing');
    if (noCommitRecords.records.length !== 1 || !isObject(noCommitRecords.record?.record)) {
      fail('malformed');
    }
    const receipt = noCommitRecords.record.record;
    if (receipt.repository !== repository) fail('repository-mismatch');
    if (receipt.issueNumber !== issueNumber) fail('issue-mismatch');
    if (receipt.issueKind !== parseIssueKind(body)) fail('kind-mismatch');
    if (receipt.deliverableUrl !== deliverable.url) fail('deliverable-mismatch');
    if (receipt.acceptedSha !== acceptedSha) fail('head-mismatch');
    if (receipt.result !== 'delivered') fail('malformed');
    return frozenResult({ skipped: false, mode: 'no-commit', receipt });
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
  const pinnedWaiver =
    records.liveIntent.record.schema === 'aitm.delivery-intent/v3' &&
    receipt.schema === 'aitm.delivery-receipt/v4';
  if (pinnedWaiver ? receipt.result !== 'waived' : receipt.result !== 'delivered')
    fail('malformed');
  if (
    (records.liveIntent.record.schema === 'aitm.delivery-intent/v3') !==
    (receipt.schema === 'aitm.delivery-receipt/v4')
  )
    fail('malformed');
  return frozenResult({ skipped: false, receipt });
}

// Evidence v2 close consumes the immutable delivery record selected by its
// cycle projection. It never searches for a pull request by an accepted SHA.
export function requireEvidenceV2DeliveryReceipt({ delivery, acceptanceId, intentId } = {}) {
  validateRecord(delivery);
  if (
    delivery.recordType !== 'delivery' ||
    delivery.payload.acceptanceId !== acceptanceId ||
    delivery.payload.intentId !== intentId
  )
    fail('v2-receipt');
  return frozenResult({ skipped: false, mode: 'v2', receipt: delivery });
}

/** Authenticate immutable waiver evidence against the burn commit, not the moving journal tip. */
export async function verifyPinnedDeliveryWaiverAuthority({
  gateInput,
  intent,
  receipt,
  deps,
} = {}) {
  if (
    intent?.schema !== 'aitm.delivery-intent/v3' ||
    receipt?.schema !== 'aitm.delivery-receipt/v4'
  )
    fail('malformed');
  const originalEntry = gateInput.records.intents.find(
    (entry) => entry.record.intentId === intent.originalIntentId
  );
  if (!originalEntry) fail('delivery-waiver-burn-mismatch');
  const originalIntent = { record: originalEntry.record, createdAt: originalEntry.createdAt };
  const journal = await deps?.readWaiverJournal?.();
  const operation =
    journal?.operations instanceof Map ? journal.operations.get(intent.deliveryOperationId) : null;
  if (
    operation?.state !== 'completed' ||
    operation.burnOid !== receipt.burnOid ||
    !isObject(operation.burn) ||
    canonicalRecordJson(operation.burn) !== canonicalRecordJson(receipt.burn) ||
    operation.intentPublication?.intentId !== intent.intentId ||
    operation.intentPublication?.originalIntentId !== originalIntent.record.intentId ||
    operation.intentPublication?.originalIntentDigest !== intent.originalIntentDigest ||
    operation.intentPublication?.intentBody !== renderDeliveryIntentComment(intent) ||
    operation.publication?.receiptBody !== renderDeliveryReceiptComment(receipt)
  )
    fail('delivery-waiver-burn-mismatch');
  try {
    validatePinnedWaiverEvidence({
      intent,
      receipt,
      grant: receipt.waiverGrant,
      burn: operation.burn,
      originalIntent,
    });
    await verifyHistoricalDeliveryWaiverAuthority({
      records: await deps?.listWaiverRecords?.(),
      grant: receipt.waiverGrant,
      burn: operation.burn,
      repository: gateInput.repository,
      issue: gateInput.issueNumber,
      runtime: {
        resolveTranscriptPath: deps?.resolveTranscriptPath,
        verifyStoredDeliveryWaiverAuthority: deps?.verifyStoredDeliveryWaiverAuthority,
      },
    });
  } catch (error) {
    if (error?.category) throw error;
    fail('delivery-waiver-burn-mismatch');
  }
  return {
    originalIntent,
    grant: receipt.waiverGrant,
    burn: operation.burn,
    burnOid: operation.burnOid,
    receipt,
  };
}

export async function verifyCloseDeliveryReceipt({
  gateInput,
  receiptGate,
  testReceiptSha,
  acceptedReviewSha,
  deps,
} = {}) {
  if (receiptGate?.skipped === true) return frozenResult({ skipped: true, receipt: null });
  if (receiptGate?.mode === 'no-commit') {
    if (testReceiptSha !== gateInput?.acceptedSha || acceptedReviewSha !== gateInput?.acceptedSha) {
      fail('head-mismatch');
    }
    const fresh = requireDeliveryReceipt(gateInput);
    if (
      fresh.mode !== 'no-commit' ||
      canonicalRecordJson(fresh.receipt) !== canonicalRecordJson(receiptGate.receipt)
    ) {
      fail('fresh-receipt-mismatch');
    }
    return frozenResult({ mode: 'no-commit', receipt: fresh.receipt });
  }
  const receipt = receiptGate?.receipt;
  const liveIntent = gateInput?.records?.liveIntent;
  const intent = liveIntent?.record;
  const pullRequest = gateInput?.pullRequest;
  if (!isObject(receipt) || !isObject(intent) || !isObject(pullRequest)) fail('fresh-input');
  const pinned = intent.schema === 'aitm.delivery-intent/v3';
  const genericWaiverEvidence = pinned
    ? await verifyPinnedDeliveryWaiverAuthority({ gateInput, intent, receipt, deps })
    : null;
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
      mergeMethod: pinned
        ? pullRequest.mergeMethod
        : (pullRequest.mergeMethod ?? intent.mergeMethod),
    },
    recovery: gateInput.headRelation === 'advanced',
    testReceiptSha,
    ...(pinned
      ? { genericWaiverEvidence }
      : intent.schema === 'aitm.delivery-intent/v2'
        ? {
            waivedEvidence: {
              sourceInventory: gateInput.sourceInventory,
              exceptionRecord: receipt.exceptionRecord,
            },
          }
        : {}),
  });
  if (
    canonicalRecordJson(buildDeliveryReceipt(verified.receiptInput)) !==
    canonicalRecordJson(receipt)
  ) {
    fail('fresh-receipt-mismatch');
  }
  return frozenResult({ skipped: false, receipt, verification: verified });
}
