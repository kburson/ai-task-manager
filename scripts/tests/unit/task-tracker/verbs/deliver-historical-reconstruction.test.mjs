#!/usr/bin/env node
// @story #2096
// @story #1574
// @story #939
// Historical intent reconstruction, retry provenance, and compatibility boundaries.

import { strict as assert } from 'node:assert';
import { test } from 'node:test';

import {
  buildDeliveryIntent,
  renderDeliveryIntentComment,
} from '../../../../task-tracker/lib/delivery-records.mjs';
import {
  HEAD,
  INTENT_IDS,
  MERGE_HEAD,
  NEXT_HEAD,
  SERVER_NOW,
  advancePendingDelivery,
  deliver,
  makeHarness,
} from './deliver-test-harness.mjs';

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

function historicalReconstructionHarness(options = {}) {
  return makeHarness({
    prState: 'MERGED',
    prHead: HEAD,
    head: NEXT_HEAD,
    testReceiptSha: HEAD,
    acceptedReviewSha: HEAD,
    prMergeMethod: null,
    historyMergeMethod: 'merge',
    ...options,
  });
}

const historicalReconcile = {
  declaredMergeMethod: 'merge',
  reason: 'The historical PR was merged manually before delivery intent existed.',
  operator: 'kburson',
};

test('advanced local head explicitly reconstructs a missing intent after proving historical delivery', async () => {
  const harness = historicalReconstructionHarness();
  const append = harness.deps.createIssueComment;
  harness.deps.createIssueComment = async (input) => {
    // Both the preliminary observation and independent verification must finish
    // before even the reconciliation record may be posted.
    const receiptWrite = input.body.startsWith('<!-- aitm-delivery-receipt ');
    assert.equal(harness.calls.fetchOriginTrunk, receiptWrite ? 2 : 1);
    assert.equal(harness.calls.isAncestor, receiptWrite ? 2 : 1);
    assert.equal(harness.calls.inspectMergeCommit, 2);
    return append(input);
  };

  await assert.rejects(() => deliver(harness), /delivery-preflight:historical-intent/);
  assert.equal(harness.calls.createIssueComment, 0);

  const result = await deliver(harness, { reconcile: historicalReconcile });

  assert.equal(result.status, 'delivered');
  assert.equal(result.mode, 'historical-reconstruction');
  assert.equal(result.recovery, true);
  assert.equal(result.action, null);
  assert.equal(result.intent.provider, 'external');
  assert.equal(result.intent.expectedHeadSha, HEAD);
  assert.equal(result.receipt.expectedHeadSha, HEAD);
  assert.equal(result.receipt.mergeCommitSha, MERGE_HEAD);
  assert.equal(result.receipt.mergeMethod, 'merge');
  assert.equal(result.receipt.provider, 'external');
  assert.equal(harness.data.head, NEXT_HEAD);
  assert.equal(harness.calls.fetchRequiredChecks, 0);
  assert.equal(harness.calls.createIssueComment, 3);
  assert.deepEqual(
    harness.data.comments.map(({ body }) => body.match(/^<!-- (\S+) /)[1]),
    ['aitm-delivery-method-reconciliation', 'aitm-delivery-intent', 'aitm-delivery-receipt']
  );
  const reconciliation = JSON.parse(harness.data.comments[0].body.match(/^<!-- \S+ (.+) -->/)[1]);
  assert.equal(reconciliation.schema, 'aitm.delivery-method-reconciliation/v2');
  assert.equal(reconciliation.intentOrigin, 'retroactively-reconstructed');
  assert.equal(reconciliation.acceptedSha, HEAD);
  assert.equal(reconciliation.mergeCommitSha, MERGE_HEAD);
  assert.deepEqual(harness.calls.events.slice(-4), [
    'intent:post',
    'comments:read',
    'receipt:post',
    'comments:read',
  ]);
});

