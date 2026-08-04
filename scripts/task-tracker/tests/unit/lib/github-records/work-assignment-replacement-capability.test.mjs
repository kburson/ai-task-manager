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
  rejectSubmission,
} from '../../../../lib/github-records/work-assignment.mjs';

const repository = 'kburson/ai-task-manager';
const issue = 1077;
const branch = 'feature/child/1077';
const coordinator = { actor: 'claude/original', platform: 'claude', session: 'original' };
const replacementCoordinator = {
  actor: 'codex/replacement',
  platform: 'codex',
  session: 'replacement',
};
const worker = { actor: 'codex/worker', platform: 'codex', session: 'worker' };

function id(number) {
  return `01J0000000000000000007${String(number).padStart(4, '0')}`;
}

function grant({ grantId, epoch, grantCoordinator, issuer = null, operations }) {
  return {
    schema: 'aitm.coordinator-grant/v1',
    grantId,
    scope: { scopeRootIssue: issue, includedIssues: [], excludedIssues: [] },
    coordinator: grantCoordinator,
    parentGrantId: null,
    issuer,
    epoch,
    operations,
    branchBoundary: [branch],
    integrationBoundary: { sourceBranches: [], destinationBranches: [] },
    activatedAt: '2026-08-03T20:00:00.000Z',
    expiresAt: null,
  };
}

function record(
  { recordId, recordType, payload, actor, epoch, grantId, supersedes = null },
  predecessor = null
) {
  return Object.freeze({
    commentNodeId: `IC_kwDOCapability${recordId.slice(-4)}`,
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
    issueHierarchy: [{ issue, parentIssue: null }],
    records,
    repository,
    issue,
    coordinationProjection: projection,
    now: '2026-08-03T20:06:00.000Z',
  });
}

function history({
  replacementOperations,
  reverse,
  historical = false,
  originalOperations = ['assign-work', 'dispose-submission', 'adopt-submissions'],
}) {
  const originalGrant = grant({
    grantId: id(9001),
    epoch: 1,
    grantCoordinator: coordinator,
    operations: originalOperations,
  });
  const root = record({
    recordId: id(1),
    recordType: 'coordinator-grant',
    payload: originalGrant,
    actor: coordinator.actor,
    epoch: 1,
    grantId: id(8000),
  });
  const active = resolve([root], {
    schema: 'aitm.coordination-projection/v1',
    grantId: originalGrant.grantId,
    epoch: 1,
    adoptionState: 'adopted',
  });
  const assignmentCandidate = createWorkAssignment({
    authority: active,
    coordinator,
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
      actor: coordinator.actor,
      epoch: 1,
      grantId: originalGrant.grantId,
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
        result: { summary: 'complete' },
      },
      actor: worker.actor,
      epoch: 1,
      grantId: originalGrant.grantId,
    },
    assignment.envelope.recordId
  );
  const replacementGrant = grant({
    grantId: id(9002),
    epoch: 2,
    grantCoordinator: replacementCoordinator,
    issuer: coordinator,
    operations: replacementOperations,
  });
  const replacement = replaceCoordinator({
    authority: active,
    expectedGrantId: originalGrant.grantId,
    expectedEpoch: 1,
    replacementGrant,
  });
  const dispositionPayload = {
    schema: 'aitm.record-disposition/v1',
    decision: 'accepted',
    issue,
    assignmentRecordId: assignment.envelope.recordId,
    assignmentCommentNodeId: assignment.commentNodeId,
    submissionRecordId: submission.envelope.recordId,
    submissionCommentNodeId: submission.commentNodeId,
    grantId: historical ? originalGrant.grantId : replacementGrant.grantId,
    epoch: historical ? originalGrant.epoch : replacementGrant.epoch,
    decidedBy: historical ? coordinator : replacementCoordinator,
    reason: null,
  };
  const historicalDisposition = historical
    ? record(
        {
          recordId: id(29),
          recordType: 'record-disposition',
          payload: dispositionPayload,
          actor: coordinator.actor,
          epoch: 1,
          grantId: originalGrant.grantId,
        },
        submission.envelope.recordId
      )
    : null;
  const revocation = record(
    {
      recordId: id(30),
      recordType: 'coordinator-revocation',
      payload: replacement.revocation,
      actor: coordinator.actor,
      epoch: 1,
      grantId: id(8000),
    },
    (historicalDisposition ?? submission).envelope.recordId
  );
  const replacementRecord = record(
    {
      recordId: id(31),
      recordType: 'coordinator-grant',
      payload: replacementGrant,
      actor: coordinator.actor,
      epoch: 1,
      grantId: id(8000),
    },
    revocation.envelope.recordId
  );
  const persisted = [
    root,
    assignment,
    submission,
    ...(historicalDisposition === null ? [] : [historicalDisposition]),
    revocation,
    replacementRecord,
  ];
  const paused = resolve(reverse ? [...persisted].reverse() : persisted, {
    ...replacement.coordinationProjection,
    adoptionState: 'required',
  });
  let replacementDisposition = null;
  if (!historical) {
    const target = { authority: paused, assignment, submission };
    const canDispose = replacementOperations.includes('dispose-submission');
    if (canDispose) assert.equal(acceptSubmission(target).payload.decision, 'accepted');
    else assert.throws(() => acceptSubmission(target), /work-assignment:authority/);
    replacementDisposition = record(
      {
        recordId: id(32),
        recordType: 'record-disposition',
        payload: dispositionPayload,
        actor: replacementCoordinator.actor,
        epoch: 2,
        grantId: replacementGrant.grantId,
      },
      replacementRecord.envelope.recordId
    );
  }
  const records = [
    ...persisted,
    ...(replacementDisposition === null ? [] : [replacementDisposition]),
  ];
  const headRecord = replacementDisposition ?? replacementRecord;
  return {
    assignment,
    paused,
    persisted,
    projection: { ...replacement.coordinationProjection, adoptionState: 'required' },
    records,
    replacementDisposition,
    replacementRecord,
    result: adoptOutstandingSubmissions({
      authority: paused,
      snapshot: {
        repository,
        issue,
        expectedHeadRecordId: headRecord.envelope.recordId,
        records: reverse ? [...records].reverse() : records,
      },
    }),
    submission,
  };
}

