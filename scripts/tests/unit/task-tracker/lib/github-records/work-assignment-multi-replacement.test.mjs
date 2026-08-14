// @story #1077
import { strict as assert } from 'node:assert';
import test from 'node:test';

import {
  authorizeCoordinatorAdoption,
  replaceCoordinator,
  resolveCoordinatorAuthority,
} from '../../../../../task-tracker/lib/github-records/coordination-authority.mjs';
import { createAitmRecordEnvelope } from '../../../../../task-tracker/lib/github-records/record-envelope.mjs';
import {
  acceptSubmission,
  adoptOutstandingSubmissions,
  createWorkAssignment,
  evaluateAssignment,
  rejectSubmission,
} from '../../../../../task-tracker/lib/github-records/work-assignment.mjs';

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

function record(
  { recordId, recordType, payload, actor, epoch, grantId, supersedes = null },
  predecessor = null
) {
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
      supersedes,
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

function threeEpochHistory({
  epoch2Outstanding,
  epoch1Completed = true,
  lateEpoch1Submission = false,
  epoch1SupersessionDecision = null,
}) {
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
  let epoch1Records = [parent, child, assignment1];
  if (epoch1Completed) epoch1Records.push(submission1);
  let epoch1Authority = resolve(epoch1Records, {
    schema: 'aitm.coordination-projection/v1',
    grantId: grant1.grantId,
    epoch: 1,
    adoptionState: 'adopted',
  });
  let disposition1 = null;
  if (epoch1Completed) {
    const disposition1Candidate = acceptSubmission({
      authority: epoch1Authority,
      assignment: assignment1,
      submission: submission1,
    });
    disposition1 = record(
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
    epoch1Records.push(disposition1);
    if (epoch1SupersessionDecision !== null) {
      const supersedingDisposition = record(
        {
          recordId: id(31),
          recordType: disposition1.envelope.recordType,
          payload: {
            ...disposition1.envelope.payload,
            ...(epoch1SupersessionDecision === 'malformed'
              ? { assignmentCommentNodeId: 'IC_kwDOMalformedAssignment' }
              : {
                  decision: epoch1SupersessionDecision,
                  reason: epoch1SupersessionDecision === 'accepted' ? null : 'conflicting decision',
                }),
          },
          actor: coordinator1.actor,
          epoch: 1,
          grantId: grant1.grantId,
          supersedes: disposition1.envelope.recordId,
        },
        disposition1.envelope.recordId
      );
      epoch1Records.push(supersedingDisposition);
    }
    epoch1Authority = resolve(epoch1Records, {
      schema: 'aitm.coordination-projection/v1',
      grantId: grant1.grantId,
      epoch: 1,
      adoptionState: 'adopted',
    });
  }
  const grant2 = grant({
    grantId: id(9002),
    epoch: 2,
    coordinator: coordinator2,
    issuer: coordinator1,
  });
  const replacement1 = replaceCoordinator({
    authority: epoch1Authority,
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
    epoch1Records.at(-1).envelope.recordId
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
  const firstRecords = [...epoch1Records, revocation1, grant2Record];
  const active2 = resolve(firstRecords, {
    ...replacement1.coordinationProjection,
    adoptionState: 'adopted',
  });
  let assignment2 = null;
  let submission2 = null;
  const workRecords = [];
  let lateSubmission1 = null;
  if (lateEpoch1Submission) {
    lateSubmission1 = record(
      {
        recordId: submission1.envelope.recordId,
        recordType: submission1.envelope.recordType,
        payload: submission1.envelope.payload,
        actor: worker.actor,
        epoch: 1,
        grantId: grant1.grantId,
      },
      grant2Record.envelope.recordId
    );
    workRecords.push(lateSubmission1);
  }
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
      (workRecords.at(-1) ?? grant2Record).envelope.recordId
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
    assignment1,
    assignment2,
    child,
    grant3,
    grant3Record,
    parent,
    records: [...firstRecords, ...workRecords, revocation2, grant3Record],
    replacement2,
    submission1: lateSubmission1 ?? submission1,
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
    let paused = resolve(records, current.replacement2.coordinationProjection);
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

test('epoch-3 adoption requires only immediate epoch-2 outstanding work before publication', () => {
  for (const reverse of [false, true]) {
    const current = threeEpochHistory({ epoch2Outstanding: true });
    const records = reverse ? [...current.records].reverse() : current.records;
    assert.equal(
      resolve(records, {
        ...current.replacement2.coordinationProjection,
        adoptionState: 'adopted',
      }).status,
      'active'
    );
    let paused = resolve(records, current.replacement2.coordinationProjection);
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
    const freshPaused = resolve(
      reverse ? [...completedRecords].reverse() : completedRecords,
      current.replacement2.coordinationProjection
    );
    assert.deepEqual(
      adoptOutstandingSubmissions({
        authority: freshPaused,
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

function adoptEpoch3(current, _paused, records = current.records) {
  const predecessorIds = new Set(
    records.map(({ envelope }) => envelope.predecessor).filter((recordId) => recordId !== null)
  );
  const head = records.find(({ envelope }) => !predecessorIds.has(envelope.recordId));
  const authority = resolve(records, current.replacement2.coordinationProjection);
  return adoptOutstandingSubmissions({
    authority,
    snapshot: {
      repository,
      issue,
      expectedHeadRecordId: head.envelope.recordId,
      records,
    },
  });
}

test('active Task 8 rejects assignments authored before their exact grant record', () => {
  const current = threeEpochHistory({ epoch2Outstanding: false });
  const grant1 = current.child.envelope.payload;
  for (const reverse of [false, true]) {
    for (const futureGrant of [false, true]) {
      const assignment = record(
        {
          recordId: current.assignment1.envelope.recordId,
          recordType: current.assignment1.envelope.recordType,
          payload: current.assignment1.envelope.payload,
          actor: coordinator1.actor,
          epoch: 1,
          grantId: grant1.grantId,
        },
        (futureGrant ? current.parent : current.child).envelope.recordId
      );
      const submission = record(
        {
          recordId: current.submission1.envelope.recordId,
          recordType: current.submission1.envelope.recordType,
          payload: current.submission1.envelope.payload,
          actor: worker.actor,
          epoch: 1,
          grantId: grant1.grantId,
        },
        assignment.envelope.recordId
      );
      const child = futureGrant
        ? record(
            {
              recordId: current.child.envelope.recordId,
              recordType: current.child.envelope.recordType,
              payload: grant1,
              actor: parentCoordinator.actor,
              epoch: 1,
              grantId: id(8000),
            },
            submission.envelope.recordId
          )
        : current.child;
      const records = futureGrant
        ? [current.parent, assignment, submission, child]
        : [current.parent, child, assignment, submission];
      const authority = resolve(reverse ? [...records].reverse() : records, {
        schema: 'aitm.coordination-projection/v1',
        grantId: grant1.grantId,
        epoch: 1,
        adoptionState: 'adopted',
      });
      const target = { authority, assignment, submission };
      assert.equal(evaluateAssignment(target).status, futureGrant ? 'blocked' : 'matched');
      if (futureGrant) assert.throws(() => acceptSubmission(target), /work-assignment:authority/);
      else assert.equal(acceptSubmission(target).payload.decision, 'accepted');
    }
  }
});

test('epoch-3 adoption carries a late epoch-1 submission until disposition', () => {
  for (const reverse of [false, true]) {
    const current = threeEpochHistory({
      epoch2Outstanding: false,
      epoch1Completed: false,
      lateEpoch1Submission: true,
    });
    const records = reverse ? [...current.records].reverse() : current.records;
    let paused = resolve(records, current.replacement2.coordinationProjection);
    assert.deepEqual(adoptEpoch3(current, paused, records), {
      status: 'blocked',
      diagnostic: { reason: 'missing-disposition' },
    });
    paused = resolve(records, current.replacement2.coordinationProjection);
    const candidate = acceptSubmission({
      authority: paused,
      assignment: current.assignment1,
      submission: current.submission1,
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
    const completed = [...current.records, disposition];
    assert.deepEqual(
      adoptEpoch3(current, paused, reverse ? [...completed].reverse() : completed)
        .acceptedSubmissionRecordIds,
      [current.submission1.envelope.recordId]
    );
  }
});

test('an older assignment without a submission creates no later obligation', () => {
  const current = threeEpochHistory({ epoch2Outstanding: false, epoch1Completed: false });
  for (const records of [current.records, [...current.records].reverse()]) {
    const paused = resolve(records, current.replacement2.coordinationProjection);
    assert.deepEqual(adoptEpoch3(current, paused, records).acceptedSubmissionRecordIds, []);
  }
});

test('epoch-3 adoption exhaustively disposes mixed ancestor and immediate work', () => {
  for (const reverse of [false, true]) {
    const current = threeEpochHistory({
      epoch2Outstanding: true,
      epoch1Completed: false,
      lateEpoch1Submission: true,
    });
    const records = reverse ? [...current.records].reverse() : current.records;
    const paused = resolve(records, current.replacement2.coordinationProjection);
    assert.deepEqual(paused, { status: 'paused', diagnostic: { reason: 'adoption-required' } });
    const ancestorAuthorization = authorizeCoordinatorAdoption({
      authority: paused,
      issue,
      operation: 'dispose-submission',
      branch,
      repository,
      grantId: id(9001),
      epoch: 1,
      coordinator: coordinator1,
      assignment: current.assignment1,
      submission: current.submission1,
    });
    assert.equal(ancestorAuthorization.authorized, true, ancestorAuthorization.reason);
    const ancestorCandidate = acceptSubmission({
      authority: paused,
      assignment: current.assignment1,
      submission: current.submission1,
    });
    const immediateCandidate = acceptSubmission({
      authority: paused,
      assignment: current.assignment2,
      submission: current.submission2,
    });
    const ancestorDisposition = record(
      {
        recordId: id(52),
        recordType: ancestorCandidate.recordType,
        payload: ancestorCandidate.payload,
        actor: coordinator3.actor,
        epoch: 3,
        grantId: current.grant3.grantId,
      },
      current.grant3Record.envelope.recordId
    );
    const immediateDisposition = record(
      {
        recordId: id(53),
        recordType: immediateCandidate.recordType,
        payload: immediateCandidate.payload,
        actor: coordinator3.actor,
        epoch: 3,
        grantId: current.grant3.grantId,
      },
      ancestorDisposition.envelope.recordId
    );
    const completed = [...current.records, ancestorDisposition, immediateDisposition];
    assert.deepEqual(
      adoptEpoch3(current, paused, reverse ? [...completed].reverse() : completed)
        .acceptedSubmissionRecordIds,
      [current.submission1.envelope.recordId, current.submission2.envelope.recordId].sort()
    );
    const freshPaused = resolve(
      reverse ? [...completed].reverse() : completed,
      current.replacement2.coordinationProjection
    );
    assert.deepEqual(
      adoptOutstandingSubmissions({
        authority: freshPaused,
        assignments: [current.assignment2, current.assignment1],
        submissions: [current.submission2, current.submission1],
        dispositions: [immediateDisposition, ancestorDisposition],
      }).acceptedSubmissionRecordIds,
      [current.submission1.envelope.recordId, current.submission2.envelope.recordId].sort()
    );
  }
});

for (const decision of ['accepted', 'rejected', 'malformed']) {
  test(`a valid historical disposition is terminal against ${decision} supersession`, () => {
    for (const reverse of [false, true]) {
      const current = threeEpochHistory({
        epoch2Outstanding: false,
        epoch1SupersessionDecision: decision,
      });
      const records = reverse ? [...current.records].reverse() : current.records;
      const paused = resolve(records, current.replacement2.coordinationProjection);
      assert.equal(adoptEpoch3(current, paused, records).status, 'blocked');
    }
  });
}

function supersededReplacementHistory(kind) {
  const current = threeEpochHistory({
    epoch2Outstanding: false,
    epoch1Completed: false,
    lateEpoch1Submission: true,
  });
  const paused = resolve(current.records, current.replacement2.coordinationProjection);
  const target = {
    authority: paused,
    assignment: current.assignment1,
    submission: current.submission1,
  };
  const accepted = acceptSubmission(target);
  const second =
    kind === 'rejected'
      ? rejectSubmission({ ...target, reason: 'conflicting decision' })
      : {
          ...accepted,
          payload:
            kind === 'malformed'
              ? { ...accepted.payload, assignmentCommentNodeId: 'IC_kwDOMalformedAssignment' }
              : accepted.payload,
        };
  const firstRecord = record(
    {
      recordId: id(52),
      recordType: accepted.recordType,
      payload: accepted.payload,
      actor: coordinator3.actor,
      epoch: 3,
      grantId: current.grant3.grantId,
    },
    current.grant3Record.envelope.recordId
  );
  const secondRecord = record(
    {
      recordId: id(53),
      recordType: second.recordType,
      payload: second.payload,
      actor: coordinator3.actor,
      epoch: 3,
      grantId: current.grant3.grantId,
      supersedes: firstRecord.envelope.recordId,
    },
    firstRecord.envelope.recordId
  );
  return { current, paused, records: [...current.records, firstRecord, secondRecord] };
}

for (const kind of ['accepted', 'rejected', 'malformed']) {
  test(`a valid replacement disposition is terminal against ${kind} supersession`, () => {
    for (const reverse of [false, true]) {
      const { current, paused, records } = supersededReplacementHistory(kind);
      const supplied = reverse ? [...records].reverse() : records;
      assert.equal(adoptEpoch3(current, paused, supplied).status, 'blocked');
      const restarted = resolve(supplied, current.replacement2.coordinationProjection);
      assert.throws(
        () =>
          acceptSubmission({
            authority: restarted,
            assignment: current.assignment1,
            submission: current.submission1,
          }),
        /work-assignment:authority/
      );
    }
  });
}

test('the active restart fence retains a superseded valid disposition', () => {
  for (const reverse of [false, true]) {
    const current = threeEpochHistory({ epoch2Outstanding: false, epoch1Completed: false });
    const projection = {
      schema: 'aitm.coordination-projection/v1',
      grantId: current.child.envelope.payload.grantId,
      epoch: 1,
      adoptionState: 'adopted',
    };
    const initialRecords = [
      current.parent,
      current.child,
      current.assignment1,
      current.submission1,
    ];
    const active = resolve(initialRecords, projection);
    const candidate = acceptSubmission({
      authority: active,
      assignment: current.assignment1,
      submission: current.submission1,
    });
    const valid = record(
      {
        recordId: id(60),
        recordType: candidate.recordType,
        payload: candidate.payload,
        actor: coordinator1.actor,
        epoch: 1,
        grantId: current.child.envelope.payload.grantId,
      },
      current.submission1.envelope.recordId
    );
    const malformed = record(
      {
        recordId: id(61),
        recordType: candidate.recordType,
        payload: { ...candidate.payload, assignmentCommentNodeId: 'IC_kwDOMalformedAssignment' },
        actor: coordinator1.actor,
        epoch: 1,
        grantId: current.child.envelope.payload.grantId,
        supersedes: valid.envelope.recordId,
      },
      valid.envelope.recordId
    );
    const records = [...initialRecords, valid, malformed];
    const restarted = resolve(reverse ? [...records].reverse() : records, projection);
    assert.equal(
      evaluateAssignment({
        authority: restarted,
        assignment: current.assignment1,
        submission: current.submission1,
      }).status,
      'blocked'
    );
  }
});
