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
  evaluateAssignment,
} from '../../../../lib/github-records/work-assignment.mjs';

const repository = 'kburson/ai-task-manager';
const parentIssue = 1067;
const issue = 1077;
const siblingIssue = 1078;
const parentBranch = 'feature/epic/1067';
const branch = 'feature/child/1077';
const siblingBranch = 'feature/child/1078';
const parentCoordinator = { actor: 'codex/parent', platform: 'codex', session: 'nested' };
const childCoordinator = { actor: 'claude/child', platform: 'claude', session: 'nested' };
const replacementCoordinator = {
  actor: 'codex/replacement',
  platform: 'codex',
  session: 'nested',
};
const worker = { actor: 'codex/worker', platform: 'codex', session: 'nested' };

function id(number) {
  return `01J0000000000000000008${String(number).padStart(4, '0')}`;
}

function grant({
  grantId,
  coordinator,
  epoch = 1,
  issuer = null,
  parentGrantId = null,
  scopeRootIssue = parentIssue,
  includedIssues = [issue, siblingIssue],
  operations = ['assign-work', 'dispose-submission', 'adopt-submissions', 'advance'],
  branches = [parentBranch, branch, siblingBranch],
} = {}) {
  return {
    schema: 'aitm.coordinator-grant/v1',
    grantId,
    scope: { scopeRootIssue, includedIssues, excludedIssues: [] },
    coordinator,
    parentGrantId,
    issuer,
    epoch,
    operations,
    branchBoundary: branches,
    integrationBoundary: {
      sourceBranches: [branch, siblingBranch].filter((candidate) => branches.includes(candidate)),
      destinationBranches: branches.includes(parentBranch) ? [parentBranch] : [],
    },
    activatedAt: '2026-08-03T20:00:00.000Z',
    expiresAt: null,
  };
}

function record({ recordId, recordType, payload, actor, epoch, grantId }, predecessor = null) {
  return Object.freeze({
    commentNodeId: `IC_kwDONested${recordId.slice(-4)}`,
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
      { issue: siblingIssue, parentIssue },
    ],
    records,
    repository,
    issue,
    coordinationProjection: projection,
    now: '2026-08-03T20:06:00.000Z',
  });
}

function dispositionRecord({
  assignment,
  submission,
  authorGrant,
  coordinator,
  number,
  predecessor,
}) {
  return record(
    {
      recordId: id(number),
      recordType: 'record-disposition',
      payload: {
        schema: 'aitm.record-disposition/v1',
        decision: 'accepted',
        issue,
        assignmentRecordId: assignment.envelope.recordId,
        assignmentCommentNodeId: assignment.commentNodeId,
        submissionRecordId: submission.envelope.recordId,
        submissionCommentNodeId: submission.commentNodeId,
        grantId: authorGrant.grantId,
        epoch: authorGrant.epoch,
        decidedBy: coordinator,
        reason: null,
      },
      actor: coordinator.actor,
      epoch: authorGrant.epoch,
      grantId: authorGrant.grantId,
    },
    predecessor
  );
}