test('historical reconstruction and every retry enforce manual approval of the accepted historical SHA', async (t) => {
  const original = historicalReconstructionHarness();
  await deliver(original, { reconcile: historicalReconcile });
  for (const prefixLength of [0, 1, 2, 3]) {
    for (const [label, approvedSha] of [
      ['missing', null],
      ['stale local-head', NEXT_HEAD],
      ['exact accepted-head', HEAD],
    ]) {
      await t.test(`${prefixLength} records: ${label} approval`, async () => {
        const comments = original.data.comments.slice(0, prefixLength);
        const harness = historicalReconstructionHarness({
          comments,
          manualCodeReview: true,
          reviews:
            approvedSha === null
              ? []
              : [
                  {
                    authorLogin: 'kburson',
                    authorIsBot: false,
                    state: 'APPROVED',
                    commitOid: approvedSha,
                    submittedAt: SERVER_NOW,
                  },
                ],
        });
        const observedHeads = [];
        const fetchReview = harness.deps.fetchManualCodeReviewEvidence;
        harness.deps.fetchManualCodeReviewEvidence = async (input) => {
          observedHeads.push(input.expectedHeadSha);
          if (observedHeads.length === 1) assert.equal(harness.calls.createIssueComment, 0);
          return fetchReview(input);
        };
        if (approvedSha === HEAD) {
          const result = await deliver(harness, { reconcile: historicalReconcile });
          assert.equal(result.status, prefixLength === 3 ? 'already-delivered' : 'delivered');
          assert.equal(result.mode, 'historical-reconstruction');
          assert.equal(harness.calls.createIssueComment, 3 - prefixLength);
        } else {
          await assert.rejects(
            () => deliver(harness, { reconcile: historicalReconcile }),
            /delivery-preflight:manual-code-review-approval-missing/
          );
          assert.equal(harness.calls.createIssueComment, 0);
          assert.deepEqual(harness.data.comments, comments);
        }
        assert.ok(observedHeads.length >= 1);
        assert.ok(observedHeads.every((sha) => sha === HEAD));
        assert.equal(harness.calls.requestPullRequestReview, 0);
        assert.equal(harness.calls.fetchRequiredChecks, 0);
      });
    }
  }
});

test('ordinary prior-intent historical recovery retains its existing manual-review behavior', async () => {
  const harness = makeHarness();
  await advancePendingDelivery(harness);
  harness.data.manualCodeReview = true;
  harness.deps.fetchManualCodeReviewEvidence = () => {
    assert.fail('ordinary historical recovery must retain its existing path');
  };
  const result = await deliver(harness);
  assert.equal(result.status, 'delivered');
  assert.equal(result.mode, 'historical-recovery');
});

for (const prefixLength of [1, 2, 3]) {
  test(`historical reconstruction retries a persisted ${prefixLength}-record prefix without duplicates`, async () => {
    const original = historicalReconstructionHarness();
    const delivered = await deliver(original, { reconcile: historicalReconcile });
    const comments = original.data.comments.slice(0, prefixLength);
    const harness = historicalReconstructionHarness({ comments });
    harness.deps.createIntentId = () => {
      assert.equal(prefixLength, 1, 'a persisted intent must retain its identity');
      return INTENT_IDS[1];
    };

    const result = await deliver(harness, { reconcile: historicalReconcile });

    assert.equal(result.status, prefixLength === 3 ? 'already-delivered' : 'delivered');
    assert.equal(result.mode, 'historical-reconstruction');
    assert.equal(result.recovery, true);
    assert.equal(harness.calls.fetchOriginTrunk, prefixLength === 3 ? 1 : 2);
    assert.equal(harness.calls.isAncestor, prefixLength === 3 ? 1 : 2);
    assert.equal(harness.calls.createIssueComment, 3 - prefixLength);
    assert.equal(harness.data.comments.length, 3);
    assert.deepEqual(harness.data.comments.slice(0, prefixLength), comments);
    if (prefixLength > 1) assert.deepEqual(result.intent, delivered.intent);
    if (prefixLength === 3) assert.deepEqual(result.receipt, delivered.receipt);
  });
}

