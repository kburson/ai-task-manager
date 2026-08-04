// @story #1077
import { strict as assert } from 'node:assert';
import test from 'node:test';

import {
  replaceCoordinator,
  resolveCoordinatorAuthority,
} from '../../../../lib/github-records/coordination-authority.mjs';
import {
  createAitmRecordEnvelope,
  hashRecordPayload,
} from '../../../../lib/github-records/record-envelope.mjs';
import {
  acceptSubmission,
  adoptOutstandingSubmissions,
  createWorkAssignment,
  evaluateAssignment,
  rejectSubmission,
} from '../../../../lib/github-records/work-assignment.mjs';

const issue = 1077;
const repository = 'kburson/ai-task-manager';
const branch = 'feature/child/1077';
const baselineSha = 'c2ae3db785468fb496f2be1f54aca144e636b172';
const coordinator = Object.freeze({
  actor: 'claude/session-1067',
  platform: 'claude',
  session: 'session-1067',
});
const worker = Object.freeze({
  actor: 'codex/session-1077',
  platform: 'codex',
  session: 'session-1077',
});
const replacementCoordinator = Object.freeze({
  actor: 'codex/session-1067-replacement',
  platform: 'codex',
  session: 'session-1067-replacement',
});

function id(number) {
  return `01J0000000000000000000${String(number).padStart(4, '0')}`;
}

function grant({
  grantId = id(9001),
  epoch = 4,
  grantCoordinator = coordinator,
  operations = ['assign-work', 'dispose-submission', 'adopt-submissions'],
  issuer = null,
} = {}) {
  return {
    schema: 'aitm.coordinator-grant/v1',
    grantId,
    scope: { scopeRootIssue: 1067, includedIssues: [issue], excludedIssues: [] },
    coordinator: grantCoordinator,
    parentGrantId: null,
    issuer,
    epoch,
    operations,
    branchBoundary: ['feature/epic/1067', branch],
    integrationBoundary: { sourceBranches: [], destinationBranches: [] },
    activatedAt: '2026-08-03T20:00:00.000Z',
    expiresAt: null,
  };
}

function resolveActiveRecords(authorityGrant, records) {
  return resolveCoordinatorAuthority({
    issueHierarchy: [
      { issue: 1067, parentIssue: null },
      { issue, parentIssue: 1067 },
    ],
    records,
    repository,
    issue,
    coordinationProjection: {
      schema: 'aitm.coordination-projection/v1',
      grantId: authorityGrant.grantId,
      epoch: authorityGrant.epoch,
      adoptionState: 'adopted',
    },
    now: '2026-08-03T20:05:00.000Z',
  });
}

function activeFixture(overrides = {}) {
  const authorityGrant = grant(overrides);
  const grantRecord = record({
    recordId: id(1),
    recordType: 'coordinator-grant',
    payload: authorityGrant,
    actor: authorityGrant.coordinator.actor,
    epoch: authorityGrant.epoch,
    grantId: id(8000),
  });
  return {
    authority: resolveActiveRecords(authorityGrant, [grantRecord]),
    authorityGrant,
    grantRecord,
  };
}

function activeAuthority(overrides = {}) {
  return activeFixture(overrides).authority;
}

function assignmentInput(authority = activeAuthority(), overrides = {}) {
  return {
    authority,
    coordinator,
    issue,
    repository,
    branch,
    files: ['scripts/task-tracker/lib/github-records/work-assignment.mjs'],
    subsystem: 'github-records',
    dependency: { baselineSha, recordIds: [id(1)] },
    verification: { contractEpoch: 1, verifierIds: ['vc-6'] },
    worker,
    ...overrides,
  };
}

