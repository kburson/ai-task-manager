// @story #939
// Review-stage, re-entrant delivery-intent orchestration.

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

import { splitRepo } from '../../gh/lib/github-projects.mjs';
import { loadState } from '../state.mjs';
import { currentSessionId, aiAppName } from '../word-counter.mjs';
import { fetchParentIssueStrict } from '../lib/fetch-parent-issue.mjs';
import { GH_API_TIMEOUT_MS, GIT_TIMEOUT_MS } from '../lib/process-timeouts.mjs';
import { isAgentReviewComplete } from '../lib/agent-review/review-gate.mjs';
import { parseReviewApprovedMarker, parseTestStartedMarker } from '../lib/markers.mjs';
import { parseVerificationReceipt } from '../lib/verification-receipt.mjs';
import { createRecordId } from '../lib/github-records/record-envelope.mjs';
import { canonicalRecordJson } from '../lib/github-records/canonical-json.mjs';
import {
  buildDeliveryIntent,
  buildDeliveryReceipt,
  parseDeliveryComment,
  projectDeliveryRecords,
  renderDeliveryIntentComment,
  renderDeliveryReceiptComment,
} from '../lib/delivery-records.mjs';
import {
  validateDeliveryPreflight,
  validateMergedDeliveryPreflight,
} from '../lib/delivery-preflight.mjs';
import {
  buildProviderAction,
  serializeProviderActionRequired,
} from '../lib/delivery-provider-action.mjs';
import { verifyDeliveredPullRequest } from '../lib/delivery-verification.mjs';
import { attributingCommits as defaultAttributingCommits } from '../lib/commit-attribution.mjs';

const pexec = promisify(execFile);
const SHA_RE = /^[0-9a-f]{40}$/;
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

function parsedDeliveryRecords(comments, context) {
  if (!Array.isArray(comments)) throw deliverError('comments');
  return comments
    .map((comment) => parseDeliveryComment(comment, context))
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
    commitTitle: preflight.commitText.commitTitle,
    commitMessage: preflight.commitText.commitMessage,
    provider,
    sessionId,
    clientCreatedAt,
  });
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
  localHeadSha,
  testReceiptSha,
  acceptedReviewSha,
  verified,
}) {
  const verification =
    verified ??
    (await verifyDeliveredPullRequest({
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

  const getCurrentBranch = requiredDependency(deps, 'getCurrentBranch');
  const getLocalHeadSha = requiredDependency(deps, 'getLocalHeadSha');
  const resolveTestReceiptSha = requiredDependency(deps, 'resolveTestReceiptSha');
  const resolveAcceptedReviewSha = requiredDependency(deps, 'resolveAcceptedReviewSha');
  const listPullRequests = requiredDependency(deps, 'listPullRequests');
  const fetchPullRequest = requiredDependency(deps, 'fetchPullRequest');
  const fetchRequiredChecks = requiredDependency(deps, 'fetchRequiredChecks');
  const fetchRepositoryMergeMethods = requiredDependency(deps, 'fetchRepositoryMergeMethods');
  const listCommitSubjects = requiredDependency(deps, 'listCommitSubjects');
  const listDirtyPaths = requiredDependency(deps, 'listDirtyPaths');
  const providerId = requiredDependency(deps, 'providerId');
  const sessionId = requiredDependency(deps, 'sessionId');
  const now = requiredDependency(deps, 'now');
  const createIntentId = requiredDependency(deps, 'createIntentId');

  const branch = await getCurrentBranch();
  const localHeadSha = await getLocalHeadSha();
  const pullRequestRefs = await listPullRequests({
    repository: cfg.repo,
    headRef: branch,
  });
  if (!Array.isArray(pullRequestRefs)) throw deliverError('pull-requests');
  const pullRequests = await Promise.all(
    pullRequestRefs.map(({ number }) =>
      fetchPullRequest({ repository: cfg.repo, prNumber: Number(number) })
    )
  );
  const mergedPullRequest = pullRequests.length === 1 && pullRequestMerged(pullRequests[0]);
  const prNumber = pullRequests.length === 1 ? pullRequests[0].number : null;
  const checks =
    prNumber === null
      ? { readable: false, required: [] }
      : await fetchRequiredChecks({
          repository: cfg.repo,
          prNumber,
          expectedHeadSha: localHeadSha,
        });
  const commitSubjectsPromise = mergedPullRequest
    ? Promise.resolve(pullRequests[0].sourceCommitSubjects)
    : listCommitSubjects({ range: 'origin/trunk..HEAD' });
  const [testReceiptSha, acceptedReviewSha, repositoryMergeMethods, commitSubjects, dirtyPaths] =
    await Promise.all([
      resolveTestReceiptSha({ issue, issueNumber, expectedHeadSha: localHeadSha }),
      resolveAcceptedReviewSha({ issue, issueNumber, expectedHeadSha: localHeadSha }),
      fetchRepositoryMergeMethods({ repository: cfg.repo }),
      commitSubjectsPromise,
      listDirtyPaths({ issueNumber }),
    ]);
  const assignee =
    typeof cfg.assignee === 'string' && cfg.assignee !== '@me' && cfg.assignee.length > 0
      ? cfg.assignee
      : await requiredDependency(deps, 'getAuthenticatedLogin')();
  const deliveryConfig = {
    ...cfg,
    assignee,
    repositoryMergeMethods,
  };
  const preflightInput = {
    issue,
    binding: bindingFromState({ branch, state }),
    lineage,
    pullRequests,
    localHeadSha,
    testReceiptSha,
    acceptedReviewSha,
    checks,
    dirtyPaths,
    config: deliveryConfig,
    commitSubjects,
  };
  const preflight = mergedPullRequest
    ? validateMergedDeliveryPreflight(preflightInput)
    : validateDeliveryPreflight(preflightInput);
  const context = {
    repository: cfg.repo,
    issueNumber,
    prNumber: preflight.pr.number,
  };
  const initial = await readProjection({ deps, issueNumber, context });
  const live = initial.projection.liveIntent;
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
      });
      if (authorizedIntentBytes(expected) !== authorizedIntentBytes(liveIntent.record)) {
        throw deliverError('intent-divergence');
      }
    }
    if (liveIntent === null) {
      recovery = true;
      const recoveryIntent = buildIntentFromPreflight({
        preflight,
        cfg,
        intentId: createIntentId(),
        supersedesIntentId: null,
        provider: 'external',
        sessionId: sessionId(),
        clientCreatedAt: pullRequests[0].mergedAt,
      });
      const verified = await verifyDeliveredPullRequest({
        intent: recoveryIntent,
        intentCreatedAt: pullRequests[0].mergedAt,
        pullRequest: pullRequests[0],
        recovery: true,
        localHeadSha,
        testReceiptSha,
        acceptedReviewSha,
        fetchOriginTrunk: requiredDependency(deps, 'fetchOriginTrunk'),
        isAncestor: requiredDependency(deps, 'isAncestor'),
        inspectMergeCommit: requiredDependency(deps, 'inspectMergeCommit'),
        attributingCommits: requiredDependency(deps, 'attributingCommits'),
      });
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
        pullRequest: pullRequests[0],
        recovery,
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
      pullRequest: pullRequests[0],
      recovery,
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
    intent: readbackIntent.record,
    action: buildProviderAction(readbackIntent.record),
  };
}

