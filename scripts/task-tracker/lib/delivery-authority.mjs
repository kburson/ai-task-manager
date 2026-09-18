// @story #1381
// Pure immutable accepted-delivery authority. Local HEAD is an observation;
// Test/Review evidence and the unique exact-head pull request are authority.

import { resolveDeliveryIntent } from './evidence-v2/delivery.mjs';

const SHA_RE = /^[0-9a-f]{40}$/;
const SEMANTIC_REVIEW_REQUIREMENT = 'review.semantic-resident';

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

function failReviewAuthority(category) {
  throw new TypeError(`delivery-review-authority:${category}`);
}

export function resolveDeliveryReviewAuthority({
  agentReviewPassed,
  terminalReviewOutcome,
  testReceiptSha,
  acceptedReviewSha,
  workflowPolicy,
} = {}) {
  if (!SHA_RE.test(testReceiptSha || '')) failReviewAuthority('accepted-head');

  if (agentReviewPassed === true) {
    if (!SHA_RE.test(acceptedReviewSha || '') || acceptedReviewSha !== testReceiptSha) {
      failReviewAuthority('accepted-head');
    }
    return deepFreeze({ outcome: 'passed', acceptedSha: testReceiptSha, authority: null });
  }

  if (!isObject(terminalReviewOutcome) || terminalReviewOutcome.outcome !== 'waived') {
    failReviewAuthority('terminal-outcome');
  }
  if (acceptedReviewSha !== null && acceptedReviewSha !== undefined) {
    if (!SHA_RE.test(acceptedReviewSha) || acceptedReviewSha !== testReceiptSha) {
      failReviewAuthority('accepted-head');
    }
  }
  const recorded = terminalReviewOutcome.evidence;
  if (!isObject(recorded) || recorded.requirementId !== SEMANTIC_REVIEW_REQUIREMENT) {
    failReviewAuthority('requirement');
  }
  if (
    typeof recorded.authority?.recordId !== 'string' ||
    recorded.authority.recordId.length === 0
  ) {
    failReviewAuthority('authority');
  }
  if (
    !isObject(workflowPolicy) ||
    workflowPolicy.status !== 'policy-compatible' ||
    typeof workflowPolicy.isWaived !== 'function' ||
    !workflowPolicy.isWaived(SEMANTIC_REVIEW_REQUIREMENT) ||
    typeof workflowPolicy.decision !== 'function'
  ) {
    failReviewAuthority('policy');
  }
  const decision = workflowPolicy.decision(SEMANTIC_REVIEW_REQUIREMENT);
  const authority = decision?.authority;
  if (
    decision?.outcome !== 'waived' ||
    !isObject(authority) ||
    authority.recordId !== recorded.authority.recordId ||
    !Number.isSafeInteger(authority.revision) ||
    authority.revision <= 0
  ) {
    failReviewAuthority('authority');
  }
  return deepFreeze({ outcome: 'waived', acceptedSha: testReceiptSha, authority });
}

export function resolveAcceptedDeliveryHead({
  localHeadSha,
  testReceiptSha,
  reviewReceiptSha = null,
  agentReviewPassed,
  reviewAuthority = null,
} = {}) {
  const typedAuthorityValid =
    isObject(reviewAuthority) &&
    ['passed', 'waived'].includes(reviewAuthority.outcome) &&
    SHA_RE.test(reviewAuthority.acceptedSha || '') &&
    reviewAuthority.acceptedSha === testReceiptSha;
  if (
    !SHA_RE.test(localHeadSha || '') ||
    !SHA_RE.test(testReceiptSha || '') ||
    (!typedAuthorityValid && agentReviewPassed !== true) ||
    (!typedAuthorityValid &&
      reviewReceiptSha !== null &&
      (!SHA_RE.test(reviewReceiptSha || '') || reviewReceiptSha !== testReceiptSha))
  ) {
    fail('accepted-evidence');
  }
  return typedAuthorityValid ? reviewAuthority.acceptedSha : (reviewReceiptSha ?? testReceiptSha);
}

export function resolveAcceptedDeliveryAuthority({
  issueNumber,
  branch,
  localHeadSha,
  testReceiptSha,
  reviewReceiptSha = null,
  agentReviewPassed,
  reviewAuthority = null,
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
    reviewAuthority,
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
