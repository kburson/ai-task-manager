// @story #1668
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { evaluateAction } from '../../../../task-tracker/lib/action-decision/evaluate.mjs';
import { validateActionDecision } from '../../../../task-tracker/lib/action-decision/contract.mjs';
import { createObservationAttempt } from '../../../../task-tracker/lib/action-decision/observations.mjs';
import * as deliveryDecision from '../../../../task-tracker/lib/action-decision/deliver.mjs';
import {
  buildDeliveryIntent,
  renderDeliveryIntentComment,
} from '../../../../task-tracker/lib/delivery-records.mjs';
import {
  validateDeliveryPreflight,
  validateMergedDeliveryPreflight,
} from '../../../../task-tracker/lib/delivery-preflight.mjs';
import {
  buildNoCommitDeliveryRecord,
  renderNoCommitDeliveryComment,
} from '../../../../task-tracker/lib/no-commit-delivery-record.mjs';
import {
  cfg as deliveryCfg,
  deliver as executeDelivery,
  HEAD as DELIVERY_HEAD,
  makeHarness,
  NEXT_HEAD,
  trackerState,
} from '../../../unit/task-tracker/verbs/deliver-test-harness.mjs';
import { createDefaultDeliverDeps } from '../../../../task-tracker/verbs/deliver.mjs';

const ISSUE = 1668;
const REPOSITORY = 'example/project';
const HEAD = 'a'.repeat(40);
const BODY = `## User Story
As a delivery operator
I want current delivery readiness
So that stale evidence cannot authorize delivery

## Scope
Explain current provider delivery authorization without effects.

## Acceptance Criteria
- [x] The explanation is read-only.`;

function openPrInput() {
  return {
    issue: {
      number: ISSUE,
      state: 'OPEN',
      projectState: 'Review',
      body: BODY,
      assignees: ['operator'],
      agentReviewPassed: true,
      reviewAuthorization: { mode: 'full-auto', standing: true, source: 'test' },
    },
    binding: { issueNumber: ISSUE, branch: 'feature/epic/1558', timerState: 'running' },
    lineage: { parentIssueNumber: null, deliveryTarget: 'trunk' },
    pullRequests: [
      {
        number: 99,
        state: 'OPEN',
        isDraft: false,
        baseRefName: 'trunk',
        headRefName: 'feature/epic/1558',
        headRefOid: HEAD,
        mergeable: 'MERGEABLE',
      },
    ],
    localHeadSha: HEAD,
    testReceiptSha: HEAD,
    acceptedReviewSha: HEAD,
    checks: {
      readable: true,
      required: [{ name: 'ci', headSha: HEAD, status: 'COMPLETED', conclusion: 'SUCCESS' }],
    },
    dirtyPaths: [],
    config: {
      repo: REPOSITORY,
      assignee: 'operator',
      trunkRef: 'origin/trunk',
      repositoryMergeMethods: ['squash'],
      fullAutoMerge: { mechanism: 'provider-action', mergeMethod: 'squash' },
    },
    commitSubjects: ['[#1668] Share delivery readiness'],
  };
}

function fixture({
  preflightInput = openPrInput(),
  providerActionAvailable = true,
  unreadable = false,
  unreadableBody = false,
  issueBody = BODY,
  observedHead = HEAD,
  manualReviewDecision = { status: 'authorized' },
  comments = [],
} = {}) {
  const effects = [];
  const requests = [];
  const attempt = createObservationAttempt({
    repository: REPOSITORY,
    issue: ISSUE,
    boundaryId: `action:deliver:${ISSUE}`,
    now: () => '2026-09-21T23:10:00.000Z',
    read: async (request) => {
      requests.push(request.resource);
      const value =
        request.resource === 'issue-body'
          ? unreadableBody
            ? undefined
            : { number: ISSUE, body: issueBody }
          : request.resource === 'delivery'
            ? unreadable
              ? undefined
              : { preflightInput, providerActionAvailable, manualReviewDecision, comments }
            : undefined;
      return { ...request, value };
    },
  });
  return {
    effects,
    requests,
    decision: () =>
      evaluateAction({
        actionId: 'deliver',
        repository: REPOSITORY,
        issue: ISSUE,
        inputs: { state: 'review', head: observedHead, body: issueBody },
        attempt,
        deps: { effectAttempts: () => effects },
      }),
  };
}

