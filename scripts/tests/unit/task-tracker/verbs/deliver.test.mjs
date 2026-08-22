#!/usr/bin/env node
// @story #939
// cspell:ignore NDEKTSV RRFFQ

import { strict as assert } from 'node:assert';
import { createHash } from 'node:crypto';
import { test } from 'node:test';

import {
  buildDeliveryIntent,
  buildDeliveryReceipt,
  renderDeliveryIntentComment,
  renderDeliveryReceiptComment,
} from '../../../../task-tracker/lib/delivery-records.mjs';
import { serializeProviderActionRequired } from '../../../../task-tracker/lib/delivery-provider-action.mjs';
import { runDeliver, verbDeliver } from '../../../../task-tracker/verbs/deliver.mjs';

const HEAD = 'a'.repeat(40);
const NEXT_HEAD = 'b'.repeat(40);
const MERGE_HEAD = 'c'.repeat(40);
const NOW = '2026-08-22T14:00:00.000Z';
const SERVER_NOW = '2026-08-22T14:00:01.000Z';
const MERGED_AT = '2026-08-22T14:01:00.000Z';
const RECEIPT_SERVER_NOW = '2026-08-22T14:01:01.000Z';
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
    fetchOriginTrunk: 0,
    isAncestor: 0,
    inspectMergeCommit: 0,
    attributingCommits: [],
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
    prCommitSubjects: options.prCommitSubjects ??
      options.commitSubjects ?? ['[#939] Add governed delivery intent verb'],
    prState: options.prState ?? 'OPEN',
    prHead: options.prHead ?? null,
    mergeCommitSha: options.mergeCommitSha === undefined ? MERGE_HEAD : options.mergeCommitSha,
    mergedAt: options.mergedAt ?? MERGED_AT,
    prMergeMethod: options.prMergeMethod === undefined ? 'squash' : options.prMergeMethod,
    headRefDeleted: options.headRefDeleted ?? false,
    fetchFailure: options.fetchFailure ?? false,
    historyMergeMethod: options.historyMergeMethod ?? 'squash',
  };
  let intentIdIndex = 0;

  const deps = {
    resolveReviewAuthorization() {
      return Object.freeze({ mode: 'full-auto', standing: true, source: 'test' });
    },
    async fetchIssue() {
      return {
        number: 939,
        state: 'OPEN',
        projectState: 'Review',
        assignees: ['kburson'],
        agentReviewPassed: true,
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
      const pullRequest = {
        number: 1400,
        state: data.prState,
        merged: data.prState === 'MERGED',
        isDraft: false,
        baseRefName: 'trunk',
        headRefName: 'codex/939-full-auto-merge',
        headRefOid: data.prHead ?? data.head,
        mergeable: data.prState === 'OPEN' ? 'MERGEABLE' : 'UNKNOWN',
        mergeCommit: data.mergeCommitSha === null ? null : { oid: data.mergeCommitSha },
        mergedAt: data.prState === 'MERGED' ? data.mergedAt : null,
        headRefDeleted: data.headRefDeleted,
        sourceCommitSubjects: [...data.prCommitSubjects],
      };
      if (!options.omitPrMergeMethod) {
        pullRequest.mergeMethod = data.prState === 'MERGED' ? data.prMergeMethod : null;
      }
      return pullRequest;
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
      const kind = body.startsWith('<!-- aitm-delivery-receipt ') ? 'receipt' : 'intent';
      calls.events.push(`${kind}:post`);
      data.comments.push({
        id: `comment-${data.comments.length + 1}`,
        createdAt: kind === 'receipt' ? RECEIPT_SERVER_NOW : SERVER_NOW,
        body,
      });
      if (
        (options.losePostResponse === true && calls.createIssueComment === 1) ||
        (options.loseReceiptPostResponse === true && kind === 'receipt')
      ) {
        throw new Error('transport response lost');
      }
      return { id: data.comments.at(-1).id };
    },
    async fetchOriginTrunk({ remote, branch }) {
      calls.fetchOriginTrunk += 1;
      assert.equal(remote, 'origin');
      assert.equal(branch, 'trunk');
      if (data.fetchFailure) throw new Error('fetch unavailable');
    },
    async isAncestor({ ancestor, descendant }) {
      calls.isAncestor += 1;
      assert.equal(ancestor, data.mergeCommitSha);
      assert.equal(descendant, 'origin/trunk');
      return options.mergeReachable ?? true;
    },
    async inspectMergeCommit({
      mergeCommitSha,
      expectedHeadSha,
      authorizedCommitTitle,
      authorizedCommitMessage,
    }) {
      calls.inspectMergeCommit += 1;
      assert.equal(mergeCommitSha, data.mergeCommitSha);
      const intent = data.comments
        .map(({ body }) => body.match(/^<!-- aitm-delivery-intent (.+) -->/))
        .find(Boolean);
      const parsed = intent === undefined ? null : JSON.parse(intent[1]);
      const commitTitle =
        options.historyCommitTitle ??
        parsed?.commitTitle ??
        authorizedCommitTitle ??
        '[#939] Governed PR delivery';
      const commitMessage =
        options.historyCommitMessage ??
        parsed?.commitMessage ??
        authorizedCommitMessage ??
        `PR #1400\nSource: ${HEAD}\n\nAttribution: [#939]`;
      if (options.historyBytesMismatch) {
        return { parents: ['d'.repeat(40)], commitTitle, commitMessage: 'wrong bytes' };
      }
      if (data.historyMergeMethod === 'merge') {
        return {
          parents: ['d'.repeat(40), expectedHeadSha],
          commitTitle,
          commitMessage,
        };
      }
      if (data.historyMergeMethod === 'squash') {
        return { parents: ['d'.repeat(40)], commitTitle, commitMessage };
      }
      return {
        parents: ['d'.repeat(40), 'e'.repeat(40), 'f'.repeat(40)],
        commitTitle,
        commitMessage,
      };
    },
    async attributingCommits(issueNumber, { refs }) {
      calls.attributingCommits.push(issueNumber);
      assert.deepEqual(refs, ['origin/trunk']);
      const missing = new Set(options.missingAttribution ?? []);
      return missing.has(issueNumber)
        ? []
        : [{ sha: data.mergeCommitSha, subject: `[#${issueNumber}] delivered`, ts: data.mergedAt }];
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

async function mergePendingIntent(harness, overrides = {}) {
  const pending = await deliver(harness, overrides);
  assert.equal(pending.status, 'action-required');
  harness.data.prState = 'MERGED';
  return pending;
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

test('configured rebase refuses before durable intent or provider action output', async () => {
  const harness = makeHarness();
  const rebaseCfg = cfg();
  rebaseCfg.fullAutoMerge.mergeMethod = 'rebase';
  let exitCode = null;
  let output = '';

  await assert.rejects(
    () =>
      verbDeliver(
        {
          rest: ['#939'],
          cfg: rebaseCfg,
          statePath: '/injected/state.json',
        },
        {
          loadTrackerState: () => trackerState(),
          deliverDeps: harness.deps,
          writeOutput(line) {
            output = line;
          },
          setExitCode(code) {
            exitCode = code;
          },
        }
      ),
    /delivery-preflight:merge-method-unverifiable/
  );

  assert.equal(harness.calls.createIssueComment, 0);
  assert.equal(harness.data.comments.length, 0);
  assert.equal(harness.calls.fetchOriginTrunk, 0);
  assert.equal(output, '');
  assert.equal(exitCode, null);
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

test('merged exact head is independently verified and receives one durable receipt', async () => {
  const harness = makeHarness();
  await mergePendingIntent(harness);

  const result = await deliver(harness);

  assert.equal(result.status, 'delivered');
  assert.equal(result.recovery, false);
  assert.equal(result.branchDisposition, 'retained');
  assert.equal(result.receipt.expectedHeadSha, HEAD);
  assert.equal(result.receipt.mergeCommitSha, MERGE_HEAD);
  assert.equal(result.receipt.verifiedAt, MERGED_AT);
  assert.equal(harness.calls.createIssueComment, 2);
  assert.deepEqual(harness.calls.events.slice(-3), [
    'comments:read',
    'receipt:post',
    'comments:read',
  ]);
  assert.equal(harness.calls.fetchOriginTrunk, 1);
  assert.deepEqual(harness.calls.attributingCommits, [939]);
});

test('merged verification rejects a missing merge SHA', async () => {
  const harness = makeHarness({ mergeCommitSha: null });
  await mergePendingIntent(harness);
  await assert.rejects(() => deliver(harness), /delivery-verification:merge-commit-sha/);
  assert.equal(harness.calls.createIssueComment, 1);
});

test('merged verification rejects the wrong recorded pre-merge head', async () => {
  const harness = makeHarness();
  await mergePendingIntent(harness);
  harness.data.prHead = NEXT_HEAD;
  await assert.rejects(() => deliver(harness), /delivery-preflight:head-mismatch/);
  assert.equal(harness.calls.createIssueComment, 1);
});

for (const authority of ['local', 'test', 'review']) {
  test(`merged delivery refuses a ${authority} SHA disagreement without appending a receipt`, async () => {
    const harness = makeHarness();
    await mergePendingIntent(harness);
    harness.data.prHead = HEAD;
    if (authority === 'local') harness.data.head = NEXT_HEAD;
    if (authority === 'test') harness.data.testReceiptSha = NEXT_HEAD;
    if (authority === 'review') harness.data.acceptedReviewSha = NEXT_HEAD;

    await assert.rejects(() => deliver(harness), /(?:delivery-preflight|delivery-verification):/);
    assert.equal(harness.calls.createIssueComment, 1);
    assert.equal(harness.data.comments.length, 1);
  });
}

test('merged verification rejects an exposed merge-method mismatch', async () => {
  const harness = makeHarness({ prMergeMethod: 'merge' });
  await mergePendingIntent(harness);
  await assert.rejects(() => deliver(harness), /delivery-verification:merge-method/);
  assert.equal(harness.calls.createIssueComment, 1);
});

test('merged verification rejects a live-history merge-method mismatch', async () => {
  const harness = makeHarness({ prMergeMethod: null, historyMergeMethod: 'merge' });
  await mergePendingIntent(harness);
  await assert.rejects(() => deliver(harness), /delivery-verification:merge-method/);
  assert.equal(harness.calls.createIssueComment, 1);
});

test('merged verification rejects an indistinguishable live-history merge method', async () => {
  const harness = makeHarness({ prMergeMethod: null, historyMergeMethod: 'unknown' });
  await mergePendingIntent(harness);
  await assert.rejects(() => deliver(harness), /delivery-verification:merge-method-unknown/);
  assert.equal(harness.calls.createIssueComment, 1);
});

test('ordinary delivery still requires live merge bytes to equal the prior authorization', async () => {
  const harness = makeHarness({ historyBytesMismatch: true });
  await mergePendingIntent(harness);

  await assert.rejects(() => deliver(harness), /delivery-verification:merge-commit-bytes/);

  assert.equal(harness.calls.createIssueComment, 1);
});

test('configured merge verifies an exact two-parent live-history shape', async () => {
  const harness = makeHarness({ prMergeMethod: null, historyMergeMethod: 'merge' });
  const mergeCfg = cfg();
  mergeCfg.fullAutoMerge.mergeMethod = 'merge';
  await mergePendingIntent(harness, { cfg: mergeCfg });
  const result = await deliver(harness, { cfg: mergeCfg });
  assert.equal(result.status, 'delivered');
  assert.equal(result.receipt.mergeMethod, 'merge');
});

test('merged verification rejects unknown branch disposition observations', async () => {
  for (const observed of [undefined, null, 'false', 0]) {
    const harness = makeHarness();
    await mergePendingIntent(harness);
    harness.data.headRefDeleted = observed;
    await assert.rejects(() => deliver(harness), /delivery-verification:branch-disposition/);
    assert.equal(harness.calls.createIssueComment, 1);
  }
});

test('merged verification fails closed when the authoritative trunk fetch fails', async () => {
  const harness = makeHarness({ fetchFailure: true });
  await mergePendingIntent(harness);
  await assert.rejects(() => deliver(harness), /delivery-verification:fetch-origin-trunk/);
  assert.equal(harness.calls.createIssueComment, 1);
});

test('merged verification rejects a merge result unreachable from fetched origin/trunk', async () => {
  const harness = makeHarness({ mergeReachable: false });
  await mergePendingIntent(harness);
  await assert.rejects(() => deliver(harness), /delivery-verification:trunk-reachability/);
  assert.equal(harness.calls.createIssueComment, 1);
});

for (const missingIssue of [939, 1274]) {
  test(`merged verification rejects missing #${missingIssue} trunk attribution`, async () => {
    const harness = makeHarness({
      commitSubjects: ['[#939] Top-level work', '[#1274] Child work'],
      missingAttribution: [missingIssue],
    });
    await mergePendingIntent(harness);
    await assert.rejects(() => deliver(harness), /delivery-verification:attribution/);
    assert.equal(harness.calls.createIssueComment, 1);
  });
}

test('ordinary intent rejects a merge timestamp earlier than the server intent timestamp', async () => {
  const harness = makeHarness({ mergedAt: '2026-08-22T13:59:59.000Z' });
  await mergePendingIntent(harness);
  await assert.rejects(() => deliver(harness), /delivery-verification:merge-before-intent/);
  assert.equal(harness.calls.createIssueComment, 1);
});

test('ambiguous provider outcome reconciles an open PR as the same action-required intent', async () => {
  const harness = makeHarness();
  const first = await deliver(harness);
  const second = await deliver(harness);
  assert.equal(second.status, 'action-required');
  assert.equal(second.intent.intentId, first.intent.intentId);
  assert.equal(harness.calls.createIssueComment, 1);
  assert.equal(harness.calls.fetchOriginTrunk, 0);
});

test('ambiguous provider outcome reconciles a merged PR from live state, not provider output', async () => {
  const harness = makeHarness();
  await mergePendingIntent(harness);
  const result = await deliver(harness);
  assert.equal(result.status, 'delivered');
  assert.equal(harness.calls.createIssueComment, 2);
});

test('repeated exact receipt re-verifies live PR and trunk without creating another comment', async () => {
  const harness = makeHarness();
  await mergePendingIntent(harness);
  const delivered = await deliver(harness);
  const postsAfterDelivery = harness.calls.createIssueComment;

  const repeated = await deliver(harness);

  assert.equal(repeated.status, 'already-delivered');
  assert.deepEqual(repeated.receipt, delivered.receipt);
  assert.equal(harness.calls.createIssueComment, postsAfterDelivery);
  assert.equal(harness.calls.fetchOriginTrunk, 2);
});

test('lost receipt POST response is reconciled from the single server-visible receipt', async () => {
  const harness = makeHarness({ loseReceiptPostResponse: true });
  await mergePendingIntent(harness);
  const result = await deliver(harness);
  assert.equal(result.status, 'delivered');
  assert.equal(harness.calls.createIssueComment, 2);
  assert.equal(harness.data.comments.length, 2);
});

test('conflicting receipts fail closed before any new comment is created', async () => {
  const harness = makeHarness();
  const pending = await mergePendingIntent(harness);
  const delivered = await deliver(harness);
  const conflict = buildDeliveryReceipt({
    intentId: pending.intent.intentId,
    issueNumber: 939,
    prNumber: 1400,
    expectedHeadSha: HEAD,
    mergeCommitSha: NEXT_HEAD,
    baseRef: 'trunk',
    mergeMethod: 'squash',
    verifiedTrunkRef: 'origin/trunk',
    provider: 'codex',
    sessionId: 'session-939',
    verifiedAt: MERGED_AT,
  });
  harness.data.comments.push({
    id: 'comment-conflict',
    createdAt: RECEIPT_SERVER_NOW,
    body: renderDeliveryReceiptComment(conflict),
  });
  await assert.rejects(() => deliver(harness), /delivery-records:receipt-conflict/);
  assert.equal(delivered.status, 'delivered');
  assert.equal(harness.calls.createIssueComment, 2);
});

test('already-merged external recovery appends an external intent and receipt without an action', async () => {
  const harness = makeHarness({ prState: 'MERGED', headRefDeleted: true });

  const result = await deliver(harness);

  assert.equal(result.status, 'delivered');
  assert.equal(result.recovery, true);
  assert.equal(result.branchDisposition, 'deleted');
  assert.equal(result.intent.provider, 'external');
  assert.equal(result.intent.clientCreatedAt, MERGED_AT);
  assert.equal(result.receipt.provider, 'external');
  assert.equal(result.receipt.verifiedAt, MERGED_AT);
  assert.equal(result.action, null);
  assert.equal(harness.calls.createIssueComment, 2);
  assert.deepEqual(
    harness.calls.events.filter((event) => event.endsWith(':post')),
    ['intent:post', 'receipt:post']
  );
});

for (const observation of [
  { label: 'missing', options: { omitPrMergeMethod: true } },
  { label: 'null', options: { prMergeMethod: null } },
]) {
  test(`external recovery refuses ambiguous one-parent rewritten history with ${observation.label} method observation`, async () => {
    const harness = makeHarness({
      prState: 'MERGED',
      historyMergeMethod: 'squash',
      ...observation.options,
    });

    await assert.rejects(() => deliver(harness), /delivery-verification:merge-method-unknown/);

    assert.equal(harness.calls.createIssueComment, 0);
    assert.equal(harness.data.comments.length, 0);
  });
}

test('external recovery strictly rejects malformed provider merge-method evidence', async () => {
  const harness = makeHarness({
    prState: 'MERGED',
    historyMergeMethod: 'squash',
    prMergeMethod: 'SQUASH',
  });

  await assert.rejects(() => deliver(harness), /delivery-verification:merge-method-observation/);

  assert.equal(harness.calls.createIssueComment, 0);
  assert.equal(harness.data.comments.length, 0);
});

test('external recovery rejects a provider method observation that mismatches configuration', async () => {
  const harness = makeHarness({
    prState: 'MERGED',
    historyMergeMethod: 'squash',
    prMergeMethod: 'rebase',
  });

  await assert.rejects(() => deliver(harness), /delivery-verification:merge-method$/);

  assert.equal(harness.calls.createIssueComment, 0);
  assert.equal(harness.data.comments.length, 0);
});

test('external recovery structurally verifies a two-parent merge without provider method evidence', async () => {
  const harness = makeHarness({
    prState: 'MERGED',
    historyMergeMethod: 'merge',
    omitPrMergeMethod: true,
  });
  const mergeCfg = cfg();
  mergeCfg.fullAutoMerge.mergeMethod = 'merge';

  const result = await deliver(harness, { cfg: mergeCfg });

  assert.equal(result.status, 'delivered');
  assert.equal(result.receipt.mergeMethod, 'merge');
  assert.equal(harness.calls.createIssueComment, 2);
});

test('ordinary prior-intent squash remains verifiable without provider method evidence', async () => {
  const harness = makeHarness({ omitPrMergeMethod: true });
  await mergePendingIntent(harness);

  const result = await deliver(harness);

  assert.equal(result.status, 'delivered');
  assert.equal(result.recovery, false);
  assert.equal(result.receipt.mergeMethod, 'squash');
  assert.equal(harness.calls.createIssueComment, 2);
});

test('external recovery records observed merge bytes instead of synthesizing provider bytes', async () => {
  const historyCommitTitle = 'Merge pull request #1400 from codex/939-full-auto-merge';
  const historyCommitMessage = 'GitHub default merge message for the historical pull request.';
  const harness = makeHarness({
    prState: 'MERGED',
    historyCommitTitle,
    historyCommitMessage,
  });

  const result = await deliver(harness);

  assert.equal(result.status, 'delivered');
  assert.equal(result.recovery, true);
  assert.equal(result.intent.provider, 'external');
  assert.equal(result.intent.commitTitle, historyCommitTitle);
  assert.equal(result.intent.commitMessage, historyCommitMessage);
  assert.equal(
    result.intent.commitTitleSha256,
    createHash('sha256').update(historyCommitTitle).digest('hex')
  );
  assert.equal(
    result.intent.commitMessageSha256,
    createHash('sha256').update(historyCommitMessage).digest('hex')
  );
  const repeated = await deliver(harness);
  assert.equal(repeated.status, 'already-delivered');
  assert.equal(repeated.intent.commitTitle, historyCommitTitle);
  assert.equal(repeated.intent.commitMessage, historyCommitMessage);
  assert.equal(harness.calls.createIssueComment, 2);
});

for (const [label, observedBytes] of [
  ['empty-title', { historyCommitTitle: '' }],
  ['control-character-title', { historyCommitTitle: 'invalid\u0000title' }],
  ['control-character-message', { historyCommitMessage: 'invalid\u0000message' }],
]) {
  test(`external recovery refuses ${label} observed commit bytes before writing`, async () => {
    const harness = makeHarness({ prState: 'MERGED', ...observedBytes });

    await assert.rejects(() => deliver(harness), /delivery-records:commit-(?:title|message)/);

    assert.equal(harness.calls.createIssueComment, 0);
    assert.equal(harness.data.comments.length, 0);
  });
}

test('failed first external recovery writes nothing and a corrected retry succeeds', async () => {
  const harness = makeHarness({ prState: 'MERGED', fetchFailure: true });

  await assert.rejects(() => deliver(harness), /delivery-verification:fetch-origin-trunk/);
  assert.equal(harness.calls.createIssueComment, 0);
  assert.equal(harness.data.comments.length, 0);

  harness.data.fetchFailure = false;
  const retried = await deliver(harness);
  assert.equal(retried.status, 'delivered');
  assert.equal(retried.recovery, true);
  assert.equal(harness.calls.createIssueComment, 2);
});

test('external recovery derives required attribution from PR history when post-merge range is empty', async () => {
  const harness = makeHarness({
    prState: 'MERGED',
    commitSubjects: [],
    prCommitSubjects: ['[#939] Top-level work', '[#1274] Child work'],
  });

  const result = await deliver(harness);

  assert.equal(result.status, 'delivered');
  assert.deepEqual(result.intent.attributionTokens, ['#1274', '#939']);
  assert.deepEqual(harness.calls.attributingCommits, [1274, 939]);
});

test('repeated external recovery re-verifies as already delivered without timestamp reclassification', async () => {
  const harness = makeHarness({ prState: 'MERGED' });
  const recovered = await deliver(harness);
  const repeated = await deliver(harness);

  assert.equal(recovered.status, 'delivered');
  assert.equal(repeated.status, 'already-delivered');
  assert.equal(repeated.recovery, true);
  assert.equal(repeated.receipt.provider, 'external');
  assert.equal(harness.calls.createIssueComment, 2);
  assert.equal(harness.calls.fetchOriginTrunk, 2);
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
