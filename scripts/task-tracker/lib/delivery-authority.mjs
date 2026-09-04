// @story #1381
// Pure immutable accepted-delivery authority. Local HEAD is an observation;
// Test/Review evidence and the unique exact-head pull request are authority.

import { resolveDeliveryIntent } from './evidence-v2/delivery.mjs';

const SHA_RE = /^[0-9a-f]{40}$/;

export class DeliveryAuthorityError extends TypeError {
  constructor(category) {
    super(`delivery-authority:${category}`);
    this.name = 'DeliveryAuthorityError';
    this.category = category;
  }
}

function fail(category) {
  throw new DeliveryAuthorityError(category);
}

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function deepFreeze(value) {
  if (value === null || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

export function resolveAcceptedDeliveryHead({
  localHeadSha,
  testReceiptSha,
  reviewReceiptSha = null,
  agentReviewPassed,
} = {}) {
  if (
    !SHA_RE.test(localHeadSha || '') ||
    !SHA_RE.test(testReceiptSha || '') ||
    agentReviewPassed !== true ||
    (reviewReceiptSha !== null &&
      (!SHA_RE.test(reviewReceiptSha || '') || reviewReceiptSha !== testReceiptSha))
  ) {
    fail('accepted-evidence');
  }
  return reviewReceiptSha ?? testReceiptSha;
}

export function resolveAcceptedDeliveryAuthority({
  issueNumber,
  branch,
  localHeadSha,
  testReceiptSha,
  reviewReceiptSha = null,
  agentReviewPassed,
  pullRequests,
} = {}) {
  if (
    !Number.isSafeInteger(issueNumber) ||
    issueNumber <= 0 ||
    typeof branch !== 'string' ||
    branch.length === 0
  ) {
    fail('input');
  }
  const acceptedSha = resolveAcceptedDeliveryHead({
    localHeadSha,
    testReceiptSha,
    reviewReceiptSha,
    agentReviewPassed,
  });
  if (!Array.isArray(pullRequests)) fail('ambiguous-pr');
  const matches = pullRequests.filter(
    (pullRequest) => isObject(pullRequest) && pullRequest.headRefOid === acceptedSha
  );
  if (matches.length !== 1) fail('ambiguous-pr');
  const pullRequest = matches[0];
  if (!Number.isSafeInteger(pullRequest.number) || pullRequest.number <= 0) fail('ambiguous-pr');
  if (pullRequest.headRefName !== branch) fail('branch-mismatch');

  return deepFreeze({
    issueNumber,
    acceptedSha,
    observedLocalHeadSha: localHeadSha,
    headRelation: localHeadSha === acceptedSha ? 'current' : 'advanced',
    pullRequest: { ...pullRequest },
  });
}

// Evidence v2 is selected by the public dispatcher before reaching this seam.
// The legacy exports above retain their exact-head authority contract.
export function resolveEvidenceV2DeliveryAuthority(input = {}) {
  return resolveDeliveryIntent(input);
}
