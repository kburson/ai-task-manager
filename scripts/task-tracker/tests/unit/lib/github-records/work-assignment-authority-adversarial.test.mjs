// @story #1077
import { strict as assert } from 'node:assert';
import test from 'node:test';

import {
  authorizeCoordinatorOperation,
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
const otherIssue = 1078;
const branch = 'feature/child/1077';
const coordinator = {
  actor: 'claude/adversarial-coordinator',
  platform: 'claude',
  session: 'adversarial-coordinator',
};
const replacementCoordinator = {
  actor: 'codex/adversarial-replacement',
  platform: 'codex',
  session: 'adversarial-replacement',
};
const worker = {
  actor: 'codex/adversarial-worker',
  platform: 'codex',
  session: 'adversarial-worker',
};

function id(number) {
  return `01J0000000000000000002${String(number).padStart(4, '0')}`;
}

function grant({
  grantId = id(9001),
  epoch = 1,
  grantCoordinator = coordinator,
  issuer = null,
  includedIssues = [],
} = {}) {
  return {
    schema: 'aitm.coordinator-grant/v1',
    grantId,
    scope: { scopeRootIssue: issue, includedIssues, excludedIssues: [] },
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

function record(spec, predecessor = null) {
  const recordRepository = spec.repository ?? repository;
  const recordIssue = spec.issue ?? issue;
  return Object.freeze({
    commentNodeId: `IC_kwDOAuthority${spec.recordId.slice(-4)}`,
    envelope: createAitmRecordEnvelope({
      recordId: spec.recordId,
      recordType: spec.recordType,
      repository: recordRepository,
      issue: recordIssue,
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

function assignmentInput(authority, overrides = {}) {
  return {
    authority,
    repository,
    coordinator,
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
    ...overrides,
  };
}

function submissionPayload(assignment) {
  const payload = assignment.envelope.payload;
  return {
    schema: 'aitm.worker-submission/v1',
    status: 'submitted',
    assignmentRecordId: assignment.envelope.recordId,
    issue: payload.issue,
    branch: payload.branch,
    files: [...payload.files],
    subsystem: payload.subsystem,
    dependency: structuredClone(payload.dependency),
    verification: structuredClone(payload.verification),
    worker: structuredClone(payload.worker),
    result: { summary: 'adversarial result' },
  };
}

function resolveRecords(records, projection, options = {}) {
  return resolveCoordinatorAuthority({
    issueHierarchy: [
      { issue, parentIssue: null },
      { issue: otherIssue, parentIssue: issue },
    ],
    records,
    repository: options.repository ?? repository,
    issue: options.issue ?? issue,
    coordinationProjection: projection,
    now: '2026-08-03T20:06:00.000Z',
  });
}

function replacementHistory({ malformedHistorical = false } = {}) {
  const originalGrant = grant();
  const root = record({
    recordId: id(1),
    recordType: 'coordinator-grant',
    payload: originalGrant,
    actor: coordinator.actor,
    epoch: 1,
    grantId: id(8000),
  });
  const active = resolveRecords([root], {
    schema: 'aitm.coordination-projection/v1',
    grantId: originalGrant.grantId,
    epoch: 1,
    adoptionState: 'adopted',
  });
  const candidate = createWorkAssignment(assignmentInput(active));
  const assignment = record(
    {
      recordId: id(10),
      recordType: candidate.recordType,
      payload: candidate.payload,
      actor: coordinator.actor,
      epoch: 1,
      grantId: originalGrant.grantId,
    },
    root.envelope.recordId
  );
  const assignmentB = record(
    {
      recordId: id(12),
      recordType: candidate.recordType,
      payload: candidate.payload,
      actor: coordinator.actor,
      epoch: 1,
      grantId: originalGrant.grantId,
    },
    assignment.envelope.recordId
  );
  const submission = record(
    {
      recordId: id(20),
      recordType: 'execution-result',
      payload: submissionPayload(assignment),
      actor: worker.actor,
      epoch: 1,
      grantId: originalGrant.grantId,
    },
    assignmentB.envelope.recordId
  );
  const malformed = malformedHistorical
    ? record(
        {
          recordId: id(30),
          recordType: 'record-disposition',
          payload: {
            schema: 'aitm.record-disposition/v1',
            decision: 'accepted',
            issue,
            assignmentRecordId: assignmentB.envelope.recordId,
            assignmentCommentNodeId: assignmentB.commentNodeId,
            submissionRecordId: submission.envelope.recordId,
            submissionCommentNodeId: submission.commentNodeId,
            grantId: originalGrant.grantId,
            epoch: 1,
            decidedBy: coordinator,
            reason: null,
          },
          actor: coordinator.actor,
          epoch: 1,
          grantId: originalGrant.grantId,
        },
        submission.envelope.recordId
      )
    : null;
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
  const revocation = record(
    {
      recordId: id(40),
      recordType: 'coordinator-revocation',
      payload: replacement.revocation,
      actor: coordinator.actor,
      epoch: 1,
      grantId: id(8000),
    },
    (malformed ?? submission).envelope.recordId
  );
  const replacementRecord = record(
    {
      recordId: id(41),
      recordType: 'coordinator-grant',
      payload: replacementGrant,
      actor: coordinator.actor,
      epoch: 1,
      grantId: id(8000),
    },
    revocation.envelope.recordId
  );
  const records = [
    root,
    assignment,
    assignmentB,
    submission,
    ...(malformed === null ? [] : [malformed]),
    revocation,
    replacementRecord,
  ];
  return {
    assignment,
    malformed,
    records,
    replacement,
    replacementRecord,
    submission,
  };
}

test('raw grant context assertions never mint repository-bound Task 8 authority', () => {
  const rawGrant = grant({ includedIssues: [otherIssue] });
  const hierarchy = [
    { issue, parentIssue: null },
    { issue: otherIssue, parentIssue: issue },
  ];
  const recordBacked = resolveRecords(
    [
      record({
        recordId: id(1),
        recordType: 'coordinator-grant',
        payload: rawGrant,
        actor: coordinator.actor,
        epoch: 1,
        grantId: id(8000),
      }),
    ],
    {
      schema: 'aitm.coordination-projection/v1',
      grantId: rawGrant.grantId,
      epoch: 1,
      adoptionState: 'adopted',
    }
  );
  const positive = createWorkAssignment(assignmentInput(recordBacked));
  assert.equal(positive.payload.grantId, rawGrant.grantId);
  const raw = resolveCoordinatorAuthority({
    issueHierarchy: hierarchy,
    grants: [rawGrant],
    revocations: [],
    repository: 'foreign/repository',
    issue: otherIssue,
    coordinationProjection: {
      schema: 'aitm.coordination-projection/v1',
      grantId: rawGrant.grantId,
      epoch: 1,
      adoptionState: 'adopted',
    },
    now: '2026-08-03T20:06:00.000Z',
  });
  assert.throws(
    () =>
      createWorkAssignment(
        assignmentInput(raw, { repository: 'foreign/repository', issue: otherIssue })
      ),
    /work-assignment:authority/
  );

  const assignmentPayload = {
    ...positive.payload,
    issue: otherIssue,
  };
  const assignment = record({
    recordId: id(10),
    recordType: 'work-assignment',
    payload: assignmentPayload,
    actor: coordinator.actor,
    epoch: 1,
    grantId: rawGrant.grantId,
    repository: 'foreign/repository',
    issue: otherIssue,
  });
  const submission = record(
    {
      recordId: id(20),
      recordType: 'execution-result',
      payload: submissionPayload(assignment),
      actor: worker.actor,
      epoch: 1,
      grantId: rawGrant.grantId,
      repository: 'foreign/repository',
      issue: otherIssue,
    },
    assignment.envelope.recordId
  );
  const target = { authority: raw, assignment, submission };
  assert.equal(evaluateAssignment(target).status, 'blocked');
  assert.throws(() => acceptSubmission(target), /work-assignment:authority/);
  assert.throws(
    () => rejectSubmission({ ...target, reason: 'raw context forgery' }),
    /work-assignment:authority/
  );
  assert.equal(
    authorizeCoordinatorOperation({
      authority: raw,
      grantId: rawGrant.grantId,
      epoch: 1,
      coordinator,
      issue: otherIssue,
      operation: 'assign-work',
      branch,
    }).authorized,
    true
  );
});

test('an adopted projection cannot bypass incomplete durable replacement replay', () => {
  const current = replacementHistory();
  const bypass = resolveRecords([...current.records].reverse(), {
    ...current.replacement.coordinationProjection,
    adoptionState: 'adopted',
  });
  assert.deepEqual(bypass, {
    status: 'paused',
    diagnostic: { reason: 'adoption-required' },
  });
  assert.throws(
    () => createWorkAssignment(assignmentInput(bypass, { coordinator: replacementCoordinator })),
    /work-assignment:authority/
  );
});

test('malformed historical linkage permits repair but never counts as completion', () => {
  const current = replacementHistory({ malformedHistorical: true });
  const paused = resolveRecords([...current.records].reverse(), {
    ...current.replacement.coordinationProjection,
    adoptionState: 'required',
  });
  const target = {
    authority: paused,
    assignment: current.assignment,
    submission: current.submission,
  };
  const correction = acceptSubmission(target);
  const blocked = adoptOutstandingSubmissions({
    authority: paused,
    snapshot: {
      repository,
      issue,
      expectedHeadRecordId: current.replacementRecord.envelope.recordId,
      records: current.records,
    },
  });
  assert.equal(blocked.status, 'blocked');

  const corrected = record(
    {
      recordId: id(42),
      recordType: correction.recordType,
      payload: correction.payload,
      actor: replacementCoordinator.actor,
      epoch: 2,
      grantId: id(9002),
      supersedes: current.malformed.envelope.recordId,
    },
    current.replacementRecord.envelope.recordId
  );
  const records = [...current.records, corrected];
  const restarted = resolveRecords([...records].reverse(), {
    ...current.replacement.coordinationProjection,
    adoptionState: 'required',
  });
  const adopted = adoptOutstandingSubmissions({
    authority: restarted,
    snapshot: {
      repository,
      issue,
      expectedHeadRecordId: corrected.envelope.recordId,
      records: [...records].reverse(),
    },
  });
  assert.deepEqual(adopted.acceptedSubmissionRecordIds, [current.submission.envelope.recordId]);
});
