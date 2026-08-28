import { buildDeliveryCommitText } from './delivery-attribution.mjs';
import { DeliveryAuthorityError, resolveAcceptedDeliveryAuthority } from './delivery-authority.mjs';
import { resolveMergeMechanism } from './full-auto-merge.mjs';

const INPUT_KEYS = [
  'acceptedReviewSha',
  'binding',
  'checks',
  'commitSubjects',
  'config',
  'dirtyPaths',
  'issue',
  'lineage',
  'localHeadSha',
  'pullRequests',
  'testReceiptSha',
];
const HISTORICAL_INPUT_KEYS = INPUT_KEYS.filter((key) => key !== 'checks').concat('intent');
const SHA_RE = /^[0-9a-f]{40}$/;
const REPOSITORY_RE = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;
const MERGE_METHODS = ['merge', 'squash', 'rebase'];

export class DeliveryPreflightError extends TypeError {
  constructor(category, cause) {
    super(`delivery-preflight:${category}`, cause === undefined ? undefined : { cause });
    this.name = 'DeliveryPreflightError';
    this.category = category;
  }
}

function fail(category, cause) {
  throw new DeliveryPreflightError(category, cause);
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

function isPositiveInteger(value) {
  return Number.isSafeInteger(value) && value > 0;
}

function isSha(value) {
  return typeof value === 'string' && SHA_RE.test(value);
}

function deepFreeze(value) {
  if (value === null || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

function trunkBaseRef(config) {
  if (typeof config.trunkRef !== 'string' || config.trunkRef.length === 0) {
    fail('configuration');
  }
  const segments = config.trunkRef.split('/');
  const baseRef = segments.at(-1);
  if (!baseRef) fail('configuration');
  return baseRef;
}

function validateIssueAndBinding(issue, binding, config) {
  if (!isPlainObject(issue) || !isPlainObject(binding) || !isPlainObject(config)) fail('input');
  if (!isPositiveInteger(issue.number) || !isPositiveInteger(binding.issueNumber)) fail('input');
  if (binding.issueNumber !== issue.number) fail('active-issue-mismatch');
  if (binding.timerState !== 'running') fail('timer-not-running');
  if (issue.projectState !== 'Review') fail('issue-not-review');
  if (issue.state !== 'OPEN') fail('issue-not-open');
  if (
    typeof config.assignee !== 'string' ||
    config.assignee.length === 0 ||
    !Array.isArray(issue.assignees) ||
    issue.assignees.length !== 1 ||
    issue.assignees[0] !== config.assignee
  ) {
    fail('issue-owner');
  }
  if (issue.agentReviewPassed !== true) fail('agent-review-evidence');
  const authorization = issue.reviewAuthorization;
  const authorizedByDecision =
    isPlainObject(authorization) &&
    authorization.standing === true &&
    ['human', 'full-auto'].includes(authorization.mode);
  if (!authorizedByDecision) fail('approval-evidence');
  if (typeof binding.branch !== 'string' || binding.branch.length === 0) fail('input');
}

function validateLineage(lineage, baseRef) {
  if (!isPlainObject(lineage)) fail('input');
  if (lineage.parentIssueNumber !== null || lineage.deliveryTarget !== baseRef) {
    fail('child-lineage');
  }
}

function validatePullRequest(pr, binding, baseRef, { merged = false } = {}) {
  if (!isPlainObject(pr) || !isPositiveInteger(pr.number)) fail('pull-request-count');
  if (merged) {
    if (pr.merged !== true && String(pr.state || '').toUpperCase() !== 'MERGED') {
      fail('pull-request-not-merged');
    }
  } else if (pr.state !== 'OPEN') {
    fail('pull-request-not-open');
  }
  if (pr.isDraft !== false) fail('pull-request-draft');
  if (pr.baseRefName !== baseRef) fail('pull-request-base');
  if (pr.headRefName !== binding.branch) fail('pull-request-head');
  return pr;
}

function validateExactHead({ localHeadSha, remoteHeadSha, testReceiptSha, acceptedReviewSha }) {
  if (
    !isSha(localHeadSha) ||
    !isSha(remoteHeadSha) ||
    !isSha(testReceiptSha) ||
    !isSha(acceptedReviewSha) ||
    new Set([localHeadSha, remoteHeadSha, testReceiptSha, acceptedReviewSha]).size !== 1
  ) {
    fail('head-mismatch');
  }
}

function validateChecks(checks, expectedHeadSha) {
  if (!isPlainObject(checks) || checks.readable !== true || !Array.isArray(checks.required)) {
    fail('checks-unreadable');
  }
  for (const check of checks.required) {
    if (!isPlainObject(check) || !isSha(check.headSha) || check.headSha !== expectedHeadSha) {
      fail('required-check-head-mismatch');
    }
    if (
      typeof check.name !== 'string' ||
      check.name.length === 0 ||
      check.status !== 'COMPLETED' ||
      check.conclusion !== 'SUCCESS'
    ) {
      fail('required-check-not-green');
    }
  }
}

function validateConfiguration(config) {
  if (
    !REPOSITORY_RE.test(config.repo) ||
    !isPlainObject(config.fullAutoMerge) ||
    config.fullAutoMerge.mechanism !== 'provider-action' ||
    !MERGE_METHODS.includes(config.fullAutoMerge.mergeMethod) ||
    !Array.isArray(config.repositoryMergeMethods) ||
    config.repositoryMergeMethods.some((method) => !MERGE_METHODS.includes(method)) ||
    new Set(config.repositoryMergeMethods).size !== config.repositoryMergeMethods.length
  ) {
    fail('configuration');
  }
  const resolved = resolveMergeMechanism(config);
  if (!resolved.ok || resolved.mechanism !== 'provider-action') fail('configuration');
  if (!config.repositoryMergeMethods.includes(resolved.mergeMethod)) {
    fail('merge-method-not-allowed');
  }
  if (resolved.mergeMethod === 'rebase') fail('merge-method-unverifiable');
  return resolved;
}

function validatePreflight(input, { merged = false } = {}) {
  if (!hasExactKeys(input, INPUT_KEYS)) fail('input');
  validateIssueAndBinding(input.issue, input.binding, input.config);
  const baseRef = trunkBaseRef(input.config);
  validateLineage(input.lineage, baseRef);
  let authority;
  try {
    authority = resolveAcceptedDeliveryAuthority({
      issueNumber: input.issue.number,
      branch: input.binding.branch,
      localHeadSha: input.localHeadSha,
      testReceiptSha: input.testReceiptSha,
      reviewReceiptSha: input.acceptedReviewSha,
      agentReviewPassed: input.issue.agentReviewPassed,
      pullRequests: input.pullRequests,
    });
  } catch (error) {
    if (!(error instanceof DeliveryAuthorityError)) throw error;
    const category =
      error.category === 'ambiguous-pr'
        ? 'pull-request-count'
        : error.category === 'branch-mismatch'
          ? 'pull-request-head'
          : error.category === 'accepted-evidence'
            ? 'head-mismatch'
            : 'input';
    fail(category, error);
  }
  if (authority.headRelation !== 'current') fail('head-mismatch');
  const pr = validatePullRequest(authority.pullRequest, input.binding, baseRef, { merged });
  validateExactHead({
    localHeadSha: input.localHeadSha,
    remoteHeadSha: pr.headRefOid,
    testReceiptSha: input.testReceiptSha,
    acceptedReviewSha: input.acceptedReviewSha,
  });
  if (!Array.isArray(input.dirtyPaths) || input.dirtyPaths.length > 0) fail('dirty-overlap');
  if (!merged && pr.mergeable !== 'MERGEABLE') fail('mergeability');
  validateChecks(input.checks, input.localHeadSha);
  const resolved = validateConfiguration(input.config);

  let commitText;
  try {
    commitText = buildDeliveryCommitText({
      issueNumber: input.issue.number,
      prNumber: pr.number,
      expectedHeadSha: input.localHeadSha,
      commitSubjects: input.commitSubjects,
    });
  } catch (error) {
    fail('attribution', error);
  }

  const issue = { ...input.issue, assignees: [...input.issue.assignees] };
  return deepFreeze({
    issue,
    pr: { ...pr },
    expectedHeadSha: input.localHeadSha,
    mergeMethod: resolved.mergeMethod,
    commitText,
  });
}

export function validateDeliveryPreflight(input = {}) {
  return validatePreflight(input);
}

export function validateMergedDeliveryPreflight(input = {}) {
  return validatePreflight(input, { merged: true });
}

export function validateHistoricalRecoveryPreflight(input = {}) {
  if (!hasExactKeys(input, HISTORICAL_INPUT_KEYS)) fail('input');
  validateIssueAndBinding(input.issue, input.binding, input.config);
  const baseRef = trunkBaseRef(input.config);
  validateLineage(input.lineage, baseRef);

  let authority;
  try {
    authority = resolveAcceptedDeliveryAuthority({
      issueNumber: input.issue.number,
      branch: input.binding.branch,
      localHeadSha: input.localHeadSha,
      testReceiptSha: input.testReceiptSha,
      reviewReceiptSha: input.acceptedReviewSha,
      agentReviewPassed: input.issue.agentReviewPassed,
      pullRequests: input.pullRequests,
    });
  } catch (error) {
    if (!(error instanceof DeliveryAuthorityError)) throw error;
    const category =
      error.category === 'ambiguous-pr'
        ? 'pull-request-count'
        : error.category === 'branch-mismatch'
          ? 'pull-request-head'
          : error.category === 'accepted-evidence'
            ? 'head-mismatch'
            : 'input';
    fail(category, error);
  }
  if (authority.headRelation !== 'advanced') fail('head-relation');
  const pr = validatePullRequest(authority.pullRequest, input.binding, baseRef, { merged: true });
  if (
    !isSha(input.testReceiptSha) ||
    !isSha(input.acceptedReviewSha) ||
    new Set([authority.acceptedSha, pr.headRefOid, input.testReceiptSha, input.acceptedReviewSha])
      .size !== 1
  ) {
    fail('head-mismatch');
  }
  if (!Array.isArray(input.dirtyPaths) || input.dirtyPaths.length > 0) fail('dirty-overlap');
  const resolved = validateConfiguration(input.config);

  const intent = input.intent;
  if (!isPlainObject(intent) || intent.provider === 'external') fail('historical-intent');
  let commitText;
  try {
    commitText = buildDeliveryCommitText({
      issueNumber: input.issue.number,
      prNumber: pr.number,
      expectedHeadSha: authority.acceptedSha,
      commitSubjects: input.commitSubjects,
    });
  } catch (error) {
    fail('attribution', error);
  }
  const expectedIntent = {
    issueNumber: input.issue.number,
    repository: input.config.repo,
    prNumber: pr.number,
    baseRef,
    headRef: input.binding.branch,
    expectedHeadSha: authority.acceptedSha,
    mergeMethod: resolved.mergeMethod,
    attributionTokens: commitText.attributionTokens,
    commitTitle: commitText.commitTitle,
    commitMessage: commitText.commitMessage,
  };
  for (const [key, expected] of Object.entries(expectedIntent)) {
    const actual = intent[key];
    const matches = Array.isArray(expected)
      ? Array.isArray(actual) &&
        actual.length === expected.length &&
        actual.every((value, index) => value === expected[index])
      : actual === expected;
    if (!matches) fail('historical-intent');
  }

  return deepFreeze({
    issue: { ...input.issue, assignees: [...input.issue.assignees] },
    pr: { ...pr },
    acceptedSha: authority.acceptedSha,
    observedLocalHeadSha: authority.observedLocalHeadSha,
    headRelation: authority.headRelation,
    intent: { ...intent },
  });
}
