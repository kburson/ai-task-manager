#!/usr/bin/env node
// @story #1393
// cspell:ignore NDEKTSV RRFFQ

import { strict as assert } from 'node:assert';
import { test } from 'node:test';

import { buildDeliveryIntent } from '../../../../task-tracker/lib/delivery-records.mjs';
import {
  DeliveryPreflightError,
  validateDeliveryPreflight,
  validateMergedDeliveryPreflight,
} from '../../../../task-tracker/lib/delivery-preflight.mjs';
import {
  verifyDeliveredPullRequest,
  verifyExternalDeliveredPullRequest,
} from '../../../../task-tracker/lib/delivery-verification.mjs';

const HEAD = 'a'.repeat(40);
const MERGE_HEAD = 'b'.repeat(40);
const MERGED_AT = '2026-08-23T06:01:54.000Z';
const ATTRIBUTION_TOKENS = ['#1380', '#1392', '#939'];
const COMMIT_TITLE = '[#1392] Governed PR delivery';
const COMMIT_MESSAGE = `PR #1391\nSource: ${HEAD}\n\n` + 'Attribution: [#1392] [#1380] [#939]';
const DEFAULT_MERGE_HEAD_REF = 'claude/aad-yml-config-exploration-6d0cf6';
const DEFAULT_MERGE_TITLE = `Merge pull request #1556 from kburson/` + DEFAULT_MERGE_HEAD_REF;
const DEFAULT_MERGE_BODY = '[#680] docs(spike): aitm.yml pipeline engine design recommendation';

function recoveryPreflightInput({ commitSubjects = ['legacy source subject'], merged = true } = {}) {
  return {
    issue: {
      number: 1619,
      state: 'OPEN',
      projectState: 'Review',
      assignees: ['kburson'],
      agentReviewPassed: true,
      reviewAuthorization: { mode: 'full-auto', standing: true, source: 'test' },
    },
    binding: {
      issueNumber: 1619,
      branch: 'codex/1619-receipt-attribution-recovery',
      timerState: 'running',
    },
    lineage: { parentIssueNumber: null, deliveryTarget: 'trunk' },
    pullRequests: [
      {
        number: 1620,
        state: merged ? 'MERGED' : 'OPEN',
        merged,
        isDraft: false,
        baseRefName: 'trunk',
        headRefName: 'codex/1619-receipt-attribution-recovery',
        headRefOid: HEAD,
        mergeable: 'MERGEABLE',
      },
    ],
    localHeadSha: HEAD,
    testReceiptSha: HEAD,
    acceptedReviewSha: HEAD,
    checks: {
      readable: true,
      required: [
        { name: 'ci', headSha: HEAD, status: 'COMPLETED', conclusion: 'SUCCESS' },
      ],
    },
    dirtyPaths: [],
    config: {
      repo: 'kburson/ai-task-manager',
      assignee: 'kburson',
      trunkRef: 'origin/trunk',
      repositoryMergeMethods: ['merge', 'squash'],
      fullAutoMerge: { mechanism: 'provider-action', mergeMethod: 'squash' },
    },
    commitSubjects,
  };
}

