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
  'delivery-intent': [
    'acceptanceId',
    'candidateId',
    'subjectId',
    'pr',
    'expectedHeadSha',
    'authorizedTreeOid',
    'authorizedManifestDigest',
    'target',
    'requestedMethod',
    'policy',
    'providerOperationId',
  ],
  delivery: [
    'acceptanceId',
    'intentId',
    'candidateId',
    'pr',
    'expectedHeadSha',
    'landedCommitSha',
    'landedTreeOid',
    'targetObservation',
    'contentVerification',
    'methodObservation',
    'transport',
  ],
  'close-started': [
    'deliveryId',
    'acceptanceId',
    'closeTransactionId',
    'expectedCycleRevision',
    'expectedBinding',
    'effectOperationKeys',
  ],
  'close-step': [
    'closeStartedId',
    'closeTransactionId',
    'step',
    'operationKey',
    'outcome',
    'readBack',
  ],
  'cycle-completed': ['closeStartedId', 'closeTransactionId', 'finalObservation'],
  cleanup: ['closeStartedId', 'closeTransactionId', 'expectedBinding', 'status', 'diagnostics'],
};
const METHODS = ['merge', 'squash', 'rebase', 'fast-forward'];
const CLOSE_EFFECTS = [
  'timing',
  'estimation',
  'lifecycle',
  'board',
  'disposition',
  'issue',
  'labels',
  'cleanup',
];

function validateExpectedBinding(binding) {
  exact(
    binding,
    ['status', 'repositoryId', 'issue', 'cycleId', 'sid', 'worktreePath', 'bindingGenerationId'],
    'close-binding-keys'
  );
  if (!['owned', 'paused', 'absent'].includes(binding.status)) fail('close-binding-status');
  repository(binding.repositoryId);
  if (!Number.isSafeInteger(binding.issue) || binding.issue <= 0) fail('close-binding-issue');
  uuidValue(binding.cycleId, 'close-binding-cycle');
  if (binding.status === 'absent') {
    if (
      binding.sid !== null ||
      binding.worktreePath !== null ||
      binding.bindingGenerationId !== null
    )
      fail('close-binding-absent');
  } else {
    textValue(binding.sid, 'close-binding-session');
    textValue(binding.worktreePath, 'close-binding-worktree');
    uuidValue(binding.bindingGenerationId, 'close-binding-generation');
  }
}

