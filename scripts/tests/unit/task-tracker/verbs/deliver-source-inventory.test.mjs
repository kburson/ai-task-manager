#!/usr/bin/env node
// @story #1381 #1755

import { strict as assert } from 'node:assert';
import { test } from 'node:test';

import { HEAD, NEXT_HEAD, deliver, makeHarness } from './deliver-test-harness.mjs';
import { classifySourceCommitSubjects } from '../../../../task-tracker/verbs/deliver.mjs';
import { canonicalSourceInventory } from '../../../../task-tracker/lib/delivery-attribution-exception.mjs';
import { buildDeliveryAttributionProposal } from '../../../../task-tracker/lib/delivery-attribution-exception-record.mjs';
import { validateDeliveryPreflight } from '../../../../task-tracker/lib/delivery-preflight.mjs';

test('classification retains SHA records and verifies only unattributed merges', async () => {
  const source = [
    { oid: '1'.repeat(40), messageHeadline: '[#1755] ordinary' },
    { oid: '2'.repeat(40), messageHeadline: 'Merge plain branch' },
    { oid: '3'.repeat(40), messageHeadline: 'Merge #1755 branch' },
    { oid: HEAD, messageHeadline: '[#1755] tip' },
  ];
  const result = await classifySourceCommitSubjects(
    {
      sourceCommitSubjects: source.map((item) => item.messageHeadline),
      sourceCommits: source,
      sourceCommitsComplete: true,
      sourceCommitsHeadSha: HEAD,
      headRefOid: HEAD,
    },
    async () => ({ parents: ['4'.repeat(40), '5'.repeat(40)], commitTitle: 'Merge plain branch' })
  );

  assert.deepEqual(result.verifiedMergeShas, ['2'.repeat(40)]);
  assert.deepEqual(result.attributableCommits, [source[0], source[2], source[3]]);
  assert.deepEqual(
    result.attributableSubjects,
    source.filter((_, index) => index !== 1).map((item) => item.messageHeadline)
  );
});

test('failed merge inspection leaves its source SHA attributable', async () => {
  const source = [
    { oid: '2'.repeat(40), messageHeadline: 'Merge plain branch' },
    { oid: HEAD, messageHeadline: '[#1755] tip' },
  ];
  const result = await classifySourceCommitSubjects(
    {
      sourceCommitSubjects: source.map((item) => item.messageHeadline),
      sourceCommits: source,
      sourceCommitsComplete: true,
      sourceCommitsHeadSha: HEAD,
      headRefOid: HEAD,
    },
    async () => {
      throw new Error('local object unavailable');
    }
  );

  assert.deepEqual(result.attributableCommits, source);
  assert.deepEqual(result.verifiedMergeShas, []);
});

test('classification keeps duplicate subjects bound to distinct source SHAs', async () => {
  const repeated = 'legacy source subject';
  const commits = [
    { oid: '1'.repeat(40), messageHeadline: repeated },
    { oid: '2'.repeat(40), messageHeadline: repeated },
    { oid: HEAD, messageHeadline: '[#939] accepted tip' },
  ];
  const classified = await classifySourceCommitSubjects(
    {
      sourceCommitSubjects: commits.map(({ messageHeadline }) => messageHeadline),
      sourceCommits: commits,
      sourceCommitsComplete: true,
      sourceCommitsHeadSha: HEAD,
      headRefOid: HEAD,
    },
    async () => {
      throw new Error('not a verified merge');
    }
  );
  assert.deepEqual(classified.attributableCommits, commits);
  assert.deepEqual(classified.verifiedMergeShas, []);
});

test('open-PR preflight binds every exception scope and mapping field', () => {
  const commits = [
    { oid: '1'.repeat(40), messageHeadline: 'legacy commit' },
    { oid: HEAD, messageHeadline: '[#939] tip' },
  ];
  const proposal = {
    exceptionId: '01M2H000000000000000000001',
    operationId: '01M2H000000000000000000002',
    repository: 'kburson/ai-task-manager',
    issueNumber: 939,
    prNumber: 1400,
    baseRef: 'trunk',
    headRef: 'codex/939-full-auto-merge',
    headSha: HEAD,
    sourceDigest: canonicalSourceInventory(commits, HEAD).sourceDigest,
    mappings: [
      { oid: commits[0].oid, messageHeadline: commits[0].messageHeadline, issueNumber: 939 },
    ],
    attributionTokens: ['#939'],
    expiresAt: '2026-08-23T14:00:00.000Z',
  };
  const record = {
    kind: 'grant',
    recordId: '01M2H000000000000000000003',
    proposal,
    proposalDigest: buildDeliveryAttributionProposal(proposal).proposalDigest,
  };
  const input = {
    acceptedReviewSha: HEAD,
    binding: { issueNumber: 939, branch: proposal.headRef, timerState: 'running' },
    checks: {
      readable: true,
      required: [{ name: 'ci', headSha: HEAD, status: 'COMPLETED', conclusion: 'SUCCESS' }],
    },
    commitSubjects: commits.map(({ messageHeadline }) => messageHeadline),
    config: {
      repo: proposal.repository,
      assignee: 'kburson',
      trunkRef: 'origin/trunk',
      fullAutoMerge: { mechanism: 'provider-action', mergeMethod: 'squash' },
      repositoryMergeMethods: ['merge', 'squash', 'rebase'],
    },
    dirtyPaths: [],
    issue: {
      number: 939,
      state: 'OPEN',
      projectState: 'Review',
      assignees: ['kburson'],
      agentReviewPassed: true,
      reviewAuthorization: { standing: true, mode: 'full-auto' },
    },
    lineage: { parentIssueNumber: null, deliveryTarget: 'trunk' },
    localHeadSha: HEAD,
    pullRequests: [
      {
        number: 1400,
        state: 'OPEN',
        isDraft: false,
        baseRefName: proposal.baseRef,
        headRefName: proposal.headRef,
        headRefOid: HEAD,
        mergeable: 'MERGEABLE',
      },
    ],
    testReceiptSha: HEAD,
    sourceInventory: { commits, attributableCommits: commits, verifiedMergeShas: [] },
    attributionException: record,
  };
  assert.equal(
    validateDeliveryPreflight(input).exceptionDisposition.operationId,
    proposal.operationId
  );
  const mutations = [
    (x) => {
      x.repository = 'other/repo';
    },
    (x) => {
      x.issueNumber = 940;
      x.attributionTokens = ['#939', '#940'];
    },
    (x) => {
      x.prNumber = 1401;
    },
    (x) => {
      x.baseRef = 'main';
    },
    (x) => {
      x.headRef = 'feature/other';
    },
    (x) => {
      x.headSha = NEXT_HEAD;
    },
    (x) => {
      x.sourceDigest = `sha256:${'f'.repeat(64)}`;
    },
    (x) => {
      x.mappings[0].oid = '2'.repeat(40);
    },
  ];
  for (const [index, mutate] of mutations.entries()) {
    const changed = structuredClone(proposal);
    mutate(changed);
    const changedRecord = {
      ...record,
      proposal: changed,
      proposalDigest: buildDeliveryAttributionProposal(changed).proposalDigest,
    };
    assert.throws(
      () => validateDeliveryPreflight({ ...input, attributionException: changedRecord }),
      /delivery-preflight:attribution-exception/,
      `scope mutation ${index}`
    );
  }
});