function withoutKey(value, key) {
  const copy = structuredClone(value);
  delete copy[key];
  return copy;
}

const malformedPredecessorClaims = [
  {
    name: 'assignment missing grantId',
    target: 'assignment',
    payload: (value) => withoutKey(value, 'grantId'),
  },
  {
    name: 'assignment with invalid epoch type',
    target: 'assignment',
    payload: (value) => ({ ...value, epoch: '1' }),
  },
  {
    name: 'submission missing assignmentRecordId',
    target: 'submission',
    payload: (value) => withoutKey(value, 'assignmentRecordId'),
  },
  {
    name: 'submission with invalid assignmentRecordId type',
    target: 'submission',
    payload: (value) => ({ ...value, assignmentRecordId: 10 }),
  },
];

for (const claim of malformedPredecessorClaims) {
  for (const reverse of [false, true]) {
    test(`${claim.name} blocks adoption with ${reverse ? 'reversed' : 'ordered'} records`, () => {
      const current = history({
        replacementOperations: ['dispose-submission', 'adopt-submissions'],
        reverse: false,
      });
      const original = current[claim.target];
      const malformed = record(
        {
          recordId: original.envelope.recordId,
          recordType: original.envelope.recordType,
          payload: claim.payload(original.envelope.payload),
          actor: original.envelope.authority.actor,
          epoch: original.envelope.authority.epoch,
          grantId: original.envelope.authority.grantId,
        },
        original.envelope.predecessor
      );
      const records = current.persisted.map((candidate) =>
        candidate.envelope.recordId === malformed.envelope.recordId ? malformed : candidate
      );
      const ordered = reverse ? [...records].reverse() : records;
      const pausedAuthority = resolve(ordered, current.projection);
      assert.deepEqual(
        adoptOutstandingSubmissions({
          authority: pausedAuthority,
          snapshot: {
            repository,
            issue,
            expectedHeadRecordId: current.replacementRecord.envelope.recordId,
            records: ordered,
          },
        }),
        { status: 'blocked', diagnostic: { reason: 'authority' } }
      );
    });
  }
}

const scenarios = [
  { name: 'adopt without dispose', operations: ['adopt-submissions'], ready: false },
  { name: 'dispose without adopt', operations: ['dispose-submission'], ready: false },
  {
    name: 'dispose and adopt',
    operations: ['dispose-submission', 'adopt-submissions'],
    ready: true,
  },
];

for (const scenario of scenarios) {
  for (const reverse of [false, true]) {
    test(`${scenario.name} is capability-safe with ${reverse ? 'reversed' : 'ordered'} records`, () => {
      const current = history({ replacementOperations: scenario.operations, reverse });
      if (!scenario.ready) {
        assert.deepEqual(current.result, {
          status: 'blocked',
          diagnostic: {
            reason: scenario.operations.includes('adopt-submissions')
              ? 'disposition-authority'
              : 'authority',
          },
        });
        return;
      }
      assert.equal(current.result.status, 'ready-to-adopt');
      assert.deepEqual(current.result.acceptedSubmissionRecordIds, [
        current.submission.envelope.recordId,
      ]);
    });
  }
}

