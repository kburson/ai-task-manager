// @story #1857
import test from 'node:test';
import assert from 'node:assert/strict';
import { createCascadeOutcomeAuthority } from '../../../../../task-tracker/lib/estimation/cascade-outcome-authority.mjs';
import { canonicalTestReceiptFixture } from '../../../../fixtures/estimation-verification.mjs';
import {
  parseVerificationReceipt,
  upsertVerificationReceipt,
} from '../../../../../task-tracker/lib/verification-receipt.mjs';
const sha = 'a'.repeat(40);
function harness() {
  let body = canonicalTestReceiptFixture({ issue: 1857 }).body;
  body = upsertVerificationReceipt(body, {
    ...parseVerificationReceipt(body, 'test'),
    stage: 'review',
    receiptId: '01J00000000000000000000992',
  });
  const state = {
    body,
    parent: 1847,
    children: [{ num: 1857, state: 'review' }],
    authorization: { mode: 'full-auto' },
    reads: 0,
  };
  const authority = createCascadeOutcomeAuthority({
    repository: 'owner/repo',
    parentIssue: 1847,
    issue: 1857,
    deps: {
      refreshParent: async () => {
        state.reads++;
        return {
          authorization: state.authorization,
          gateInput: { repository: 'owner/repo', issueNumber: 1847, acceptedSha: sha },
          receipt: { skipped: false, receipt: { acceptedSha: sha } },
          testReceiptSha: sha,
          acceptedReviewSha: sha,
        };
      },
      readChildBody: async () => state.body,
      readChildParent: async () => state.parent,
      readChildCensus: async () => state.children,
      readLineage: async () => ({ ok: true, evidence: { parentIssue: 1847, acceptedSha: sha } }),
    },
  });
  return { state, authority };
}
test('cascade captures fresh parent-approved authority and child Test/Review without inventing child approval', async () => {
  const { state, authority } = harness();
  assert.throws(() => authority.resolveVerificationSha({ issueNumber: 1857 }), /unresolved/);
  const result = await authority.resolveDeliveryAuthority({ issueNumber: 1857 });
  assert.equal(result.gateInput.acceptedSha, sha);
  assert.equal(result.cascadeAuthorization.parentIssue, 1847);
  assert.equal(result.cascadeAuthorization.approvalMode, 'full-auto');
  assert.deepEqual(result.cascadeAuthorization.childIssues, [1857]);
  assert.equal(result.cascadeAuthorization.parentProofDigest.length, 64);
  assert.equal(authority.resolveVerificationSha({ issueNumber: 1857 }), sha);
  assert.ok(!state.body.includes('aitm-review-approved'));
  await authority.resolveDeliveryAuthority({ issueNumber: 1857 });
  assert.equal(state.reads, 2);
});
test('cascade refuses stale parent relation, census, missing authorization and mismatched child proof', async () => {
  for (const mutate of [
    (s) => {
      s.parent = 1848;
    },
    (s) => {
      s.children = [];
    },
    (s) => {
      s.children = [{ num: 1857, state: 'develop' }];
    },
    (s) => {
      s.authorization = { mode: 'missing' };
    },
    (s) => {
      s.body = canonicalTestReceiptFixture({ issue: 1857 }).body;
    },
    (s) => {
      s.body = canonicalTestReceiptFixture({ issue: 1858 }).body;
    },
  ]) {
    const { state, authority } = harness();
    mutate(state);
    await assert.rejects(authority.resolveDeliveryAuthority({ issueNumber: 1857 }));
  }
});