function nestedHistory({ timing, delegatedIssue = issue }) {
  const parentGrant = grant({ grantId: id(9001), coordinator: parentCoordinator });
  const root = record({
    recordId: id(1),
    recordType: 'coordinator-grant',
    payload: parentGrant,
    actor: parentCoordinator.actor,
    epoch: 1,
    grantId: id(8000),
  });
  const parentAuthority = resolve([root], {
    schema: 'aitm.coordination-projection/v1',
    grantId: parentGrant.grantId,
    epoch: 1,
    adoptionState: 'adopted',
  });
  const assignmentCandidate = createWorkAssignment({
    authority: parentAuthority,
    coordinator: parentCoordinator,
    issue,
    branch,
    files: ['scripts/task-tracker/lib/github-records/work-assignment.mjs'],
    subsystem: 'github-records',
    dependency: { baselineSha: 'c2ae3db785468fb496f2be1f54aca144e636b172', recordIds: [] },
    verification: { contractEpoch: 1, verifierIds: ['vc-6'] },
    worker,
  });
  const assignment = record(
    {
      recordId: id(10),
      recordType: assignmentCandidate.recordType,
      payload: assignmentCandidate.payload,
      actor: parentCoordinator.actor,
      epoch: 1,
      grantId: parentGrant.grantId,
    },
    root.envelope.recordId
  );
  const submission = record(
    {
      recordId: id(20),
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
        worker,
        result: { summary: 'nested delegation work' },
      },
      actor: worker.actor,
      epoch: 1,
      grantId: parentGrant.grantId,
    },
    assignment.envelope.recordId
  );
  const childBranch = delegatedIssue === issue ? branch : siblingBranch;
  const childGrant = grant({
    grantId: id(9101),
    coordinator: childCoordinator,
    issuer: parentCoordinator,
    parentGrantId: parentGrant.grantId,
    scopeRootIssue: delegatedIssue,
    includedIssues: [],
    operations: ['dispose-submission'],
    branches: [childBranch],
  });
  const beforeDelegationDisposition =
    timing === 'before'
      ? dispositionRecord({
          assignment,
          submission,
          authorGrant: parentGrant,
          coordinator: parentCoordinator,
          number: 25,
          predecessor: submission.envelope.recordId,
        })
      : null;
  const childGrantRecord = record(
    {
      recordId: id(30),
      recordType: 'coordinator-grant',
      payload: childGrant,
      actor: parentCoordinator.actor,
      epoch: 1,
      grantId: id(8000),
    },
    (beforeDelegationDisposition ?? submission).envelope.recordId
  );
  const delegationPrefix = [
    root,
    assignment,
    submission,
    ...(beforeDelegationDisposition === null ? [] : [beforeDelegationDisposition]),
    childGrantRecord,
  ];
  let directDisposition = null;
  let directError = null;
  if (['parent-during', 'sibling'].includes(timing)) {
    const delegatedParent = resolve(delegationPrefix, {
      schema: 'aitm.coordination-projection/v1',
      grantId: parentGrant.grantId,
      epoch: 1,
      adoptionState: 'adopted',
    });
    try {
      directDisposition = acceptSubmission({
        authority: delegatedParent,
        assignment,
        submission,
      });
    } catch (error) {
      directError = error;
    }
  }
  const duringDisposition = ['parent-during', 'child-during', 'sibling'].includes(timing)
    ? dispositionRecord({
        assignment,
        submission,
        authorGrant: timing === 'child-during' ? childGrant : parentGrant,
        coordinator: timing === 'child-during' ? childCoordinator : parentCoordinator,
        number: 35,
        predecessor: childGrantRecord.envelope.recordId,
      })
    : null;
  const activeDelegationRecords = [
    ...delegationPrefix,
    ...(duringDisposition === null ? [] : [duringDisposition]),
  ];
  const childRevocation = record(
    {
      recordId: id(40),
      recordType: 'coordinator-revocation',
      payload: {
        schema: 'aitm.coordinator-revocation/v1',
        grantId: childGrant.grantId,
        epoch: 1,
        state: 'revoked',
      },
      actor: childCoordinator.actor,
      epoch: 1,
      grantId: id(8000),
    },
    (duringDisposition ?? childGrantRecord).envelope.recordId
  );
  const afterDisposition =
    timing === 'after'
      ? dispositionRecord({
          assignment,
          submission,
          authorGrant: parentGrant,
          coordinator: parentCoordinator,
          number: 45,
          predecessor: childRevocation.envelope.recordId,
        })
      : null;
  const beforeReplacement = [
    ...activeDelegationRecords,
    childRevocation,
    ...(afterDisposition === null ? [] : [afterDisposition]),
  ];
  const restoredParent = resolve(beforeReplacement, {
    schema: 'aitm.coordination-projection/v1',
    grantId: parentGrant.grantId,
    epoch: 1,
    adoptionState: 'adopted',
  });
  const replacementGrant = grant({
    grantId: id(9002),
    coordinator: replacementCoordinator,
    epoch: 2,
    issuer: parentCoordinator,
  });
  const replacement = replaceCoordinator({
    authority: restoredParent,
    expectedGrantId: parentGrant.grantId,
    expectedEpoch: 1,
    replacementGrant,
  });
  const parentRevocation = record(
    {
      recordId: id(50),
      recordType: 'coordinator-revocation',
      payload: replacement.revocation,
      actor: parentCoordinator.actor,
      epoch: 1,
      grantId: id(8000),
    },
    beforeReplacement.at(-1).envelope.recordId
  );
  const replacementRecord = record(
    {
      recordId: id(51),
      recordType: 'coordinator-grant',
      payload: replacementGrant,
      actor: parentCoordinator.actor,
      epoch: 1,
      grantId: id(8000),
    },
    parentRevocation.envelope.recordId
  );
  const records = [...beforeReplacement, parentRevocation, replacementRecord];
  return {
    assignment,
    directDisposition,
    directError,
    projection: replacement.coordinationProjection,
    records,
    replacementRecord,
    submission,
  };
}

