#!/usr/bin/env node
// @story #939
// cspell:ignore NDEKTSV RRFFQ

import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

import {
  buildDeliveryIntent,
  renderDeliveryIntentComment,
} from '../../../../task-tracker/lib/delivery-records.mjs';
import { serializeProviderActionRequired } from '../../../../task-tracker/lib/delivery-provider-action.mjs';
import { runDeliver, verbDeliver } from '../../../../task-tracker/verbs/deliver.mjs';

const HEAD = 'a'.repeat(40);
const NEXT_HEAD = 'b'.repeat(40);
const NOW = '2026-08-22T14:00:00.000Z';
const SERVER_NOW = '2026-08-22T14:00:01.000Z';
const INTENT_IDS = [
  '01ARZ3NDEKTSV4RRFFQ69G5FAV',
  '01ARZ3NDEKTSV4RRFFQ69G5FAW',
  '01ARZ3NDEKTSV4RRFFQ69G5FAX',
];

function cfg() {
  return {
    repo: 'kburson/ai-task-manager',
    assignee: 'kburson',
    trunkRef: 'origin/trunk',
    fullAutoMerge: {
      mechanism: 'provider-action',
      mergeMethod: 'squash',
    },
  };
}

function trackerState() {
  return {
    active: '#939',
    entryStartTs: '2026-08-22T13:00:00.000Z',
  };
}

function makeHarness(options = {}) {
  const calls = {
    events: [],
    listIssueComments: 0,
    createIssueComment: 0,
    listPullRequests: 0,
    fetchPullRequest: 0,
    fetchRequiredChecks: 0,
    terminalTiming: 0,
    terminalBoard: 0,
    terminalDisposition: 0,
    terminalClosure: 0,
    terminalBinding: 0,
  };
  const data = {
    head: options.head ?? HEAD,
    testReceiptSha: options.testReceiptSha ?? options.head ?? HEAD,
    acceptedReviewSha: options.acceptedReviewSha ?? options.head ?? HEAD,
    lineage: options.lineage ?? { parentIssueNumber: null, deliveryTarget: 'trunk' },
    comments: [...(options.comments ?? [])],
    checks: {
      readable: true,
      required: [
        {
          name: 'ci',
          headSha: options.head ?? HEAD,
          status: 'COMPLETED',
          conclusion: 'SUCCESS',
        },
      ],
    },
    commitSubjects: options.commitSubjects ?? ['[#939] Add governed delivery intent verb'],
  };
  let intentIdIndex = 0;

  const deps = {
    async fetchIssue() {
      return {
        number: 939,
        state: 'OPEN',
        projectState: 'Review',
        assignees: ['kburson'],
        agentReviewPassed: true,
        approvalEvidence: 'full-auto',
        body: 'governed issue body',
      };
    },
    async resolveLineage() {
      return { ...data.lineage };
    },
    async getCurrentBranch() {
      return 'codex/939-full-auto-merge';
    },
    async getLocalHeadSha() {
      return data.head;
    },
    async resolveTestReceiptSha() {
      return data.testReceiptSha;
    },
    async resolveAcceptedReviewSha() {
      return data.acceptedReviewSha;
    },
    async listPullRequests({ headRef }) {
      calls.listPullRequests += 1;
      assert.equal(headRef, 'codex/939-full-auto-merge');
      return [{ number: 1400 }];
    },
    async fetchPullRequest({ prNumber }) {
      calls.fetchPullRequest += 1;
      assert.equal(prNumber, 1400);
      return {
        number: 1400,
        state: 'OPEN',
        isDraft: false,
        baseRefName: 'trunk',
        headRefName: 'codex/939-full-auto-merge',
        headRefOid: data.head,
        mergeable: 'MERGEABLE',
      };
    },
    async fetchRequiredChecks({ prNumber, expectedHeadSha }) {
      calls.fetchRequiredChecks += 1;
      assert.equal(prNumber, 1400);
      assert.equal(expectedHeadSha, data.head);
      return structuredClone(data.checks);
    },
    async fetchRepositoryMergeMethods() {
      return ['merge', 'squash', 'rebase'];
    },
    async listCommitSubjects({ range }) {
      assert.equal(range, 'origin/trunk..HEAD');
      return [...data.commitSubjects];
    },
    async listDirtyPaths() {
      return [];
    },
    async listIssueComments() {
      calls.listIssueComments += 1;
      calls.events.push('comments:read');
      return structuredClone(data.comments);
    },
    async createIssueComment({ body }) {
      calls.createIssueComment += 1;
      calls.events.push('intent:post');
      data.comments.push({
        id: `comment-${data.comments.length + 1}`,
        createdAt: SERVER_NOW,
        body,
      });
      if (options.losePostResponse === true && calls.createIssueComment === 1) {
        throw new Error('transport response lost');
      }
      return { id: data.comments.at(-1).id };
    },
    now() {
      return NOW;
    },
    createIntentId() {
      return INTENT_IDS[intentIdIndex++];
    },
    providerId() {
      return 'codex';
    },
    sessionId() {
      return 'session-939';
    },
    async flushTerminalTiming() {
      calls.terminalTiming += 1;
    },
    async moveBoardToDone() {
      calls.terminalBoard += 1;
    },
    async setTerminalDisposition() {
      calls.terminalDisposition += 1;
    },
    async closeIssue() {
      calls.terminalClosure += 1;
    },
    async releaseBinding() {
      calls.terminalBinding += 1;
    },
  };

  return { calls, data, deps };
}

