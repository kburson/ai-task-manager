// @story #1668
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { evaluateAction } from '../../../../task-tracker/lib/action-decision/evaluate.mjs';
import { createObservationAttempt } from '../../../../task-tracker/lib/action-decision/observations.mjs';
import {
  validateDeliveryPreflight,
  validateMergedDeliveryPreflight,
} from '../../../../task-tracker/lib/delivery-preflight.mjs';

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
  issueBody = BODY,
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
          ? { number: ISSUE, body: issueBody }
          : request.resource === 'delivery'
            ? unreadable
              ? undefined
              : { preflightInput, providerActionAvailable }
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
        inputs: { state: 'review', head: HEAD, body: issueBody },
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

test('merged PR readiness uses the merged validator rather than an open-PR refusal', async () => {
  const input = openPrInput();
  input.pullRequests[0].state = 'MERGED';
  input.pullRequests[0].merged = true;
  input.pullRequests[0].mergedAt = '2026-09-21T22:00:00Z';
  assert.equal(validateMergedDeliveryPreflight(input).expectedHeadSha, HEAD);
  const item = fixture({ preflightInput: input });
  const result = await item.decision();
  assert.equal(result.status, 'ready', JSON.stringify(result));
  assert.deepEqual(item.effects, []);
});

test('merged PR reconstruction does not require an open-PR provider action', async () => {
  const input = openPrInput();
  input.pullRequests[0].state = 'MERGED';
  input.pullRequests[0].merged = true;
  const item = fixture({
    preflightInput: input,
    providerActionAvailable: false,
  });
  const result = await item.decision();
  assert.equal(result.status, 'ready', JSON.stringify(result));
  assert.deepEqual(item.effects, []);
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