test('open-PR delivery explanation shares actual preflight and performs no effects', async () => {
  const input = openPrInput();
  assert.equal(validateDeliveryPreflight(input).expectedHeadSha, HEAD);
  const item = fixture({ preflightInput: input });
  const result = await item.decision();
  assert.equal(result.status, 'ready', JSON.stringify(result));
  assert.deepEqual(result.blockers, []);
  assert.deepEqual(item.effects, []);
  assert.deepEqual(item.requests, ['issue-body', 'delivery']);
});

test('stale PR head is blocked by the same exact-head preflight as execution', async () => {
  const input = openPrInput();
  input.pullRequests[0].headRefOid = 'b'.repeat(40);
  const item = fixture({ preflightInput: input });
  const result = await item.decision();
  assert.equal(result.status, 'blocked', JSON.stringify(result));
  assert.deepEqual(
    result.blockers.map(({ code, args }) => [code, args.category]),
    [['delivery-preflight-refused', 'pull-request-count']]
  );
  assert.deepEqual(item.effects, []);
});

test('missing provider capability blocks without shell merge guidance', async () => {
  const item = fixture({ providerActionAvailable: false });
  const result = await item.decision();
  assert.equal(result.status, 'blocked', JSON.stringify(result));
  assert.deepEqual(
    result.blockers.map(({ code }) => code),
    ['delivery-provider-unavailable']
  );
  assert.doesNotMatch(JSON.stringify(result), /git merge|gh pr merge/);
  assert.deepEqual(item.effects, []);
});

test('an unreadable delivery authority observation is indeterminate', async () => {
  const item = fixture({ unreadable: true });
  const result = await item.decision();
  assert.equal(result.status, 'indeterminate');
  assert.ok(result.blockers.some(({ code }) => code === 'authority-read-failed'));
  assert.deepEqual(item.effects, []);
});

test('simultaneous unreadable sources retain both typed causes', async () => {
  const item = fixture({ unreadable: true, unreadableBody: true });
  const result = await item.decision();
  assert.equal(result.status, 'indeterminate', JSON.stringify(result));
  assert.equal(result.blockers.length, 2, JSON.stringify(result));
  assert.deepEqual(item.effects, []);
});

test('merged PR without a delivery receipt cannot claim ready from PR state alone', async () => {
  const input = openPrInput();
  input.pullRequests[0].state = 'MERGED';
  input.pullRequests[0].merged = true;
  input.pullRequests[0].mergedAt = '2026-09-21T22:00:00Z';
  assert.equal(validateMergedDeliveryPreflight(input).expectedHeadSha, HEAD);
  const item = fixture({ preflightInput: input });
  const result = await item.decision();
  assert.equal(result.status, 'indeterminate', JSON.stringify(result));
  assert.deepEqual(
    result.blockers.map(({ code }) => code),
    ['action-not-explain-ready']
  );
  assert.deepEqual(item.effects, []);
});

test('merged PR reconstruction does not infer a provider action', async () => {
  const input = openPrInput();
  input.pullRequests[0].state = 'MERGED';
  input.pullRequests[0].merged = true;
  const item = fixture({
    preflightInput: input,
    providerActionAvailable: false,
  });
  const result = await item.decision();
  assert.equal(result.status, 'indeterminate', JSON.stringify(result));
  assert.deepEqual(
    result.blockers.map(({ code }) => code),
    ['action-not-explain-ready']
  );
  assert.deepEqual(item.effects, []);
});

