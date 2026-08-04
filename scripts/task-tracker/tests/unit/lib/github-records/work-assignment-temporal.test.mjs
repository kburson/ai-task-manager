// @story #1077
// cspell:ignore redisposition
import { strict as assert } from 'node:assert';
import test from 'node:test';

import {
  replaceCoordinator,
  resolveCoordinatorAuthority,
} from '../../../../lib/github-records/coordination-authority.mjs';
import { createAitmRecordEnvelope } from '../../../../lib/github-records/record-envelope.mjs';
import {
  acceptSubmission,
  adoptOutstandingSubmissions,
  createWorkAssignment,
  evaluateAssignment,
  rejectSubmission,
} from '../../../../lib/github-records/work-assignment.mjs';

const repository = 'kburson/ai-task-manager';
const issue = 1077;
const branch = 'feature/child/1077';
const coordinator = {
  actor: 'claude/coordinator-1067',
  platform: 'claude',
  session: 'coordinator-1067',
};
const replacementCoordinator = {
  actor: 'codex/replacement-1067',
  platform: 'codex',
  session: 'replacement-1067',
};
const worker = {
  actor: 'codex/worker-1077',
  platform: 'codex',
  session: 'worker-1077',
};

function id(number) {
  return `01J0000000000000000001${String(number).padStart(4, '0')}`;
}

function grant({ grantId, epoch, grantCoordinator, issuer = null }) {
  return {
    schema: 'aitm.coordinator-grant/v1',
    grantId,
    scope: { scopeRootIssue: issue, includedIssues: [], excludedIssues: [] },
    coordinator: grantCoordinator,
    parentGrantId: null,
    issuer,
    epoch,
    operations: ['assign-work', 'dispose-submission', 'adopt-submissions'],
    branchBoundary: [branch],
    integrationBoundary: { sourceBranches: [], destinationBranches: [] },
    activatedAt: '2026-08-03T20:00:00.000Z',
    expiresAt: null,
  };
}

function record(spec, predecessor) {
  return Object.freeze({
    commentNodeId: `IC_kwDOTemporal${spec.recordId.slice(-4)}`,
    envelope: createAitmRecordEnvelope({
      recordId: spec.recordId,
      recordType: spec.recordType,
      repository,
      issue,
      payload: spec.payload,
      actor: spec.actor,
      epoch: spec.epoch,
      grantId: spec.grantId,
      predecessor,
      supersedes: spec.supersedes ?? null,
      createdAt: '2026-08-03T20:05:00.000Z',
    }),
  });
}

function linearize(specs) {
  let predecessor = null;
  return specs.map((spec) => {
    const current = record(spec, predecessor);
    predecessor = current.envelope.recordId;
    return current;
  });
}

function submissionPayload(assignmentRecordId, summary) {
  return {
    schema: 'aitm.worker-submission/v1',
    status: 'submitted',
    assignmentRecordId,
    issue,
    branch,
    files: ['scripts/task-tracker/lib/github-records/work-assignment.mjs'],
    subsystem: 'github-records',
    dependency: {
      baselineSha: 'c2ae3db785468fb496f2be1f54aca144e636b172',
      recordIds: [id(1)],
    },
    verification: { contractEpoch: 1, verifierIds: ['vc-6'] },
    worker,
    result: { summary },
  };
}

function dispositionPayload({ assignmentRecordId, submissionRecordId, replacement = true }) {
  const decisionCoordinator = replacement ? replacementCoordinator : coordinator;
  return {
    schema: 'aitm.record-disposition/v1',
    decision: 'accepted',
    issue,
    assignmentRecordId,
    assignmentCommentNodeId: `IC_kwDOTemporal${assignmentRecordId.slice(-4)}`,
    submissionRecordId,
    submissionCommentNodeId: `IC_kwDOTemporal${submissionRecordId.slice(-4)}`,
    grantId: replacement ? id(9002) : id(9001),
    epoch: replacement ? 2 : 1,
    decidedBy: decisionCoordinator,
    reason: null,
  };
}

