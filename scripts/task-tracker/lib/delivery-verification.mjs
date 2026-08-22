// @story #939
// Independent live verification for governed pull-request delivery.

const SHA_RE = /^[0-9a-f]{40}$/;
const REPOSITORY_RE = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;
const VERIFICATION_INPUT_KEYS = [
  'attributingCommits',
  'fetchOriginTrunk',
  'intent',
  'intentCreatedAt',
  'isAncestor',
  'pullRequest',
  'recovery',
];
const EVIDENCE_INPUT_KEYS = [
  'branchDisposition',
  'ciRunUrl',
  'closeResult',
  'issueNumber',
  'mergeSha',
  'prNumber',
  'providerAction',
  'receiptCommentId',
  'repository',
  'sourceSha',
];

function verificationError(category, cause) {
  return new TypeError(
    `delivery-verification:${category}`,
    cause === undefined ? undefined : { cause }
  );
}

function evidenceError(category) {
  return new TypeError(`delivery-real-pr-evidence:${category}`);
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

function deepFreeze(value) {
  if (value === null || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

function isCanonicalInstant(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)) {
    return false;
  }
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) && new Date(timestamp).toISOString() === value;
}

function mergeCommitSha(pullRequest) {
  if (typeof pullRequest?.mergeCommitSha === 'string') return pullRequest.mergeCommitSha;
  if (typeof pullRequest?.mergeCommit?.oid === 'string') return pullRequest.mergeCommit.oid;
  return null;
}

function assertMergedPullRequest(pullRequest, intent) {
  if (!isPlainObject(pullRequest) || !isPlainObject(intent)) {
    throw verificationError('input');
  }
  const merged =
    pullRequest.merged === true || String(pullRequest.state || '').toUpperCase() === 'MERGED';
  if (!merged) throw verificationError('pull-request-not-merged');
  if (pullRequest.number !== intent.prNumber) throw verificationError('pr-number');
  if (pullRequest.baseRefName !== intent.baseRef) throw verificationError('base-ref');
  if (pullRequest.headRefOid !== intent.expectedHeadSha) {
    throw verificationError('expected-head-sha');
  }
  const exposedMethod = pullRequest.mergeMethod;
  if (
    exposedMethod !== null &&
    exposedMethod !== undefined &&
    String(exposedMethod).toLowerCase() !== intent.mergeMethod
  ) {
    throw verificationError('merge-method');
  }
  const sha = mergeCommitSha(pullRequest);
  if (typeof sha !== 'string' || !SHA_RE.test(sha)) {
    throw verificationError('merge-commit-sha');
  }
  if (!isCanonicalInstant(pullRequest.mergedAt)) throw verificationError('merged-at');
  return { mergeCommitSha: sha, mergedAt: pullRequest.mergedAt };
}

export async function verifyDeliveredPullRequest(input = {}) {
  if (!hasExactKeys(input, VERIFICATION_INPUT_KEYS)) throw verificationError('input-keys');
  if (
    typeof input.fetchOriginTrunk !== 'function' ||
    typeof input.isAncestor !== 'function' ||
    typeof input.attributingCommits !== 'function' ||
    typeof input.recovery !== 'boolean'
  ) {
    throw verificationError('input');
  }
  const { intent, pullRequest } = input;
  const merged = assertMergedPullRequest(pullRequest, intent);
  if (!input.recovery) {
    if (!isCanonicalInstant(input.intentCreatedAt)) throw verificationError('intent-created-at');
    if (Date.parse(merged.mergedAt) < Date.parse(input.intentCreatedAt)) {
      throw verificationError('merge-before-intent');
    }
  }

  try {
    await input.fetchOriginTrunk({ remote: 'origin', branch: intent.baseRef });
  } catch (error) {
    throw verificationError('fetch-origin-trunk', error);
  }
  const verifiedTrunkRef = `origin/${intent.baseRef}`;
  let reachable;
  try {
    reachable = await input.isAncestor({
      ancestor: merged.mergeCommitSha,
      descendant: verifiedTrunkRef,
    });
  } catch (error) {
    throw verificationError('trunk-reachability', error);
  }
  if (reachable !== true) throw verificationError('trunk-reachability');

  for (const token of intent.attributionTokens ?? []) {
    const issueNumber = Number(String(token).replace(/^#/, ''));
    let commits;
    try {
      commits = await input.attributingCommits(issueNumber, { refs: [verifiedTrunkRef] });
    } catch (error) {
      throw verificationError('attribution', error);
    }
    if (!Array.isArray(commits) || commits.length === 0) {
      throw verificationError('attribution');
    }
  }

  return deepFreeze({
    receiptInput: {
      intentId: intent.intentId,
      issueNumber: intent.issueNumber,
      prNumber: intent.prNumber,
      expectedHeadSha: intent.expectedHeadSha,
      mergeCommitSha: merged.mergeCommitSha,
      baseRef: intent.baseRef,
      mergeMethod: intent.mergeMethod,
      verifiedTrunkRef,
      provider: intent.provider,
      sessionId: intent.sessionId,
      verifiedAt: merged.mergedAt,
    },
    recovery: input.recovery,
    branchDisposition: pullRequest.headRefDeleted === true ? 'deleted' : 'retained',
  });
}

function validProviderAction(value) {
  if (!isPlainObject(value) || Reflect.ownKeys(value).some((key) => typeof key !== 'string')) {
    return false;
  }
  try {
    return JSON.stringify(value) !== undefined && Object.keys(value).length > 0;
  } catch {
    return false;
  }
}

function validHttpsUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && url.username === '' && url.password === '';
  } catch {
    return false;
  }
}

export function buildDeliveryRealPrEvidence(input = {}) {
  if (!hasExactKeys(input, EVIDENCE_INPUT_KEYS)) throw evidenceError('input-keys');
  if (!REPOSITORY_RE.test(input.repository)) throw evidenceError('repository');
  if (!Number.isSafeInteger(input.issueNumber) || input.issueNumber <= 0) {
    throw evidenceError('issue-number');
  }
  if (!Number.isSafeInteger(input.prNumber) || input.prNumber <= 0) {
    throw evidenceError('pr-number');
  }
  if (!SHA_RE.test(input.sourceSha)) throw evidenceError('source-sha');
  if (!SHA_RE.test(input.mergeSha)) throw evidenceError('merge-sha');
  if (!validProviderAction(input.providerAction)) throw evidenceError('provider-action');
  if (typeof input.receiptCommentId !== 'string' || input.receiptCommentId.length === 0) {
    throw evidenceError('receipt-comment-id');
  }
  if (!validHttpsUrl(input.ciRunUrl)) throw evidenceError('ci-run-url');
  if (!['retained', 'deleted'].includes(input.branchDisposition)) {
    throw evidenceError('branch-disposition');
  }
  if (input.closeResult !== 'closed') throw evidenceError('close-result');
  return deepFreeze(
    structuredClone({
      schema: 'aitm.delivery-real-pr-evidence/v1',
      ...input,
    })
  );
}