test('merged PR with a live intent and exact read-only trunk proof is explainable', async () => {
  const harness = makeHarness();
  const pending = await executeDelivery(harness);
  assert.equal(pending.status, 'action-required');
  harness.data.prState = 'MERGED';
  const previousComments = harness.calls.createIssueComment;
  const fetchIssue = harness.deps.fetchIssue;
  const decision = await deliveryDecision.evaluateDeliveryReadiness({
    issue: 939,
    cfg: deliveryCfg(),
    projectDir: process.cwd(),
    state: trackerState(),
    deps: {
      ...harness.deps,
      fetchIssue: async (...args) => ({ ...(await fetchIssue(...args)), body: BODY }),
      fetchRemoteTrunkHeadSha: async () => 'e'.repeat(40),
      resolveLocalTrunkHeadSha: async () => 'e'.repeat(40),
      providerActionAvailable: false,
    },
  });
  assert.equal(decision.status, 'ready', JSON.stringify(decision));
  assert.equal(harness.calls.createIssueComment, previousComments);
});

test('merged PR with a matching receipt remains explainable without new records', async () => {
  const harness = makeHarness();
  assert.equal((await executeDelivery(harness)).status, 'action-required');
  harness.data.prState = 'MERGED';
  assert.equal((await executeDelivery(harness)).status, 'delivered');
  const commentsBefore = harness.calls.createIssueComment;
  const fetchesBefore = harness.calls.fetchOriginTrunk;
  const fetchIssue = harness.deps.fetchIssue;
  const decision = await deliveryDecision.evaluateDeliveryReadiness({
    issue: 939,
    cfg: deliveryCfg(),
    projectDir: process.cwd(),
    state: trackerState(),
    deps: {
      ...harness.deps,
      fetchIssue: async (...args) => ({ ...(await fetchIssue(...args)), body: BODY }),
      fetchRemoteTrunkHeadSha: async () => 'e'.repeat(40),
      resolveLocalTrunkHeadSha: async () => 'e'.repeat(40),
      providerActionAvailable: false,
    },
  });
  assert.equal(decision.status, 'ready', JSON.stringify(decision));
  assert.equal(harness.calls.createIssueComment, commentsBefore);
  assert.equal(harness.calls.fetchOriginTrunk, fetchesBefore);
});

test('default merged proof ports observe remote and local trunk without fetching refs', async () => {
  const commands = [];
  const deps = createDefaultDeliverDeps(
    { projectDir: process.cwd(), cfg: { repo: REPOSITORY } },
    {
      exec: async (command, args) => {
        commands.push([command, args]);
        return {
          stdout:
            args[0] === 'ls-remote'
              ? `${'e'.repeat(40)}\trefs/heads/trunk\n`
              : `${'e'.repeat(40)}\n`,
        };
      },
    }
  );
  assert.equal(await deps.fetchRemoteTrunkHeadSha({ branch: 'trunk' }), 'e'.repeat(40));
  assert.equal(await deps.resolveLocalTrunkHeadSha({ branch: 'trunk' }), 'e'.repeat(40));
  assert.deepEqual(commands, [
    ['git', ['ls-remote', '--heads', 'origin', 'trunk']],
    ['git', ['rev-parse', 'refs/remotes/origin/trunk']],
  ]);
});

test('a stale local trunk mirror cannot prove merged delivery readiness', async () => {
  const harness = makeHarness();
  assert.equal((await executeDelivery(harness)).status, 'action-required');
  harness.data.prState = 'MERGED';
  const previousComments = harness.calls.createIssueComment;
  const fetchIssue = harness.deps.fetchIssue;
  const decision = await deliveryDecision.evaluateDeliveryReadiness({
    issue: 939,
    cfg: deliveryCfg(),
    projectDir: process.cwd(),
    state: trackerState(),
    deps: {
      ...harness.deps,
      fetchIssue: async (...args) => ({ ...(await fetchIssue(...args)), body: BODY }),
      fetchRemoteTrunkHeadSha: async () => 'e'.repeat(40),
      resolveLocalTrunkHeadSha: async () => 'f'.repeat(40),
      providerActionAvailable: false,
    },
  });
  assert.equal(decision.status, 'indeterminate', JSON.stringify(decision));
  assert.equal(harness.calls.fetchOriginTrunk, 0);
  assert.equal(harness.calls.createIssueComment, previousComments);
});