function scenario(sequence) {
  const originalGrant = grant({ grantId: id(9001), epoch: 1, grantCoordinator: coordinator });
  const root = record(
    {
      recordId: id(1),
      recordType: 'coordinator-grant',
      payload: originalGrant,
      actor: coordinator.actor,
      epoch: 1,
      grantId: id(8000),
    },
    null
  );
  const active = resolveCoordinatorAuthority({
    issueHierarchy: [{ issue, parentIssue: null }],
    records: [root],
    repository,
    issue,
    coordinationProjection: {
      schema: 'aitm.coordination-projection/v1',
      grantId: originalGrant.grantId,
      epoch: 1,
      adoptionState: 'adopted',
    },
    now: '2026-08-03T20:06:00.000Z',
  });
  const assignmentCandidate = createWorkAssignment({
    authority: active,
    repository,
    coordinator,
    issue,
    branch,
    files: ['scripts/task-tracker/lib/github-records/work-assignment.mjs'],
    subsystem: 'github-records',
    dependency: {
      baselineSha: 'c2ae3db785468fb496f2be1f54aca144e636b172',
      recordIds: [root.envelope.recordId],
    },
    verification: { contractEpoch: 1, verifierIds: ['vc-6'] },
    worker,
  });
  const replacementGrant = grant({
    grantId: id(9002),
    epoch: 2,
    grantCoordinator: replacementCoordinator,
    issuer: coordinator,
  });
  const replacement = replaceCoordinator({
    authority: active,
    expectedGrantId: originalGrant.grantId,
    expectedEpoch: 1,
    replacementGrant,
  });
  const common = {
    root: {
      recordId: id(1),
      recordType: 'coordinator-grant',
      payload: originalGrant,
      actor: coordinator.actor,
      epoch: 1,
      grantId: id(8000),
    },
    assignment: {
      recordId: id(10),
      recordType: 'work-assignment',
      payload: assignmentCandidate.payload,
      actor: coordinator.actor,
      epoch: 1,
      grantId: id(9001),
    },
    assignmentCorrection: {
      recordId: id(11),
      recordType: 'work-assignment',
      payload: assignmentCandidate.payload,
      actor: coordinator.actor,
      epoch: 1,
      grantId: id(9001),
      supersedes: id(10),
    },
    assignmentTwo: {
      recordId: id(12),
      recordType: 'work-assignment',
      payload: assignmentCandidate.payload,
      actor: coordinator.actor,
      epoch: 1,
      grantId: id(9001),
    },
    submission: {
      recordId: id(20),
      recordType: 'execution-result',
      payload: submissionPayload(id(10), 'original result'),
      actor: worker.actor,
      epoch: 1,
      grantId: id(9001),
    },
    correctedSubmission: {
      recordId: id(21),
      recordType: 'execution-result',
      payload: submissionPayload(id(11), 'corrected result'),
      actor: worker.actor,
      epoch: 1,
      grantId: id(9001),
      supersedes: id(20),
    },
    submissionTwo: {
      recordId: id(22),
      recordType: 'execution-result',
      payload: submissionPayload(id(12), 'second result'),
      actor: worker.actor,
      epoch: 1,
      grantId: id(9001),
    },
    historicalDisposition: {
      recordId: id(30),
      recordType: 'record-disposition',
      payload: dispositionPayload({
        assignmentRecordId: id(10),
        submissionRecordId: id(20),
        replacement: false,
      }),
      actor: coordinator.actor,
      epoch: 1,
      grantId: id(9001),
    },
    replacementDisposition: {
      recordId: id(31),
      recordType: 'record-disposition',
      payload: dispositionPayload({ assignmentRecordId: id(10), submissionRecordId: id(20) }),
      actor: replacementCoordinator.actor,
      epoch: 2,
      grantId: id(9002),
    },
    correctedDisposition: {
      recordId: id(32),
      recordType: 'record-disposition',
      payload: dispositionPayload({ assignmentRecordId: id(11), submissionRecordId: id(21) }),
      actor: replacementCoordinator.actor,
      epoch: 2,
      grantId: id(9002),
    },
    replacementDispositionTwo: {
      recordId: id(33),
      recordType: 'record-disposition',
      payload: dispositionPayload({ assignmentRecordId: id(12), submissionRecordId: id(22) }),
      actor: replacementCoordinator.actor,
      epoch: 2,
      grantId: id(9002),
    },
    malformedReplacementDisposition: {
      recordId: id(34),
      recordType: 'record-disposition',
      payload: {
        ...dispositionPayload({ assignmentRecordId: id(10), submissionRecordId: id(20) }),
        assignmentRecordId: id(12),
      },
      actor: replacementCoordinator.actor,
      epoch: 2,
      grantId: id(9002),
    },
    revocation: {
      recordId: id(40),
      recordType: 'coordinator-revocation',
      payload: replacement.revocation,
      actor: coordinator.actor,
      epoch: 1,
      grantId: id(8000),
    },
    replacementGrant: {
      recordId: id(41),
      recordType: 'coordinator-grant',
      payload: replacementGrant,
      actor: coordinator.actor,
      epoch: 1,
      grantId: id(8000),
    },
  };
  const records = linearize(sequence.map((name) => common[name]));
  const byName = new Map(sequence.map((name, index) => [name, records[index]]));
  const paused = resolveCoordinatorAuthority({
    issueHierarchy: [{ issue, parentIssue: null }],
    records: [...records].reverse(),
    repository,
    issue,
    coordinationProjection: replacement.coordinationProjection,
    now: '2026-08-03T20:06:00.000Z',
  });
  const adopt = (inputRecords = records) =>
    adoptOutstandingSubmissions({
      authority: paused,
      snapshot: {
        repository,
        issue,
        expectedHeadRecordId: records.at(-1).envelope.recordId,
        records: inputRecords,
      },
    });
  return { adopt, byName, paused, records };
}

