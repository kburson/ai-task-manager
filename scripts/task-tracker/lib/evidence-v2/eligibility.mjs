// @story #1497
import { canonical, frozen } from './value.mjs';
import { validateRecord } from './codec.mjs';
export function evaluateReuse({ candidate, verification, policy }) {
  const result = (status, ...reasons) =>
    frozen({
      status,
      reasons,
      priorVerificationId: verification?.recordId ?? null,
      candidateId: candidate?.recordId ?? null,
    });
  try {
    validateRecord(candidate);
    if (candidate.recordType !== 'candidate') return result('refuse', 'candidate-type');
  } catch {
    return result('refuse', 'malformed-candidate');
  }
  if (verification?.schema === 'aitm.verification-receipt/v1')
    return result('verify', 'legacy-inputs-incomplete');
  try {
    validateRecord(verification);
    if (verification.recordType !== 'verification') return result('refuse', 'verification-type');
  } catch {
    return result('refuse', 'malformed-verification');
  }
  if (
    canonical(candidate.repositoryId) !== canonical(verification.repositoryId) ||
    candidate.issueNumber !== verification.issueNumber
  )
    return result('refuse', 'evidence-identity-mismatch');
  if (
    !policy?.trustedActors?.includes(verification.actor.id) ||
    !policy?.trustedRunners?.includes(verification.payload.runner)
  )
    return result('refuse', 'verification-authority');
  if (!verification.payload.inputsComplete) return result('verify', 'historical-inputs-incomplete');
  if (verification.payload.outcome !== 'success') return result('verify', 'verification-failed');
  if (
    !policy.requiredLanes?.length ||
    policy.requiredLanes.some(
      (lane) => !verification.payload.commands.some((c) => c.lane === lane && c.exitCode === 0)
    )
  )
    return result('verify', 'lane-coverage-incomplete');
  if (!policy.allowReuse) return result('verify', 'reuse-policy-disabled');
  if (typeof policy.id !== 'string' || typeof policy.version !== 'string')
    return result('refuse', 'policy-identity');
  if (candidate.payload.subject.subjectId !== verification.payload.subjectId)
    return result('verify', 'subject-inputs-changed');
  const equivalence = {
    priorVerificationId: verification.recordId,
    candidateId: candidate.recordId,
    subjectId: candidate.payload.subject.subjectId,
    policy: { id: policy.id, version: policy.version },
    comparedInputs: {
      priorSubjectId: verification.payload.subjectId,
      candidateSubjectId: candidate.payload.subject.subjectId,
    },
  };
  return frozen({ ...result('reuse'), equivalence });
}
