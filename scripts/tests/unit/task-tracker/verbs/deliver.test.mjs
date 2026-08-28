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
import { verbDeliver } from '../../../../task-tracker/verbs/deliver.mjs';
import {
  HEAD,
  INTENT_IDS,
  MERGE_HEAD,
  MERGED_AT,
  NEXT_HEAD,
  NOW,
  RECEIPT_SERVER_NOW,
  SERVER_NOW,
  advancePendingDelivery,
  cfg,
  deliver,
  makeHarness,
  mergePendingIntent,
  trackerState,
} from './deliver-test-harness.mjs';

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
  assert.deepEqual(harness.calls.attributingCommits, []);
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
  await assert.rejects(() => deliver(harness), /delivery-preflight:pull-request-count/);
  assert.equal(harness.calls.createIssueComment, 1);
});

for (const authority of ['test', 'review']) {
  test(`merged delivery refuses a ${authority} SHA disagreement without appending a receipt`, async () => {
    const harness = makeHarness();
    await mergePendingIntent(harness);
    harness.data.prHead = HEAD;
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

test('advanced local head recovers one historical receipt from a prior durable intent', async () => {
  const harness = makeHarness();
  const pending = await advancePendingDelivery(harness);
  assert.equal(pending.mode, 'current-head');

  const recovered = await deliver(harness);
  assert.equal(recovered.mode, 'historical-recovery');
  assert.equal(recovered.status, 'delivered');
  assert.equal(recovered.intent.expectedHeadSha, HEAD);
  assert.equal(recovered.receipt.expectedHeadSha, HEAD);
  assert.equal(recovered.action, null);
  assert.equal(harness.calls.createIssueComment, 2);

  const retry = await deliver(harness);
  assert.equal(retry.mode, 'historical-recovery');
  assert.equal(retry.status, 'already-delivered');
  assert.equal(retry.action, null);
  assert.equal(harness.calls.createIssueComment, 2);
});

test('advanced local head refuses historical recovery while the accepted PR is open', async () => {
  const harness = makeHarness();
  await deliver(harness);
  harness.data.prHead = HEAD;
  harness.data.head = NEXT_HEAD;

  await assert.rejects(() => deliver(harness), /delivery-preflight:pull-request-not-merged/);
  assert.equal(harness.calls.createIssueComment, 1);
});

test('advanced local head requires accepted Agent Review and standing approval', async () => {
  for (const invalid of ['agent-review', 'approval']) {
    const harness = makeHarness();
    await advancePendingDelivery(harness);
    if (invalid === 'agent-review') harness.data.agentReviewPassed = false;
    if (invalid === 'approval') {
      harness.data.reviewAuthorization = { mode: 'full-auto', standing: false, source: 'test' };
    }

    await assert.rejects(
      () => deliver(harness),
      invalid === 'agent-review'
        ? /delivery-preflight:agent-review-evidence/
        : /delivery-preflight:approval-evidence/
    );
    assert.equal(harness.calls.createIssueComment, 1);
  }
});

test('advanced local head refuses wrong-SHA Test or Review evidence', async () => {
  for (const invalid of ['test', 'review']) {
    const harness = makeHarness();
    await advancePendingDelivery(harness);
    if (invalid === 'test') harness.data.testReceiptSha = NEXT_HEAD;
    if (invalid === 'review') harness.data.acceptedReviewSha = NEXT_HEAD;

    await assert.rejects(() => deliver(harness), /delivery-preflight:head-mismatch/);
    assert.equal(harness.calls.createIssueComment, 1);
  }
});

test('advanced local head enforces intent-time ordering and trunk reachability', async () => {
  for (const invalid of ['merge-time', 'reachability']) {
    const harness = makeHarness();
    await advancePendingDelivery(harness);
    if (invalid === 'merge-time') harness.data.mergedAt = '2026-08-22T13:59:59.000Z';
    if (invalid === 'reachability') harness.deps.isAncestor = async () => false;

    await assert.rejects(
      () => deliver(harness),
      invalid === 'merge-time'
        ? /delivery-verification:merge-before-intent/
        : /delivery-verification:trunk-reachability/
    );
    assert.equal(harness.calls.createIssueComment, 1);
  }
});

for (const [label, override] of [
  ['repository', { repository: 'kburson/wrong-repository' }],
  [
    'issue',
    {
      issueNumber: 940,
      attributionTokens: ['#940'],
      commitTitle: '[#940] Governed PR delivery',
      commitMessage: `PR #1400\nSource: ${HEAD}\n\nAttribution: [#940]`,
    },
  ],
  [
    'pull request',
    { prNumber: 1401, commitMessage: `PR #1401\nSource: ${HEAD}\n\nAttribution: [#939]` },
  ],
  ['base', { baseRef: 'main' }],
  ['branch', { headRef: 'codex/wrong-branch' }],
  [
    'head',
    {
      expectedHeadSha: NEXT_HEAD,
      commitMessage: `PR #1400\nSource: ${NEXT_HEAD}\n\nAttribution: [#939]`,
    },
  ],
  ['method', { mergeMethod: 'merge' }],
  [
    'attribution',
    {
      attributionTokens: ['#938', '#939'],
      commitMessage: `PR #1400\nSource: ${HEAD}\n\nAttribution: [#939] [#938]`,
    },
  ],
  ['title', { commitTitle: '[#939] Wrong title' }],
  ['message', { commitMessage: `PR #1400\nSource: ${HEAD}\n\nAttribution: [#939] wrong` }],
]) {
  test(`advanced local head rejects divergent prior intent ${label} bytes`, async () => {
    const harness = makeHarness();
    const pending = await advancePendingDelivery(harness);
    const intentInput = structuredClone(pending.intent);
    for (const key of ['schema', 'state', 'commitTitleSha256', 'commitMessageSha256']) {
      delete intentInput[key];
    }
    const divergent = buildDeliveryIntent({ ...intentInput, ...override });
    harness.data.comments[0] = {
      ...harness.data.comments[0],
      body: renderDeliveryIntentComment(divergent),
    };

    await assert.rejects(
      () => deliver(harness),
      /(?:delivery-preflight:historical-intent|delivery-records:|deliver:)/
    );
    assert.equal(harness.calls.createIssueComment, 1);
  });
}

test('advanced local head refuses historical recovery when Full-Auto delivery is disabled', async () => {
  const harness = makeHarness();
  await advancePendingDelivery(harness);
  const disabled = cfg();
  disabled.fullAutoMerge.mechanism = 'manual';

  await assert.rejects(
    () => deliver(harness, { cfg: disabled }),
    /delivery-preflight:configuration/
  );
  assert.equal(harness.calls.createIssueComment, 1);
});

test('advanced local head rejects duplicate and divergent historical receipts', async () => {
  for (const invalid of ['duplicate', 'divergent']) {
    const harness = makeHarness();
    const pending = await advancePendingDelivery(harness);
    const recovered = await deliver(harness);
    const receipt =
      invalid === 'duplicate'
        ? recovered.receipt
        : buildDeliveryReceipt({
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
      id: `comment-${invalid}`,
      createdAt: RECEIPT_SERVER_NOW,
      body: renderDeliveryReceiptComment(receipt),
    });

    await assert.rejects(
      () => deliver(harness),
      /delivery-records:(?:duplicate-receipt|receipt-conflict)/
    );
    assert.equal(harness.calls.createIssueComment, 2);
  }
});

test('advanced local head refuses historical recovery without a prior intent', async () => {
  const harness = makeHarness({
    prState: 'MERGED',
    prHead: HEAD,
    head: NEXT_HEAD,
    testReceiptSha: HEAD,
    acceptedReviewSha: HEAD,
  });

  await assert.rejects(() => deliver(harness), /delivery-preflight:historical-intent/);

  assert.equal(harness.calls.createIssueComment, 0);
  assert.equal(harness.data.comments.length, 0);
});

test('advanced local head refuses an external recovery intent', async () => {
  const externalIntent = buildDeliveryIntent({
    intentId: INTENT_IDS[0],
    supersedesIntentId: null,
    issueNumber: 939,
    repository: 'kburson/ai-task-manager',
    prNumber: 1400,
    baseRef: 'trunk',
    headRef: 'codex/939-full-auto-merge',
    expectedHeadSha: HEAD,
    mergeMethod: 'squash',
    attributionTokens: ['#939'],
    commitTitle: '[#939] Governed PR delivery',
    commitMessage: `PR #1400\nSource: ${HEAD}\n\nAttribution: [#939]`,
    provider: 'external',
    sessionId: 'session-previous',
    clientCreatedAt: '2026-08-22T13:59:00.000Z',
  });
  const harness = makeHarness({
    prState: 'MERGED',
    prHead: HEAD,
    head: NEXT_HEAD,
    testReceiptSha: HEAD,
    acceptedReviewSha: HEAD,
    comments: [
      {
        id: 'comment-existing',
        createdAt: SERVER_NOW,
        body: renderDeliveryIntentComment(externalIntent),
      },
    ],
  });

  await assert.rejects(() => deliver(harness), /delivery-preflight:historical-intent/);

  assert.equal(harness.calls.createIssueComment, 0);
  assert.equal(harness.data.comments.length, 1);
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
  const historyCommitMessage =
    'GitHub default merge message for the historical pull request.\n\nAttribution: [#939]';
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
    historyCommitMessage: `PR #1400\nSource: ${HEAD}\n\n` + 'Attribution: [#939] [#1274]',
  });

  const result = await deliver(harness);

  assert.equal(result.status, 'delivered');
  assert.deepEqual(result.intent.attributionTokens, ['#1274', '#939']);
  assert.deepEqual(harness.calls.attributingCommits, []);
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

  await assert.rejects(() => deliver(harness), /delivery-preflight:pull-request-count/);
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