test('merged intent cannot explain ready after configured method diverges', async () => {
  const harness = makeHarness();
  assert.equal((await executeDelivery(harness)).status, 'action-required');
  harness.data.prState = 'MERGED';
  harness.data.configuredMergeMethod = 'merge';
  const fetchIssue = harness.deps.fetchIssue;
  const decision = await deliveryDecision.evaluateDeliveryReadiness({
    issue: 939,
    cfg: {
      ...deliveryCfg(),
      fullAutoMerge: { mechanism: 'provider-action', mergeMethod: 'merge' },
    },
    projectDir: process.cwd(),
    state: trackerState(),
    deps: {
      ...harness.deps,
      fetchIssue: async (...args) => ({ ...(await fetchIssue(...args)), body: BODY }),
      fetchRemoteTrunkHeadSha: async () => 'e'.repeat(40),
      resolveLocalTrunkHeadSha: async () => 'e'.repeat(40),
      providerActionAvailable: false,
    },
  });
  assert.equal(decision.status, 'blocked', JSON.stringify(decision));
  assert.ok(decision.blockers.some(({ code }) => code === 'delivery-intent-divergence'));
});

test('issue-resident no-commit delivery is explainable without a merge provider', async () => {
  const input = openPrInput();
  input.pullRequests = [];
  input.issue.body = `${BODY}\n\n## AITM Progress Markers\n\n<!-- aitm-issue-kind kind="audit" -->\n<!-- aitm-deliverable-posted url="https://example.com/deliverable" ts="2026-09-21T22:00:00.000Z" -->`;
  const item = fixture({
    preflightInput: input,
    providerActionAvailable: false,
    issueBody: input.issue.body,
  });
  const result = await item.decision();
  assert.equal(result.status, 'ready', JSON.stringify(result));
  assert.deepEqual(item.effects, []);
});

test('production reader reconstructs open-PR authority from read-only delivery dependencies', async () => {
  assert.equal(typeof deliveryDecision.evaluateDeliveryReadiness, 'function');
  const input = openPrInput();
  input.issue.body = BODY;
  const effects = [];
  const deps = {
    fetchIssue: async () => input.issue,
    resolveLineage: async () => input.lineage,
    getCurrentBranch: async () => input.binding.branch,
    listPullRequests: async () => [{ number: 99 }],
    getLocalHeadSha: async () => HEAD,
    resolveTestReceiptSha: async () => HEAD,
    resolveAcceptedReviewSha: async () => HEAD,
    resolveAgentReviewPassed: async () => true,
    fetchPullRequest: async () => input.pullRequests[0],
    fetchRequiredChecks: async () => input.checks,
    fetchRepositoryMergeMethods: async () => input.config.repositoryMergeMethods,
    listCommitSubjects: async () => input.commitSubjects,
    listDirtyPaths: async () => [],
    resolveReviewAuthorization: async () => input.issue.reviewAuthorization,
    getAuthenticatedLogin: async () => 'operator',
    resolvePullRequestReviewGate: async () => false,
    listIssueComments: async () => [],
    providerActionAvailable: true,
    createIssueComment: async () => effects.push('comment'),
    requestPullRequestReview: async () => effects.push('review-request'),
  };
  const decision = await deliveryDecision.evaluateDeliveryReadiness({
    issue: ISSUE,
    cfg: input.config,
    projectDir: process.cwd(),
    state: { active: '#1668', entryStartTs: '2026-09-21T23:10:00Z' },
    deps,
    now: () => '2026-09-21T23:10:00.000Z',
  });
  assert.equal(decision.status, 'ready', JSON.stringify(decision));
  assert.deepEqual(effects, []);
});

test('production reader reports an unavailable initial issue without throwing or effects', async () => {
  const result = await deliveryDecision.evaluateDeliveryReadiness({
    issue: ISSUE,
    cfg: { repo: REPOSITORY },
    projectDir: process.cwd(),
    state: { active: '#1668', entryStartTs: '2026-09-21T23:10:00Z' },
    deps: {
      fetchIssue: async () => {
        throw new Error('network unavailable');
      },
      getLocalHeadSha: async () => HEAD,
    },
  });
  assert.equal(result.status, 'indeterminate');
  assert.deepEqual(
    result.blockers.map(({ code }) => code),
    ['authority-read-failed', 'authority-read-failed']
  );
  assert.deepEqual(validateActionDecision(result), result);
});

