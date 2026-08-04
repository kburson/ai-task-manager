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

function activeAuthority(overrides = {}) {
  const authorityGrant = grant(overrides);
  return resolveCoordinatorAuthority({
    issueHierarchy: [
      { issue: 1067, parentIssue: null },
      { issue, parentIssue: 1067 },
    ],
    grants: [authorityGrant],
    revocations: [],
    coordinationProjection: {
      schema: 'aitm.coordination-projection/v1',
      grantId: authorityGrant.grantId,
      epoch: authorityGrant.epoch,
      adoptionState: 'adopted',
    },
    now: '2026-08-03T20:05:00.000Z',
  });
}

function assignmentInput(authority = activeAuthority(), overrides = {}) {
  return {
    authority,
    coordinator,
    issue,
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
      repository: 'kburson/ai-task-manager',
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
  const authority = activeAuthority();
  const assignmentCandidate = createWorkAssignment(assignmentInput(authority));
  const assignment = record({
    recordId: id(10),
    recordType: assignmentCandidate.recordType,
    payload: assignmentCandidate.payload,
    actor: coordinator.actor,
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
  return { authority, assignment, submission };
}

function replacementHandoff({ decision = 'accepted' } = {}) {
  const originalGrant = grant();
  const authority = activeAuthority();
  const assignmentCandidate = createWorkAssignment(assignmentInput(authority));
  const assignment = record({
    recordId: id(20),
    recordType: 'work-assignment',
    payload: assignmentCandidate.payload,
    actor: coordinator.actor,
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
  const pausedAuthority = resolveCoordinatorAuthority({
    issueHierarchy: [
      { issue: 1067, parentIssue: null },
      { issue, parentIssue: 1067 },
    ],
    grants: [originalGrant, replacementGrant],
    revocations: [replacement.revocation],
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
    recordId: id(22),
    recordType: 'record-disposition',
    payload: dispositionCandidate.payload,
    actor: replacementCoordinator.actor,
    epoch: 5,
    grantId: id(9002),
    predecessor: submission.envelope.recordId,
  });
  return {
    pausedAuthority,
    assignment,
    submission,
    disposition,
    replacement,
    originalGrant,
    replacementGrant,
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
    { files: [], subsystem: null },
    { files: ['/absolute/path'] },
    { files: ['C:/absolute/path'] },
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
    diagnostic: { reason: 'submission-provenance' },
  });
  const foreignRepository = {
    ...valid.submission,
    envelope: { ...valid.submission.envelope, repository: 'foreign/repository' },
  };
  assert.deepEqual(evaluateAssignment({ ...valid, submission: foreignRepository }), {
    status: 'blocked',
    diagnostic: { reason: 'submission-provenance' },
  });
});

test('throws categorized errors for malformed durable assignment or submission data', () => {
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
  assert.throws(
    () => evaluateAssignment({ ...valid, submission: unknown }),
    /work-assignment:submission/
  );

  const nonCanonicalBranch = record({
    recordId: id(14),
    recordType: 'execution-result',
    payload: { ...valid.submission.envelope.payload, branch: `refs/heads/${branch}` },
    actor: worker.actor,
  });
  assert.throws(
    () => evaluateAssignment({ ...valid, submission: nonCanonicalBranch }),
    /work-assignment:submission/
  );

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

test('adopts zero or exhaustively decided submissions with deterministic provenance', () => {
  const empty = replacementHandoff();
  assert.deepEqual(
    adoptOutstandingSubmissions({
      authority: empty.pausedAuthority,
      assignments: [],
      submissions: [],
      dispositions: [],
    }),
    {
      status: 'ready-to-adopt',
      coordinationProjection: {
        schema: 'aitm.coordination-projection/v1',
        grantId: id(9002),
        epoch: 5,
        adoptionState: 'adopted',
      },
      acceptedSubmissionRecordIds: [],
      rejectedSubmissionRecordIds: [],
    }
  );

  for (const decision of ['accepted', 'rejected']) {
    const current = replacementHandoff({ decision });
    const result = adoptOutstandingSubmissions({
      authority: current.pausedAuthority,
      assignments: [current.assignment],
      submissions: [current.submission],
      dispositions: [current.disposition],
    });
    assert.equal(result.status, 'ready-to-adopt');
    assert.deepEqual(result.acceptedSubmissionRecordIds, decision === 'accepted' ? [id(21)] : []);
    assert.deepEqual(result.rejectedSubmissionRecordIds, decision === 'rejected' ? [id(21)] : []);
    assert.equal(Object.isFrozen(result.coordinationProjection), true);
  }
});

test('blocks partial, duplicate, unknown, and wrong-authority disposition coverage', () => {
  const missing = replacementHandoff();
  assert.deepEqual(
    adoptOutstandingSubmissions({
      authority: missing.pausedAuthority,
      assignments: [missing.assignment],
      submissions: [missing.submission],
      dispositions: [],
    }),
    { status: 'blocked', diagnostic: { reason: 'missing-disposition' } }
  );

  const duplicate = replacementHandoff();
  assert.equal(
    adoptOutstandingSubmissions({
      authority: duplicate.pausedAuthority,
      assignments: [duplicate.assignment],
      submissions: [duplicate.submission],
      dispositions: [duplicate.disposition, duplicate.disposition],
    }).status,
    'blocked'
  );

  const foreign = replacementHandoff();
  const foreignPayload = { ...foreign.disposition.envelope.payload, submissionRecordId: id(99) };
  const foreignDisposition = record({
    recordId: id(23),
    recordType: 'record-disposition',
    payload: foreignPayload,
    actor: replacementCoordinator.actor,
    epoch: 5,
    grantId: id(9002),
  });
  assert.equal(
    adoptOutstandingSubmissions({
      authority: foreign.pausedAuthority,
      assignments: [foreign.assignment],
      submissions: [foreign.submission],
      dispositions: [foreignDisposition],
    }).status,
    'blocked'
  );

  const oldEpoch = replacementHandoff();
  const wrongEnvelope = {
    ...oldEpoch.disposition,
    envelope: {
      ...oldEpoch.disposition.envelope,
      authority: { ...oldEpoch.disposition.envelope.authority, epoch: 4 },
    },
  };
  assert.equal(
    adoptOutstandingSubmissions({
      authority: oldEpoch.pausedAuthority,
      assignments: [oldEpoch.assignment],
      submissions: [oldEpoch.submission],
      dispositions: [wrongEnvelope],
    }).status,
    'blocked'
  );

  const multipleRoots = replacementHandoff();
  const rootSubmission = {
    ...multipleRoots.submission,
    envelope: { ...multipleRoots.submission.envelope, predecessor: null },
  };
  assert.deepEqual(
    adoptOutstandingSubmissions({
      authority: multipleRoots.pausedAuthority,
      assignments: [multipleRoots.assignment],
      submissions: [rootSubmission],
      dispositions: [multipleRoots.disposition],
    }),
    { status: 'blocked', diagnostic: { reason: 'multiple-roots' } }
  );
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
  assert.deepEqual(
    adoptOutstandingSubmissions({
      authority: current.pausedAuthority,
      assignments: [current.assignment],
      submissions: [current.submission],
      dispositions: [current.disposition],
    }),
    { status: 'blocked', diagnostic: { reason: 'authority' } }
  );
});
