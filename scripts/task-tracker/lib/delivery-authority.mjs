// @story #1381
// Pure immutable accepted-delivery authority. Local HEAD is an observation;
// Test/Review evidence and the unique exact-head pull request are authority.

import { resolveDeliveryIntent } from './evidence-v2/delivery.mjs';

const SHA_RE = /^[0-9a-f]{40}$/;
const RECORD_ID_RE = /^[0-9A-HJKMNP-TV-Z]{26}$/;
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

function isPlainObject(value) {
  if (!isObject(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function hasExactKeys(value, keys) {
  if (!isPlainObject(value)) return false;
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
}

function deepFreeze(value) {
  if (value === null || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

function failReviewAuthority(category) {
  throw new TypeError(`delivery-review-authority:${category}`);
}

export function isValidDeliveryReviewAuthority(reviewAuthority, { testReceiptSha } = {}) {
  if (
    !hasExactKeys(reviewAuthority, ['outcome', 'acceptedSha', 'authority']) ||
    !['passed', 'waived'].includes(reviewAuthority.outcome) ||
    !SHA_RE.test(reviewAuthority.acceptedSha || '') ||
    (testReceiptSha !== undefined && reviewAuthority.acceptedSha !== testReceiptSha)
  ) {
    return false;
  }
  if (reviewAuthority.outcome === 'passed') return reviewAuthority.authority === null;
  return (
    hasExactKeys(reviewAuthority.authority, ['recordId', 'revision']) &&
    RECORD_ID_RE.test(reviewAuthority.authority.recordId || '') &&
    Number.isSafeInteger(reviewAuthority.authority.revision) &&
    reviewAuthority.authority.revision > 0
  );
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
  if (!SHA_RE.test(recorded.acceptedSha || '') || recorded.acceptedSha !== testReceiptSha) {
    failReviewAuthority('accepted-head');
  }
  if (
    typeof recorded.authority?.recordId !== 'string' ||
    !RECORD_ID_RE.test(recorded.authority.recordId) ||
    !['undefined', 'number'].includes(typeof recorded.authority.revision) ||
    (recorded.authority.revision !== undefined &&
      (!Number.isSafeInteger(recorded.authority.revision) || recorded.authority.revision <= 0))
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
    (recorded.authority.revision !== undefined &&
      authority.revision !== recorded.authority.revision) ||
    !Number.isSafeInteger(authority.revision) ||
    authority.revision <= 0
  ) {
    failReviewAuthority('authority');
  }
  return deepFreeze({
    outcome: 'waived',
    acceptedSha: testReceiptSha,
    authority: { recordId: authority.recordId, revision: authority.revision },
  });
}

export function resolveAcceptedDeliveryHead({
  localHeadSha,
  testReceiptSha,
  reviewReceiptSha = null,
  agentReviewPassed,
  reviewAuthority = null,
} = {}) {
  const typedAuthorityValid = isValidDeliveryReviewAuthority(reviewAuthority, { testReceiptSha });
  if (
    !SHA_RE.test(localHeadSha || '') ||
    !SHA_RE.test(testReceiptSha || '') ||
    (!typedAuthorityValid && agentReviewPassed !== true) ||
    (reviewReceiptSha !== null &&
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