test('ignores an ineligible old-epoch assignment appended after the replacement boundary', () => {
  const current = scenario([
    'root',
    'revocation',
    'replacementGrant',
    'assignment',
    'submission',
    'replacementDisposition',
  ]);
  assert.throws(
    () =>
      acceptSubmission({
        authority: current.paused,
        assignment: current.byName.get('assignment'),
        submission: current.byName.get('submission'),
      }),
    /work-assignment:authority/
  );
  assert.deepEqual(current.adopt().acceptedSubmissionRecordIds, []);
});

test('accepts a post-replacement submission for a pre-boundary assignment', () => {
  const current = scenario(['root', 'assignment', 'revocation', 'replacementGrant', 'submission']);
  assert.equal(
    acceptSubmission({
      authority: current.paused,
      assignment: current.byName.get('assignment'),
      submission: current.byName.get('submission'),
    }).payload.decision,
    'accepted'
  );
  const completed = scenario([
    'root',
    'assignment',
    'revocation',
    'replacementGrant',
    'submission',
    'replacementDisposition',
  ]);
  assert.deepEqual(completed.adopt().acceptedSubmissionRecordIds, [id(20)]);
});

test('keeps a predecessor disposition historical and requires only outstanding work', () => {
  const current = scenario([
    'root',
    'assignment',
    'submission',
    'historicalDisposition',
    'revocation',
    'replacementGrant',
  ]);
  assert.deepEqual(current.adopt(), {
    status: 'ready-to-adopt',
    coordinationProjection: {
      schema: 'aitm.coordination-projection/v1',
      grantId: id(9002),
      epoch: 2,
      adoptionState: 'adopted',
    },
    acceptedSubmissionRecordIds: [],
    rejectedSubmissionRecordIds: [],
  });
  assert.throws(
    () =>
      acceptSubmission({
        authority: current.paused,
        assignment: current.byName.get('assignment'),
        submission: current.byName.get('submission'),
      }),
    /work-assignment:authority/
  );
});