function childIssuedHistory() {
  const parentGrant = grant({ grantId: id(9201), coordinator: parentCoordinator });
  const root = record({
    recordId: id(101),
    recordType: 'coordinator-grant',
    payload: parentGrant,
    actor: parentCoordinator.actor,
    epoch: 1,
    grantId: id(8000),
  });
  const childGrant = grant({
    grantId: id(9202),
    coordinator: childCoordinator,
    issuer: parentCoordinator,
    parentGrantId: parentGrant.grantId,
    scopeRootIssue: issue,
    includedIssues: [],
    operations: ['assign-work', 'dispose-submission'],
    branches: [branch],
  });
  const childGrantRecord = record(
    {
      recordId: id(102),
      recordType: 'coordinator-grant',
      payload: childGrant,
      actor: parentCoordinator.actor,
      epoch: 1,
      grantId: id(8000),
    },
    root.envelope.recordId
  );
  const childAuthority = resolve([root, childGrantRecord], {
    schema: 'aitm.coordination-projection/v1',
    grantId: childGrant.grantId,
    epoch: 1,
    adoptionState: 'adopted',
  });
  assert.equal(childAuthority.status, 'active', JSON.stringify(childAuthority));
  const assignmentCandidate = createWorkAssignment({
    authority: childAuthority,
    coordinator: childCoordinator,
    issue,
    branch,
    files: ['scripts/task-tracker/lib/github-records/work-assignment.mjs'],
    subsystem: 'github-records',
    dependency: { baselineSha: 'c2ae3db785468fb496f2be1f54aca144e636b172', recordIds: [] },
    verification: { contractEpoch: 1, verifierIds: ['vc-6'] },
    worker,
  });
  const assignment = record(
    {
      recordId: id(110),
      recordType: assignmentCandidate.recordType,
      payload: assignmentCandidate.payload,
      actor: childCoordinator.actor,
      epoch: 1,
      grantId: childGrant.grantId,
    },
    childGrantRecord.envelope.recordId
  );
  const submission = record(
    {
      recordId: id(120),
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
        worker,
        result: { summary: 'child-issued work' },
      },
      actor: worker.actor,
      epoch: 1,
      grantId: childGrant.grantId,
    },
    assignment.envelope.recordId
  );
  const childRevocation = record(
    {
      recordId: id(130),
      recordType: 'coordinator-revocation',
      payload: {
        schema: 'aitm.coordinator-revocation/v1',
        grantId: childGrant.grantId,
        epoch: 1,
        state: 'revoked',
      },
      actor: childCoordinator.actor,
      epoch: 1,
      grantId: id(8000),
    },
    submission.envelope.recordId
  );
  const records = [root, childGrantRecord, assignment, submission, childRevocation];
  const parentAuthority = resolve(records, {
    schema: 'aitm.coordination-projection/v1',
    grantId: parentGrant.grantId,
    epoch: 1,
    adoptionState: 'adopted',
  });
  return {
    assignment,
    childGrant,
    parentAuthority,
    parentGrant,
    records,
    root,
    submission,
  };
}

for (const scenario of [
  { timing: 'before', ready: true },
  { timing: 'parent-during', ready: false },
  { timing: 'child-during', ready: true },
  { timing: 'after', ready: true },
  { timing: 'sibling', delegatedIssue: siblingIssue, ready: true },
]) {
  test(`${scenario.timing} nested disposition uses position-specific effective authority`, () => {
    for (const reverse of [false, true]) {
      const current = nestedHistory(scenario);
      if (scenario.timing === 'parent-during') {
        assert.match(current.directError?.message ?? '', /work-assignment:authority/);
      }
      if (scenario.timing === 'sibling') {
        assert.equal(current.directError, null);
        assert.equal(current.directDisposition.payload.decision, 'accepted');
      }
      if (scenario.timing === 'child-during') {
        const activeRecords = current.records.slice(0, 4);
        const childAuthority = resolve(activeRecords, {
          schema: 'aitm.coordination-projection/v1',
          grantId: id(9101),
          epoch: 1,
          adoptionState: 'adopted',
        });
        assert.equal(
          acceptSubmission({
            authority: childAuthority,
            assignment: current.assignment,
            submission: current.submission,
          }).payload.decision,
          'accepted'
        );
      }
      const records = reverse ? [...current.records].reverse() : current.records;
      const fresh = resolve(records, current.projection);
      const adopted = adoptOutstandingSubmissions({
        authority: fresh,
        snapshot: {
          repository,
          issue,
          expectedHeadRecordId: current.replacementRecord.envelope.recordId,
          records,
        },
      });
      if (scenario.ready) assert.equal(adopted.status, 'ready-to-adopt');
      else assert.equal(adopted.status, 'blocked');
    }
  });
}

