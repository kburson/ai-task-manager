// @story #1497
import test from 'node:test';
import assert from 'node:assert/strict';
import { recordFixture } from '../../../../helpers/evidence-v2/records.mjs';
import { evaluateReuse } from '../../../../../task-tracker/lib/evidence-v2/eligibility.mjs';
import { buildEvidenceSubject } from '../../../../../task-tracker/lib/evidence-v2/subject.mjs';
test('same complete content earns a new equivalence edge and never rewrites execution provenance', () => {
  const f = recordFixture();
  try {
    const original = JSON.stringify(f.verification);
    f.sandbox.git(['commit', '--amend', '-m', 'rewrite']);
    const capture = buildEvidenceSubject(f.input);
    const candidate = f.make('candidate', {
      ...f.candidate.payload,
      sourceSha: capture.observations.sourceSha,
      subject: capture.subject,
    });
    const result = evaluateReuse({ candidate, verification: f.verification, policy: f.policy });
    assert.equal(result.status, 'reuse');
    assert.equal(result.equivalence.priorVerificationId, f.verification.recordId);
    assert.equal(result.equivalence.candidateId, candidate.recordId);
    assert.equal(JSON.stringify(f.verification), original);
    assert.notEqual(candidate.payload.sourceSha, f.verification.payload.testedSha);
  } finally {
    f.sandbox.dispose();
  }
});
test('missing historical inputs or changed subjects require verification; malformed and untrusted evidence refuse', () => {
  const f = recordFixture();
  try {
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
    const changed = buildEvidenceSubject({
      ...f.input,
      environment: { ...f.input.environment, node: '22.0.0' },
    });
    assert.equal(
      run(
        f.verification,
        f.policy,
        f.make('candidate', { ...f.candidate.payload, subject: changed.subject })
      ).reasons[0],
      'subject-inputs-changed'
    );
  } finally {
    f.sandbox.dispose();
  }
});
