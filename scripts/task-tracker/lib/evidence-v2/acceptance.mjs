// @story #1497
import { canonical, hash, fail, frozen } from './value.mjs';
import { validateRecord } from './codec.mjs';
import { validateReview, validateTarget } from './record-schema.mjs';
import { evaluateReuse } from './eligibility.mjs';
export async function authorizeAcceptance({
  cycle,
  candidate,
  verificationRecords,
  reviewAuthority,
  policy,
  target,
}) {
  validateRecord(cycle);
  validateRecord(candidate);
  validateReview(reviewAuthority);
  validateTarget(target);
  if (
    cycle.recordType !== 'cycle-opened' ||
    candidate.recordType !== 'candidate' ||
    cycle.cycleId !== candidate.cycleId ||
    cycle.issueNumber !== candidate.issueNumber ||
    canonical(cycle.repositoryId) !== canonical(candidate.repositoryId)
  )
    fail('acceptance-cycle');
  if (reviewAuthority.candidateId !== candidate.recordId) fail('review-candidate');
  if (reviewAuthority.requirementsDigest !== candidate.payload.subject.requirementsDigest)
    fail('review-requirements');
  if (reviewAuthority.targetDigest !== hash(target)) fail('review-target');
  if (canonical(target.repositoryId) !== canonical(candidate.repositoryId))
    fail('acceptance-target-repository');
  const policyRef = { id: policy?.id, version: policy?.version };
  if (canonical(reviewAuthority.policy) !== canonical(policyRef)) fail('review-policy');
  if (reviewAuthority.kind === 'gate-bypass' && !policy.allowGateBypass)
    fail('gate-bypass-not-authorized');
  if (reviewAuthority.kind === 'transfer' && !policy.allowTransfer)
    fail('acceptance-transfer-disabled');
  if (
    typeof policy.authorizeReview !== 'function' ||
    canonical(await policy.authorizeReview(reviewAuthority)) !== canonical(reviewAuthority)
  )
    fail('review-authentication');
  const evidenceIds = [];
  const records = new Map();
  for (const record of verificationRecords) {
    validateRecord(record);
    if (records.has(record.recordId)) fail('acceptance-duplicate-evidence');
    records.set(record.recordId, record);
  }
  for (const record of verificationRecords) {
    if (
      record.issueNumber !== candidate.issueNumber ||
      canonical(record.repositoryId) !== canonical(candidate.repositoryId)
    )
      fail('acceptance-evidence-identity');
    if (record.recordType === 'verification' && record.payload.candidateId === candidate.recordId) {
      if (
        record.cycleId !== candidate.cycleId ||
        record.payload.testedSha !== candidate.payload.sourceSha
      )
        fail('acceptance-verification-candidate');
      if (
        evaluateReuse({ candidate, verification: record, policy: { ...policy, allowReuse: true } })
          .status === 'reuse'
      )
        evidenceIds.push(record.recordId);
    }
    if (record.recordType === 'equivalence' && record.payload.candidateId === candidate.recordId) {
      if (
        record.cycleId !== candidate.cycleId ||
        canonical(record.payload.policy) !== canonical(policyRef)
      )
        fail('acceptance-equivalence-policy');
      const prior = records.get(record.payload.priorVerificationId);
      const result = evaluateReuse({ candidate, verification: prior, policy });
      if (result.status !== 'reuse' || canonical(result.equivalence) !== canonical(record.payload))
        fail('acceptance-equivalence');
      evidenceIds.push(record.recordId);
    }
  }
  if (!evidenceIds.length) fail('acceptance-verification');
  return frozen({
    status: 'authorized',
    payload: {
      candidateId: candidate.recordId,
      requirementsDigest: candidate.payload.subject.requirementsDigest,
      evidenceIds,
      reviewAuthority,
      policy: policyRef,
      target,
    },
  });
}
