// @story #1077
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
} from '../../../../lib/github-records/work-assignment.mjs';

const repository = 'kburson/ai-task-manager';
const parentIssue = 1067;
const issue = 1077;
const branch = 'feature/child/1077';
const parentCoordinator = { actor: 'codex/parent', platform: 'codex', session: 'parent' };
const coordinator1 = { actor: 'claude/epoch-1', platform: 'claude', session: 'epoch-1' };
const coordinator2 = { actor: 'codex/epoch-2', platform: 'codex', session: 'epoch-2' };
const coordinator3 = { actor: 'gemini/epoch-3', platform: 'gemini', session: 'epoch-3' };
const worker = { actor: 'codex/worker', platform: 'codex', session: 'worker' };

function id(number) {
  return `01J0000000000000000003${String(number).padStart(4, '0')}`;
}

function grant({
  grantId,
  epoch,
  coordinator,
  issuer,
  parentGrantId = id(7000),
  scope = { scopeRootIssue: issue, includedIssues: [], excludedIssues: [] },
  operations = ['assign-work', 'dispose-submission', 'adopt-submissions'],
  branches = [branch],
  sourceBranches = [],
  destinationBranches = [],
}) {
  return {
    schema: 'aitm.coordinator-grant/v1',
    grantId,
    scope,
    coordinator,
    parentGrantId,
    issuer,
    epoch,
    operations,
    branchBoundary: branches,
    integrationBoundary: { sourceBranches, destinationBranches },
    activatedAt: '2026-08-03T20:00:00.000Z',
    expiresAt: null,
  };
}

function record({ recordId, recordType, payload, actor, epoch, grantId }, predecessor = null) {
  return Object.freeze({
    commentNodeId: `IC_kwDOMulti${recordId.slice(-4)}`,
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
      createdAt: '2026-08-03T20:05:00.000Z',
    }),
  });
}

function resolve(records, projection) {
  return resolveCoordinatorAuthority({
    issueHierarchy: [
      { issue: parentIssue, parentIssue: null },
      { issue, parentIssue },
    ],
    records,
    repository,
    issue,
    coordinationProjection: projection,
    now: '2026-08-03T20:06:00.000Z',
  });
}

function assignmentCandidate(authority, coordinator) {
  return createWorkAssignment({
    authority,
    repository,
    coordinator,
    issue,
    branch,
    files: ['scripts/task-tracker/lib/github-records/work-assignment.mjs'],
    subsystem: 'github-records',
    dependency: { baselineSha: 'c2ae3db785468fb496f2be1f54aca144e636b172', recordIds: [] },
    verification: { contractEpoch: 1, verifierIds: ['vc-6'] },
    worker,
  });
}

function submissionPayload(assignment) {
  const payload = assignment.envelope.payload;
  return {
    schema: 'aitm.worker-submission/v1',
    status: 'submitted',
    assignmentRecordId: assignment.envelope.recordId,
    issue,
    branch,
    files: [...payload.files],
    subsystem: payload.subsystem,
    dependency: structuredClone(payload.dependency),
    verification: structuredClone(payload.verification),
    worker,
    result: { summary: 'complete' },
  };
}