function record({
  recordId,
  recordType,
  payload,
  actor,
  epoch = 4,
  grantId = id(9001),
  commentNodeId = `IC_kwDO1077${recordId.slice(-4)}`,
  predecessor = null,
} = {}) {
  return Object.freeze({
    commentNodeId,
    envelope: createAitmRecordEnvelope({
      recordId,
      recordType,
      repository,
      issue,
      payload,
      actor,
      epoch,
      grantId,
      predecessor,
      createdAt: '2026-08-03T20:00:00.000Z',
    }),
  });
}

function handoff({ recordType = 'execution-result', submissionOverrides = {} } = {}) {
  const fixture = activeFixture();
  const assignmentCandidate = createWorkAssignment(assignmentInput(fixture.authority));
  const assignment = record({
    recordId: id(10),
    recordType: assignmentCandidate.recordType,
    payload: assignmentCandidate.payload,
    actor: coordinator.actor,
    predecessor: fixture.grantRecord.envelope.recordId,
  });
  const submissionPayload = {
    schema: 'aitm.worker-submission/v1',
    status: 'submitted',
    assignmentRecordId: assignment.envelope.recordId,
    issue,
    branch,
    files: [...assignment.envelope.payload.files],
    subsystem: assignment.envelope.payload.subsystem,
    dependency: structuredClone(assignment.envelope.payload.dependency),
    verification: structuredClone(assignment.envelope.payload.verification),
    worker: structuredClone(worker),
    result: { summary: 'focused tests passed' },
    ...submissionOverrides,
  };
  const submission = record({
    recordId: id(11),
    recordType,
    payload: submissionPayload,
    actor: worker.actor,
    predecessor: assignment.envelope.recordId,
  });
  const authority = resolveActiveRecords(fixture.authorityGrant, [
    fixture.grantRecord,
    assignment,
    submission,
  ]);
  return { authority, assignment, submission };
}

function replacementHandoff({ decision = 'accepted', fillerCount = 0 } = {}) {
  const originalGrant = grant();
  const authority = activeAuthority();
  const originalGrantRecord = record({
    recordId: id(19),
    recordType: 'coordinator-grant',
    payload: originalGrant,
    actor: coordinator.actor,
    grantId: id(8000),
  });
  const fillerRecords = [];
  let assignmentPredecessor = originalGrantRecord.envelope.recordId;
  for (let index = 0; index < fillerCount; index += 1) {
    const filler = record({
      recordId: id(100 + index),
      recordType: 'contract-sealed',
      payload: { schema: 'aitm.test-filler/v1', sequence: index },
      actor: coordinator.actor,
      predecessor: assignmentPredecessor,
    });
    fillerRecords.push(filler);
    assignmentPredecessor = filler.envelope.recordId;
  }
  const assignmentCandidate = createWorkAssignment(assignmentInput(authority));
  const assignment = record({
    recordId: id(20),
    recordType: 'work-assignment',
    payload: assignmentCandidate.payload,
    actor: coordinator.actor,
    predecessor: assignmentPredecessor,
  });
  const submission = record({
    recordId: id(21),
    recordType: 'verification-evidence',
    payload: {
      schema: 'aitm.worker-submission/v1',
      status: 'submitted',
      assignmentRecordId: assignment.envelope.recordId,
      issue,
      branch,
      files: [...assignment.envelope.payload.files],
      subsystem: assignment.envelope.payload.subsystem,
      dependency: structuredClone(assignment.envelope.payload.dependency),
      verification: structuredClone(assignment.envelope.payload.verification),
      worker: structuredClone(worker),
      result: { checks: ['vc-6'] },
    },
    actor: worker.actor,
    predecessor: assignment.envelope.recordId,
  });
  const replacementGrant = grant({
    grantId: id(9002),
    epoch: 5,
    grantCoordinator: replacementCoordinator,
    issuer: coordinator,
  });
  const replacement = replaceCoordinator({
    authority,
    expectedGrantId: id(9001),
    expectedEpoch: 4,
    replacementGrant,
  });
  const revocationRecord = record({
    recordId: id(22),
    recordType: 'coordinator-revocation',
    payload: replacement.revocation,
    actor: coordinator.actor,
    grantId: id(8000),
    predecessor: submission.envelope.recordId,
  });
  const replacementGrantRecord = record({
    recordId: id(23),
    recordType: 'coordinator-grant',
    payload: replacementGrant,
    actor: coordinator.actor,
    grantId: id(8000),
    predecessor: revocationRecord.envelope.recordId,
  });
  const persistedRecords = [
    originalGrantRecord,
    ...fillerRecords,
    assignment,
    submission,
    revocationRecord,
    replacementGrantRecord,
  ];
  const pausedAuthority = resolveCoordinatorAuthority({
    issueHierarchy: [
      { issue: 1067, parentIssue: null },
      { issue, parentIssue: 1067 },
    ],
    records: persistedRecords,
    repository,
    issue,
    coordinationProjection: replacement.coordinationProjection,
    now: '2026-08-03T20:05:00.000Z',
  });
  const dispositionCandidate =
    decision === 'accepted'
      ? acceptSubmission({ assignment, submission, authority: pausedAuthority })
      : rejectSubmission({
          assignment,
          submission,
          authority: pausedAuthority,
          reason: 'replacement rejected bounded result',
        });
  const disposition = record({
    recordId: id(24),
    recordType: 'record-disposition',
    payload: dispositionCandidate.payload,
    actor: replacementCoordinator.actor,
    epoch: 5,
    grantId: id(9002),
    predecessor: replacementGrantRecord.envelope.recordId,
  });
  return {
    pausedAuthority,
    assignment,
    submission,
    disposition,
    replacement,
    originalGrant,
    replacementGrant,
    originalGrantRecord,
    revocationRecord,
    replacementGrantRecord,
    persistedRecords,
    records: [...persistedRecords, disposition],
  };
}

