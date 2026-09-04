// @story #939
// Review-stage, re-entrant delivery-intent orchestration.

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

import { gql, splitRepo } from '../../gh/lib/github-projects.mjs';
import { loadState } from '../state.mjs';
import { currentSessionId, aiAppName } from '../word-counter.mjs';
import { fetchParentIssueStrict } from '../lib/fetch-parent-issue.mjs';
import { GH_API_TIMEOUT_MS, GIT_TIMEOUT_MS } from '../lib/process-timeouts.mjs';
import { isAgentReviewComplete } from '../lib/agent-review/review-gate.mjs';
import { parseReviewApprovedMarker, parseTestStartedMarker } from '../lib/markers.mjs';
import { parseVerificationReceipt } from '../lib/verification-receipt.mjs';
import { createRecordId } from '../lib/github-records/record-envelope.mjs';
import { canonicalRecordJson } from '../lib/github-records/canonical-json.mjs';
import { normalizeGitHubInstant } from '../lib/github-records/github-comment-store.mjs';
import { resolveGate, resolveReviewAuthorization } from '../lib/gate-resolve.mjs';
import {
  evaluateManualCodeReview,
  resolveManualCodeReviewer as resolveManualCodeReviewerPolicy,
} from '../lib/manual-code-review.mjs';
import { locateAuthoritySource } from '../lib/github-records/authority-locator.mjs';
import {
  hasAcceptedApprovalEvidence,
  hasAcceptedReviewEvidence,
  resolveLifecycleGateEvidence,
} from '../lib/github-records/lifecycle-gate-source.mjs';
import { loadSession } from '../lib/session-store.mjs';
import { rawProjectConfig } from '../config.mjs';
import {
  buildDeliveryIntent,
  buildDeliveryReceipt,
  parseDeliveryComment,
  parseDeliveryCommentForPullRequest,
  projectDeliveryRecords,
  renderDeliveryIntentComment,
  renderDeliveryReceiptComment,
} from '../lib/delivery-records.mjs';
import {
  validateDeliveryPreflight,
  validateHistoricalRecoveryPreflight,
  validateMergedDeliveryPreflight,
} from '../lib/delivery-preflight.mjs';
import {
  DeliveryAuthorityError,
  resolveAcceptedDeliveryAuthority,
} from '../lib/delivery-authority.mjs';
import {
  buildProviderAction,
  serializeProviderActionRequired,
} from '../lib/delivery-provider-action.mjs';
import {
  verifyDeliveredPullRequest,
  verifyExternalDeliveredPullRequest,
} from '../lib/delivery-verification.mjs';
import { attributingCommits as defaultAttributingCommits } from '../lib/commit-attribution.mjs';
import { isNoCommitKind, parseDeliverablePosted, parseIssueKind } from '../lib/issue-kind.mjs';
import {
  buildNoCommitDeliveryRecord,
  parseNoCommitDeliveryComment,
  projectNoCommitDeliveryRecords,
  renderNoCommitDeliveryComment,
  sameNoCommitDeliveryAuthority,
} from '../lib/no-commit-delivery-record.mjs';
import { selectEvidenceProtocol } from '../lib/evidence-v2/protocol.mjs';

const pexec = promisify(execFile);
const SHA_RE = /^[0-9a-f]{40}$/;
const MAX_PULL_REQUEST_SOURCE_COMMITS = 10_000;
const AUTHORIZED_INTENT_KEYS = Object.freeze([
  'attributionTokens',
  'baseRef',
  'commitMessage',
  'commitMessageSha256',
  'commitTitle',
  'commitTitleSha256',
  'headRef',
  'mergeMethod',
]);

function deliverError(category, cause) {
  return new TypeError(`deliver:${category}`, cause === undefined ? undefined : { cause });
}