for (const canHistoricallyDispose of [false, true]) {
  for (const reverse of [false, true]) {
    test(`historical disposition ${canHistoricallyDispose ? 'has' : 'lacks'} capability with ${
      reverse ? 'reversed' : 'ordered'
    } records`, () => {
      const current = history({
        replacementOperations: ['adopt-submissions'],
        reverse,
        historical: true,
        originalOperations: [
          'assign-work',
          ...(canHistoricallyDispose ? ['dispose-submission'] : []),
          'adopt-submissions',
        ],
      });
      if (!canHistoricallyDispose) {
        assert.deepEqual(current.result, {
          status: 'blocked',
          diagnostic: { reason: 'disposition-authority' },
        });
        return;
      }
      assert.equal(current.result.status, 'ready-to-adopt');
      assert.deepEqual(current.result.acceptedSubmissionRecordIds, []);
    });
  }
}

test('documented adoption arrays derive and preserve the complete private snapshot', () => {
  const current = history({
    replacementOperations: ['dispose-submission', 'adopt-submissions'],
    reverse: false,
  });
  const adopt = (overrides = {}) =>
    adoptOutstandingSubmissions({
      authority: current.paused,
      assignments: [],
      submissions: [],
      dispositions: [current.replacementDisposition],
      ...overrides,
    });
  assert.deepEqual(adopt(), current.result);
  assert.deepEqual(
    adopt({
      assignments: [current.assignment, current.assignment],
      submissions: [current.submission, current.submission],
      dispositions: [current.replacementDisposition, current.replacementDisposition],
    }),
    current.result
  );
  assert.deepEqual(adopt({ dispositions: [] }), {
    status: 'blocked',
    diagnostic: { reason: 'missing-disposition' },
  });

  const conflictingAssignment = structuredClone(current.assignment);
  conflictingAssignment.commentNodeId = 'IC_kwDOConflictingAssignment';
  assert.deepEqual(adopt({ assignments: [conflictingAssignment] }), {
    status: 'blocked',
    diagnostic: { reason: 'authority' },
  });
  const foreignDisposition = structuredClone(current.replacementDisposition);
  foreignDisposition.envelope.repository = 'foreign/repository';
  assert.deepEqual(adopt({ dispositions: [foreignDisposition] }), {
    status: 'blocked',
    diagnostic: { reason: 'authority' },
  });
  const fork = record(
    {
      recordId: id(33),
      recordType: 'record-disposition',
      payload: current.replacementDisposition.envelope.payload,
      actor: replacementCoordinator.actor,
      epoch: 2,
      grantId: id(9002),
    },
    current.replacementRecord.envelope.recordId
  );
  assert.deepEqual(adopt({ dispositions: [current.replacementDisposition, fork] }), {
    status: 'blocked',
    diagnostic: { reason: 'authority' },
  });

  const reversed = history({
    replacementOperations: ['dispose-submission', 'adopt-submissions'],
    reverse: true,
  });
  assert.deepEqual(
    adoptOutstandingSubmissions({
      authority: reversed.paused,
      assignments: [reversed.assignment],
      submissions: [reversed.submission],
      dispositions: [reversed.replacementDisposition],
    }),
    reversed.result
  );
});

test('documented adoption arrays handle zero outstanding work without supplied history', () => {
  const current = history({
    replacementOperations: ['adopt-submissions'],
    reverse: true,
    historical: true,
    originalOperations: ['assign-work', 'dispose-submission', 'adopt-submissions'],
  });
  const result = adoptOutstandingSubmissions({
    authority: current.paused,
    assignments: [],
    submissions: [],
    dispositions: [],
  });
  assert.equal(result.status, 'ready-to-adopt');
  assert.deepEqual(result.acceptedSubmissionRecordIds, []);
  assert.deepEqual(result.rejectedSubmissionRecordIds, []);
});