function adoptionInput(current, records = current.records, expectedHeadRecordId = id(24)) {
  return {
    authority: current.pausedAuthority,
    snapshot: {
      repository: 'kburson/ai-task-manager',
      issue,
      expectedHeadRecordId,
      records,
    },
  };
}

test('exports the bounded worker handoff surface', () => {
  for (const exported of [
    createWorkAssignment,
    evaluateAssignment,
    acceptSubmission,
    rejectSubmission,
    adoptOutstandingSubmissions,
  ]) {
    assert.equal(typeof exported, 'function');
  }
});

test('creates an exact frozen assignment without mutating caller data', () => {
  const input = assignmentInput();
  const before = structuredClone(input);
  const result = createWorkAssignment(input);

  assert.deepEqual(input, before);
  assert.deepEqual(result, {
    recordType: 'work-assignment',
    payload: {
      schema: 'aitm.work-assignment/v1',
      issue,
      branch,
      files: ['scripts/task-tracker/lib/github-records/work-assignment.mjs'],
      subsystem: 'github-records',
      dependency: { baselineSha, recordIds: [id(1)] },
      verification: { contractEpoch: 1, verifierIds: ['vc-6'] },
      worker,
      coordinator,
      grantId: id(9001),
      epoch: 4,
    },
  });
  assert.equal(Object.isFrozen(result), true);
  assert.equal(Object.isFrozen(result.payload.worker), true);
  assert.equal(Object.isFrozen(result.payload.files), true);
});

test('normalizes the Task 7 branch convention but never accepts a branch prefix escape', () => {
  const normalized = createWorkAssignment(
    assignmentInput(undefined, { branch: `refs/heads/${branch}` })
  );
  assert.equal(normalized.payload.branch, branch);
  assert.throws(
    () => createWorkAssignment(assignmentInput(undefined, { branch: `${branch}/escape` })),
    /work-assignment:authority/
  );
});

