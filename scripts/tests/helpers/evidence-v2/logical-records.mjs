// @story #1497
import { randomUUID } from 'node:crypto';
import { createRecord } from '../../../task-tracker/lib/evidence-v2/codec.mjs';
import { hash } from '../../../task-tracker/lib/evidence-v2/value.mjs';
export function logicalRecordFixture() {
  const runId = `logical-${randomUUID()}`;
  const repositoryId = {
    nodeId: `R_rehearsal_${runId}`,
    nameWithOwner: `aitm-rehearsal/${runId}`,
  };
  const cycleId = randomUUID();
  const authorityHostId = randomUUID();
  const policy = {
    id: 'standard',
    version: '1',
    allowReuse: true,
    trustedActors: ['rehearsal-author'],
    trustedRunners: ['node22'],
    requiredLanes: ['unit'],
    allowGateBypass: true,
    allowTransfer: false,
    authorizeReview: async (decision) => structuredClone(decision),
  };
  const referencePolicy = { id: policy.id, version: policy.version };
  const make = (recordType, payload, overrides = {}) =>
    createRecord({
      schema: 'aitm.evidence-record/v2',
      recordType,
      repositoryId,
      issueNumber: 1000001,
      cycleId,
      operationId: randomUUID(),
      predecessorId: null,
      actor: { id: 'rehearsal-author', kind: 'user' },
      recordedAt: '2026-09-03T16:00:00.000Z',
      payload,
      ...overrides,
    });
  const cycle = make('cycle-opened', { previousCycleId: null, authorityHostId, reason: 'initial' });
  const target = { repositoryId, ref: 'refs/heads/trunk', methods: ['squash'] };
  const input = {
    repositoryId,
    sourceRoot: '/synthetic/source',
    requirements: {
      schema: 'aitm.requirements/v2',
      acceptanceCriteria: [{ id: 'ac:1', text: 'Raw source', verificationIds: ['vc:1'] }],
      verificationCommands: [{ id: 'vc:1', argv: ['node', '--test'] }],
      target,
      policy: referencePolicy,
    },
    recipe: {
      schema: 'aitm.recipe/v2',
      commands: [{ executable: 'node', args: ['--test'], lane: 'unit' }],
      toolDigest: hash('tool'),
      runnerDigest: hash('runner'),
      lanes: ['unit'],
      policy: referencePolicy,
      sensitivity: 'content-only',
      review: { id: 'review-1', actor: 'maintainer' },
    },
    environment: {
      schema: 'aitm.environment/v2',
      dependenciesDigest: hash('resolved dependencies'),
      lockfileDigest: hash('lockfile'),
      node: process.versions.node,
      toolchain: 'node22+',
      platform: { os: process.platform, arch: process.arch },
      configDigests: {},
      variables: {},
      consumedFiles: [],
      externalInputs: [],
      complete: true,
    },
  };
  const identity = {
    schema: 'aitm.evidence-subject/v2',
    repositoryId,
    source: {
      objectFormat: 'sha1',
      treeOid: 'a'.repeat(40),
      manifestDigest: hash('synthetic raw manifest'),
    },
    requirementsDigest: hash(input.requirements),
    recipeDigest: hash(input.recipe),
    environmentDigest: hash(input.environment),
    gitInputs: { sensitivity: 'content-only', digest: null },
  };
  const captured = {
    subject: { ...identity, subjectId: hash(identity) },
    observations: { sourceSha: '1'.repeat(40) },
  };
  const candidate = make(
    'candidate',
    {
      subject: captured.subject,
      sourceSha: captured.observations.sourceSha,
      sourceRetention: { locator: 'rehearsal/source-pack', digest: hash('retained source') },
    },
    { predecessorId: cycle.recordId }
  );
  const verification = make(
    'verification',
    {
      candidateId: candidate.recordId,
      subjectId: captured.subject.subjectId,
      testedSha: captured.observations.sourceSha,
      commands: [{ executable: 'node', args: ['--test'], lane: 'unit', exitCode: 0 }],
      outcome: 'success',
      runner: 'node22',
      startedAt: '2026-09-03T15:59:00.000Z',
      completedAt: '2026-09-03T16:00:00.000Z',
      inputsComplete: true,
    },
    { predecessorId: candidate.recordId }
  );
  const reviewAuthority = {
    kind: 'human',
    actor: 'maintainer',
    decisionId: 'review-1',
    candidateId: candidate.recordId,
    requirementsDigest: captured.subject.requirementsDigest,
    targetDigest: hash(target),
    policy: referencePolicy,
    recordedAt: '2026-09-03T16:00:00.000Z',
  };
  return {
    repositoryId,
    cycle,
    make,
    candidate,
    verification,
    policy,
    reviewAuthority,
    target,
    input,
    authorityHostId,
  };
}