test('delivery body drift between observed issue and preflight snapshot is indeterminate', async () => {
  const input = openPrInput();
  input.issue.body = `${BODY}\n<!-- changed approval evidence -->`;
  const item = fixture({ preflightInput: input, issueBody: BODY });
  const result = await item.decision();
  assert.equal(result.status, 'indeterminate', JSON.stringify(result));
  assert.ok(result.blockers.some(({ code }) => code === 'authority-read-failed'));
});

test('delivery snapshot cannot claim ready at a different observed worktree HEAD', async () => {
  const item = fixture({ observedHead: 'b'.repeat(40) });
  const result = await item.decision();
  assert.equal(result.status, 'indeterminate', JSON.stringify(result));
  assert.ok(result.blockers.some(({ code }) => code === 'authority-read-failed'));
});

test('missing exact-head human PR approval is a typed request, not ready', async () => {
  const item = fixture({
    manualReviewDecision: {
      status: 'request-review',
      reviewerLogin: 'reviewer',
      reason: 'approval-missing',
    },
  });
  const result = await item.decision();
  assert.equal(result.status, 'blocked', JSON.stringify(result));
  assert.deepEqual(
    result.blockers.map(({ code }) => code),
    ['delivery-manual-review-required']
  );
  assert.deepEqual(result.humanDecision?.requests, [
    {
      kind: 'code-review-approval',
      actor: 'configured-approver',
      subject: { issue: ISSUE, actionId: 'deliver' },
      args: { head: HEAD, prNumber: 99 },
    },
  ]);
  assert.deepEqual(item.effects, []);
});

test('ineligible manual code reviewer blocks rather than becoming indeterminate', async () => {
  const item = fixture({
    manualReviewDecision: { status: 'refused', reason: 'reviewer-ineligible' },
  });
  const result = await item.decision();
  assert.equal(result.status, 'blocked', JSON.stringify(result));
  assert.deepEqual(
    result.blockers.map(({ code }) => code),
    ['delivery-manual-review-refused']
  );
});

test('missing complete delivery-record inventory cannot explain ready', async () => {
  const item = fixture({ comments: null });
  const result = await item.decision();
  assert.equal(result.status, 'indeterminate', JSON.stringify(result));
  assert.ok(result.blockers.some(({ code }) => code === 'authority-read-failed'));
});

test('historical recovery is not silently offered as a ready default delivery', async () => {
  const input = openPrInput();
  input.pullRequests[0].state = 'MERGED';
  input.pullRequests[0].merged = true;
  input.localHeadSha = 'b'.repeat(40);
  const item = fixture({ preflightInput: input, observedHead: input.localHeadSha });
  const result = await item.decision();
  assert.equal(result.status, 'indeterminate', JSON.stringify(result));
  assert.deepEqual(
    result.blockers.map(({ code }) => code),
    ['action-not-explain-ready']
  );
  assert.doesNotMatch(JSON.stringify(result), /--reconcile|gh pr merge/);
});

test('malformed v2 evidence marker cannot fall through to v1 delivery readiness', async () => {
  const input = openPrInput();
  input.issue.body = `${BODY}\n<!-- aitm-evidence-v2 data="bad" -->`;
  const item = fixture({ preflightInput: input, issueBody: input.issue.body });
  const result = await item.decision();
  assert.equal(result.status, 'indeterminate', JSON.stringify(result));
  assert.deepEqual(item.effects, []);
});

