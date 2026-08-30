// @story #1439
import { strict as assert } from 'node:assert';
import { test } from 'node:test';

import { runDeliver } from '../../../../task-tracker/verbs/deliver.mjs';

const HEAD = 'a'.repeat(40);
const ADVANCED_HEAD = 'b'.repeat(40);
const DELIVERABLE_URL =
  'https://github.com/kburson/ai-task-manager/issues/1407#issuecomment-5469679817';
const BODY = `## AITM Progress Markers

<!-- aitm-issue-kind kind="epic" -->
<!-- aitm-deliverable-posted url="${DELIVERABLE_URL}" ts="2026-08-30T15:49:04.000Z" -->`;

function makeHarness(overrides = {}) {
  const comments = [];
  const calls = { commentsCreated: 0, pullRequestsListed: 0 };
  const issue = {
    number: 1407,
    state: 'OPEN',
    projectState: 'Review',
    assignees: ['kburson'],
    agentReviewPassed: true,
    body: BODY,
    ...overrides.issue,
  };
  const deps = {
    async fetchIssue() {
      return issue;
    },
    async resolveLineage() {
      return { parentIssueNumber: null, deliveryTarget: 'trunk' };
    },
    async getCurrentBranch() {
      return 'claude/pull-branch-trunk-origin-c647e3';
    },
    async getLocalHeadSha() {
      return overrides.localHeadSha ?? HEAD;
    },
    async resolveTestReceiptSha() {
      return HEAD;
    },
    async resolveAcceptedReviewSha() {
      return HEAD;
    },
    async resolveAgentReviewPassed() {
      return true;
    },
    async resolveReviewAuthorization() {
      return Object.freeze({ mode: 'full-auto', standing: true, source: 'test' });
    },
    async listIssueComments() {
      return structuredClone(comments);
    },
    async createIssueComment({ body }) {
      calls.commentsCreated += 1;
      comments.push({
        id: `comment-${comments.length + 1}`,
        createdAt: '2026-08-30T16:20:01.000Z',
        body,
      });
    },
    async listPullRequests() {
      calls.pullRequestsListed += 1;
      return [];
    },
    async fetchPullRequest() {
      throw new Error('unexpected pull request fetch');
    },
    async fetchRequiredChecks() {
      throw new Error('unexpected required-check fetch');
    },
    async fetchRepositoryMergeMethods() {
      return ['squash'];
    },
    async listCommitSubjects() {
      return [];
    },
    async listDirtyPaths() {
      return [];
    },
    providerId() {
      return 'codex';
    },
    sessionId() {
      return 'session-1439';
    },
    now() {
      return '2026-08-30T16:20:00.000Z';
    },
    createIntentId() {
      return '01ARZ3NDEKTSV4RRFFQ69G5FAV';
    },
    ...overrides.deps,
  };
  return { calls, comments, deps, issue };
}

test('reviewed no-commit issue records action-free delivery and reuses exact readback', async () => {
  const harness = makeHarness({ localHeadSha: ADVANCED_HEAD });
  const input = {
    issueNumber: 1407,
    cfg: { repo: 'kburson/ai-task-manager', assignee: 'kburson', trunkRef: 'origin/trunk' },
    state: { active: '#1407', entryStartTs: '2026-08-30T16:00:00.000Z' },
    deps: harness.deps,
  };

  const delivered = await runDeliver(input);
  assert.equal(delivered.status, 'delivered');
  assert.equal(delivered.mode, 'no-commit');
  assert.equal(delivered.action, null);
  assert.equal(delivered.receipt.issueNumber, 1407);
  assert.equal(delivered.receipt.issueKind, 'epic');
  assert.equal(delivered.receipt.deliverableUrl, DELIVERABLE_URL);
  assert.equal(delivered.receipt.acceptedSha, HEAD);
  assert.equal(harness.calls.pullRequestsListed, 0);
  assert.equal(harness.calls.commentsCreated, 1);
  assert.match(harness.comments[0].body, /^<!-- aitm-no-commit-delivery /);

  const repeated = await runDeliver(input);
  assert.equal(repeated.status, 'already-delivered');
  assert.deepEqual(repeated.receipt, delivered.receipt);
  assert.equal(repeated.action, null);
  assert.equal(harness.calls.commentsCreated, 1);
  assert.equal(harness.calls.pullRequestsListed, 0);
});

test('code-kind issue never enters the no-commit delivery path', async () => {
  const harness = makeHarness({
    issue: { body: BODY.replace('<!-- aitm-issue-kind kind="epic" -->\n', '') },
  });

  await assert.rejects(
    runDeliver({
      issueNumber: 1407,
      cfg: { repo: 'kburson/ai-task-manager', assignee: 'kburson', trunkRef: 'origin/trunk' },
      state: { active: '#1407', entryStartTs: '2026-08-30T16:00:00.000Z' },
      deps: harness.deps,
    }),
    /delivery-preflight:pull-request-count/
  );
  assert.equal(harness.calls.commentsCreated, 0);
  assert.equal(harness.calls.pullRequestsListed, 1);
});

test('no-commit delivery fails closed without exact deliverable evidence', async () => {
  for (const body of [
    BODY.replace(/<!-- aitm-deliverable-posted[^>]*-->\n?/, ''),
    BODY.replace(DELIVERABLE_URL, 'not-a-url'),
  ]) {
    const harness = makeHarness({ issue: { body } });
    await assert.rejects(
      runDeliver({
        issueNumber: 1407,
        cfg: { repo: 'kburson/ai-task-manager', assignee: 'kburson', trunkRef: 'origin/trunk' },
        state: { active: '#1407', entryStartTs: '2026-08-30T16:00:00.000Z' },
        deps: harness.deps,
      }),
      /delivery-preflight:no-commit-deliverable/
    );
    assert.equal(harness.calls.commentsCreated, 0);
    assert.equal(harness.calls.pullRequestsListed, 0);
  }
});