async function deliver(harness, overrides = {}) {
  return runDeliver({
    issueNumber: 939,
    cfg: cfg(),
    state: trackerState(),
    deps: harness.deps,
    ...overrides,
  });
}

test('first open-PR call posts one exact intent before emitting one action and exits 20', async () => {
  const harness = makeHarness();
  let exitCode = null;
  let output = '';
  await verbDeliver(
    {
      rest: ['#939'],
      cfg: cfg(),
      statePath: '/injected/state.json',
    },
    {
      loadTrackerState: () => trackerState(),
      deliverDeps: harness.deps,
      writeOutput(line) {
        harness.calls.events.push('action:emit');
        output = line;
      },
      setExitCode(code) {
        exitCode = code;
      },
    }
  );

  assert.equal(harness.calls.createIssueComment, 1);
  assert.deepEqual(harness.calls.events.slice(-3), ['intent:post', 'comments:read', 'action:emit']);
  const posted = harness.data.comments[0].body;
  const parsedIntent = JSON.parse(posted.match(/^<!-- aitm-delivery-intent (.+) -->/)[1]);
  assert.equal(posted, renderDeliveryIntentComment(parsedIntent));
  assert.equal(output, serializeProviderActionRequired((await deliver(makeHarness())).action));
  assert.equal(exitCode, 20);
});

test('lost POST response reconciles the server-visible dedupe key without posting again', async () => {
  const harness = makeHarness({ losePostResponse: true });
  const result = await deliver(harness);

  assert.equal(result.status, 'action-required');
  assert.equal(harness.calls.createIssueComment, 1);
  assert.equal(harness.data.comments.length, 1);
  assert.ok(harness.calls.listIssueComments >= 2);
  assert.equal(result.intent.intentId, INTENT_IDS[0]);
});

