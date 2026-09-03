// @story #1497
import test from 'node:test';
import assert from 'node:assert/strict';
import { logicalRecordFixture } from '../../../../helpers/evidence-v2/logical-records.mjs';
import { evaluateReuse } from '../../../../../task-tracker/lib/evidence-v2/eligibility.mjs';
import { hash } from '../../../../../task-tracker/lib/evidence-v2/value.mjs';
test('reuse preserves the original tested SHA and yields a distinct equivalence payload', () => {
  const f = logicalRecordFixture();
  const original = JSON.stringify(f.verification);
  const candidate = f.make('candidate', { ...f.candidate.payload, sourceSha: '2'.repeat(40) });
  const result = evaluateReuse({ candidate, verification: f.verification, policy: f.policy });
  assert.equal(result.status, 'reuse');
  assert.equal(result.equivalence.candidateId, candidate.recordId);
  assert.equal(result.equivalence.priorVerificationId, f.verification.recordId);
  assert.equal(JSON.stringify(f.verification), original);
});
test('legacy incomplete changed and untrusted evidence return distinct conservative outcomes', () => {
  const f = logicalRecordFixture();
  const run = (verification = f.verification, policy = f.policy, candidate = f.candidate) =>
    evaluateReuse({ candidate, verification, policy });
  assert.equal(
    run({ schema: 'aitm.verification-receipt/v1' }).reasons[0],
    'legacy-inputs-incomplete'
  );
  assert.equal(
    run(f.make('verification', { ...f.verification.payload, inputsComplete: false })).status,
    'verify'
  );
  assert.equal(run(f.verification, { ...f.policy, allowReuse: false }).status, 'verify');
  assert.equal(run({ ...f.verification, recordId: 'broken' }).status, 'refuse');
  assert.equal(run(f.verification, { ...f.policy, trustedActors: [] }).status, 'refuse');
  const { subjectId: _subjectId, ...identity } = f.candidate.payload.subject;
  identity.environmentDigest = hash('changed environment');
  const candidate = f.make('candidate', {
    ...f.candidate.payload,
    subject: { ...identity, subjectId: hash(identity) },
  });
  assert.equal(run(f.verification, f.policy, candidate).reasons[0], 'subject-inputs-changed');
});