test('historical reconstruction recovers a lost reconciliation POST response without duplicate records', async () => {
  const harness = historicalReconstructionHarness({ losePostResponse: true });
  await assert.rejects(
    () => deliver(harness, { reconcile: historicalReconcile }),
    /transport response lost/
  );
  assert.equal(harness.data.comments.length, 1);
  const result = await deliver(harness, { reconcile: historicalReconcile });
  assert.equal(result.status, 'delivered');
  assert.equal(harness.calls.createIssueComment, 3);
  assert.equal(harness.data.comments.length, 3);
});

test('historical reconstruction retries require explicit authority and fresh provider/Git proof', async (t) => {
  const original = historicalReconstructionHarness();
  await deliver(original, { reconcile: historicalReconcile });
  for (const prefixLength of [1, 2, 3]) {
    for (const [label, options, reconcile, error] of [
      ['missing flag', {}, null, /delivery-preflight:historical-intent/],
      [
        'changed reason',
        {},
        { ...historicalReconcile, reason: 'A different reason to reconstruct.' },
        /deliver:historical-reconstruction-provenance/,
      ],
      [
        'placeholder reason',
        {},
        { ...historicalReconcile, reason: 'TBD' },
        /delivery-method-reconciliation:reason/,
      ],
      [
        'changed declaration',
        {},
        { ...historicalReconcile, declaredMergeMethod: 'squash' },
        /delivery-method-reconciliation:declared-not-observed/,
      ],
      [
        'unreachable merge',
        { mergeReachable: false },
        historicalReconcile,
        /delivery-verification:trunk-reachability/,
      ],
      [
        'changed topology',
        { historyMergeMethod: 'unknown' },
        historicalReconcile,
        /delivery-verification:merge-method-unattributable/,
      ],
      [
        'changed live bytes',
        { historyCommitMessage: 'Changed commit bytes' },
        historicalReconcile,
        /delivery-verification:(?:attribution|merge-commit-bytes)/,
      ],
    ]) {
      await t.test(`${prefixLength} records: ${label}`, async () => {
        const comments = original.data.comments.slice(0, prefixLength);
        const harness = historicalReconstructionHarness({ comments, ...options });
        await assert.rejects(() => deliver(harness, { reconcile }), error);
        assert.equal(harness.calls.createIssueComment, 0);
        assert.deepEqual(harness.data.comments, comments);
      });
    }
  }
});

test('historical reconstruction refuses missing, malformed, or mismatched v2 retry provenance', async (t) => {
  const original = historicalReconstructionHarness();
  await deliver(original, { reconcile: historicalReconcile });
  const valid = JSON.parse(original.data.comments[0].body.match(/^<!-- \S+ (.+) -->/)[1]);
  for (const [label, override] of [
    ['missing', null],
    ['malformed', 'broken JSON'],
    ['v1 only', { schema: 'aitm.delivery-method-reconciliation/v1', intentOrigin: undefined }],
    ['wrong origin', { intentOrigin: 'delivery-time' }],
    ['wrong issue', { issueNumber: 940 }],
    ['wrong repository', { repository: 'kburson/other' }],
    ['wrong PR', { prNumber: 1401 }],
    ['wrong accepted SHA', { acceptedSha: NEXT_HEAD }],
    ['wrong merge SHA', { mergeCommitSha: NEXT_HEAD }],
    ['wrong configured method', { configuredMergeMethod: 'rebase' }],
    ['wrong observed method', { observedMergeMethod: 'rebase' }],
    ['wrong reason', { reason: 'A different reconstruction explanation.' }],
    ['false divergence', { divergent: false }],
  ]) {
    await t.test(label, async () => {
      const comments = structuredClone(original.data.comments.slice(0, 2));
      if (override === null) comments.shift();
      else {
        const record = { ...valid, ...override };
        const json =
          typeof override === 'string'
            ? override
            : JSON.stringify(record, Object.keys(record).sort());
        comments[0].body = `<!-- aitm-delivery-method-reconciliation ${json} -->`;
      }
      const harness = historicalReconstructionHarness({ comments });
      await assert.rejects(
        () => deliver(harness, { reconcile: historicalReconcile }),
        /(?:deliver:historical-reconstruction-provenance|delivery-method-reconciliation:)/
      );
      assert.equal(harness.calls.createIssueComment, 0);
      assert.deepEqual(harness.data.comments, comments);
    });
  }
});

