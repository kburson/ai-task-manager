// @story #1497
import test from 'node:test';
import assert from 'node:assert/strict';
import { recordFixture } from '../../../../helpers/evidence-v2/records.mjs';
import { authorizeAcceptance } from '../../../../../task-tracker/lib/evidence-v2/acceptance.mjs';
test('acceptance binds exact candidate target policy and authenticated authority', async () => {
  const f = recordFixture();
  try {
    const args = {
      cycle: f.cycle,
      candidate: f.candidate,
      verificationRecords: [f.verification],
      reviewAuthority: f.reviewAuthority,
      policy: f.policy,
      target: f.target,
    };
    const accepted = await authorizeAcceptance(args);
    assert.equal(accepted.payload.candidateId, f.candidate.recordId);
    assert.deepEqual(accepted.payload.evidenceIds, [f.verification.recordId]);
    await assert.rejects(
      () => authorizeAcceptance({ ...args, reviewAuthority: { approved: true } }),
      /review/
    );
    await assert.rejects(
      () => authorizeAcceptance({ ...args, target: { ...f.target, ref: 'refs/heads/wrong' } }),
      /review-target/
    );
    await assert.rejects(
      () =>
        authorizeAcceptance({
          ...args,
          policy: { ...f.policy, authorizeReview: async () => true },
        }),
      /review-authentication/
    );
    await assert.rejects(
      () => authorizeAcceptance({ ...args, verificationRecords: [] }),
      /acceptance-verification/
    );
    const bypass = { ...f.reviewAuthority, kind: 'gate-bypass', decisionId: 'explicit-full-auto' };
    assert.equal(
      (await authorizeAcceptance({ ...args, reviewAuthority: bypass })).payload.reviewAuthority
        .kind,
      'gate-bypass'
    );
    await assert.rejects(
      () =>
        authorizeAcceptance({
          ...args,
          reviewAuthority: bypass,
          policy: { ...f.policy, allowGateBypass: false },
        }),
      /gate-bypass/
    );
    await assert.rejects(
      () =>
        authorizeAcceptance({
          ...args,
          reviewAuthority: { ...f.reviewAuthority, kind: 'transfer' },
        }),
      /transfer/
    );
  } finally {
    f.sandbox.dispose();
  }
});