function issueTarget(rest = []) {
  for (const token of rest) {
    const match = String(token).match(/^#?([1-9][0-9]*)$/);
    if (match) return Number(match[1]);
  }
  return null;
}

function baseRefFrom(cfg) {
  const value = String(cfg?.trunkRef || '');
  return value.split('/').at(-1) || '';
}

function bindingFromState({ branch, state }) {
  const active = Number(String(state?.active || '').replace(/^#/, ''));
  return {
    issueNumber: Number.isSafeInteger(active) && active > 0 ? active : 0,
    branch,
    timerState: state?.entryStartTs ? 'running' : 'paused',
  };
}

function isStructurallyInspectableSourceCommits(pullRequest) {
  const subjects = pullRequest?.sourceCommitSubjects;
  const commits = pullRequest?.sourceCommits;
  return (
    Array.isArray(subjects) &&
    Array.isArray(commits) &&
    commits.length > 0 &&
    subjects.length === commits.length &&
    pullRequest.sourceCommitsHeadSha === pullRequest.headRefOid &&
    commits.at(-1)?.oid === pullRequest.headRefOid &&
    commits.every((commit, index) => {
      if (commit === null || typeof commit !== 'object' || Array.isArray(commit)) return false;
      const keys = Object.keys(commit).sort();
      return (
        keys.length === 2 &&
        keys[0] === 'messageHeadline' &&
        keys[1] === 'oid' &&
        SHA_RE.test(commit.oid) &&
        commit.messageHeadline === subjects[index]
      );
    })
  );
}

function isUnattributedMergeCandidate(subject) {
  return typeof subject === 'string' && !subject.includes('[') && !subject.includes('#');
}

function matchesInspectedCommitTitle(observed, inspected) {
  if (observed === inspected) return true;
  if (typeof observed !== 'string' || typeof inspected !== 'string' || !observed.endsWith('…')) {
    return false;
  }
  const prefix = observed.slice(0, -1);
  return prefix.length >= 64 && inspected.length > prefix.length && inspected.startsWith(prefix);
}

async function classifySourceCommitSubjects(pullRequest, inspectSourceCommit) {
  const strictSubjects = pullRequest?.sourceCommitSubjects;
  if (!Array.isArray(strictSubjects)) {
    return { attributableSubjects: strictSubjects, verifiedMergeTitles: [] };
  }
  if (pullRequest?.sourceCommitsComplete !== true) {
    return { attributableSubjects: null, verifiedMergeTitles: [] };
  }
  if (!isStructurallyInspectableSourceCommits(pullRequest)) {
    return { attributableSubjects: null, verifiedMergeTitles: [] };
  }
  if (!strictSubjects.some(isUnattributedMergeCandidate)) {
    return { attributableSubjects: strictSubjects, verifiedMergeTitles: [] };
  }

  const attributableSubjects = [];
  const verifiedMergeTitles = [];
  for (const commit of pullRequest.sourceCommits) {
    if (!isUnattributedMergeCandidate(commit.messageHeadline)) {
      attributableSubjects.push(commit.messageHeadline);
      continue;
    }
    let inspection = null;
    try {
      inspection = await inspectSourceCommit({ commitSha: commit.oid });
    } catch {
      // Preserve the subject so the existing attribution parser fails closed.
    }
    const parents = inspection?.parents;
    const verifiedMerge =
      matchesInspectedCommitTitle(commit.messageHeadline, inspection?.commitTitle) &&
      Array.isArray(parents) &&
      parents.length >= 2 &&
      parents.every((parent) => SHA_RE.test(parent)) &&
      new Set(parents).size === parents.length;
    if (verifiedMerge) {
      verifiedMergeTitles.push(inspection.commitTitle);
    } else {
      attributableSubjects.push(commit.messageHeadline);
    }
  }
  return { attributableSubjects, verifiedMergeTitles };
}

export async function mergedSourceCommitSubjects(pullRequest, inspectSourceCommit) {
  return (await classifySourceCommitSubjects(pullRequest, inspectSourceCommit))
    .attributableSubjects;
}

export async function openSourceCommitSubjects(localSubjects, pullRequest, inspectSourceCommit) {
  if (!Array.isArray(localSubjects)) return localSubjects;
  const { verifiedMergeTitles } = await classifySourceCommitSubjects(
    pullRequest,
    inspectSourceCommit
  );
  const remaining = new Map();
  for (const title of verifiedMergeTitles) {
    remaining.set(title, (remaining.get(title) ?? 0) + 1);
  }
  return localSubjects.filter((subject) => {
    const count = remaining.get(subject) ?? 0;
    if (count === 0) return true;
    remaining.set(subject, count - 1);
    return false;
  });
}

function validateLineageResult(lineage) {
  const parent = lineage?.parentIssueNumber;
  if (
    lineage === null ||
    typeof lineage !== 'object' ||
    Array.isArray(lineage) ||
    !Object.hasOwn(lineage, 'parentIssueNumber') ||
    !Object.hasOwn(lineage, 'deliveryTarget') ||
    (parent !== null && (!Number.isSafeInteger(parent) || parent <= 0)) ||
    typeof lineage.deliveryTarget !== 'string' ||
    lineage.deliveryTarget.length === 0
  ) {
    throw deliverError('lineage');
  }
  return lineage;
}

export function parsedDeliveryRecords(comments, context) {
  if (!Array.isArray(comments)) throw deliverError('comments');
  return comments
    .map((comment) => parseDeliveryCommentForPullRequest(comment, context))
    .filter((record) => record !== null);
}

function authorizedIntentBytes(intent) {
  return canonicalRecordJson(
    Object.fromEntries(AUTHORIZED_INTENT_KEYS.map((key) => [key, intent[key]]))
  );
}

function buildIntentFromPreflight({
  preflight,
  cfg,
  intentId,
  supersedesIntentId,
  provider,
  sessionId,
  clientCreatedAt,
  commitTitle = preflight.commitText.commitTitle,
  commitMessage = preflight.commitText.commitMessage,
}) {
  return buildDeliveryIntent({
    intentId,
    supersedesIntentId,
    issueNumber: preflight.issue.number,
    repository: cfg.repo,
    prNumber: preflight.pr.number,
    baseRef: preflight.pr.baseRefName,
    headRef: preflight.pr.headRefName,
    expectedHeadSha: preflight.expectedHeadSha,
    mergeMethod: preflight.mergeMethod,
    attributionTokens: preflight.commitText.attributionTokens,
    commitTitle,
    commitMessage,
    provider,
    sessionId,
    clientCreatedAt,
  });
}

function buildExternalIntentInput({ preflight, cfg, intentId, sessionId, clientCreatedAt }) {
  return {
    intentId,
    supersedesIntentId: null,
    issueNumber: preflight.issue.number,
    repository: cfg.repo,
    prNumber: preflight.pr.number,
    baseRef: preflight.pr.baseRefName,
    headRef: preflight.pr.headRefName,
    expectedHeadSha: preflight.expectedHeadSha,
    mergeMethod: preflight.mergeMethod,
    attributionTokens: preflight.commitText.attributionTokens,
    provider: 'external',
    sessionId,
    clientCreatedAt,
  };
}

async function readProjection({ deps, issueNumber, context }) {
  const comments = await deps.listIssueComments({
    issueNumber,
    repository: context.repository,
  });
  const records = parsedDeliveryRecords(comments, context);
  return { comments, projection: projectDeliveryRecords(records) };
}

function exactReadback(comments, intent, body) {
  return comments.some((comment) => {
    if (comment?.body !== body) return false;
    const parsed = parseDeliveryComment(comment, {
      repository: intent.repository,
      issueNumber: intent.issueNumber,
      prNumber: intent.prNumber,
    });
    return parsed?.record?.intentId === intent.intentId;
  });
}

function exactReceiptReadback(comments, receipt, body) {
  return comments.some((comment) => {
    if (comment?.body !== body) return false;
    const parsed = parseDeliveryComment(comment, {
      repository: receipt.repository,
      issueNumber: receipt.record.issueNumber,
      prNumber: receipt.record.prNumber,
    });
    return parsed?.record?.intentId === receipt.record.intentId;
  });
}

function pullRequestMerged(pullRequest) {
  return (
    pullRequest?.merged === true || String(pullRequest?.state || '').toUpperCase() === 'MERGED'
  );
}

async function appendIntent({ deps, issueNumber, repository, context, intent }) {
  const body = renderDeliveryIntentComment(intent);
  let createError = null;
  try {
    await requiredDependency(deps, 'createIssueComment')({ issueNumber, repository, body });
  } catch (error) {
    createError = error;
  }
  const readback = await readProjection({ deps, issueNumber, context });
  if (
    readback.projection.liveIntent?.record.intentId !== intent.intentId ||
    !exactReadback(readback.comments, intent, body)
  ) {
    if (createError !== null) throw deliverError('comment-create-ambiguous', createError);
    throw deliverError('comment-readback');
  }
  if (
    authorizedIntentBytes(readback.projection.liveIntent.record) !== authorizedIntentBytes(intent)
  ) {
    throw deliverError('intent-divergence');
  }
  return readback.projection.liveIntent;
}

async function verifyAndFinalize({
  deps,
  issueNumber,
  repository,
  context,
  liveIntent,
  matchingReceipt,
  pullRequest,
  recovery,
  mode,
  acceptedSha,
  localHeadSha,
  testReceiptSha,
  acceptedReviewSha,
  verified,
}) {
  const verification =
    verified ??
    (await verifyDeliveredPullRequest({
      acceptedSha,
      intent: liveIntent.record,
      intentCreatedAt: liveIntent.createdAt,
      pullRequest,
      recovery,
      localHeadSha,
      testReceiptSha,
      acceptedReviewSha,
      fetchOriginTrunk: requiredDependency(deps, 'fetchOriginTrunk'),
      isAncestor: requiredDependency(deps, 'isAncestor'),
      inspectMergeCommit: requiredDependency(deps, 'inspectMergeCommit'),
      attributingCommits: requiredDependency(deps, 'attributingCommits'),
    }));
  const receipt = buildDeliveryReceipt(verification.receiptInput);
  if (matchingReceipt !== null) {
    if (canonicalRecordJson(matchingReceipt.record) !== canonicalRecordJson(receipt)) {
      throw deliverError('receipt-divergence');
    }
    return {
      status: 'already-delivered',
      mode,
      intent: liveIntent.record,
      receipt: matchingReceipt.record,
      action: null,
      recovery,
      branchDisposition: verification.branchDisposition,
    };
  }

  const receiptBody = renderDeliveryReceiptComment(receipt);
  let createError = null;
  try {
    await requiredDependency(
      deps,
      'createIssueComment'
    )({ issueNumber, repository, body: receiptBody });
  } catch (error) {
    createError = error;
  }
  const readback = await readProjection({ deps, issueNumber, context });
  const readbackReceipt = readback.projection.matchingReceipt;
  const receiptWithContext = { repository, record: receipt };
  if (
    readbackReceipt === null ||
    canonicalRecordJson(readbackReceipt.record) !== canonicalRecordJson(receipt) ||
    !exactReceiptReadback(readback.comments, receiptWithContext, receiptBody)
  ) {
    if (createError !== null) throw deliverError('receipt-create-ambiguous', createError);
    throw deliverError('receipt-readback');
  }
  return {
    status: 'delivered',
    mode,
    intent: liveIntent.record,
    receipt: readbackReceipt.record,
    action: null,
    recovery,
    branchDisposition: verification.branchDisposition,
  };
}

function requiredDependency(deps, name) {
  const dependency = deps?.[name];
  if (typeof dependency !== 'function') throw deliverError(`missing-dependency:${name}`);
  return dependency;
}

async function deliverNoCommit({ deps, issue, issueNumber, cfg }) {
  const deliverable = parseDeliverablePosted(issue.body);
  if (!deliverable) throw new TypeError('delivery-preflight:no-commit-deliverable');
  if (String(issue.projectState || '').toLowerCase() !== 'review') {
    throw new TypeError('delivery-preflight:issue-state');
  }
  const getLocalHeadSha = requiredDependency(deps, 'getLocalHeadSha');
  const resolveTestReceiptSha = requiredDependency(deps, 'resolveTestReceiptSha');
  const resolveAcceptedReviewSha = requiredDependency(deps, 'resolveAcceptedReviewSha');
  const resolveAgentReviewPassed =
    typeof deps.resolveAgentReviewPassed === 'function'
      ? deps.resolveAgentReviewPassed
      : async () => issue.agentReviewPassed === true;
  const [localHeadSha, testReceiptSha] = await Promise.all([
    getLocalHeadSha(),
    resolveTestReceiptSha({ issue, issueNumber }),
  ]);
  const [acceptedReviewSha, agentReviewPassed] = await Promise.all([
    resolveAcceptedReviewSha({ issue, issueNumber, expectedHeadSha: testReceiptSha }),
    resolveAgentReviewPassed({ issue, issueNumber }),
  ]);
  if (
    agentReviewPassed !== true ||
    !SHA_RE.test(localHeadSha || '') ||
    !SHA_RE.test(testReceiptSha || '') ||
    testReceiptSha !== acceptedReviewSha
  ) {
    throw new TypeError('delivery-preflight:no-commit-review-evidence');
  }
  const authorization = await requiredDependency(
    deps,
    'resolveReviewAuthorization'
  )({
    issue,
    issueNumber,
    expectedHeadSha: acceptedReviewSha,
    acceptedReviewSha,
  });
  if (!authorization || authorization.mode === 'missing') {
    throw new TypeError('delivery-preflight:review-authorization');
  }
  const expected = buildNoCommitDeliveryRecord({
    recordId: requiredDependency(deps, 'createIntentId')(),
    repository: cfg.repo,
    issueNumber,
    issueKind: parseIssueKind(issue.body),
    deliverableUrl: deliverable.url,
    acceptedSha: acceptedReviewSha,
    provider: requiredDependency(deps, 'providerId')(),
    sessionId: requiredDependency(deps, 'sessionId')(),
    verifiedAt: requiredDependency(deps, 'now')(),
  });
  const listRecords = async () => {
    const comments = await requiredDependency(
      deps,
      'listIssueComments'
    )({
      issueNumber,
      repository: cfg.repo,
    });
    if (!Array.isArray(comments)) throw deliverError('comments');
    return {
      comments,
      projection: projectNoCommitDeliveryRecords(
        comments.map(parseNoCommitDeliveryComment).filter(Boolean)
      ),
    };
  };
  const initial = await listRecords();
  if (initial.projection.record) {
    if (!sameNoCommitDeliveryAuthority(initial.projection.record.record, expected)) {
      throw deliverError('no-commit-record-conflict');
    }
    return {
      status: 'already-delivered',
      mode: 'no-commit',
      intent: null,
      receipt: initial.projection.record.record,
      action: null,
    };
  }
  const body = renderNoCommitDeliveryComment(expected);
  let createError = null;
  try {
    await requiredDependency(
      deps,
      'createIssueComment'
    )({
      issueNumber,
      repository: cfg.repo,
      body,
    });
  } catch (error) {
    createError = error;
  }
  const readback = await listRecords();
  const record = readback.projection.record;
  const exact = readback.comments.some(
    (comment) =>
      comment.body === body &&
      parseNoCommitDeliveryComment(comment)?.record.recordId === expected.recordId
  );
  if (!record || !sameNoCommitDeliveryAuthority(record.record, expected) || !exact) {
    if (createError) throw deliverError('comment-create-ambiguous', createError);
    throw deliverError('comment-readback');
  }
  return {
    status: 'delivered',
    mode: 'no-commit',
    intent: null,
    receipt: record.record,
    action: null,
  };
}

export async function runDeliver({ issueNumber, cfg, state, deps = {} } = {}) {
  if (!Number.isSafeInteger(Number(issueNumber)) || Number(issueNumber) <= 0) {
    throw deliverError('issue-number');
  }
  if (!cfg || typeof cfg.repo !== 'string' || cfg.repo.length === 0) {
    throw deliverError('configuration');
  }
  issueNumber = Number(issueNumber);

  const fetchIssue = requiredDependency(deps, 'fetchIssue');
  const resolveLineage = requiredDependency(deps, 'resolveLineage');
  const issue = await fetchIssue({ issueNumber, repository: cfg.repo });
  const lineage = validateLineageResult(
    await resolveLineage({ issueNumber, repository: cfg.repo, issue })
  );
  if (lineage?.parentIssueNumber !== null) {
    return {
      status: 'not-provider-delivery',
      reason: 'child-lineage',
      intent: null,
      receipt: null,
      action: null,
    };
  }

  const protocol = selectEvidenceProtocol({ body: issue.body, context: deps.executionContext });
  if (protocol.protocol === 'v2') {
    return requiredDependency(
      deps,
      'runEvidenceV2Delivery'
    )({
      issue,
      issueNumber,
      repository: cfg.repo,
      lineage,
      protocol,
      state,
    });
  }

  const getCurrentBranch = requiredDependency(deps, 'getCurrentBranch');
  const listPullRequests = requiredDependency(deps, 'listPullRequests');
  const branch = await getCurrentBranch();
  const pullRequestRefs = await listPullRequests({
    repository: cfg.repo,
    headRef: branch,
  });
  if (!Array.isArray(pullRequestRefs)) throw deliverError('pull-requests');

  if (isNoCommitKind(issue.body) && pullRequestRefs.length === 0) {
    return deliverNoCommit({ deps, issue, issueNumber, cfg });
  }

  const getLocalHeadSha = requiredDependency(deps, 'getLocalHeadSha');
  const resolveTestReceiptSha = requiredDependency(deps, 'resolveTestReceiptSha');
  const resolveAcceptedReviewSha = requiredDependency(deps, 'resolveAcceptedReviewSha');
  const resolveAgentReviewPassed =
    typeof deps.resolveAgentReviewPassed === 'function'
      ? deps.resolveAgentReviewPassed
      : async () => issue.agentReviewPassed === true;
  const fetchPullRequest = requiredDependency(deps, 'fetchPullRequest');
  const fetchRequiredChecks = requiredDependency(deps, 'fetchRequiredChecks');
  const fetchRepositoryMergeMethods = requiredDependency(deps, 'fetchRepositoryMergeMethods');
  const listCommitSubjects = requiredDependency(deps, 'listCommitSubjects');
  const listDirtyPaths = requiredDependency(deps, 'listDirtyPaths');
  const providerId = requiredDependency(deps, 'providerId');
  const sessionId = requiredDependency(deps, 'sessionId');
  const now = requiredDependency(deps, 'now');
  const createIntentId = requiredDependency(deps, 'createIntentId');

  const localHeadSha = await getLocalHeadSha();
  const testReceiptSha = await resolveTestReceiptSha({ issue, issueNumber });
  const [acceptedReviewSha, agentReviewPassed] = await Promise.all([
    resolveAcceptedReviewSha({ issue, issueNumber, expectedHeadSha: testReceiptSha }),
    resolveAgentReviewPassed({ issue, issueNumber, expectedHeadSha: testReceiptSha }),
  ]);
  if (agentReviewPassed !== true) {
    throw new TypeError('delivery-preflight:agent-review-evidence');
  }
  const pullRequests = await Promise.all(
    pullRequestRefs.map(({ number }) =>
      fetchPullRequest({ repository: cfg.repo, prNumber: Number(number) })
    )
  );
  let authority;
  try {
    authority = resolveAcceptedDeliveryAuthority({
      issueNumber,
      branch,
      localHeadSha,
      testReceiptSha,
      reviewReceiptSha: acceptedReviewSha,
      agentReviewPassed,
      pullRequests,
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
    throw new TypeError(`delivery-preflight:${category}`, { cause: error });
  }
  const selectedPullRequest = authority.pullRequest;
  const mergedPullRequest = pullRequestMerged(selectedPullRequest);
  const [repositoryMergeMethods, dirtyPaths] = await Promise.all([
    fetchRepositoryMergeMethods({ repository: cfg.repo }),
    listDirtyPaths({ issueNumber }),
  ]);
  const reviewAuthorization = await requiredDependency(
    deps,
    'resolveReviewAuthorization'
  )({
    issue,
    issueNumber,
    expectedHeadSha: authority.acceptedSha,
    acceptedReviewSha,
  });
  const assignee =
    typeof cfg.assignee === 'string' && cfg.assignee !== '@me' && cfg.assignee.length > 0
      ? cfg.assignee
      : await requiredDependency(deps, 'getAuthenticatedLogin')();
  const deliveryConfig = {
    ...cfg,
    assignee,
    repositoryMergeMethods,
  };
  const context = {
    repository: cfg.repo,
    issueNumber,
    prNumber: selectedPullRequest.number,
  };
  const initial = await readProjection({ deps, issueNumber, context });
  const live = initial.projection.liveIntent;
  const commitSubjects = mergedPullRequest
    ? await mergedSourceCommitSubjects(selectedPullRequest, deps.inspectSourceCommit)
    : await openSourceCommitSubjects(
        await listCommitSubjects({ range: 'origin/trunk..HEAD' }),
        selectedPullRequest,
        deps.inspectSourceCommit
      );
  const preflightInput = {
    issue: { ...issue, agentReviewPassed, reviewAuthorization },
    binding: bindingFromState({ branch, state }),
    lineage,
    pullRequests,
    localHeadSha,
    testReceiptSha,
    acceptedReviewSha,
    dirtyPaths,
    config: deliveryConfig,
    commitSubjects,
  };
  if (authority.headRelation === 'advanced') {
    const historical = validateHistoricalRecoveryPreflight({
      ...preflightInput,
      intent: live?.record ?? null,
    });
    return verifyAndFinalize({
      deps,
      issueNumber,
      repository: cfg.repo,
      context,
      liveIntent: live,
      matchingReceipt: initial.projection.matchingReceipt,
      pullRequest: historical.pr,
      recovery: true,
      mode: 'historical-recovery',
      acceptedSha: historical.acceptedSha,
      localHeadSha: historical.observedLocalHeadSha,
      testReceiptSha,
      acceptedReviewSha,
    });
  }

  const checks = await fetchRequiredChecks({
    repository: cfg.repo,
    prNumber: selectedPullRequest.number,
    expectedHeadSha: authority.acceptedSha,
  });
  const preflight = mergedPullRequest
    ? validateMergedDeliveryPreflight({ ...preflightInput, checks })
    : validateDeliveryPreflight({ ...preflightInput, checks });
  const manualCodeReviewEnabled = await (
    deps.resolvePullRequestReviewGate ?? (async () => false)
  )();
  if (manualCodeReviewEnabled === true) {
    const reviewerLogin = await requiredDependency(
      deps,
      'resolveManualCodeReviewer'
    )({
      configuredReviewer: cfg.manualCodeReviewer,
    });
    const reviewEvidence = await requiredDependency(
      deps,
      'fetchManualCodeReviewEvidence'
    )({
      repository: cfg.repo,
      prNumber: selectedPullRequest.number,
      expectedHeadSha: authority.acceptedSha,
    });
    const decision = evaluateManualCodeReview({
      gateEnabled: true,
      expectedHeadSha: authority.acceptedSha,
      reviewerLogin,
      pullRequest: reviewEvidence,
    });
    if (decision.status === 'refused') {
      throw new TypeError(`delivery-preflight:manual-code-review-${decision.reason}`);
    }
    if (decision.status !== 'authorized') {
      if (mergedPullRequest) {
        throw new TypeError('delivery-preflight:manual-code-review-approval-missing');
      }
      let reviewRequested = false;
      if (decision.status === 'request-review') {
        await requiredDependency(
          deps,
          'requestPullRequestReview'
        )({
          repository: cfg.repo,
          prNumber: selectedPullRequest.number,
          reviewerLogin,
        });
        reviewRequested = true;
      }
      return {
        status: 'manual-review-required',
        reason: decision.reason,
        prNumber: selectedPullRequest.number,
        reviewerLogin,
        expectedHeadSha: authority.acceptedSha,
        reviewRequested,
      };
    }
  }
  if (mergedPullRequest) {
    let liveIntent = live;
    let recovery = liveIntent?.record.provider === 'external';
    if (liveIntent !== null) {
      const expected = buildIntentFromPreflight({
        preflight,
        cfg,
        intentId: liveIntent.record.intentId,
        supersedesIntentId: liveIntent.record.supersedesIntentId,
        provider: liveIntent.record.provider,
        sessionId: liveIntent.record.sessionId,
        clientCreatedAt: liveIntent.record.clientCreatedAt,
        ...(recovery
          ? {
              commitTitle: liveIntent.record.commitTitle,
              commitMessage: liveIntent.record.commitMessage,
            }
          : {}),
      });
      if (authorizedIntentBytes(expected) !== authorizedIntentBytes(liveIntent.record)) {
        throw deliverError('intent-divergence');
      }
    }
    if (liveIntent === null) {
      recovery = true;
      const verified = await verifyExternalDeliveredPullRequest({
        intentInput: buildExternalIntentInput({
          preflight,
          cfg,
          intentId: createIntentId(),
          sessionId: sessionId(),
          clientCreatedAt: selectedPullRequest.mergedAt,
        }),
        pullRequest: selectedPullRequest,
        acceptedSha: authority.acceptedSha,
        localHeadSha,
        testReceiptSha,
        acceptedReviewSha,
        fetchOriginTrunk: requiredDependency(deps, 'fetchOriginTrunk'),
        isAncestor: requiredDependency(deps, 'isAncestor'),
        inspectMergeCommit: requiredDependency(deps, 'inspectMergeCommit'),
        attributingCommits: requiredDependency(deps, 'attributingCommits'),
      });
      const recoveryIntent = verified.intent;
      liveIntent = await appendIntent({
        deps,
        issueNumber,
        repository: cfg.repo,
        context,
        intent: recoveryIntent,
      });
      return verifyAndFinalize({
        deps,
        issueNumber,
        repository: cfg.repo,
        context,
        liveIntent,
        matchingReceipt: null,
        pullRequest: selectedPullRequest,
        recovery,
        mode: 'current-head',
        acceptedSha: authority.acceptedSha,
        localHeadSha,
        testReceiptSha,
        acceptedReviewSha,
        verified,
      });
    }
    return verifyAndFinalize({
      deps,
      issueNumber,
      repository: cfg.repo,
      context,
      liveIntent,
      matchingReceipt: initial.projection.matchingReceipt,
      pullRequest: selectedPullRequest,
      recovery,
      mode: 'current-head',
      acceptedSha: authority.acceptedSha,
      localHeadSha,
      testReceiptSha,
      acceptedReviewSha,
    });
  }
  if (initial.projection.matchingReceipt !== null) {
    throw deliverError('receipt-on-open-pr');
  }

  if (live?.record.expectedHeadSha === preflight.expectedHeadSha) {
    const expected = buildIntentFromPreflight({
      preflight,
      cfg,
      intentId: live.record.intentId,
      supersedesIntentId: live.record.supersedesIntentId,
      provider: live.record.provider,
      sessionId: live.record.sessionId,
      clientCreatedAt: live.record.clientCreatedAt,
    });
    if (authorizedIntentBytes(expected) !== authorizedIntentBytes(live.record)) {
      throw deliverError('intent-divergence');
    }
    return {
      status: 'action-required',
      mode: 'current-head',
      intent: live.record,
      action: buildProviderAction(live.record),
    };
  }

  const intent = buildIntentFromPreflight({
    preflight,
    cfg,
    intentId: createIntentId(),
    supersedesIntentId: live?.record.intentId ?? null,
    provider: providerId(),
    sessionId: sessionId(),
    clientCreatedAt: now(),
  });
  const readbackIntent = await appendIntent({
    deps,
    issueNumber,
    repository: cfg.repo,
    context,
    intent,
  });

  return {
    status: 'action-required',
    mode: 'current-head',
    intent: readbackIntent.record,
    action: buildProviderAction(readbackIntent.record),
  };
}

function normalizeIssue(issue, projectState) {
  const body = String(issue?.body || '');
  return {
    number: Number(issue?.number),
    state: issue?.state,
    projectState: String(projectState || '').toLowerCase() === 'review' ? 'Review' : projectState,
    assignees: Array.isArray(issue?.assignees)
      ? issue.assignees.map(({ login }) => login).filter(Boolean)
      : [],
    agentReviewPassed: isAgentReviewComplete(body),
    body,
  };
}

function checkRollup(rollup, expectedHeadSha) {
  if (!Array.isArray(rollup)) return { readable: false, required: [] };
  return {
    readable: true,
    required: rollup.map((check) => {
      const state = String(check?.state || '').toUpperCase();
      return {
        name: String(check?.name || ''),
        headSha: expectedHeadSha,
        status: state === 'SUCCESS' ? 'COMPLETED' : state,
        conclusion: state,
      };
    }),
  };
}

export function createDefaultDeliverDeps(ctx, { exec = pexec } = {}) {
  const run = async (command, args, options = {}) =>
    exec(command, args, {
      cwd: ctx.projectDir,
      encoding: 'utf8',
      timeout: command === 'git' ? GIT_TIMEOUT_MS : GH_API_TIMEOUT_MS,
      maxBuffer: 8 * 1024 * 1024,
      ...options,
    });
  const json = async (command, args, options) => {
    const { stdout } = await run(command, args, options);
    return JSON.parse(String(stdout || 'null'));
  };
  const requiredChecksJson = async (args) => {
    try {
      return await json('gh', args);
    } catch (error) {
      const exitCode = Number(error?.code);
      if (exitCode === 8 && typeof error?.stdout === 'string') {
        return JSON.parse(error.stdout);
      }
      const diagnostic = `${String(error?.stderr || '')}\n${String(error?.message || '')}`;
      if (
        exitCode === 1 &&
        /(?:^|\n)no required checks reported on the '[^'\r\n]+' branch(?:\r?\n|$)/i.test(diagnostic)
      ) {
        return [];
      }
      throw error;
    }
  };
  const { owner, repoName } = splitRepo(ctx.cfg.repo);
  const fetchCompletePullRequestCommits = async (prNumber, expectedHeadSha) => {
    const query = `query($owner:String!,$repo:String!,$pr:Int!,$cursor:String){repository(owner:$owner,name:$repo){pullRequest(number:$pr){headRefOid commits(first:100,after:$cursor){totalCount nodes{commit{oid messageHeadline message parents(first:100){totalCount nodes{oid} pageInfo{hasNextPage}} tree{oid}}} pageInfo{hasNextPage endCursor}}}}}`;
    const commits = [];
    const evidence = [];
    const seenCommitShas = new Set();
    const seenCursors = new Set();
    let cursor = null;
    let expectedTotal = null;
    for (;;) {
      const args = [
        'api',
        'graphql',
        '-f',
        `query=${query}`,
        '-f',
        `owner=${owner}`,
        '-f',
        `repo=${repoName}`,
        '-F',
        `pr=${prNumber}`,
      ];
      if (cursor !== null) args.push('-f', `cursor=${cursor}`);
      const payload = await json('gh', args);
      const pullRequest = payload?.data?.repository?.pullRequest;
      const connection = pullRequest?.commits;
      const totalCount = connection?.totalCount;
      const nodes = connection?.nodes;
      const pageInfo = connection?.pageInfo;
      if (
        !Number.isSafeInteger(totalCount) ||
        totalCount < 1 ||
        totalCount > MAX_PULL_REQUEST_SOURCE_COMMITS ||
        !Array.isArray(nodes) ||
        nodes.length > 100 ||
        typeof pageInfo?.hasNextPage !== 'boolean' ||
        !SHA_RE.test(expectedHeadSha || '') ||
        pullRequest?.headRefOid !== expectedHeadSha
      ) {
        throw deliverError('pull-request-commits');
      }
      if (expectedTotal === null) expectedTotal = totalCount;
      else if (expectedTotal !== totalCount) throw deliverError('pull-request-commits');
      for (const node of nodes) {
        const commit = node?.commit;
        const parents = commit?.parents;
        const parentNodes = parents?.nodes;
        if (
          !SHA_RE.test(commit?.oid || '') ||
          typeof commit?.messageHeadline !== 'string' ||
          commit.messageHeadline.length === 0 ||
          typeof commit?.message !== 'string' ||
          commit.message.length === 0 ||
          !Number.isSafeInteger(parents?.totalCount) ||
          parents.totalCount < 0 ||
          parents.totalCount > 100 ||
          !Array.isArray(parentNodes) ||
          parentNodes.length !== parents.totalCount ||
          parents?.pageInfo?.hasNextPage !== false ||
          parentNodes.some((parent) => !SHA_RE.test(parent?.oid || '')) ||
          !SHA_RE.test(commit?.tree?.oid || '') ||
          seenCommitShas.has(commit.oid)
        ) {
          throw deliverError('pull-request-commits');
        }
        seenCommitShas.add(commit.oid);
        commits.push({ oid: commit.oid, messageHeadline: commit.messageHeadline });
        evidence.push({
          oid: commit.oid,
          message: commit.message,
          parents: parentNodes.map(({ oid }) => oid),
          tree: commit.tree.oid,
        });
      }
      if (commits.length > expectedTotal) throw deliverError('pull-request-commits');
      if (!pageInfo.hasNextPage) {
        if (commits.length !== expectedTotal || commits.at(-1)?.oid !== expectedHeadSha) {
          throw deliverError('pull-request-commits');
        }
        return { commits, evidence };
      }
      const nextCursor = pageInfo.endCursor;
      if (
        nodes.length === 0 ||
        typeof nextCursor !== 'string' ||
        nextCursor.length === 0 ||
        seenCursors.has(nextCursor)
      ) {
        throw deliverError('pull-request-commits');
      }
      seenCursors.add(nextCursor);
      cursor = nextCursor;
    }
  };
  const directoryEvidence = new Map();
  const resolveDirectoryEvidence = async ({ issue, issueNumber, expectedHeadSha }) => {
    const source = (ctx.locateAuthoritySource || locateAuthoritySource)({
      issueBody: issue.body,
    });
    if (source.kind !== 'github-records/v1') return null;
    const key = `${issueNumber}:${expectedHeadSha}`;
    if (!directoryEvidence.has(key)) {
      directoryEvidence.set(
        key,
        (ctx.resolveLifecycleEvidence || resolveLifecycleGateEvidence)({
          repository: ctx.cfg.repo,
          issue: Number(issueNumber),
          issueBody: issue.body,
          expectedSha: expectedHeadSha,
          graphql:
            ctx.graphql ||
            (({ query, variables }) => gql(query, variables).then((data) => ({ data }))),
          readContractRecord: ctx.readContractRecord,
          deps: ctx.listIssueRecords ? { listIssueRecords: ctx.listIssueRecords } : undefined,
        })
      );
    }
    return directoryEvidence.get(key);
  };
  const inspectCommitObject = async (commitSha) => {
    const { stdout } = await run('git', ['cat-file', 'commit', commitSha]);
    const raw = String(stdout || '');
    const separator = raw.indexOf('\n\n');
    if (separator < 0) throw deliverError('commit-object');
    const headers = raw.slice(0, separator).split('\n');
    const trees = headers
      .filter((line) => line.startsWith('tree '))
      .map((line) => line.slice('tree '.length));
    if (trees.length !== 1 || !SHA_RE.test(trees[0])) throw deliverError('commit-object');
    const message = raw.slice(separator + 2).replace(/\n$/, '');
    const [commitTitle, ...bodyLines] = message.split('\n');
    const commitMessage =
      bodyLines[0] === '' ? bodyLines.slice(1).join('\n') : bodyLines.join('\n');
    return {
      parents: headers
        .filter((line) => line.startsWith('parent '))
        .map((line) => line.slice('parent '.length)),
      tree: trees[0],
      commitTitle,
      commitMessage,
    };
  };

  return {
    async resolvePullRequestReviewGate() {
      return resolveGate('pullRequestReview', {
        session: (ctx.loadCurrentSession || (() => loadSession(currentSessionId())))(),
        projectConfig: (ctx.loadRawProjectConfig || rawProjectConfig)(),
      });
    },
    async resolveManualCodeReviewer({ configuredReviewer }) {
      const authenticatedLogin = await (async () => {
        const { stdout } = await run('gh', ['api', 'user', '--jq', '.login']);
        return String(stdout || '').trim();
      })();
      const reviewerLogin = resolveManualCodeReviewerPolicy({
        configuredReviewer,
        authenticatedLogin,
      });
      const account = await json('gh', ['api', `users/${encodeURIComponent(reviewerLogin)}`]);
      if (
        String(account?.login || '').toLowerCase() !== reviewerLogin.toLowerCase() ||
        account?.type !== 'User'
      ) {
        throw new TypeError(
          `manual-code-review:${account?.type === 'Bot' ? 'reviewer-bot' : 'reviewer-unresolved'}`
        );
      }
      return reviewerLogin;
    },
    async fetchManualCodeReviewEvidence({ prNumber, expectedHeadSha }) {
      const query = `query($owner:String!,$repo:String!,$pr:Int!){repository(owner:$owner,name:$repo){pullRequest(number:$pr){headRefOid author{login __typename} reviewRequests(first:100){nodes{requestedReviewer{__typename ... on User{login}}} pageInfo{hasNextPage}} reviews(first:100){nodes{author{login __typename} state submittedAt commit{oid}} pageInfo{hasNextPage}}}}}`;
      const payload = await json('gh', [
        'api',
        'graphql',
        '-f',
        `query=${query}`,
        '-f',
        `owner=${owner}`,
        '-f',
        `repo=${repoName}`,
        '-F',
        `pr=${prNumber}`,
      ]);
      const pr = payload?.data?.repository?.pullRequest;
      if (
        pr?.headRefOid !== expectedHeadSha ||
        pr?.reviewRequests?.pageInfo?.hasNextPage !== false ||
        pr?.reviews?.pageInfo?.hasNextPage !== false
      ) {
        return null;
      }
      return {
        number: Number(prNumber),
        author: {
          login: pr.author?.login,
          isBot: pr.author?.__typename === 'Bot',
        },
        reviewRequests: (pr.reviewRequests?.nodes ?? []).map(({ requestedReviewer }) => ({
          login: requestedReviewer?.login,
          isBot: requestedReviewer?.__typename === 'Bot',
        })),
        reviews: (pr.reviews?.nodes ?? []).map((review) => ({
          authorLogin: review?.author?.login,
          authorIsBot: review?.author?.__typename === 'Bot',
          state: review?.state,
          commitOid: review?.commit?.oid,
          submittedAt: review?.submittedAt,
        })),
      };
    },
    async requestPullRequestReview({ prNumber, reviewerLogin }) {
      await run('gh', [
        'api',
        '--method',
        'POST',
        `repos/${owner}/${repoName}/pulls/${prNumber}/requested_reviewers`,
        '-f',
        `reviewers[]=${reviewerLogin}`,
      ]);
    },
    async resolveReviewAuthorization({ issue, issueNumber, expectedHeadSha, acceptedReviewSha }) {
      const lifecycleEvidence = await resolveDirectoryEvidence({
        issue,
        issueNumber,
        expectedHeadSha,
      });
      const approval = parseReviewApprovedMarker(issue.body);
      const directoryLane = lifecycleEvidence !== null;
      return resolveReviewAuthorization({
        session: (ctx.loadCurrentSession || (() => loadSession(currentSessionId())))(),
        projectConfig: (ctx.loadRawProjectConfig || rawProjectConfig)(),
        acceptedHeadSha: acceptedReviewSha === expectedHeadSha ? expectedHeadSha : null,
        humanApprovalEvidence:
          directoryLane && hasAcceptedApprovalEvidence(lifecycleEvidence, { provenance: 'human' })
            ? {
                accepted: true,
                approvedSha: lifecycleEvidence.expectedSha,
                source: 'directory-human-evidence',
              }
            : !directoryLane && approval && !approval.fullAuto
              ? { accepted: true, approvedSha: approval.approvedSha }
              : null,
        fullAutoApprovalEvidence:
          directoryLane &&
          hasAcceptedApprovalEvidence(lifecycleEvidence, { provenance: 'full-auto' })
            ? { accepted: true, approvedSha: lifecycleEvidence.expectedSha }
            : !directoryLane && approval?.fullAuto
              ? { accepted: true, approvedSha: approval.approvedSha }
              : null,
      });
    },
    async fetchIssue({ issueNumber }) {
      const [issue, projectState] = await Promise.all([
        json('gh', [
          'issue',
          'view',
          String(issueNumber),
          '-R',
          ctx.cfg.repo,
          '--json',
          'number,state,body,assignees',
        ]),
        ctx.getIssueBoardState(issueNumber),
      ]);
      return normalizeIssue(issue, projectState);
    },
    async resolveLineage({ issueNumber }) {
      const parentIssueNumber = await fetchParentIssueStrict({
        issueNumber,
        repo: ctx.cfg.repo,
        deps: {
          gql: async (query, variables) => {
            const args = ['api', 'graphql', '-f', `query=${query}`];
            for (const [key, value] of Object.entries(variables)) {
              args.push(Number.isInteger(value) ? '-F' : '-f', `${key}=${value}`);
            }
            return json('gh', args);
          },
        },
      });
      return {
        parentIssueNumber,
        deliveryTarget:
          parentIssueNumber === null ? baseRefFrom(ctx.cfg) : `epic/${parentIssueNumber}`,
      };
    },
    async getCurrentBranch() {
      const { stdout } = await run('git', ['branch', '--show-current']);
      return String(stdout || '').trim();
    },
    async getLocalHeadSha() {
      const { stdout } = await run('git', ['rev-parse', 'HEAD']);
      return String(stdout || '').trim();
    },
    async resolveTestReceiptSha({ issue }) {
      return parseVerificationReceipt(issue.body, 'test')?.commitSha ?? null;
    },
    async resolveAcceptedReviewSha({ issue, issueNumber, expectedHeadSha }) {
      const lifecycleEvidence = await resolveDirectoryEvidence({
        issue,
        issueNumber,
        expectedHeadSha,
      });
      if (lifecycleEvidence) {
        return hasAcceptedReviewEvidence(lifecycleEvidence) ? lifecycleEvidence.expectedSha : null;
      }
      const reviewReceipt = parseVerificationReceipt(issue.body, 'review');
      if (reviewReceipt?.commitSha) return reviewReceipt.commitSha;
      if (!isAgentReviewComplete(issue.body)) return null;
      const markerSha = parseTestStartedMarker(issue.body)?.sha;
      return SHA_RE.test(markerSha || '') ? markerSha : null;
    },
    async resolveAgentReviewPassed({ issue, issueNumber, expectedHeadSha }) {
      const lifecycleEvidence = await resolveDirectoryEvidence({
        issue,
        issueNumber,
        expectedHeadSha,
      });
      return lifecycleEvidence
        ? hasAcceptedReviewEvidence(lifecycleEvidence)
        : isAgentReviewComplete(issue.body);
    },
    async listPullRequests({ headRef }) {
      return json('gh', [
        'pr',
        'list',
        '-R',
        ctx.cfg.repo,
        '--head',
        headRef,
        '--state',
        'all',
        '--json',
        'number',
      ]);
    },
    async fetchPullRequest({ prNumber }) {
      const pr = await json('gh', [
        'pr',
        'view',
        String(prNumber),
        '-R',
        ctx.cfg.repo,
        '--json',
        'number,state,isDraft,baseRefName,headRefName,headRefOid,headRepository,headRepositoryOwner,mergeable,mergedAt,mergeCommit',
      ]);
      const sourceHistory = await fetchCompletePullRequestCommits(prNumber, pr.headRefOid);
      pr.sourceCommits = sourceHistory.commits;
      pr.sourceCommitEvidence = sourceHistory.evidence;
      pr.sourceCommitSubjects = pr.sourceCommits.map(({ messageHeadline }) => messageHeadline);
      pr.sourceCommitsComplete = true;
      pr.sourceCommitsHeadSha = pr.headRefOid;
      pr.merged = String(pr.state || '').toUpperCase() === 'MERGED';
      if (pr.merged) {
        const mergedAt = normalizeGitHubInstant(pr.mergedAt);
        if (mergedAt === null) throw deliverError('pull-request-merged-at');
        pr.mergedAt = mergedAt;
      }
      pr.headRefDeleted = false;
      if (pr.merged && typeof pr.headRefName === 'string' && pr.headRefName.length > 0) {
        const headOwner = pr.headRepositoryOwner?.login || owner;
        const headRepo = pr.headRepository?.name || repoName;
        const encodedRef = pr.headRefName.split('/').map(encodeURIComponent).join('/');
        try {
          await run('gh', ['api', `repos/${headOwner}/${headRepo}/git/ref/heads/${encodedRef}`]);
        } catch (error) {
          if (!/\b404\b/.test(`${error?.message || ''}\n${error?.stderr || ''}`)) throw error;
          pr.headRefDeleted = true;
        }
      }
      return pr;
    },
    async fetchRequiredChecks({ prNumber, expectedHeadSha }) {
      const required = await requiredChecksJson([
        'pr',
        'checks',
        String(prNumber),
        '-R',
        ctx.cfg.repo,
        '--required',
        '--json',
        'name,state',
      ]);
      const head = await json('gh', [
        'pr',
        'view',
        String(prNumber),
        '-R',
        ctx.cfg.repo,
        '--json',
        'headRefOid',
      ]);
      const liveHeadSha = String(head?.headRefOid || '');
      if (Array.isArray(required) && required.length === 0 && liveHeadSha !== expectedHeadSha) {
        return { readable: false, required: [] };
      }
      return checkRollup(required, liveHeadSha);
    },
    async fetchRepositoryMergeMethods() {
      const repository = await json('gh', ['api', `repos/${owner}/${repoName}`]);
      return [
        repository.allow_merge_commit ? 'merge' : null,
        repository.allow_squash_merge ? 'squash' : null,
        repository.allow_rebase_merge ? 'rebase' : null,
      ].filter(Boolean);
    },
    async listCommitSubjects({ range }) {
      const { stdout } = await run('git', ['log', '--format=%s', range]);
      return String(stdout || '')
        .split('\n')
        .map((subject) => subject.trim())
        .filter(Boolean);
    },
    async listDirtyPaths() {
      const { stdout } = await run('git', ['status', '--porcelain']);
      return String(stdout || '')
        .split('\n')
        .map((line) => line.slice(3).trim())
        .filter(Boolean);
    },
    async listIssueComments({ issueNumber }) {
      const pages = await json('gh', [
        'api',
        '--paginate',
        '--slurp',
        `repos/${owner}/${repoName}/issues/${issueNumber}/comments`,
      ]);
      return (Array.isArray(pages) ? pages.flat() : []).map((comment) => {
        const createdAt = normalizeGitHubInstant(comment.created_at);
        if (createdAt === null) throw deliverError('comment-created-at');
        return {
          id: String(comment.id),
          createdAt,
          body: comment.body,
        };
      });
    },
    async createIssueComment({ issueNumber, body }) {
      return json('gh', [
        'api',
        '--method',
        'POST',
        `repos/${owner}/${repoName}/issues/${issueNumber}/comments`,
        '-f',
        `body=${body}`,
      ]);
    },
    async fetchOriginTrunk({ remote, branch }) {
      await run('git', ['fetch', remote, branch]);
    },
    async isAncestor({ ancestor, descendant }) {
      try {
        await run('git', ['merge-base', '--is-ancestor', ancestor, descendant]);
        return true;
      } catch (error) {
        if (error?.code === 1) return false;
        throw error;
      }
    },
    async inspectMergeCommit({ mergeCommitSha }) {
      return inspectCommitObject(mergeCommitSha);
    },
    async inspectSourceCommit({ commitSha }) {
      return inspectCommitObject(commitSha);
    },
    async attributingCommits(issueNumber, options) {
      return defaultAttributingCommits(issueNumber, { cwd: ctx.projectDir, ...options });
    },
    async getAuthenticatedLogin() {
      const { stdout } = await run('gh', ['api', 'user', '--jq', '.login']);
      return String(stdout || '').trim();
    },
    now: () => new Date().toISOString(),
    createIntentId: () => createRecordId(),
    providerId: () => aiAppName(),
    sessionId: () => currentSessionId(),
  };
}

export async function verbDeliver(ctx, injected = {}) {
  const issueNumber = issueTarget(ctx.rest);
  const setExitCode = injected.setExitCode ?? ((code) => (process.exitCode = code));
  const writeOutput = injected.writeOutput ?? ((line) => console.log(line));
  if (issueNumber === null) {
    writeOutput('Usage: /task deliver #N');
    setExitCode(2);
    return;
  }
  const state = (injected.loadTrackerState ?? loadState)(ctx.statePath);
  const result = await runDeliver({
    issueNumber,
    cfg: ctx.cfg,
    state,
    deps: injected.deliverDeps ?? createDefaultDeliverDeps(ctx),
  });
  if (result.status === 'action-required') {
    writeOutput(serializeProviderActionRequired(result.action));
    setExitCode(20);
    return result;
  }
  if (result.status === 'manual-review-required') {
    writeOutput(
      `PROMPT_REQUIRED: manual-code-review #${issueNumber} pr=${result.prNumber} reviewer=${result.reviewerLogin} head=${result.expectedHeadSha}`
    );
    setExitCode(21);
    return result;
  }
  writeOutput(`AITM_DELIVERY_RESULT: ${canonicalRecordJson(result)}`);
  return result;
}
