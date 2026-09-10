// @story #1562
import { strict as assert } from 'node:assert';
import test from 'node:test';

import { observeMergeMethod } from '../../../../task-tracker/lib/delivery-verification.mjs';

const headSha = 'a'.repeat(40);
const mergeSha = 'b'.repeat(40);
const baseSha = 'c'.repeat(40);

function inspection(overrides = {}) {
  return {
    commitTitle: 'Merge pull request #1556',
    commitMessage: '',
    parents: [baseSha, headSha],
    ...overrides,
  };
}

test('observes a two-parent merge commit as the merge method', async () => {
  const observed = await observeMergeMethod({
    mergeCommitSha: mergeSha,
    expectedHeadSha: headSha,
    inspectMergeCommit: async () => inspection(),
  });
  assert.equal(observed, 'merge');
});

test('refuses a single-parent rewrite rather than guessing squash', async () => {
  // A one-parent rewrite is ambiguous between squash and rebase without the
  // authorized-bytes / single-source proofs the full verifier applies. The
  // reconciliation lane must refuse rather than attribute it.
  await assert.rejects(
    () =>
      observeMergeMethod({
        mergeCommitSha: mergeSha,
        expectedHeadSha: headSha,
        inspectMergeCommit: async () => inspection({ parents: [baseSha] }),
      }),
    /delivery-verification:merge-method-unattributable/
  );
});

test('refuses when the second parent is not the expected head', async () => {
  await assert.rejects(
    () =>
      observeMergeMethod({
        mergeCommitSha: mergeSha,
        expectedHeadSha: headSha,
        inspectMergeCommit: async () => inspection({ parents: [baseSha, 'd'.repeat(40)] }),
      }),
    /delivery-verification:merge-method-unattributable/
  );
});

test('propagates a malformed inspection as evidence failure', async () => {
  await assert.rejects(
    () =>
      observeMergeMethod({
        mergeCommitSha: mergeSha,
        expectedHeadSha: headSha,
        inspectMergeCommit: async () => ({ parents: 'not-an-array' }),
      }),
    /delivery-verification:merge-method-evidence/
  );
});

test('requires its inputs', async () => {
  await assert.rejects(
    () => observeMergeMethod({ mergeCommitSha: 'nope', expectedHeadSha: headSha }),
    /delivery-verification:input/
  );
});