test('fails closed on fabricated, stale, or unauthorized assignment authority', () => {
  const current = activeAuthority();
  const forged = structuredClone(current);
  assert.throws(() => createWorkAssignment(assignmentInput(forged)), /work-assignment:authority/);

  activeAuthority();
  assert.throws(() => createWorkAssignment(assignmentInput(current)), /work-assignment:authority/);

  assert.throws(
    () =>
      createWorkAssignment(
        assignmentInput(activeAuthority({ operations: ['dispose-submission'] }))
      ),
    /work-assignment:authority/
  );
});

test('rejects malformed assignment bounds, aliases, duplicates, and unknown data', () => {
  const invalidOverrides = [
    { issue: 0 },
    { repository: 'kburson' },
    { files: [], subsystem: null },
    { files: ['/absolute/path'] },
    { files: ['C:/absolute/path'] },
    { files: ['C:outside'] },
    { files: ['scripts/../escape.mjs'] },
    { files: ['scripts\\alias.mjs'] },
    { files: ['same.mjs', 'same.mjs'] },
    { subsystem: '' },
    { subsystem: 'github records' },
    { dependency: { baselineSha: baselineSha.toUpperCase(), recordIds: [] } },
    { dependency: { baselineSha, recordIds: [id(1), id(1)] } },
    {
      dependency: {
        baselineSha,
        recordIds: Array.from({ length: 257 }, (_, index) => id(index + 1)),
      },
    },
    { verification: { contractEpoch: 0, verifierIds: ['vc-6'] } },
    { verification: { contractEpoch: 1, verifierIds: [] } },
    { verification: { contractEpoch: 1, verifierIds: ['vc-6', 'vc-6'] } },
    {
      verification: {
        contractEpoch: 1,
        verifierIds: Array.from({ length: 257 }, (_, index) => `vc-${index + 1}`),
      },
    },
    { worker: { ...worker, extra: true } },
    { coordinator: { ...coordinator, session: '' } },
  ];
  for (const overrides of invalidOverrides) {
    assert.throws(
      () => createWorkAssignment(assignmentInput(undefined, overrides)),
      /work-assignment:(assignment|authority)/
    );
  }

  assert.throws(
    () => createWorkAssignment(assignmentInput(undefined, { dependency: new Map() })),
    /work-assignment:assignment/
  );
  assert.throws(
    () => createWorkAssignment(assignmentInput(undefined, { subsystem: 'Bearer abc' })),
    /work-assignment:assignment/
  );
});

test('matches only the four worker submission record types without implying acceptance', () => {
  for (const recordType of [
    'execution-result',
    'verification-evidence',
    'review-result',
    'handoff',
  ]) {
    const { authority, assignment, submission } = handoff({ recordType });
    const result = evaluateAssignment({ assignment, submission, authority });
    assert.deepEqual(result, {
      status: 'matched',
      assignmentRecordId: id(10),
      submissionRecordId: id(11),
    });
    assert.equal(Object.hasOwn(result, 'accepted'), false);
    assert.equal(Object.hasOwn(result, 'gateSatisfied'), false);
    assert.equal(Object.isFrozen(result), true);
  }
});

test('makes bounded worker drift rejectable without allowing it to become matched', () => {
  const drifts = [
    { branch: 'feature/child/1077-drift' },
    { files: ['different.mjs'] },
    { subsystem: 'different-subsystem' },
    { dependency: { baselineSha, recordIds: [id(2)] } },
    { verification: { contractEpoch: 2, verifierIds: ['vc-6'] } },
  ];
  for (const submissionOverrides of drifts) {
    const { authority, assignment, submission } = handoff({ submissionOverrides });
    assert.deepEqual(evaluateAssignment({ assignment, submission, authority }), {
      status: 'rejectable',
      assignmentRecordId: id(10),
      submissionRecordId: id(11),
      diagnostic: { reason: 'assignment-bounds-drift' },
    });
  }
});