test('an existing intent whose authorized merge method diverges cannot explain ready', async () => {
  const input = openPrInput();
  const preflight = validateDeliveryPreflight(input);
  const intent = buildDeliveryIntent({
    intentId: '01ARZ3NDEKTSV4RRFFQ69G5FAV',
    supersedesIntentId: null,
    issueNumber: ISSUE,
    repository: REPOSITORY,
    prNumber: 99,
    baseRef: 'trunk',
    headRef: input.binding.branch,
    expectedHeadSha: HEAD,
    mergeMethod: 'merge',
    attributionTokens: preflight.commitText.attributionTokens,
    commitTitle: preflight.commitText.commitTitle,
    commitMessage: preflight.commitText.commitMessage,
    provider: 'codex',
    sessionId: 'session-1',
    clientCreatedAt: '2026-09-21T22:00:00.000Z',
  });
  const item = fixture({
    preflightInput: input,
    comments: [
      {
        id: '1001',
        createdAt: '2026-09-21T22:01:00.000Z',
        body: renderDeliveryIntentComment(intent),
      },
    ],
  });
  const result = await item.decision();
  assert.equal(result.status, 'blocked', JSON.stringify(result));
  assert.deepEqual(
    result.blockers.map(({ code }) => code),
    ['delivery-intent-divergence']
  );
});

test('a prior-head intent may be superseded by fresh exact-head execution', async () => {
  const input = openPrInput();
  const preflight = validateDeliveryPreflight(input);
  const intent = buildDeliveryIntent({
    intentId: '01ARZ3NDEKTSV4RRFFQ69G5FAV',
    supersedesIntentId: null,
    issueNumber: ISSUE,
    repository: REPOSITORY,
    prNumber: 99,
    baseRef: 'trunk',
    headRef: input.binding.branch,
    expectedHeadSha: 'b'.repeat(40),
    mergeMethod: 'squash',
    attributionTokens: preflight.commitText.attributionTokens,
    commitTitle: preflight.commitText.commitTitle,
    commitMessage: preflight.commitText.commitMessage.replaceAll(HEAD, 'b'.repeat(40)),
    provider: 'codex',
    sessionId: 'session-1',
    clientCreatedAt: '2026-09-21T22:00:00.000Z',
  });
  const item = fixture({
    comments: [
      {
        id: '1001',
        createdAt: '2026-09-21T22:01:00.000Z',
        body: renderDeliveryIntentComment(intent),
      },
    ],
  });
  const result = await item.decision();
  assert.equal(result.status, 'ready', JSON.stringify(result));
});

test('an existing no-commit delivery record with a different accepted head blocks readiness', async () => {
  const input = openPrInput();
  input.pullRequests = [];
  input.issue.body = `${BODY}\n\n## AITM Progress Markers\n\n<!-- aitm-issue-kind kind="audit" -->\n<!-- aitm-deliverable-posted url="https://example.com/deliverable" ts="2026-09-21T22:00:00.000Z" -->`;
  const record = buildNoCommitDeliveryRecord({
    recordId: '01ARZ3NDEKTSV4RRFFQ69G5FAV',
    repository: REPOSITORY,
    issueNumber: ISSUE,
    issueKind: 'audit',
    deliverableUrl: 'https://example.com/deliverable',
    acceptedSha: 'b'.repeat(40),
    provider: 'codex',
    sessionId: 'session-1',
    verifiedAt: '2026-09-21T22:00:00.000Z',
  });
  const item = fixture({
    preflightInput: input,
    issueBody: input.issue.body,
    comments: [
      {
        id: '1001',
        createdAt: '2026-09-21T22:01:00.000Z',
        body: renderNoCommitDeliveryComment(record),
      },
    ],
  });
  const result = await item.decision();
  assert.equal(result.status, 'blocked', JSON.stringify(result));
  assert.deepEqual(
    result.blockers.map(({ code }) => code),
    ['delivery-record-conflict'],
    JSON.stringify(result)
  );
});

test('execution refuses a changed PR head after a prior ready explanation', async () => {
  const harness = makeHarness();
  const fetchIssue = harness.deps.fetchIssue;
  const deps = {
    ...harness.deps,
    fetchIssue: async (...args) => ({ ...(await fetchIssue(...args)), body: BODY }),
    providerActionAvailable: true,
  };
  const explained = await deliveryDecision.evaluateDeliveryReadiness({
    issue: 939,
    cfg: deliveryCfg(),
    projectDir: process.cwd(),
    state: trackerState(),
    deps,
  });
  assert.equal(explained.status, 'ready', JSON.stringify(explained));
  assert.equal(harness.calls.createIssueComment, 0);
  harness.data.prHead = NEXT_HEAD;
  await assert.rejects(executeDelivery(harness), /delivery-preflight:/);
  assert.equal(harness.calls.createIssueComment, 0);
  assert.equal(harness.data.head, DELIVERY_HEAD);
});