test('open-PR preflight omits a locally verified two-parent ancestry merge', async () => {
  const sourceCommit = '1'.repeat(40);
  const sourceMerge = '2'.repeat(40);
  const attributedTitle = '[#939] Repair delivery attribution';
  const tipTitle = '[#939] Final delivery repair';
  const fullMergeTitle =
    "Merge remote-tracking branch 'origin/trunk' into codex/1381-governed-delivery-convergence-spec";
  const truncatedMergeTitle =
    "Merge remote-tracking branch 'origin/trunk' into codex/1381-governed-…";
  const harness = makeHarness({
    commitSubjects: [attributedTitle, fullMergeTitle, tipTitle],
    prCommitSubjects: [attributedTitle, truncatedMergeTitle, tipTitle],
    prSourceCommits: [
      { oid: sourceCommit, messageHeadline: attributedTitle },
      { oid: sourceMerge, messageHeadline: truncatedMergeTitle },
      { oid: HEAD, messageHeadline: tipTitle },
    ],
    sourceInspections: {
      [sourceMerge]: {
        parents: ['3'.repeat(40), '4'.repeat(40)],
        commitTitle: fullMergeTitle,
      },
    },
  });

  const result = await deliver(harness);

  assert.equal(result.status, 'action-required');
  assert.equal(harness.calls.inspectSourceCommit, 1);
  assert.deepEqual(result.intent.attributionTokens, ['#939']);
});

test('open-PR preflight preserves an unattributed local commit omitted by provider records', async () => {
  const sourceCommit = '1'.repeat(40);
  const sourceMerge = '2'.repeat(40);
  const attributedTitle = '[#939] Repair delivery attribution';
  const tipTitle = '[#939] Final delivery repair';
  const fullMergeTitle =
    "Merge remote-tracking branch 'origin/trunk' into codex/1381-governed-delivery-convergence-spec";
  const truncatedMergeTitle =
    "Merge remote-tracking branch 'origin/trunk' into codex/1381-governed-…";
  const harness = makeHarness({
    commitSubjects: [attributedTitle, fullMergeTitle, 'unattributed omitted commit', tipTitle],
    prCommitSubjects: [attributedTitle, truncatedMergeTitle, tipTitle],
    prSourceCommits: [
      { oid: sourceCommit, messageHeadline: attributedTitle },
      { oid: sourceMerge, messageHeadline: truncatedMergeTitle },
      { oid: HEAD, messageHeadline: tipTitle },
    ],
    sourceInspections: {
      [sourceMerge]: {
        parents: ['3'.repeat(40), '4'.repeat(40)],
        commitTitle: fullMergeTitle,
      },
    },
  });

  await assert.rejects(() => deliver(harness), /delivery-preflight:attribution/);
  assert.equal(harness.calls.inspectSourceCommit, 1);
  assert.equal(harness.calls.createIssueComment, 0);
});

test('merged external recovery refuses an incomplete provider commit inventory', async () => {
  const harness = makeHarness({
    prState: 'MERGED',
    headRefDeleted: true,
    sourceCommitsComplete: false,
  });

  await assert.rejects(() => deliver(harness), /delivery-preflight:attribution/);
  assert.equal(harness.calls.createIssueComment, 0);
  assert.equal(harness.data.comments.length, 0);
});

for (const options of [
  { sourceCommitsHeadSha: NEXT_HEAD },
  {
    prSourceCommits: [{ oid: NEXT_HEAD, messageHeadline: '[#939] mismatched inventory tip' }],
  },
]) {
  test('merged external recovery refuses source inventory not bound to the PR head', async () => {
    const harness = makeHarness({
      prState: 'MERGED',
      headRefDeleted: true,
      ...options,
    });

    await assert.rejects(() => deliver(harness), /delivery-preflight:attribution/);
    assert.equal(harness.calls.createIssueComment, 0);
    assert.equal(harness.data.comments.length, 0);
  });
}