for (const [label, options, reconcile, error] of [
  [
    'unmerged PR',
    { prState: 'OPEN' },
    historicalReconcile,
    /delivery-preflight:pull-request-not-merged/,
  ],
  [
    'unreachable merge',
    { mergeReachable: false },
    historicalReconcile,
    /delivery-verification:trunk-reachability/,
  ],
  [
    'unattributable topology',
    { historyMergeMethod: 'unknown' },
    historicalReconcile,
    /delivery-verification:merge-method-unattributable/,
  ],
  [
    'declared method mismatch',
    {},
    { ...historicalReconcile, declaredMergeMethod: 'squash' },
    /delivery-method-reconciliation:declared-not-observed/,
  ],
  ['missing flag', {}, null, /delivery-preflight:historical-intent/],
  [
    'failed trunk fetch',
    { fetchFailure: true },
    historicalReconcile,
    /delivery-verification:fetch-origin-trunk/,
  ],
  [
    'provider method mismatch',
    { prMergeMethod: 'squash' },
    historicalReconcile,
    /delivery-verification:merge-method\b/,
  ],
  [
    'invalid attribution',
    { historyCommitMessage: 'Missing required attribution' },
    historicalReconcile,
    /delivery-verification:attribution/,
  ],
]) {
  test(`historical reconstruction refuses ${label} without any ledger writes`, async () => {
    const harness = historicalReconstructionHarness(options);

    await assert.rejects(() => deliver(harness, { reconcile }), error);

    assert.equal(harness.calls.createIssueComment, 0);
    assert.equal(harness.data.comments.length, 0);
  });
}

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

function historicalSquashHarness(options = {}) {
  return historicalReconstructionHarness({
    historyMergeMethod: 'squash',
    historyTree: 'e'.repeat(40),
    prSourceEvidence: [
      {
        oid: HEAD,
        parents: ['d'.repeat(40)],
        tree: 'e'.repeat(40),
        message: '[#939] Source repair',
      },
    ],
    ...options,
  });
}
const squashReconcile = { ...historicalReconcile, declaredMergeMethod: 'squash' };

test('historical reconstruction proves a complete single-source squash and resumes every persisted prefix', async () => {
  const original = historicalSquashHarness();
  const delivered = await deliver(original, { reconcile: squashReconcile });
  assert.equal(delivered.mode, 'historical-reconstruction');
  assert.equal(delivered.receipt.mergeMethod, 'squash');
  assert.equal(delivered.intent.provider, 'external');
  assert.equal(delivered.action, null);
  assert.equal(original.data.head, NEXT_HEAD);
  assert.equal(original.data.comments.length, 3);
  for (const prefix of [1, 2, 3]) {
    const comments = structuredClone(original.data.comments.slice(0, prefix));
    const h = historicalSquashHarness({ comments });
    const result = await deliver(h, { reconcile: squashReconcile });
    assert.equal(result.status, prefix === 3 ? 'already-delivered' : 'delivered');
    assert.equal(result.receipt.mergeMethod, 'squash');
    assert.equal(result.action, null);
    assert.deepEqual(h.data.comments.slice(0, prefix), comments);
    assert.equal(h.data.comments.length, 3);
  }
});