function validatePrIdentity(pr) {
  exact(pr, ['provider', 'id', 'number', 'repositoryId', 'baseRef', 'headRef'], 'delivery-pr-keys');
  textValue(pr.provider, 'delivery-provider');
  textValue(pr.id, 'delivery-pr');
  if (!Number.isSafeInteger(pr.number) || pr.number <= 0) fail('delivery-pr');
  repository(pr.repositoryId);
  textValue(pr.baseRef, 'delivery-target');
  textValue(pr.headRef, 'delivery-head');
}
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
  const payloadKeys =
    type === 'cycle-opened' && Object.hasOwn(payload, 'externalEventId')
      ? [...keys[type], 'externalEventId']
      : keys[type];
  exact(payload, payloadKeys, 'payload-keys');
  if (type === 'cycle-opened') {
    if (payload.previousCycleId !== null) uuidValue(payload.previousCycleId, 'previous-cycle');
    uuidValue(payload.authorityHostId, 'authority-host');
    textValue(payload.reason, 'cycle-reason');
    if (Object.hasOwn(payload, 'externalEventId') && payload.externalEventId !== null) {
      textValue(payload.externalEventId, 'cycle-external-event');
    }
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
  if (type === 'delivery-intent') {
    for (const key of ['acceptanceId', 'candidateId', 'subjectId', 'authorizedManifestDigest'])
      digestValue(payload[key], key);
    validatePrIdentity(payload.pr);
    if (!OID.test(payload.expectedHeadSha) || !OID.test(payload.authorizedTreeOid))
      fail('delivery-object');
    validateTarget(payload.target);
    if (!METHODS.includes(payload.requestedMethod)) fail('delivery-method');
    policyValue(payload.policy);
    uuidValue(payload.providerOperationId, 'delivery-operation');
  }
  if (type === 'delivery') {
    for (const key of ['acceptanceId', 'intentId', 'candidateId']) digestValue(payload[key], key);
    validatePrIdentity(payload.pr);
    for (const key of ['expectedHeadSha', 'landedCommitSha', 'landedTreeOid'])
      if (!OID.test(payload[key])) fail('delivery-object');
    exact(payload.targetObservation, ['ref', 'headSha'], 'target-observation-keys');
    textValue(payload.targetObservation.ref, 'delivery-target');
    if (!OID.test(payload.targetObservation.headSha)) fail('delivery-target-object');
    exact(
      payload.contentVerification,
      ['subjectId', 'authorizedTreeOid', 'landedTreeOid', 'result'],
      'content-verification-keys'
    );
    digestValue(payload.contentVerification.subjectId);
    if (
      !OID.test(payload.contentVerification.authorizedTreeOid) ||
      !OID.test(payload.contentVerification.landedTreeOid) ||
      payload.contentVerification.result !== 'match'
    )
      fail('delivery-content');
    exact(
      payload.methodObservation,
      ['requested', 'observed', 'result'],
      'method-observation-keys'
    );
    if (
      !METHODS.includes(payload.methodObservation.requested) ||
      !METHODS.includes(payload.methodObservation.observed) ||
      payload.methodObservation.result !== 'compliant'
    )
      fail('delivery-method');
    exact(payload.transport, ['provider', 'operationId', 'result'], 'delivery-transport-keys');
    textValue(payload.transport.provider, 'delivery-provider');
    uuidValue(payload.transport.operationId, 'delivery-operation');
    if (payload.transport.result !== 'merged') fail('delivery-transport');
  }
  if (type === 'close-started') {
    digestValue(payload.deliveryId, 'close-delivery');
    digestValue(payload.acceptanceId, 'close-acceptance');
    uuidValue(payload.closeTransactionId, 'close-transaction');
    digestValue(payload.expectedCycleRevision, 'close-cycle-revision');
    validateExpectedBinding(payload.expectedBinding);
    exact(payload.effectOperationKeys, CLOSE_EFFECTS, 'close-effect-keys');
    for (const effect of CLOSE_EFFECTS)
      textValue(payload.effectOperationKeys[effect], 'close-effect-key');
  }
  if (type === 'close-step') {
    digestValue(payload.closeStartedId, 'close-started');
    uuidValue(payload.closeTransactionId, 'close-transaction');
    if (!CLOSE_EFFECTS.includes(payload.step)) fail('close-step');
    textValue(payload.operationKey, 'close-effect-key');
    if (payload.outcome !== 'confirmed') fail('close-step-outcome');
    exact(payload.readBack, ['status', 'digest'], 'close-readback-keys');
    if (payload.readBack.status !== 'confirmed') fail('close-readback-status');
    digestValue(payload.readBack.digest, 'close-readback-digest');
  }
  if (type === 'cycle-completed') {
    digestValue(payload.closeStartedId, 'close-started');
    uuidValue(payload.closeTransactionId, 'close-transaction');
    exact(payload.finalObservation, ['issue', 'board', 'disposition'], 'close-final-keys');
    if (payload.finalObservation.issue !== 'closed' || payload.finalObservation.board !== 'done')
      fail('close-final-state');
    textValue(payload.finalObservation.disposition, 'close-final-disposition');
  }
  if (type === 'cleanup') {
    digestValue(payload.closeStartedId, 'close-started');
    uuidValue(payload.closeTransactionId, 'close-transaction');
    validateExpectedBinding(payload.expectedBinding);
    if (
      !['released', 'already-released', 'pending-conflict', 'absent', 'paused'].includes(
        payload.status
      )
    )
      fail('cleanup-status');
    if (
      !Array.isArray(payload.diagnostics) ||
      payload.diagnostics.some((item) => typeof item !== 'string')
    )
      fail('cleanup-diagnostics');
  }
}
export const recordReferenceTypes = {
  verification: { candidateId: 'candidate' },
  equivalence: { priorVerificationId: 'verification', candidateId: 'candidate' },
  acceptance: { candidateId: 'candidate' },
  'delivery-intent': { acceptanceId: 'acceptance', candidateId: 'candidate' },
  delivery: {
    acceptanceId: 'acceptance',
    intentId: 'delivery-intent',
    candidateId: 'candidate',
  },
  'close-started': { deliveryId: 'delivery', acceptanceId: 'acceptance' },
  'close-step': { closeStartedId: 'close-started' },
  'cycle-completed': { closeStartedId: 'close-started' },
  cleanup: { closeStartedId: 'close-started' },
};
