// @story #1562
//
// The reconciliation lane must NOT weaken the delivery verifier. #1562 exists
// because the verifier correctly refused to write a receipt describing a squash
// that never happened; the fix widens who may state the intent, never what
// counts as proof. These tests pin that boundary so a future change to the lane
// cannot quietly turn it into a bypass.
import { strict as assert } from 'node:assert';
import test from 'node:test';

import { observeMergeMethod } from '../../../../task-tracker/lib/delivery-verification.mjs';
import { resolveReconciledMergeMethod } from '../../../../task-tracker/lib/delivery-method-reconciliation.mjs';

const headSha = 'a'.repeat(40);
const mergeSha = 'b'.repeat(40);
const baseSha = 'c'.repeat(40);

const twoParentMerge = {
  commitTitle: 'Merge pull request #1556',
  commitMessage: '',
  parents: [baseSha, headSha],
};

test('an operator cannot launder a false squash through the lane', async () => {
  // The live topology is a merge commit. Declaring "squash" — the very claim the
  // original refusal blocked — must still refuse.
  const observed = await observeMergeMethod({
    mergeCommitSha: mergeSha,
    expectedHeadSha: headSha,
    inspectMergeCommit: async () => twoParentMerge,
  });
  assert.equal(observed, 'merge');
  assert.throws(
    () => resolveReconciledMergeMethod({ declared: 'squash', observed, configured: 'squash' }),
    /delivery-method-reconciliation:declared-not-observed/
  );
});

test('the lane cannot be used to rubber-stamp a matching configuration', () => {
  // If observation already agrees with configuration there is nothing to
  // reconcile, and the ordinary path applies. Allowing it here would let the
  // lane write a divergence record for a non-divergent delivery.
  assert.throws(
    () =>
      resolveReconciledMergeMethod({ declared: 'merge', observed: 'merge', configured: 'merge' }),
    /delivery-method-reconciliation:not-divergent/
  );
});

test('an unattributable topology refuses rather than defaulting to the declaration', async () => {
  // A single-parent rewrite is ambiguous between squash and rebase without the
  // proofs the full verifier applies. The lane must not let the operator's word
  // substitute for that evidence.
  await assert.rejects(
    () =>
      observeMergeMethod({
        mergeCommitSha: mergeSha,
        expectedHeadSha: headSha,
        inspectMergeCommit: async () => ({ ...twoParentMerge, parents: [baseSha] }),
      }),
    /delivery-verification:merge-method-unattributable/
  );
});

test('a merge whose second parent is not the delivered head refuses', async () => {
  // Guards against reconciling against some other merge that happens to sit at
  // the same SHA position — the head identity still has to hold.
  await assert.rejects(
    () =>
      observeMergeMethod({
        mergeCommitSha: mergeSha,
        expectedHeadSha: headSha,
        inspectMergeCommit: async () => ({ ...twoParentMerge, parents: [baseSha, 'd'.repeat(40)] }),
      }),
    /delivery-verification:merge-method-unattributable/
  );
});