test('same dedupe key with divergent authorized bytes fails closed', async () => {
  const divergent = buildDeliveryIntent({
    intentId: INTENT_IDS[0],
    supersedesIntentId: null,
    issueNumber: 939,
    repository: 'kburson/ai-task-manager',
    prNumber: 1400,
    baseRef: 'trunk',
    headRef: 'codex/939-full-auto-merge',
    expectedHeadSha: HEAD,
    mergeMethod: 'squash',
    attributionTokens: ['#938', '#939'],
    commitTitle: '[#939] Governed PR delivery',
    commitMessage: `PR #1400\nSource: ${HEAD}\n\nAttribution: [#939] [#938]`,
    provider: 'codex',
    sessionId: 'session-previous',
    clientCreatedAt: '2026-08-22T13:59:00.000Z',
  });
  const harness = makeHarness({
    comments: [
      {
        id: 'comment-existing',
        createdAt: '2026-08-22T13:59:01.000Z',
        body: renderDeliveryIntentComment(divergent),
      },
    ],
  });

  await assert.rejects(() => deliver(harness), /deliver:intent-divergence/);
  assert.equal(harness.calls.createIssueComment, 0);
});

test('same-head pending intent reruns live preflight and re-emits byte-identical JSON', async () => {
  const harness = makeHarness();
  const first = await deliver(harness);
  const firstJson = serializeProviderActionRequired(first.action);
  const second = await deliver(harness);

  assert.equal(second.status, 'action-required');
  assert.equal(harness.calls.createIssueComment, 1);
  assert.equal(harness.calls.fetchPullRequest, 2);
  assert.equal(harness.calls.fetchRequiredChecks, 2);
  assert.equal(serializeProviderActionRequired(second.action), firstJson);
});

test('changed head requires fresh Test and review evidence then supersedes the prior intent', async () => {
  const harness = makeHarness();
  const first = await deliver(harness);
  harness.data.head = NEXT_HEAD;
  harness.data.checks.required[0].headSha = NEXT_HEAD;

  await assert.rejects(() => deliver(harness), /delivery-preflight:head-mismatch/);
  assert.equal(harness.calls.createIssueComment, 1);

  harness.data.testReceiptSha = NEXT_HEAD;
  harness.data.acceptedReviewSha = NEXT_HEAD;
  const replacement = await deliver(harness);

  assert.equal(replacement.status, 'action-required');
  assert.equal(replacement.intent.expectedHeadSha, NEXT_HEAD);
  assert.equal(replacement.intent.supersedesIntentId, first.intent.intentId);
  assert.equal(harness.calls.createIssueComment, 2);
});

test('child lineage returns an explicit non-provider result without provider or terminal effects', async () => {
  const harness = makeHarness({
    lineage: { parentIssueNumber: 938, deliveryTarget: 'epic/938' },
  });
  const result = await deliver(harness);

  assert.deepEqual(result, {
    status: 'not-provider-delivery',
    reason: 'child-lineage',
    intent: null,
    receipt: null,
    action: null,
  });
  assert.equal(harness.calls.listPullRequests, 0);
  assert.equal(harness.calls.createIssueComment, 0);
  assert.deepEqual(
    [
      harness.calls.terminalTiming,
      harness.calls.terminalBoard,
      harness.calls.terminalDisposition,
      harness.calls.terminalClosure,
      harness.calls.terminalBinding,
    ],
    [0, 0, 0, 0, 0]
  );
});

test('unknown lineage fails closed instead of being classified as child delivery', async () => {
  const harness = makeHarness({ lineage: {} });
  await assert.rejects(() => deliver(harness), /deliver:lineage/);
  assert.equal(harness.calls.listPullRequests, 0);
  assert.equal(harness.calls.createIssueComment, 0);
});

test('requested issue number never substitutes for a missing active binding', async () => {
  const harness = makeHarness();
  await assert.rejects(
    () => deliver(harness, { state: { active: null, entryStartTs: NOW } }),
    /delivery-preflight:input/
  );
  assert.equal(harness.calls.createIssueComment, 0);
});

test('deliver source has no terminal lifecycle dependency', () => {
  const source = readFileSync(
    new URL('../../../../task-tracker/verbs/deliver.mjs', import.meta.url),
    'utf8'
  );
  for (const forbidden of [
    'flushTerminalTiming',
    'moveBoardToDone',
    'setTerminalDisposition',
    'closeIssue',
    'releaseBinding',
  ]) {
    assert.equal(source.includes(forbidden), false, forbidden);
  }
});
