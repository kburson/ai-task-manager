#!/usr/bin/env node
// @story #1381

import { strict as assert } from 'node:assert';
import { test } from 'node:test';

import { HEAD, NEXT_HEAD, deliver, makeHarness } from './deliver-test-harness.mjs';
import { classifySourceCommitSubjects } from '../../../../task-tracker/verbs/deliver.mjs';

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