test('rejects a replacement disposition before its submission and replacement grant', () => {
  const current = scenario([
    'root',
    'assignment',
    'replacementDisposition',
    'submission',
    'revocation',
    'replacementGrant',
  ]);
  assert.equal(current.adopt().status, 'blocked');
});

test('requires replacement decisions only for the N submissions outstanding at replacement', () => {
  const current = scenario([
    'root',
    'assignment',
    'submission',
    'historicalDisposition',
    'assignmentTwo',
    'submissionTwo',
    'revocation',
    'replacementGrant',
    'replacementDispositionTwo',
  ]);
  assert.deepEqual(current.adopt().acceptedSubmissionRecordIds, [id(22)]);
  assert.deepEqual(current.adopt([...current.records].reverse()), current.adopt());
});

test('adopts zero outstanding submissions from a complete replacement chain', () => {
  const current = scenario(['root', 'revocation', 'replacementGrant']);
  assert.deepEqual(current.adopt().acceptedSubmissionRecordIds, []);
  assert.deepEqual(current.adopt([...current.records].reverse()), current.adopt());
});

test('uses only effective superseding assignments and submissions across permutations', () => {
  const current = scenario([
    'root',
    'assignment',
    'assignmentCorrection',
    'submission',
    'correctedSubmission',
    'revocation',
    'replacementGrant',
    'correctedDisposition',
  ]);
  const expected = current.adopt();
  assert.deepEqual(expected.acceptedSubmissionRecordIds, [id(21)]);
  assert.deepEqual(current.adopt([...current.records].reverse()), expected);
  assert.throws(
    () =>
      acceptSubmission({
        authority: current.paused,
        assignment: current.byName.get('assignment'),
        submission: current.byName.get('submission'),
      }),
    /work-assignment:authority/
  );
});

test('refuses same and conflicting replacement redisposition after paused re-resolution', () => {
  const current = scenario([
    'root',
    'assignment',
    'submission',
    'revocation',
    'replacementGrant',
    'replacementDisposition',
  ]);
  const restarted = resolveCoordinatorAuthority({
    issueHierarchy: [{ issue, parentIssue: null }],
    records: [...current.records].reverse(),
    repository,
    issue,
    coordinationProjection: {
      schema: 'aitm.coordination-projection/v1',
      grantId: id(9002),
      epoch: 2,
      adoptionState: 'required',
    },
    now: '2026-08-03T20:06:00.000Z',
  });
  const target = {
    authority: restarted,
    assignment: current.byName.get('assignment'),
    submission: current.byName.get('submission'),
  };
  assert.throws(() => acceptSubmission(target), /work-assignment:authority/);
  assert.throws(
    () => rejectSubmission({ ...target, reason: 'conflicting replacement decision' }),
    /work-assignment:authority/
  );
  assert.deepEqual(
    adoptOutstandingSubmissions({
      authority: restarted,
      snapshot: {
        repository,
        issue,
        expectedHeadRecordId: current.records.at(-1).envelope.recordId,
        records: current.records,
      },
    }).acceptedSubmissionRecordIds,
    [id(20)]
  );
});