function activeHistory(operations, reverse) {
  const activeGrant = grant({
    grantId: id(9101),
    epoch: 3,
    grantCoordinator: coordinator,
    operations,
  });
  const root = record({
    recordId: id(101),
    recordType: 'coordinator-grant',
    payload: activeGrant,
    actor: coordinator.actor,
    epoch: 3,
    grantId: id(8100),
  });
  const initial = resolve([root], {
    schema: 'aitm.coordination-projection/v1',
    grantId: activeGrant.grantId,
    epoch: 3,
    adoptionState: 'adopted',
  });
  const assignmentPayload = {
    schema: 'aitm.work-assignment/v1',
    issue,
    branch,
    files: ['scripts/task-tracker/lib/github-records/work-assignment.mjs'],
    subsystem: 'github-records',
    dependency: { baselineSha: 'c2ae3db785468fb496f2be1f54aca144e636b172', recordIds: [] },
    verification: { contractEpoch: 1, verifierIds: ['vc-6'] },
    worker,
    coordinator,
    grantId: activeGrant.grantId,
    epoch: activeGrant.epoch,
  };
  const assignmentInput = {
    authority: initial,
    coordinator,
    issue,
    branch,
    files: [...assignmentPayload.files],
    subsystem: assignmentPayload.subsystem,
    dependency: structuredClone(assignmentPayload.dependency),
    verification: structuredClone(assignmentPayload.verification),
    worker,
  };
  if (operations.includes('assign-work'))
    assert.doesNotThrow(() => createWorkAssignment(assignmentInput));
  else assert.throws(() => createWorkAssignment(assignmentInput), /work-assignment:authority/);
  const assignment = record(
    {
      recordId: id(110),
      recordType: 'work-assignment',
      payload: assignmentPayload,
      actor: coordinator.actor,
      epoch: 3,
      grantId: activeGrant.grantId,
    },
    root.envelope.recordId
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
        files: [...assignmentPayload.files],
        subsystem: assignmentPayload.subsystem,
        dependency: structuredClone(assignmentPayload.dependency),
        verification: structuredClone(assignmentPayload.verification),
        worker,
        result: { summary: 'active result' },
      },
      actor: worker.actor,
      epoch: 3,
      grantId: activeGrant.grantId,
    },
    assignment.envelope.recordId
  );
  const records = [root, assignment, submission];
  return {
    activeGrant,
    assignment,
    submission,
    records,
    authority: resolve(reverse ? [...records].reverse() : records, {
      schema: 'aitm.coordination-projection/v1',
      grantId: activeGrant.grantId,
      epoch: 3,
      adoptionState: 'adopted',
    }),
  };
}

for (const scenario of [
  { name: 'assign only', operations: ['assign-work'], ready: false },
  { name: 'dispose only', operations: ['dispose-submission'], ready: false },
  { name: 'assign and dispose', operations: ['assign-work', 'dispose-submission'], ready: true },
]) {
  for (const reverse of [false, true]) {
    test(`active ${scenario.name} is capability-safe with ${
      reverse ? 'reversed' : 'ordered'
    } records`, () => {
      const current = activeHistory(scenario.operations, reverse);
      const target = {
        authority: current.authority,
        assignment: current.assignment,
        submission: current.submission,
      };
      assert.equal(evaluateAssignment(target).status, scenario.ready ? 'matched' : 'blocked');
      if (scenario.ready) {
        assert.equal(acceptSubmission(target).payload.decision, 'accepted');
        assert.equal(
          rejectSubmission({ ...target, reason: 'bounded rejection' }).payload.decision,
          'rejected'
        );
      } else {
        assert.throws(() => acceptSubmission(target), /work-assignment:authority/);
        assert.throws(
          () => rejectSubmission({ ...target, reason: 'missing operation' }),
          /work-assignment:authority/
        );
      }
    });
  }
}

test('snapshot overload authenticates every captured record before append-only extension', () => {
  const current = history({
    replacementOperations: ['dispose-submission', 'adopt-submissions'],
    reverse: false,
  });
  const adoptSnapshot = (records, expectedHeadRecordId) =>
    adoptOutstandingSubmissions({
      authority: current.paused,
      snapshot: { repository, issue, expectedHeadRecordId, records },
    });
  for (const records of [current.persisted, [...current.persisted].reverse()]) {
    assert.deepEqual(adoptSnapshot(records, current.replacementRecord.envelope.recordId), {
      status: 'blocked',
      diagnostic: { reason: 'missing-disposition' },
    });
  }

  const rewrittenPayload = {
    ...current.submission.envelope.payload,
    assignmentRecordId: id(999),
  };
  const rewrittenSubmission = record(
    {
      recordId: current.submission.envelope.recordId,
      recordType: current.submission.envelope.recordType,
      payload: rewrittenPayload,
      actor: worker.actor,
      epoch: 1,
      grantId: id(9001),
    },
    current.assignment.envelope.recordId
  );
  const rewritten = current.persisted.map((candidate) =>
    candidate.envelope.recordId === rewrittenSubmission.envelope.recordId
      ? rewrittenSubmission
      : candidate
  );
  for (const records of [rewritten, [...rewritten].reverse()]) {
    assert.deepEqual(adoptSnapshot(records, current.replacementRecord.envelope.recordId), {
      status: 'blocked',
      diagnostic: { reason: 'authority' },
    });
  }

  for (const records of [current.records, [...current.records].reverse()]) {
    assert.deepEqual(
      adoptSnapshot(records, current.replacementDisposition.envelope.recordId),
      current.result
    );
  }
  const missingCapturedAssignment = current.records.filter(
    (candidate) => candidate.envelope.recordId !== current.assignment.envelope.recordId
  );
  assert.throws(
    () =>
      adoptSnapshot(missingCapturedAssignment, current.replacementDisposition.envelope.recordId),
    /capsule-chain/
  );
});

