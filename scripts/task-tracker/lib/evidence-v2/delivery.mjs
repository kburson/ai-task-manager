// @story #1498
import { canonical, exact, fail, frozen, OID, repository, textValue, uuidValue } from './value.mjs';
import { validateRecord } from './codec.mjs';
import { validateTarget } from './record-schema.mjs';

const METHODS = new Set(['merge', 'squash', 'rebase', 'fast-forward']);
const refuse = (reason) => {
  throw new TypeError(`delivery-v2:${reason}`);
};
const INTENT_KEYS = [
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
];

function sameRepository(left, right) {
  return canonical(left) === canonical(right);
}

function validatePolicy(policy) {
  exact(policy, ['id', 'version', 'requiredMethod', 'providers'], 'delivery-policy-keys');
  textValue(policy.id, 'delivery-policy-id');
  textValue(policy.version, 'delivery-policy-version');
  if (!METHODS.has(policy.requiredMethod)) fail('delivery-method');
  if (
    !Array.isArray(policy.providers) ||
    !policy.providers.length ||
    new Set(policy.providers).size !== policy.providers.length
  )
    fail('delivery-provider');
  policy.providers.forEach((provider) => textValue(provider, 'delivery-provider'));
}

function validatePr(pr) {
  exact(
    pr,
    ['provider', 'id', 'number', 'repositoryId', 'baseRef', 'headRef', 'headSha', 'treeOid'],
    'delivery-pr-keys'
  );
  textValue(pr.provider, 'delivery-pr');
  textValue(pr.id, 'delivery-pr');
  if (!Number.isSafeInteger(pr.number) || pr.number <= 0) fail('delivery-pr');
  repository(pr.repositoryId);
  textValue(pr.baseRef, 'delivery-target');
  textValue(pr.headRef, 'delivery-pr');
  if (!OID.test(pr.headSha) || !OID.test(pr.treeOid)) fail('delivery-pr');
}

function validateIntent(intent, { allowId = true } = {}) {
  const keys = Object.keys(intent || {});
  const hasId = keys.includes('intentId');
  exact(
    intent,
    hasId && allowId ? [...INTENT_KEYS, 'intentId'] : INTENT_KEYS,
    'delivery-intent-keys'
  );
  if (hasId && intent.intentId !== null && !/^sha256:[a-f0-9]{64}$/.test(intent.intentId))
    fail('delivery-intent-id');
  validatePr({ ...intent.pr, headSha: intent.expectedHeadSha, treeOid: intent.authorizedTreeOid });
  validateTarget(intent.target);
  validatePolicy({
    ...intent.policy,
    requiredMethod: intent.requestedMethod,
    providers: [intent.pr.provider],
  });
  uuidValue(intent.providerOperationId, 'delivery-operation');
  return intent;
}