test('binds active Task 8 work to the durable repository and issue privately', () => {
  const originalGrant = grant({ grantId: id(9001), epoch: 1, grantCoordinator: coordinator });
  const root = record(
    {
      recordId: id(1),
      recordType: 'coordinator-grant',
      payload: originalGrant,
      actor: coordinator.actor,
      epoch: 1,
      grantId: id(8000),
    },
    null
  );
  const active = resolveCoordinatorAuthority({
    issueHierarchy: [{ issue, parentIssue: null }],
    records: [root],
    repository,
    issue,
    coordinationProjection: {
      schema: 'aitm.coordination-projection/v1',
      grantId: originalGrant.grantId,
      epoch: 1,
      adoptionState: 'adopted',
    },
    now: '2026-08-03T20:06:00.000Z',
  });
  const assignmentInput = {
    authority: active,
    repository: 'foreign/ai-task-manager',
    coordinator,
    issue,
    branch,
    files: ['scripts/task-tracker/lib/github-records/work-assignment.mjs'],
    subsystem: 'github-records',
    dependency: {
      baselineSha: 'c2ae3db785468fb496f2be1f54aca144e636b172',
      recordIds: [root.envelope.recordId],
    },
    verification: { contractEpoch: 1, verifierIds: ['vc-6'] },
    worker,
  };
  assert.throws(() => createWorkAssignment(assignmentInput), /work-assignment:authority/);

  const ownerCandidate = createWorkAssignment({ ...assignmentInput, repository });
  const assignment = record(
    {
      recordId: id(10),
      recordType: ownerCandidate.recordType,
      payload: ownerCandidate.payload,
      actor: coordinator.actor,
      epoch: 1,
      grantId: id(9001),
    },
    root.envelope.recordId
  );
  const submission = record(
    {
      recordId: id(20),
      recordType: 'execution-result',
      payload: submissionPayload(id(10), 'foreign relocation'),
      actor: worker.actor,
      epoch: 1,
      grantId: id(9001),
    },
    assignment.envelope.recordId
  );
  const foreignAssignment = structuredClone(assignment);
  foreignAssignment.envelope.repository = 'foreign/ai-task-manager';
  const foreignSubmission = structuredClone(submission);
  foreignSubmission.envelope.repository = 'foreign/ai-task-manager';
  const relocated = {
    authority: active,
    assignment: foreignAssignment,
    submission: foreignSubmission,
  };
  assert.deepEqual(evaluateAssignment(relocated), {
    status: 'blocked',
    diagnostic: { reason: 'authority' },
  });
  assert.throws(() => acceptSubmission(relocated), /work-assignment:authority/);
  assert.throws(
    () => rejectSubmission({ ...relocated, reason: 'foreign repository' }),
    /work-assignment:authority/
  );

  const otherIssue = 1078;
  const scopedGrant = {
    ...grant({ grantId: id(9010), epoch: 1, grantCoordinator: coordinator }),
    scope: { scopeRootIssue: issue, includedIssues: [otherIssue], excludedIssues: [] },
  };
  const scopedRoot = record(
    {
      recordId: id(2),
      recordType: 'coordinator-grant',
      payload: scopedGrant,
      actor: coordinator.actor,
      epoch: 1,
      grantId: id(8000),
    },
    null
  );
  const issueBound = resolveCoordinatorAuthority({
    issueHierarchy: [
      { issue, parentIssue: null },
      { issue: otherIssue, parentIssue: issue },
    ],
    records: [scopedRoot],
    repository,
    issue,
    coordinationProjection: {
      schema: 'aitm.coordination-projection/v1',
      grantId: scopedGrant.grantId,
      epoch: 1,
      adoptionState: 'adopted',
    },
    now: '2026-08-03T20:06:00.000Z',
  });
  assert.throws(
    () =>
      createWorkAssignment({
        ...assignmentInput,
        authority: issueBound,
        repository,
        issue: otherIssue,
      }),
    /work-assignment:authority/
  );

  const unbound = resolveCoordinatorAuthority({
    issueHierarchy: [
      { issue, parentIssue: null },
      { issue: otherIssue, parentIssue: issue },
    ],
    grants: [scopedGrant],
    revocations: [],
    coordinationProjection: {
      schema: 'aitm.coordination-projection/v1',
      grantId: scopedGrant.grantId,
      epoch: 1,
      adoptionState: 'adopted',
    },
    now: '2026-08-03T20:06:00.000Z',
  });
  assert.throws(
    () => createWorkAssignment({ ...assignmentInput, authority: unbound, repository }),
    /work-assignment:authority/
  );
});