test('blocks foreign provenance, worker substitution, unsupported types, and stale authority', () => {
  const blockedCases = [
    handoff({ recordType: 'record-disposition' }),
    handoff({ submissionOverrides: { assignmentRecordId: id(99) } }),
    handoff({ submissionOverrides: { worker: { ...worker, session: 'substituted' } } }),
  ];
  for (const { authority, assignment, submission } of blockedCases) {
    assert.equal(evaluateAssignment({ assignment, submission, authority }).status, 'blocked');
  }

  const stale = handoff();
  activeAuthority();
  assert.deepEqual(evaluateAssignment(stale), {
    status: 'blocked',
    diagnostic: { reason: 'authority' },
  });

  const valid = handoff();
  const forged = { ...valid.submission, envelope: { ...valid.submission.envelope } };
  forged.envelope.authority = { ...forged.envelope.authority, actor: coordinator.actor };
  assert.deepEqual(evaluateAssignment({ ...valid, submission: forged }), {
    status: 'blocked',
    diagnostic: { reason: 'authority' },
  });
  const foreignRepository = {
    ...valid.submission,
    envelope: { ...valid.submission.envelope, repository: 'foreign/repository' },
  };
  assert.deepEqual(evaluateAssignment({ ...valid, submission: foreignRepository }), {
    status: 'blocked',
    diagnostic: { reason: 'authority' },
  });
});

test('blocks nonmember submissions before validating their durable payloads', () => {
  const valid = handoff();
  assert.throws(
    () => evaluateAssignment({ ...valid, assignment: new Map() }),
    /work-assignment:assignment/
  );

  const unknownPayload = {
    ...valid.submission.envelope.payload,
    unknown: true,
  };
  const unknown = record({
    recordId: id(12),
    recordType: 'execution-result',
    payload: unknownPayload,
    actor: worker.actor,
  });
  assert.deepEqual(evaluateAssignment({ ...valid, submission: unknown }), {
    status: 'blocked',
    diagnostic: { reason: 'authority' },
  });

  const nonCanonicalBranch = record({
    recordId: id(14),
    recordType: 'execution-result',
    payload: { ...valid.submission.envelope.payload, branch: `refs/heads/${branch}` },
    actor: worker.actor,
  });
  assert.deepEqual(evaluateAssignment({ ...valid, submission: nonCanonicalBranch }), {
    status: 'blocked',
    diagnostic: { reason: 'authority' },
  });

  const secretPayload = {
    ...valid.submission.envelope.payload,
    result: { note: 'Bearer credential' },
  };
  const secret = {
    ...valid.submission,
    envelope: {
      ...valid.submission.envelope,
      payload: secretPayload,
      payloadHash: hashRecordPayload(secretPayload),
    },
  };
  assert.throws(
    () => evaluateAssignment({ ...valid, submission: secret }),
    /work-assignment:submission/
  );
});

test('creates accepted and rejected capsule candidates with exact record and comment provenance', () => {
  const acceptedHandoff = handoff();
  const accepted = acceptSubmission(acceptedHandoff);
  assert.deepEqual(accepted, {
    recordType: 'record-disposition',
    payload: {
      schema: 'aitm.record-disposition/v1',
      decision: 'accepted',
      issue,
      assignmentRecordId: id(10),
      assignmentCommentNodeId: 'IC_kwDO10770010',
      submissionRecordId: id(11),
      submissionCommentNodeId: 'IC_kwDO10770011',
      grantId: id(9001),
      epoch: 4,
      decidedBy: coordinator,
      reason: null,
    },
  });
  assert.equal(Object.isFrozen(accepted.payload.decidedBy), true);

  const rejectedHandoff = handoff({ submissionOverrides: { files: ['different.mjs'] } });
  const rejected = rejectSubmission({ ...rejectedHandoff, reason: 'assignment scope drifted' });
  assert.equal(rejected.payload.decision, 'rejected');
  assert.equal(rejected.payload.reason, 'assignment scope drifted');
  assert.throws(() => acceptSubmission(rejectedHandoff), /work-assignment:not-matched/);
});