test('restored parent directly disposes child-issued work and replay is terminal', () => {
  for (const reverse of [false, true]) {
    const current = childIssuedHistory();
    const records = reverse ? [...current.records].reverse() : current.records;
    const parentAuthority = resolve(records, {
      schema: 'aitm.coordination-projection/v1',
      grantId: current.parentGrant.grantId,
      epoch: 1,
      adoptionState: 'adopted',
    });
    const candidate = acceptSubmission({
      authority: parentAuthority,
      assignment: current.assignment,
      submission: current.submission,
    });
    const disposition = record(
      {
        recordId: id(140),
        recordType: candidate.recordType,
        payload: candidate.payload,
        actor: parentCoordinator.actor,
        epoch: 1,
        grantId: current.parentGrant.grantId,
      },
      current.records.at(-1).envelope.recordId
    );
    const complete = [...current.records, disposition];
    const replayed = resolve(reverse ? [...complete].reverse() : complete, {
      schema: 'aitm.coordination-projection/v1',
      grantId: current.parentGrant.grantId,
      epoch: 1,
      adoptionState: 'adopted',
    });
    assert.deepEqual(
      evaluateAssignment({
        authority: replayed,
        assignment: current.assignment,
        submission: current.submission,
      }),
      { status: 'blocked', diagnostic: { reason: 'authority' } }
    );
  }
});

test('replacement adoption carries undisposed child-issued work', () => {
  for (const reverse of [false, true]) {
    const current = childIssuedHistory();
    const replacementGrant = grant({
      grantId: id(9203),
      coordinator: replacementCoordinator,
      epoch: 2,
      issuer: parentCoordinator,
    });
    const replacement = replaceCoordinator({
      authority: current.parentAuthority,
      expectedGrantId: current.parentGrant.grantId,
      expectedEpoch: 1,
      replacementGrant,
    });
    const parentRevocation = record(
      {
        recordId: id(150),
        recordType: 'coordinator-revocation',
        payload: replacement.revocation,
        actor: parentCoordinator.actor,
        epoch: 1,
        grantId: id(8000),
      },
      current.records.at(-1).envelope.recordId
    );
    const replacementRecord = record(
      {
        recordId: id(151),
        recordType: 'coordinator-grant',
        payload: replacementGrant,
        actor: parentCoordinator.actor,
        epoch: 1,
        grantId: id(8000),
      },
      parentRevocation.envelope.recordId
    );
    const pausedRecords = [...current.records, parentRevocation, replacementRecord];
    let paused = resolve(
      reverse ? [...pausedRecords].reverse() : pausedRecords,
      replacement.coordinationProjection
    );
    assert.deepEqual(
      adoptOutstandingSubmissions({
        authority: paused,
        snapshot: {
          repository,
          issue,
          expectedHeadRecordId: replacementRecord.envelope.recordId,
          records: reverse ? [...pausedRecords].reverse() : pausedRecords,
        },
      }),
      { status: 'blocked', diagnostic: { reason: 'missing-disposition' } }
    );
    paused = resolve(
      reverse ? [...pausedRecords].reverse() : pausedRecords,
      replacement.coordinationProjection
    );
    const candidate = acceptSubmission({
      authority: paused,
      assignment: current.assignment,
      submission: current.submission,
    });
    const disposition = record(
      {
        recordId: id(160),
        recordType: candidate.recordType,
        payload: candidate.payload,
        actor: replacementCoordinator.actor,
        epoch: 2,
        grantId: replacementGrant.grantId,
      },
      replacementRecord.envelope.recordId
    );
    const complete = [...pausedRecords, disposition];
    paused = resolve(
      reverse ? [...complete].reverse() : complete,
      replacement.coordinationProjection
    );
    assert.deepEqual(
      adoptOutstandingSubmissions({
        authority: paused,
        snapshot: {
          repository,
          issue,
          expectedHeadRecordId: disposition.envelope.recordId,
          records: reverse ? [...complete].reverse() : complete,
        },
      }).acceptedSubmissionRecordIds,
      [current.submission.envelope.recordId]
    );
  }
});