for (const reverse of [false, true]) {
  test(`active restart enforces exact-once disposition with ${
    reverse ? 'reversed' : 'ordered'
  } records`, () => {
    const current = activeHistory(['assign-work', 'dispose-submission'], reverse);
    const target = {
      authority: current.authority,
      assignment: current.assignment,
      submission: current.submission,
    };
    const candidate = acceptSubmission(target);
    const disposition = record(
      {
        recordId: id(130),
        recordType: candidate.recordType,
        payload: candidate.payload,
        actor: coordinator.actor,
        epoch: 3,
        grantId: current.activeGrant.grantId,
      },
      current.submission.envelope.recordId
    );
    const persisted = [...current.records, disposition];
    const restarted = resolve(reverse ? [...persisted].reverse() : persisted, {
      schema: 'aitm.coordination-projection/v1',
      grantId: current.activeGrant.grantId,
      epoch: 3,
      adoptionState: 'adopted',
    });
    const restartedTarget = { ...target, authority: restarted };
    assert.equal(evaluateAssignment(restartedTarget).status, 'blocked');
    assert.throws(() => acceptSubmission(restartedTarget), /work-assignment:authority/);
    assert.throws(
      () => rejectSubmission({ ...restartedTarget, reason: 'conflicting restart' }),
      /work-assignment:authority/
    );

    const duplicate = record(
      {
        recordId: id(131),
        recordType: candidate.recordType,
        payload: candidate.payload,
        actor: coordinator.actor,
        epoch: 3,
        grantId: current.activeGrant.grantId,
      },
      disposition.envelope.recordId
    );
    const duplicatedRecords = [...persisted, duplicate];
    const duplicated = resolve(reverse ? [...duplicatedRecords].reverse() : duplicatedRecords, {
      schema: 'aitm.coordination-projection/v1',
      grantId: current.activeGrant.grantId,
      epoch: 3,
      adoptionState: 'adopted',
    });
    assert.equal(evaluateAssignment({ ...target, authority: duplicated }).status, 'blocked');
  });
}

for (const reverse of [false, true]) {
  test(`active malformed disposition remains repairable with ${
    reverse ? 'reversed' : 'ordered'
  } records`, () => {
    const current = activeHistory(['assign-work', 'dispose-submission'], reverse);
    const target = {
      authority: current.authority,
      assignment: current.assignment,
      submission: current.submission,
    };
    const validCandidate = acceptSubmission(target);
    const malformedPayload = {
      ...validCandidate.payload,
      assignmentCommentNodeId: 'IC_kwDOMalformedAssignment',
    };
    const malformed = record(
      {
        recordId: id(130),
        recordType: validCandidate.recordType,
        payload: malformedPayload,
        actor: coordinator.actor,
        epoch: 3,
        grantId: current.activeGrant.grantId,
      },
      current.submission.envelope.recordId
    );
    const malformedRecords = [...current.records, malformed];
    const repairable = resolve(reverse ? [...malformedRecords].reverse() : malformedRecords, {
      schema: 'aitm.coordination-projection/v1',
      grantId: current.activeGrant.grantId,
      epoch: 3,
      adoptionState: 'adopted',
    });
    const correctionCandidate = acceptSubmission({ ...target, authority: repairable });
    const correction = record(
      {
        recordId: id(132),
        recordType: correctionCandidate.recordType,
        payload: correctionCandidate.payload,
        actor: coordinator.actor,
        epoch: 3,
        grantId: current.activeGrant.grantId,
        supersedes: malformed.envelope.recordId,
      },
      malformed.envelope.recordId
    );
    const correctedRecords = [...malformedRecords, correction];
    const corrected = resolve(reverse ? [...correctedRecords].reverse() : correctedRecords, {
      schema: 'aitm.coordination-projection/v1',
      grantId: current.activeGrant.grantId,
      epoch: 3,
      adoptionState: 'adopted',
    });
    assert.equal(evaluateAssignment({ ...target, authority: corrected }).status, 'blocked');
  });
}