test('requires a safe rejection reason and current exact disposition authority', () => {
  for (const reason of [undefined, null, '', ' ', 'Bearer credential']) {
    const current = handoff();
    assert.throws(() => rejectSubmission({ ...current, reason }), /work-assignment:reason/);
  }

  const stale = handoff();
  activeAuthority();
  assert.throws(() => acceptSubmission(stale), /work-assignment:authority/);

  const forged = handoff();
  assert.throws(
    () => acceptSubmission({ ...forged, authority: structuredClone(forged.authority) }),
    /work-assignment:authority/
  );
});

test('adopts only an exhaustive durable capsule snapshot with deterministic provenance', () => {
  for (const decision of ['accepted', 'rejected']) {
    const current = replacementHandoff({ decision });
    const result = adoptOutstandingSubmissions(adoptionInput(current));
    assert.equal(result.status, 'ready-to-adopt');
    assert.deepEqual(result.acceptedSubmissionRecordIds, decision === 'accepted' ? [id(21)] : []);
    assert.deepEqual(result.rejectedSubmissionRecordIds, decision === 'rejected' ? [id(21)] : []);
    assert.equal(Object.isFrozen(result.coordinationProjection), true);
  }

  const current = replacementHandoff();
  assert.throws(
    () =>
      adoptOutstandingSubmissions({
        authority: current.pausedAuthority,
        assignments: [current.assignment],
        submissions: [current.submission],
        dispositions: [current.disposition],
      }),
    /work-assignment:input/
  );
  assert.throws(
    () =>
      adoptOutstandingSubmissions({
        authority: current.pausedAuthority,
        snapshot: {
          repository,
          issue,
          expectedHeadRecordId: id(24),
          records: [],
        },
      }),
    /work-assignment:input/
  );
});

test('binds replacement disposition to the exact durable predecessor authority', () => {
  const current = replacementHandoff();
  const foreignCoordinator = {
    actor: 'claude/unrelated-coordinator',
    platform: 'claude',
    session: 'unrelated-coordinator',
  };
  const foreignAuthority = activeAuthority({
    grantId: id(9010),
    epoch: 9,
    grantCoordinator: foreignCoordinator,
  });
  const candidate = createWorkAssignment(
    assignmentInput(foreignAuthority, { coordinator: foreignCoordinator })
  );
  const assignment = record({
    recordId: id(30),
    recordType: candidate.recordType,
    payload: candidate.payload,
    actor: foreignCoordinator.actor,
    epoch: 9,
    grantId: id(9010),
  });
  const submission = record({
    recordId: id(31),
    recordType: 'execution-result',
    payload: {
      schema: 'aitm.worker-submission/v1',
      status: 'submitted',
      assignmentRecordId: assignment.envelope.recordId,
      issue,
      branch,
      files: [...assignment.envelope.payload.files],
      subsystem: assignment.envelope.payload.subsystem,
      dependency: structuredClone(assignment.envelope.payload.dependency),
      verification: structuredClone(assignment.envelope.payload.verification),
      worker: structuredClone(worker),
      result: { summary: 'fabricated old assignment' },
    },
    actor: worker.actor,
    epoch: 9,
    grantId: id(9010),
    predecessor: assignment.envelope.recordId,
  });
  assert.throws(
    () => acceptSubmission({ assignment, submission, authority: current.pausedAuthority }),
    /work-assignment:authority/
  );

  const fabricated = record({
    recordId: id(32),
    recordType: 'work-assignment',
    payload: current.assignment.envelope.payload,
    actor: coordinator.actor,
    predecessor: current.originalGrantRecord.envelope.recordId,
  });
  const fabricatedSubmission = record({
    recordId: id(33),
    recordType: 'execution-result',
    payload: {
      ...current.submission.envelope.payload,
      assignmentRecordId: fabricated.envelope.recordId,
    },
    actor: worker.actor,
    predecessor: fabricated.envelope.recordId,
  });
  assert.throws(
    () =>
      acceptSubmission({
        assignment: fabricated,
        submission: fabricatedSubmission,
        authority: current.pausedAuthority,
      }),
    /work-assignment:authority/
  );
});

