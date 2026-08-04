// @story #1077
import { strict as assert } from 'node:assert';
import test from 'node:test';

import { resolveCoordinatorAuthority } from '../../../../lib/github-records/coordination-authority.mjs';
import { createAitmRecordEnvelope } from '../../../../lib/github-records/record-envelope.mjs';
import {
  validateWorkAssignmentDispositionPayload,
  validateWorkAssignmentPayload,
} from '../../../../lib/github-records/work-assignment-validation.mjs';
import {
  acceptSubmission,
  createWorkAssignment,
  evaluateAssignment,
} from '../../../../lib/github-records/work-assignment.mjs';

const repository = 'kburson/ai-task-manager';
const issue = 1077;
const branch = 'feature/child/1077';
const coordinator = { actor: 'codex/coordinator', platform: 'codex', session: 'opaque-id' };
const worker = { actor: 'codex/worker', platform: 'codex', session: 'opaque-id' };

function id(number) {
  return `01J0000000000000000004${String(number).padStart(4, '0')}`;
}

function record({ recordId, recordType, payload, actor, grantId }, predecessor = null) {
  return Object.freeze({
    commentNodeId: `IC_kwDOOpaque${recordId.slice(-4)}`,
    envelope: createAitmRecordEnvelope({
      recordId,
      recordType,
      repository,
      issue,
      payload,
      actor,
      epoch: 1,
      grantId,
      predecessor,
      createdAt: '2026-08-03T20:05:00.000Z',
    }),
  });
}

function assignmentInput(authority) {
  return {
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
  };
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
    result: { summary: 'opaque grant id works end to end' },
  };
}

test('record-backed Task 7 opaque grant IDs create, evaluate, and accept Task 8 work', () => {
  const grant = {
    schema: 'aitm.coordinator-grant/v1',
    grantId: 'grant-original',
    scope: { scopeRootIssue: issue, includedIssues: [], excludedIssues: [] },
    coordinator,
    parentGrantId: null,
    issuer: null,
    epoch: 1,
    operations: ['assign-work', 'dispose-submission'],
    branchBoundary: [branch],
    integrationBoundary: { sourceBranches: [], destinationBranches: [] },
    activatedAt: '2026-08-03T20:00:00.000Z',
    expiresAt: null,
  };
  const root = record({
    recordId: id(1),
    recordType: 'coordinator-grant',
    payload: grant,
    actor: coordinator.actor,
    grantId: id(9000),
  });
  const authority = resolveCoordinatorAuthority({
    issueHierarchy: [{ issue, parentIssue: null }],
    records: [root],
    repository,
    issue,
    coordinationProjection: {
      schema: 'aitm.coordination-projection/v1',
      grantId: grant.grantId,
      epoch: 1,
      adoptionState: 'adopted',
    },
    now: '2026-08-03T20:06:00.000Z',
  });
  const candidate = createWorkAssignment(assignmentInput(authority));
  assert.equal(candidate.payload.grantId, 'grant-original');
  const assignment = record(
    {
      recordId: id(10),
      recordType: candidate.recordType,
      payload: candidate.payload,
      actor: coordinator.actor,
      grantId: grant.grantId,
    },
    root.envelope.recordId
  );
  const submission = record(
    {
      recordId: id(20),
      recordType: 'execution-result',
      payload: submissionPayload(assignment),
      actor: worker.actor,
      grantId: grant.grantId,
    },
    assignment.envelope.recordId
  );
  assert.equal(evaluateAssignment({ authority, assignment, submission }).status, 'matched');
  assert.equal(
    acceptSubmission({ authority, assignment, submission }).payload.grantId,
    'grant-original'
  );
});

test('Task 8 grant IDs reject empty, padded, oversized, and control-bearing values', () => {
  const validAssignment = {
    schema: 'aitm.work-assignment/v1',
    issue,
    branch,
    files: ['scripts/task-tracker/lib/github-records/work-assignment.mjs'],
    subsystem: 'github-records',
    dependency: { baselineSha: 'c2ae3db785468fb496f2be1f54aca144e636b172', recordIds: [] },
    verification: { contractEpoch: 1, verifierIds: ['vc-6'] },
    worker,
    coordinator,
    grantId: 'grant-original',
    epoch: 1,
  };
  const validDisposition = {
    schema: 'aitm.record-disposition/v1',
    decision: 'accepted',
    issue,
    assignmentRecordId: id(10),
    assignmentCommentNodeId: 'IC_assignment',
    submissionRecordId: id(20),
    submissionCommentNodeId: 'IC_submission',
    grantId: 'grant-original',
    epoch: 1,
    decidedBy: coordinator,
    reason: null,
  };
  assert.equal(validateWorkAssignmentPayload(validAssignment).grantId, 'grant-original');
  assert.equal(
    validateWorkAssignmentDispositionPayload(validDisposition).grantId,
    'grant-original'
  );
  for (const invalidGrantId of [
    '',
    ' grant-original',
    'grant-original ',
    'x'.repeat(257),
    'bad\nid',
  ]) {
    assert.throws(
      () => validateWorkAssignmentPayload({ ...validAssignment, grantId: invalidGrantId }),
      /work-assignment:assignment/
    );
    assert.throws(
      () =>
        validateWorkAssignmentDispositionPayload({
          ...validDisposition,
          grantId: invalidGrantId,
        }),
      /work-assignment:disposition/
    );
    assert.throws(
      () =>
        createAitmRecordEnvelope({
          recordId: id(30),
          recordType: 'record-disposition',
          repository,
          issue,
          payload: validDisposition,
          actor: coordinator.actor,
          epoch: 1,
          grantId: invalidGrantId,
          createdAt: '2026-08-03T20:05:00.000Z',
        }),
      /record-envelope:authority-grant-id/
    );
  }
});