test('execution refuses revoked review authorization after a prior ready explanation', async () => {
  const harness = makeHarness();
  const fetchIssue = harness.deps.fetchIssue;
  const decision = await deliveryDecision.evaluateDeliveryReadiness({
    issue: 939,
    cfg: deliveryCfg(),
    projectDir: process.cwd(),
    state: trackerState(),
    deps: {
      ...harness.deps,
      fetchIssue: async (...args) => ({ ...(await fetchIssue(...args)), body: BODY }),
      providerActionAvailable: true,
    },
  });
  assert.equal(decision.status, 'ready', JSON.stringify(decision));
  harness.data.reviewAuthorization = { mode: 'missing', standing: false };
  await assert.rejects(executeDelivery(harness), /delivery-preflight:/);
  assert.equal(harness.calls.createIssueComment, 0);
});

test('execution refuses withdrawn exact-head human PR approval after explanation', async () => {
  const harness = makeHarness({
    manualCodeReview: true,
    reviews: [
      {
        authorLogin: 'kburson',
        authorIsBot: false,
        state: 'APPROVED',
        commitOid: DELIVERY_HEAD,
        submittedAt: '2026-09-21T22:00:00Z',
      },
    ],
  });
  const fetchIssue = harness.deps.fetchIssue;
  const decision = await deliveryDecision.evaluateDeliveryReadiness({
    issue: 939,
    cfg: deliveryCfg(),
    projectDir: process.cwd(),
    state: trackerState(),
    deps: {
      ...harness.deps,
      fetchIssue: async (...args) => ({ ...(await fetchIssue(...args)), body: BODY }),
      providerActionAvailable: true,
    },
  });
  assert.equal(decision.status, 'ready', JSON.stringify(decision));
  harness.data.reviews.push({
    authorLogin: 'kburson',
    authorIsBot: false,
    state: 'DISMISSED',
    commitOid: DELIVERY_HEAD,
    submittedAt: '2026-09-21T22:01:00Z',
  });
  const result = await executeDelivery(harness);
  assert.equal(result.status, 'manual-review-required');
  assert.equal(harness.calls.createIssueComment, 0);
});

test('execution refuses changed CI after a prior ready explanation', async () => {
  const harness = makeHarness();
  const fetchIssue = harness.deps.fetchIssue;
  const decision = await deliveryDecision.evaluateDeliveryReadiness({
    issue: 939,
    cfg: deliveryCfg(),
    projectDir: process.cwd(),
    state: trackerState(),
    deps: {
      ...harness.deps,
      fetchIssue: async (...args) => ({ ...(await fetchIssue(...args)), body: BODY }),
      providerActionAvailable: true,
    },
  });
  assert.equal(decision.status, 'ready', JSON.stringify(decision));
  harness.data.checks.required[0].conclusion = 'FAILURE';
  await assert.rejects(executeDelivery(harness), /delivery-preflight:required-check-not-green/);
  assert.equal(harness.calls.createIssueComment, 0);
});

test('execution refuses changed ledger after a prior ready explanation', async () => {
  const harness = makeHarness();
  const fetchIssue = harness.deps.fetchIssue;
  const decision = await deliveryDecision.evaluateDeliveryReadiness({
    issue: 939,
    cfg: deliveryCfg(),
    projectDir: process.cwd(),
    state: trackerState(),
    deps: {
      ...harness.deps,
      fetchIssue: async (...args) => ({ ...(await fetchIssue(...args)), body: BODY }),
      providerActionAvailable: true,
    },
  });
  assert.equal(decision.status, 'ready', JSON.stringify(decision));
  harness.data.comments.push({
    id: 'changed-ledger',
    createdAt: '2026-09-21T22:00:00.000Z',
    body: '<!-- aitm-delivery-intent {bad} -->',
  });
  await assert.rejects(executeDelivery(harness), /delivery-records:/);
  assert.equal(harness.calls.createIssueComment, 0);
});