test('historical squash reconstruction refuses incomplete or contradictory evidence before any ledger write', async (t) => {
  for (const [label, overrides] of [
    ['incomplete inventory', { sourceCommitsComplete: false }],
    ['wrong inventory head', { sourceCommitsHeadSha: NEXT_HEAD }],
    ['missing source proof', { prSourceEvidence: null }],
    ['wrong tree', { historyTree: 'f'.repeat(40) }],
    [
      'wrong parent',
      {
        prSourceEvidence: [
          {
            oid: HEAD,
            parents: [NEXT_HEAD],
            tree: 'e'.repeat(40),
            message: '[#939] Source repair',
          },
        ],
      },
    ],
    [
      'unchanged message cannot distinguish rewrite',
      { historyCommitTitle: '[#939] Source repair', historyCommitMessage: '' },
    ],
  ]) {
    await t.test(label, async () => {
      const h = historicalSquashHarness(overrides);
      await assert.rejects(
        () => deliver(h, { reconcile: squashReconcile }),
        /(?:delivery-verification:merge-method-unattributable|delivery-preflight:attribution)/
      );
      assert.equal(h.calls.createIssueComment, 0);
      assert.equal(h.data.comments.length, 0);
    });
  }
});

test('historical reconstruction refuses authority drift after merge proof before its first ledger write', async (t) => {
  for (const field of ['head', 'issueBody', 'source']) {
    await t.test(field, async () => {
      const h = historicalSquashHarness();
      const inspect = h.deps.inspectMergeCommit;
      h.deps.inspectMergeCommit = async (input) => {
        const result = await inspect(input);
        if (h.calls.inspectMergeCommit === 2) {
          if (field === 'head') h.data.head = HEAD;
          if (field === 'issueBody') h.data.issueBody += '\nChanged declarations';
          if (field === 'source') h.data.prSourceEvidence[0].tree = 'f'.repeat(40);
        }
        return result;
      };
      await assert.rejects(
        () => deliver(h, { reconcile: squashReconcile }),
        /deliver:historical-authority-drift/
      );
      assert.equal(h.calls.createIssueComment, 0);
      assert.equal(h.data.comments.length, 0);
    });
  }
});

test('historical reconstruction revalidates lifecycle, ownership and complete admission before publication', async (t) => {
  for (const [field, value] of [
    ['state', 'CLOSED'],
    ['projectState', 'Develop'],
    ['assignees', ['someone-else']],
    ['dirty', ['owned.mjs']],
    ['lineage', { parentIssueNumber: 42, deliveryTarget: 'epic/42' }],
    ['inventory', true],
  ]) {
    await t.test(field, async () => {
      const h = historicalSquashHarness();
      let changed = false;
      const inspect = h.deps.inspectMergeCommit;
      h.deps.inspectMergeCommit = async (input) => {
        const result = await inspect(input);
        if (h.calls.inspectMergeCommit === 2) changed = true;
        return result;
      };
      const fetchIssue = h.deps.fetchIssue;
      h.deps.fetchIssue = async (input) => ({
        ...(await fetchIssue(input)),
        ...(changed && ['state', 'projectState', 'assignees'].includes(field)
          ? { [field]: value }
          : {}),
      });
      const dirty = h.deps.listDirtyPaths;
      h.deps.listDirtyPaths = async (input) =>
        changed && field === 'dirty' ? value : dirty(input);
      const lineage = h.deps.resolveLineage;
      h.deps.resolveLineage = async (input) =>
        changed && field === 'lineage' ? value : lineage(input);
      const list = h.deps.listPullRequests;
      h.deps.listPullRequests = async (input) => {
        const result = await list(input);
        return changed && field === 'inventory' ? [...result, result[0]] : result;
      };
      await assert.rejects(
        () => deliver(h, { reconcile: squashReconcile }),
        /deliver:historical-authority-drift/
      );
      assert.equal(h.calls.createIssueComment, 0);
    });
  }
});