test('#1619: merged recovery accepts wholly absent source attribution with a warning', () => {
  const recovered = validateMergedDeliveryPreflight(recoveryPreflightInput());

  assert.deepEqual(recovered.metadataWarnings, ['missing-source-attribution']);
  assert.deepEqual(recovered.commitText.attributionTokens, ['#1619']);
  assert.equal(recovered.commitText.commitTitle, '[#1619] Governed PR delivery');
  assert.match(recovered.commitText.commitMessage, /Attribution: \[#1619\]$/);

  assert.throws(
    () => validateDeliveryPreflight(recoveryPreflightInput({ merged: false })),
    (error) => error instanceof DeliveryPreflightError && error.category === 'attribution'
  );
});

test('#1619: merged recovery refuses partial, malformed, duplicate, or conflicting attribution', () => {
  const cases = [
    ['legacy source', '[#999] conflicting source'],
    ['[#999] conflicting source'],
    ['[#1619 malformed'],
    ['[#1619] target', 'unattributed partial subject'],
    ['[#1619] target [#1619] duplicate'],
  ];

  for (const commitSubjects of cases) {
    assert.throws(
      () => validateMergedDeliveryPreflight(recoveryPreflightInput({ commitSubjects })),
      (error) => error instanceof DeliveryPreflightError && error.category === 'attribution',
      commitSubjects.join(' | ')
    );
  }
});

function intent(commitMessage = COMMIT_MESSAGE) {
  return buildDeliveryIntent({
    intentId: '01ARZ3NDEKTSV4RRFFQ69G5FAV',
    supersedesIntentId: null,
    issueNumber: 1392,
    repository: 'kburson/ai-task-manager',
    prNumber: 1391,
    baseRef: 'trunk',
    headRef: 'codex/939-full-auto-merge',
    expectedHeadSha: HEAD,
    mergeMethod: 'squash',
    attributionTokens: ATTRIBUTION_TOKENS,
    commitTitle: COMMIT_TITLE,
    commitMessage,
    provider: 'codex',
    sessionId: 'session-1393',
    clientCreatedAt: '2026-08-23T06:00:00.000Z',
  });
}

function externalIntentInput() {
  return {
    intentId: '01ARZ3NDEKTSV4RRFFQ69G5FAW',
    supersedesIntentId: null,
    issueNumber: 1392,
    repository: 'kburson/ai-task-manager',
    prNumber: 1391,
    baseRef: 'trunk',
    headRef: 'codex/939-full-auto-merge',
    expectedHeadSha: HEAD,
    mergeMethod: 'squash',
    attributionTokens: ATTRIBUTION_TOKENS,
    provider: 'external',
    sessionId: 'session-1393',
    clientCreatedAt: MERGED_AT,
  };
}

function liveInput(commitMessage = COMMIT_MESSAGE) {
  return {
    acceptedSha: HEAD,
    acceptedReviewSha: HEAD,
    attributingCommits() {
      throw new Error('delivery verification must not use generic subject-only attribution');
    },
    async fetchOriginTrunk() {},
    async inspectMergeCommit() {
      return {
        parents: ['c'.repeat(40)],
        commitTitle: COMMIT_TITLE,
        commitMessage,
      };
    },
    intentCreatedAt: '2026-08-23T06:00:01.000Z',
    async isAncestor() {
      return true;
    },
    localHeadSha: HEAD,
    pullRequest: {
      number: 1391,
      state: 'MERGED',
      merged: true,
      baseRefName: 'trunk',
      headRefName: 'codex/939-full-auto-merge',
      headRefOid: HEAD,
      mergeCommit: { oid: MERGE_HEAD },
      mergedAt: MERGED_AT,
      mergeMethod: 'squash',
      headRefDeleted: false,
    },
    recovery: false,
    testReceiptSha: HEAD,
  };
}

function defaultMergeRecoveryInput({
  commitTitle = DEFAULT_MERGE_TITLE,
  commitMessage = DEFAULT_MERGE_BODY,
  parents = ['c'.repeat(40), HEAD],
  intentOverrides = {},
} = {}) {
  const input = liveInput(commitMessage);
  delete input.intentCreatedAt;
  delete input.recovery;
  input.pullRequest = {
    ...input.pullRequest,
    number: 1556,
    headRefName: DEFAULT_MERGE_HEAD_REF,
    mergeMethod: 'merge',
  };
  input.inspectMergeCommit = async () => ({ parents, commitTitle, commitMessage });
  return {
    input,
    intentInput: {
      ...externalIntentInput(),
      issueNumber: 680,
      prNumber: 1556,
      headRef: DEFAULT_MERGE_HEAD_REF,
      mergeMethod: 'merge',
      attributionTokens: ['#680'],
      ...intentOverrides,
    },
  };
}

test('verifies multi-issue squash attribution from exact inspected commit bytes', async () => {
  const verified = await verifyDeliveredPullRequest({
    ...liveInput(),
    intent: intent(),
  });

  assert.equal(verified.receiptInput.mergeCommitSha, MERGE_HEAD);
  assert.equal(verified.intent.commitMessage, COMMIT_MESSAGE);
  assert.equal(Object.hasOwn(verified.receiptInput, 'metadataWarnings'), false);
});

test('external recovery accepts one canonical inspected attribution line', async () => {
  const input = liveInput();
  delete input.intentCreatedAt;
  delete input.recovery;

  const verified = await verifyExternalDeliveredPullRequest({
    ...input,
    intentInput: externalIntentInput(),
  });

  assert.equal(verified.intent.provider, 'external');
  assert.equal(verified.intent.commitMessage, COMMIT_MESSAGE);
  assert.equal(Object.hasOwn(verified.receiptInput, 'metadataWarnings'), false);
});

test('external recovery accepts exact GitHub default merge attribution for the accepted head', async () => {
  const { input, intentInput } = defaultMergeRecoveryInput();

  const verified = await verifyExternalDeliveredPullRequest({ ...input, intentInput });

  assert.equal(verified.receiptInput.mergeMethod, 'merge');
  assert.equal(verified.intent.commitMessage, DEFAULT_MERGE_BODY);
  assert.deepEqual(verified.receiptInput.metadataWarnings, [
    'missing-merge-attribution-trailer',
  ]);
});

test('external recovery refuses inexact or non-merge default merge attribution evidence', async () => {
  const cases = [
    {
      name: 'wrong pull request number',
      commitTitle: DEFAULT_MERGE_TITLE.replace('#1556', '#1557'),
      error: /delivery-verification:attribution/,
    },
    {
      name: 'wrong repository owner',
      commitTitle: DEFAULT_MERGE_TITLE.replace('from kburson/', 'from another-owner/'),
      error: /delivery-verification:attribution/,
    },
    {
      name: 'wrong head ref',
      commitTitle: DEFAULT_MERGE_TITLE.replace(DEFAULT_MERGE_HEAD_REF, 'another-branch'),
      error: /delivery-verification:attribution/,
    },
    {
      name: 'missing authorized token',
      intentOverrides: { attributionTokens: ['#680', '#939'] },
      error: /delivery-verification:attribution/,
    },
    {
      name: 'extra unauthorized token',
      commitMessage: `${DEFAULT_MERGE_BODY}\nRelated: [#939]`,
      error: /delivery-verification:attribution/,
    },
    {
      name: 'malformed canonical trailer claim',
      commitMessage: `${DEFAULT_MERGE_BODY}\n Attribution: [#680]`,
      error: /delivery-verification:attribution/,
    },
    {
      name: 'non-merge topology',
      parents: ['c'.repeat(40)],
      error: /delivery-verification:merge-method/,
    },
  ];

  for (const { name, error, ...overrides } of cases) {
    const { input, intentInput } = defaultMergeRecoveryInput(overrides);
    await assert.rejects(
      () => verifyExternalDeliveredPullRequest({ ...input, intentInput }),
      error,
      name
    );
  }
});

test('external recovery verifies an advanced observed local head against accepted authority', async () => {
  const input = liveInput();
  delete input.intentCreatedAt;
  delete input.recovery;
  input.localHeadSha = 'd'.repeat(40);

  const verified = await verifyExternalDeliveredPullRequest({
    ...input,
    intentInput: externalIntentInput(),
  });

  assert.equal(input.localHeadSha, 'd'.repeat(40));
  assert.equal(verified.recovery, true);
  assert.equal(verified.intent.expectedHeadSha, HEAD);
  assert.equal(verified.receiptInput.expectedHeadSha, HEAD);
});

test('external recovery keeps its exact input schema and authority equality checks', async () => {
  const input = liveInput();
  delete input.intentCreatedAt;
  delete input.recovery;
  input.localHeadSha = 'd'.repeat(40);
  input.intentInput = externalIntentInput();

  await assert.rejects(
    () => verifyExternalDeliveredPullRequest({ ...input, recovery: true }),
    /delivery-verification:input-keys/
  );
  await assert.rejects(
    () => verifyExternalDeliveredPullRequest({ ...input, testReceiptSha: input.localHeadSha }),
    /delivery-verification:authority-sha-mismatch/
  );
  await assert.rejects(
    () =>
      verifyExternalDeliveredPullRequest({
        ...input,
        intentInput: { ...input.intentInput, mergeMethod: 'merge' },
      }),
    /delivery-verification:merge-method$/
  );
  await assert.rejects(
    () =>
      verifyDeliveredPullRequest({
        ...liveInput(),
        localHeadSha: input.localHeadSha,
        intent: intent(),
      }),
    /delivery-verification:authority-sha-mismatch/
  );
});

test('external recovery rejects noncanonical inspected attribution lines', async () => {
  const invalidMessages = [
    `PR #1391\nSource: ${HEAD}`,
    `${COMMIT_MESSAGE}\nAttribution: [#1392] [#1380] [#939]`,
    `PR #1391\nSource: ${HEAD}\n\nAttribution: [#1392] [#939] [#1380]`,
    `PR #1391\nSource: ${HEAD}\n\nAttribution: #1392 #1380 #939`,
    `${COMMIT_MESSAGE} [#1400]`,
  ];

  for (const commitMessage of invalidMessages) {
    const input = liveInput(commitMessage);
    delete input.intentCreatedAt;
    delete input.recovery;
    await assert.rejects(
      () =>
        verifyExternalDeliveredPullRequest({
          ...input,
          intentInput: externalIntentInput(),
        }),
      /delivery-verification:attribution/
    );
  }
});