test('binds active evaluation and disposition to the assignment grant and epoch', () => {
  const currentGrant = grant({ grantId: id(9002), epoch: 2, grantCoordinator: coordinator });
  const root = record(
    {
      recordId: id(1),
      recordType: 'coordinator-grant',
      payload: currentGrant,
      actor: coordinator.actor,
      epoch: 2,
      grantId: id(8000),
    },
    null
  );
  const active = resolveCoordinatorAuthority({
    issueHierarchy: [{ issue, parentIssue: null }],
    records: [root],
    repository,
    issue,
    coordinationProjection: {
      schema: 'aitm.coordination-projection/v1',
      grantId: currentGrant.grantId,
      epoch: currentGrant.epoch,
      adoptionState: 'adopted',
    },
    now: '2026-08-03T20:06:00.000Z',
  });
  const currentAssignment = createWorkAssignment({
    authority: active,
    repository,
    coordinator,
    issue,
    branch,
    files: ['scripts/task-tracker/lib/github-records/work-assignment.mjs'],
    subsystem: 'github-records',
    dependency: {
      baselineSha: 'c2ae3db785468fb496f2be1f54aca144e636b172',
      recordIds: [root.envelope.recordId],
    },
    verification: { contractEpoch: 1, verifierIds: ['vc-6'] },
    worker,
  });
  assert.equal(currentAssignment.payload.grantId, id(9002));
  assert.equal(currentAssignment.payload.epoch, 2);

  for (const stale of [
    { label: 'stale epoch', grantId: id(9001), epoch: 1, number: 10 },
    { label: 'wrong grant', grantId: id(9010), epoch: 2, number: 11 },
  ]) {
    const assignment = record(
      {
        recordId: id(stale.number),
        recordType: currentAssignment.recordType,
        payload: { ...currentAssignment.payload, grantId: stale.grantId, epoch: stale.epoch },
        actor: coordinator.actor,
        epoch: stale.epoch,
        grantId: stale.grantId,
      },
      root.envelope.recordId
    );
    const submission = record(
      {
        recordId: id(stale.number + 20),
        recordType: 'execution-result',
        payload: submissionPayload(assignment.envelope.recordId, stale.label),
        actor: worker.actor,
        epoch: stale.epoch,
        grantId: stale.grantId,
      },
      assignment.envelope.recordId
    );
    const target = { authority: active, assignment, submission };
    assert.deepEqual(evaluateAssignment(target), {
      status: 'blocked',
      diagnostic: { reason: 'authority' },
    });
    assert.throws(() => acceptSubmission(target), /work-assignment:authority/);
    assert.throws(
      () => rejectSubmission({ ...target, reason: stale.label }),
      /work-assignment:authority/
    );
  }
});

test('does not let a malformed replacement claim poison lawful disposition repair', () => {
  const current = scenario([
    'root',
    'assignment',
    'submission',
    'revocation',
    'replacementGrant',
    'malformedReplacementDisposition',
  ]);
  const target = {
    authority: current.paused,
    assignment: current.byName.get('assignment'),
    submission: current.byName.get('submission'),
  };
  const correction = acceptSubmission(target);
  assert.equal(correction.payload.decision, 'accepted');
  assert.equal(current.adopt().status, 'blocked');

  const malformed = current.byName.get('malformedReplacementDisposition');
  const corrected = record(
    {
      recordId: id(35),
      recordType: correction.recordType,
      payload: correction.payload,
      actor: replacementCoordinator.actor,
      epoch: 2,
      grantId: id(9002),
      supersedes: malformed.envelope.recordId,
    },
    malformed.envelope.recordId
  );
  const records = [...current.records, corrected];
  const restarted = resolveCoordinatorAuthority({
    issueHierarchy: [{ issue, parentIssue: null }],
    records: [...records].reverse(),
    repository,
    issue,
    coordinationProjection: {
      schema: 'aitm.coordination-projection/v1',
      grantId: id(9002),
      epoch: 2,
      adoptionState: 'required',
    },
    now: '2026-08-03T20:06:00.000Z',
  });
  assert.throws(
    () => acceptSubmission({ ...target, authority: restarted }),
    /work-assignment:authority/
  );
  assert.deepEqual(
    adoptOutstandingSubmissions({
      authority: restarted,
      snapshot: {
        repository,
        issue,
        expectedHeadRecordId: corrected.envelope.recordId,
        records,
      },
    }).acceptedSubmissionRecordIds,
    [id(20)]
  );
});
