// @story #1497
import {
  exact,
  fail,
  textValue,
  digestValue,
  uuidValue,
  repository,
  OID,
  policyValue,
  hash,
} from './value.mjs';
const keys = {
  'cycle-opened': ['previousCycleId', 'authorityHostId', 'reason'],
  candidate: ['subject', 'sourceSha', 'sourceRetention'],
  verification: [
    'candidateId',
    'subjectId',
    'testedSha',
    'commands',
    'outcome',
    'runner',
    'startedAt',
    'completedAt',
    'inputsComplete',
  ],
  equivalence: ['priorVerificationId', 'candidateId', 'subjectId', 'policy', 'comparedInputs'],
  acceptance: [
    'candidateId',
    'requirementsDigest',
    'evidenceIds',
    'reviewAuthority',
    'policy',
    'target',
  ],
};
export function validateSubject(subject) {
  exact(
    subject,
    [
      'schema',
      'subjectId',
      'repositoryId',
      'source',
      'requirementsDigest',
      'recipeDigest',
      'environmentDigest',
      'gitInputs',
    ],
    'subject-keys'
  );
  if (subject.schema !== 'aitm.evidence-subject/v2') fail('subject-schema');
  repository(subject.repositoryId);
  exact(subject.source, ['objectFormat', 'treeOid', 'manifestDigest'], 'source-keys');
  if (
    !['sha1', 'sha256'].includes(subject.source.objectFormat) ||
    !new RegExp(`^[a-f0-9]{${subject.source.objectFormat === 'sha1' ? 40 : 64}}$`).test(
      subject.source.treeOid
    )
  )
    fail('source-oid');
  for (const key of ['requirementsDigest', 'recipeDigest', 'environmentDigest'])
    digestValue(subject[key], key);
  digestValue(subject.source.manifestDigest);
  exact(subject.gitInputs, ['sensitivity', 'digest'], 'git-input-keys');
  if (subject.gitInputs.sensitivity === 'content-only') {
    if (subject.gitInputs.digest !== null) fail('git-input-digest');
  } else if (subject.gitInputs.sensitivity === 'history-sensitive')
    digestValue(subject.gitInputs.digest);
  else fail('git-sensitivity');
  const { subjectId, ...identity } = subject;
  if (hash(identity) !== subjectId) fail('subject-digest');
}
export function validateTarget(target) {
  exact(target, ['repositoryId', 'ref', 'methods'], 'target-keys');
  repository(target.repositoryId);
  textValue(target.ref, 'target-ref');
  if (
    !Array.isArray(target.methods) ||
    !target.methods.length ||
    new Set(target.methods).size !== target.methods.length ||
    target.methods.some((m) => !['merge', 'squash', 'rebase', 'fast-forward'].includes(m))
  )
    fail('target-methods');
}
export function validateReview(authority) {
  exact(
    authority,
    [
      'kind',
      'actor',
      'decisionId',
      'candidateId',
      'requirementsDigest',
      'targetDigest',
      'policy',
      'recordedAt',
    ],
    'review-keys'
  );
  if (!['human', 'gate-bypass', 'transfer'].includes(authority.kind)) fail('review-kind');
  textValue(authority.actor, 'review-actor');
  textValue(authority.decisionId, 'review-decision');
  for (const key of ['candidateId', 'requirementsDigest', 'targetDigest'])
    digestValue(authority[key], `review-${key}`);
  policyValue(authority.policy);
  validateInstant(authority.recordedAt);
}
export function validateInstant(value) {
  if (
    typeof value !== 'string' ||
    !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(value) ||
    new Date(value).toISOString() !== value
  )
    fail('timestamp');
}
export function validatePayload(type, payload) {
  if (!Object.hasOwn(keys, type)) fail('record-type');
  exact(payload, keys[type], 'payload-keys');
  if (type === 'cycle-opened') {
    if (payload.previousCycleId !== null) uuidValue(payload.previousCycleId, 'previous-cycle');
    uuidValue(payload.authorityHostId, 'authority-host');
    textValue(payload.reason, 'cycle-reason');
  }
  if (type === 'candidate') {
    validateSubject(payload.subject);
    if (!OID.test(payload.sourceSha)) fail('source-sha');
    exact(payload.sourceRetention, ['locator', 'digest'], 'retention-keys');
    textValue(payload.sourceRetention.locator);
    digestValue(payload.sourceRetention.digest);
  }
  if (type === 'verification') {
    digestValue(payload.candidateId);
    digestValue(payload.subjectId);
    if (!OID.test(payload.testedSha)) fail('tested-sha');
    if (
      !['success', 'failure'].includes(payload.outcome) ||
      typeof payload.inputsComplete !== 'boolean'
    )
      fail('verification-outcome');
    textValue(payload.runner);
    validateInstant(payload.startedAt);
    validateInstant(payload.completedAt);
    if (payload.startedAt > payload.completedAt) fail('verification-time');
    if (!Array.isArray(payload.commands) || !payload.commands.length) fail('verification-commands');
    for (const cmd of payload.commands) {
      exact(cmd, ['executable', 'args', 'lane', 'exitCode'], 'command-keys');
      textValue(cmd.executable);
      textValue(cmd.lane);
      if (
        !Array.isArray(cmd.args) ||
        cmd.args.some((a) => typeof a !== 'string') ||
        !Number.isInteger(cmd.exitCode)
      )
        fail('verification-command');
    }
    if (payload.outcome === 'success' && payload.commands.some((c) => c.exitCode !== 0))
      fail('verification-outcome');
  }
  if (type === 'equivalence') {
    for (const key of ['priorVerificationId', 'candidateId', 'subjectId'])
      digestValue(payload[key]);
    policyValue(payload.policy);
    exact(payload.comparedInputs, ['priorSubjectId', 'candidateSubjectId'], 'compared-inputs');
    if (
      payload.comparedInputs.priorSubjectId !== payload.subjectId ||
      payload.comparedInputs.candidateSubjectId !== payload.subjectId
    )
      fail('equivalence-inputs');
  }
  if (type === 'acceptance') {
    digestValue(payload.candidateId);
    digestValue(payload.requirementsDigest);
    validateTarget(payload.target);
    policyValue(payload.policy);
    validateReview(payload.reviewAuthority);
    if (
      !Array.isArray(payload.evidenceIds) ||
      !payload.evidenceIds.length ||
      new Set(payload.evidenceIds).size !== payload.evidenceIds.length
    )
      fail('acceptance-evidence');
    payload.evidenceIds.forEach((id) => digestValue(id));
  }
}
export const recordReferenceTypes = {
  verification: { candidateId: 'candidate' },
  equivalence: { priorVerificationId: 'verification', candidateId: 'candidate' },
  acceptance: { candidateId: 'candidate' },
};