function normalizeIssue(issue, projectState) {
  const body = String(issue?.body || '');
  const approval = parseReviewApprovedMarker(body);
  return {
    number: Number(issue?.number),
    state: issue?.state,
    projectState: String(projectState || '').toLowerCase() === 'review' ? 'Review' : projectState,
    assignees: Array.isArray(issue?.assignees)
      ? issue.assignees.map(({ login }) => login).filter(Boolean)
      : [],
    agentReviewPassed: isAgentReviewComplete(body),
    approvalEvidence: approval ? (approval.fullAuto ? 'full-auto' : 'human') : null,
    body,
  };
}

function checkRollup(rollup, expectedHeadSha) {
  if (!Array.isArray(rollup)) return { readable: false, required: [] };
  return {
    readable: true,
    required: rollup.map((check) => ({
      name: String(check?.name || check?.context || ''),
      headSha: expectedHeadSha,
      status:
        check?.status === 'COMPLETED' || check?.state
          ? 'COMPLETED'
          : String(check?.status || '').toUpperCase(),
      conclusion: String(check?.conclusion || check?.state || '').toUpperCase(),
    })),
  };
}

export function createDefaultDeliverDeps(ctx, { exec = pexec } = {}) {
  const prRollups = new Map();
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
  const { owner, repoName } = splitRepo(ctx.cfg.repo);

  return {
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
    async resolveAcceptedReviewSha({ issue }) {
      const reviewReceipt = parseVerificationReceipt(issue.body, 'review');
      if (reviewReceipt?.commitSha) return reviewReceipt.commitSha;
      if (!isAgentReviewComplete(issue.body)) return null;
      const markerSha = parseTestStartedMarker(issue.body)?.sha;
      return SHA_RE.test(markerSha || '') ? markerSha : null;
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
        'number,state,isDraft,baseRefName,headRefName,headRefOid,headRepository,headRepositoryOwner,mergeable,mergedAt,mergeCommit,statusCheckRollup,commits',
      ]);
      prRollups.set(Number(prNumber), pr.statusCheckRollup);
      delete pr.statusCheckRollup;
      pr.sourceCommitSubjects = Array.isArray(pr.commits)
        ? pr.commits.map(({ messageHeadline }) => messageHeadline)
        : null;
      delete pr.commits;
      pr.merged = String(pr.state || '').toUpperCase() === 'MERGED';
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
      return checkRollup(prRollups.get(Number(prNumber)), expectedHeadSha);
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
      return (Array.isArray(pages) ? pages.flat() : []).map((comment) => ({
        id: String(comment.id),
        createdAt: comment.created_at,
        body: comment.body,
      }));
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
      const { stdout } = await run('git', ['cat-file', 'commit', mergeCommitSha]);
      const raw = String(stdout || '');
      const separator = raw.indexOf('\n\n');
      if (separator < 0) throw deliverError('merge-commit-object');
      const headers = raw.slice(0, separator).split('\n');
      const message = raw.slice(separator + 2).replace(/\n$/, '');
      const [commitTitle, ...bodyLines] = message.split('\n');
      const commitMessage =
        bodyLines[0] === '' ? bodyLines.slice(1).join('\n') : bodyLines.join('\n');
      return {
        parents: headers
          .filter((line) => line.startsWith('parent '))
          .map((line) => line.slice('parent '.length)),
        commitTitle,
        commitMessage,
      };
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
  writeOutput(`AITM_DELIVERY_RESULT: ${canonicalRecordJson(result)}`);
  return result;
}