export function resolveDeliveryIntent({ acceptance, candidate, pr, policy, operation } = {}) {
  validateRecord(acceptance);
  validateRecord(candidate);
  if (acceptance.recordType !== 'acceptance' || candidate.recordType !== 'candidate')
    fail('delivery-records');
  if (
    acceptance.cycleId !== candidate.cycleId ||
    acceptance.issueNumber !== candidate.issueNumber ||
    !sameRepository(acceptance.repositoryId, candidate.repositoryId) ||
    acceptance.payload.candidateId !== candidate.recordId
  )
    fail('delivery-acceptance');
  validatePr(pr);
  validatePolicy(policy);
  exact(operation, ['operationId', 'requestedMethod'], 'delivery-operation-keys');
  uuidValue(operation.operationId, 'delivery-operation');
  if (!METHODS.has(operation.requestedMethod)) fail('delivery-method');

  if (
    !sameRepository(pr.repositoryId, acceptance.repositoryId) ||
    !sameRepository(pr.repositoryId, acceptance.payload.target.repositoryId)
  )
    fail('delivery-repository');
  if (pr.baseRef !== acceptance.payload.target.ref) fail('delivery-target');
  if (
    pr.treeOid !== candidate.payload.subject.source.treeOid ||
    acceptance.payload.requirementsDigest !== candidate.payload.subject.requirementsDigest
  )
    fail('delivery-content');
  if (
    canonical(acceptance.payload.policy) !==
      canonical({ id: policy.id, version: policy.version }) ||
    policy.requiredMethod !== operation.requestedMethod ||
    !policy.providers.includes(pr.provider) ||
    !acceptance.payload.target.methods.includes(operation.requestedMethod)
  )
    fail('delivery-method');

  return frozen({
    acceptanceId: acceptance.recordId,
    candidateId: candidate.recordId,
    subjectId: candidate.payload.subject.subjectId,
    pr: {
      provider: pr.provider,
      id: pr.id,
      number: pr.number,
      repositoryId: structuredClone(pr.repositoryId),
      baseRef: pr.baseRef,
      headRef: pr.headRef,
    },
    expectedHeadSha: pr.headSha,
    authorizedTreeOid: candidate.payload.subject.source.treeOid,
    authorizedManifestDigest: candidate.payload.subject.source.manifestDigest,
    target: structuredClone(acceptance.payload.target),
    requestedMethod: operation.requestedMethod,
    policy: { id: policy.id, version: policy.version },
    providerOperationId: operation.operationId,
  });
}

export async function verifyDelivery({ intent, observations, ports } = {}) {
  validateIntent(intent);
  exact(
    observations,
    [
      'repositoryId',
      'provider',
      'prId',
      'prNumber',
      'baseRef',
      'headSha',
      'state',
      'landedCommitSha',
      'landedTreeOid',
      'targetHeadSha',
      'method',
      'transportResult',
      'contradictory',
    ],
    'delivery-observation-keys'
  );
  if (!ports || typeof ports.inspectCommit !== 'function') refuse('ports');
  repository(observations.repositoryId);
  if (
    !sameRepository(observations.repositoryId, intent.pr.repositoryId) ||
    observations.provider !== intent.pr.provider ||
    observations.prId !== intent.pr.id ||
    observations.prNumber !== intent.pr.number
  )
    refuse('identity');
  if (observations.baseRef !== intent.target.ref) refuse('target');
  if (observations.headSha !== intent.expectedHeadSha) refuse('head-race');
  if (observations.state !== 'MERGED' || observations.transportResult !== 'merged')
    refuse('transport');
  if (observations.contradictory !== null) refuse('contradictory');
  if (!OID.test(observations.landedCommitSha) || !OID.test(observations.targetHeadSha))
    refuse('object');
  if (!OID.test(observations.landedTreeOid)) refuse('content');

  const inspected = await ports.inspectCommit({ sha: observations.landedCommitSha });
  if (
    !inspected ||
    !OID.test(inspected.treeOid || '') ||
    inspected.treeOid !== observations.landedTreeOid ||
    observations.landedTreeOid !== intent.authorizedTreeOid
  )
    refuse('content');
  if (observations.method !== intent.requestedMethod) refuse('method');

  return frozen({
    acceptanceId: intent.acceptanceId,
    intentId: intent.intentId ?? null,
    candidateId: intent.candidateId,
    pr: structuredClone(intent.pr),
    expectedHeadSha: intent.expectedHeadSha,
    landedCommitSha: observations.landedCommitSha,
    landedTreeOid: observations.landedTreeOid,
    targetObservation: { ref: observations.baseRef, headSha: observations.targetHeadSha },
    contentVerification: {
      subjectId: intent.subjectId,
      authorizedTreeOid: intent.authorizedTreeOid,
      landedTreeOid: observations.landedTreeOid,
      result: 'match',
    },
    methodObservation: {
      requested: intent.requestedMethod,
      observed: observations.method,
      result: 'compliant',
    },
    transport: {
      provider: observations.provider,
      operationId: intent.providerOperationId,
      result: observations.transportResult,
    },
  });
}