function threeEpochHistory({ epoch2Outstanding }) {
  const parentGrant = grant({
    grantId: id(7000),
    epoch: 1,
    coordinator: parentCoordinator,
    issuer: null,
    parentGrantId: null,
    scope: { scopeRootIssue: parentIssue, includedIssues: [issue], excludedIssues: [] },
    operations: ['assign-work', 'dispose-submission', 'adopt-submissions', 'advance'],
    branches: [branch, 'feature/epic/1067'],
    sourceBranches: ['feature/child/1077'],
    destinationBranches: ['feature/epic/1067'],
  });
  const grant1 = grant({
    grantId: id(9001),
    epoch: 1,
    coordinator: coordinator1,
    issuer: parentCoordinator,
  });
  const parent = record({
    recordId: id(1),
    recordType: 'coordinator-grant',
    payload: parentGrant,
    actor: parentCoordinator.actor,
    epoch: 1,
    grantId: id(8000),
  });
  const child = record(
    {
      recordId: id(2),
      recordType: 'coordinator-grant',
      payload: grant1,
      actor: parentCoordinator.actor,
      epoch: 1,
      grantId: id(8000),
    },
    parent.envelope.recordId
  );
  const active1 = resolve([parent, child], {
    schema: 'aitm.coordination-projection/v1',
    grantId: grant1.grantId,
    epoch: 1,
    adoptionState: 'adopted',
  });
  const assignment1Candidate = assignmentCandidate(active1, coordinator1);
  const assignment1 = record(
    {
      recordId: id(10),
      recordType: assignment1Candidate.recordType,
      payload: assignment1Candidate.payload,
      actor: coordinator1.actor,
      epoch: 1,
      grantId: grant1.grantId,
    },
    child.envelope.recordId
  );
  const submission1 = record(
    {
      recordId: id(20),
      recordType: 'execution-result',
      payload: submissionPayload(assignment1),
      actor: worker.actor,
      epoch: 1,
      grantId: grant1.grantId,
    },
    assignment1.envelope.recordId
  );
  const disposition1Candidate = acceptSubmission({
    authority: active1,
    assignment: assignment1,
    submission: submission1,
  });
  const disposition1 = record(
    {
      recordId: id(30),
      recordType: disposition1Candidate.recordType,
      payload: disposition1Candidate.payload,
      actor: coordinator1.actor,
      epoch: 1,
      grantId: grant1.grantId,
    },
    submission1.envelope.recordId
  );
  const grant2 = grant({
    grantId: id(9002),
    epoch: 2,
    coordinator: coordinator2,
    issuer: coordinator1,
  });
  const replacement1 = replaceCoordinator({
    authority: active1,
    expectedGrantId: grant1.grantId,
    expectedEpoch: 1,
    replacementGrant: grant2,
  });
  const revocation1 = record(
    {
      recordId: id(40),
      recordType: 'coordinator-revocation',
      payload: replacement1.revocation,
      actor: coordinator1.actor,
      epoch: 1,
      grantId: id(8000),
    },
    disposition1.envelope.recordId
  );
  const grant2Record = record(
    {
      recordId: id(41),
      recordType: 'coordinator-grant',
      payload: grant2,
      actor: coordinator1.actor,
      epoch: 1,
      grantId: id(8000),
    },
    revocation1.envelope.recordId
  );
  const firstRecords = [
    parent,
    child,
    assignment1,
    submission1,
    disposition1,
    revocation1,
    grant2Record,
  ];
  const active2 = resolve(firstRecords, {
    ...replacement1.coordinationProjection,
    adoptionState: 'adopted',
  });
  let assignment2 = null;
  let submission2 = null;
  const workRecords = [];
  if (epoch2Outstanding) {
    const assignment2Candidate = assignmentCandidate(active2, coordinator2);
    assignment2 = record(
      {
        recordId: id(42),
        recordType: assignment2Candidate.recordType,
        payload: assignment2Candidate.payload,
        actor: coordinator2.actor,
        epoch: 2,
        grantId: grant2.grantId,
      },
      grant2Record.envelope.recordId
    );
    submission2 = record(
      {
        recordId: id(43),
        recordType: 'execution-result',
        payload: submissionPayload(assignment2),
        actor: worker.actor,
        epoch: 2,
        grantId: grant2.grantId,
      },
      assignment2.envelope.recordId
    );
    workRecords.push(assignment2, submission2);
  }
  const grant3 = grant({
    grantId: id(9003),
    epoch: 3,
    coordinator: coordinator3,
    issuer: coordinator2,
  });
  const replacement2 = replaceCoordinator({
    authority: active2,
    expectedGrantId: grant2.grantId,
    expectedEpoch: 2,
    replacementGrant: grant3,
  });
  const predecessor = workRecords.at(-1) ?? grant2Record;
  const revocation2 = record(
    {
      recordId: id(50),
      recordType: 'coordinator-revocation',
      payload: replacement2.revocation,
      actor: coordinator2.actor,
      epoch: 2,
      grantId: id(8000),
    },
    predecessor.envelope.recordId
  );
  const grant3Record = record(
    {
      recordId: id(51),
      recordType: 'coordinator-grant',
      payload: grant3,
      actor: coordinator2.actor,
      epoch: 2,
      grantId: id(8000),
    },
    revocation2.envelope.recordId
  );
  return {
    assignment2,
    grant3,
    grant3Record,
    records: [...firstRecords, ...workRecords, revocation2, grant3Record],
    replacement2,
    submission2,
  };
}

test('older completed generations do not poison zero-outstanding epoch-3 adoption', () => {
  for (const reverse of [false, true]) {
    const current = threeEpochHistory({ epoch2Outstanding: false });
    const records = reverse ? [...current.records].reverse() : current.records;
    const adopted = resolve(records, {
      ...current.replacement2.coordinationProjection,
      adoptionState: 'adopted',
    });
    assert.equal(adopted.status, 'active');
    const paused = resolve(records, current.replacement2.coordinationProjection);
    assert.deepEqual(
      adoptOutstandingSubmissions({
        authority: paused,
        snapshot: {
          repository,
          issue,
          expectedHeadRecordId: current.grant3Record.envelope.recordId,
          records,
        },
      }).acceptedSubmissionRecordIds,
      []
    );
  }
});

test('epoch-3 adoption requires only immediate epoch-2 outstanding work', () => {
  for (const reverse of [false, true]) {
    const current = threeEpochHistory({ epoch2Outstanding: true });
    const records = reverse ? [...current.records].reverse() : current.records;
    assert.deepEqual(
      resolve(records, {
        ...current.replacement2.coordinationProjection,
        adoptionState: 'adopted',
      }),
      { status: 'paused', diagnostic: { reason: 'adoption-required' } }
    );
    const paused = resolve(records, current.replacement2.coordinationProjection);
    const candidate = acceptSubmission({
      authority: paused,
      assignment: current.assignment2,
      submission: current.submission2,
    });
    const disposition = record(
      {
        recordId: id(52),
        recordType: candidate.recordType,
        payload: candidate.payload,
        actor: coordinator3.actor,
        epoch: 3,
        grantId: current.grant3.grantId,
      },
      current.grant3Record.envelope.recordId
    );
    const completedRecords = [...current.records, disposition];
    assert.deepEqual(
      adoptOutstandingSubmissions({
        authority: paused,
        snapshot: {
          repository,
          issue,
          expectedHeadRecordId: disposition.envelope.recordId,
          records: reverse ? [...completedRecords].reverse() : completedRecords,
        },
      }).acceptedSubmissionRecordIds,
      [current.submission2.envelope.recordId]
    );
    assert.equal(
      resolve(completedRecords, {
        ...current.replacement2.coordinationProjection,
        adoptionState: 'adopted',
      }).status,
      'active'
    );
  }
});