test('rejects omitted tails and delegates malformed topology to capsule-chain validation', () => {
  const missing = replacementHandoff();
  assert.deepEqual(adoptOutstandingSubmissions(adoptionInput(missing, missing.persistedRecords)), {
    status: 'blocked',
    diagnostic: { reason: 'stale-head' },
  });

  const duplicate = replacementHandoff();
  assert.throws(
    () =>
      adoptOutstandingSubmissions(
        adoptionInput(duplicate, [...duplicate.records, duplicate.disposition])
      ),
    /capsule-chain:duplicate-record-id/
  );

  const absent = replacementHandoff();
  const missingPredecessor = absent.records.map((candidate) =>
    candidate === absent.submission
      ? { ...candidate, envelope: { ...candidate.envelope, predecessor: id(99) } }
      : candidate
  );
  assert.throws(
    () => adoptOutstandingSubmissions(adoptionInput(absent, missingPredecessor)),
    /capsule-chain:missing-predecessor/
  );

  const cyclic = replacementHandoff();
  const cycle = cyclic.records.map((candidate) =>
    candidate === cyclic.originalGrantRecord
      ? { ...candidate, envelope: { ...candidate.envelope, predecessor: id(24) } }
      : candidate
  );
  assert.throws(
    () => adoptOutstandingSubmissions(adoptionInput(cyclic, cycle)),
    /capsule-chain:predecessor-cycle/
  );

  const forked = replacementHandoff();
  const fork = forked.records.map((candidate) =>
    candidate === forked.disposition
      ? { ...candidate, envelope: { ...candidate.envelope, predecessor: id(21) } }
      : candidate
  );
  assert.deepEqual(adoptOutstandingSubmissions(adoptionInput(forked, fork)), {
    status: 'blocked',
    diagnostic: { reason: 'forked-history' },
  });

  const multipleRoots = replacementHandoff();
  const root = multipleRoots.records.map((candidate) =>
    candidate === multipleRoots.submission
      ? { ...candidate, envelope: { ...candidate.envelope, predecessor: null } }
      : candidate
  );
  assert.throws(
    () => adoptOutstandingSubmissions(adoptionInput(multipleRoots, root)),
    /capsule-chain:multiple-roots/
  );
});

test('bounds capsule count and processes a 300-record permutation deterministically', () => {
  const stress = replacementHandoff({ fillerCount: 300 });
  const result = adoptOutstandingSubmissions(adoptionInput(stress, [...stress.records].reverse()));
  assert.deepEqual(result.acceptedSubmissionRecordIds, [id(21)]);
  assert.throws(
    () =>
      adoptOutstandingSubmissions(
        adoptionInput(
          stress,
          Array.from({ length: 2049 }, () => stress.originalGrantRecord)
        )
      ),
    /work-assignment:input/
  );
  const tooDeep = replacementHandoff({ fillerCount: 1020 });
  assert.throws(() => adoptOutstandingSubmissions(adoptionInput(tooDeep)), /work-assignment:input/);
});

test('retires adoption after any later authority resolution', () => {
  const current = replacementHandoff();
  resolveCoordinatorAuthority({
    issueHierarchy: [
      { issue: 1067, parentIssue: null },
      { issue, parentIssue: 1067 },
    ],
    grants: [current.originalGrant, current.replacementGrant],
    revocations: [current.replacement.revocation],
    coordinationProjection: {
      ...current.replacement.coordinationProjection,
      adoptionState: 'adopted',
    },
    now: '2026-08-03T20:05:00.000Z',
  });
  assert.deepEqual(adoptOutstandingSubmissions(adoptionInput(current)), {
    status: 'blocked',
    diagnostic: { reason: 'authority' },
  });
});
