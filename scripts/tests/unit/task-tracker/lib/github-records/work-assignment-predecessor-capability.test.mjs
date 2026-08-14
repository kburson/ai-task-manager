// @story #1077
import { strict as assert } from 'node:assert';
import test from 'node:test';

import {
  replaceCoordinator,
  resolveCoordinatorAuthority,
} from '../../../../../task-tracker/lib/github-records/coordination-authority.mjs';
import { createAitmRecordEnvelope } from '../../../../../task-tracker/lib/github-records/record-envelope.mjs';
import { adoptOutstandingSubmissions } from '../../../../../task-tracker/lib/github-records/work-assignment.mjs';

const repository = 'kburson/ai-task-manager';
const issue = 1077;
const branch = 'feature/child/1077';
const coordinator = { actor: 'claude/coordinator', platform: 'claude', session: 'no-assign' };
const replacementCoordinator = {
  actor: 'codex/replacement',
  platform: 'codex',
  session: 'no-assign',
};
const worker = { actor: 'codex/worker', platform: 'codex', session: 'no-assign' };

function id(number) {
  return `01J0000000000000000006${String(number).padStart(4, '0')}`;
}

function grant({
  grantId = id(9001),
  epoch = 1,
  grantCoordinator = coordinator,
  issuer = null,
} = {}) {
  return {
    schema: 'aitm.coordinator-grant/v1',
    grantId,
    scope: { scopeRootIssue: issue, includedIssues: [], excludedIssues: [] },
    coordinator: grantCoordinator,
    parentGrantId: null,
    issuer,
    epoch,
    operations: ['dispose-submission', 'adopt-submissions'],
    branchBoundary: [branch],
    integrationBoundary: { sourceBranches: [], destinationBranches: [] },
    activatedAt: '2026-08-03T20:00:00.000Z',
    expiresAt: null,
  };
}

function record({ recordId, recordType, payload, actor, epoch, grantId }, predecessor = null) {
  return Object.freeze({
    commentNodeId: `IC_kwDONoAssign${recordId.slice(-4)}`,
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
    issueHierarchy: [{ issue, parentIssue: null }],
    records,
    repository,
    issue,
    coordinationProjection: projection,
    now: '2026-08-03T20:06:00.000Z',
  });
}

function operationDeficientHistory() {
  const originalGrant = grant();
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
  const assignment = record(
    {
      recordId: id(10),
      recordType: 'work-assignment',
      payload: {
        schema: 'aitm.work-assignment/v1',
        issue,
        branch,
        files: ['scripts/task-tracker/lib/github-records/work-assignment.mjs'],
        subsystem: 'github-records',
        dependency: {
          baselineSha: 'c2ae3db785468fb496f2be1f54aca144e636b172',
          recordIds: [],
        },
        verification: { contractEpoch: 1, verifierIds: ['vc-6'] },
        worker,
        coordinator,
        grantId: originalGrant.grantId,
        epoch: 1,
      },
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
        subsystem: 'github-records',
        dependency: structuredClone(assignment.envelope.payload.dependency),
        verification: structuredClone(assignment.envelope.payload.verification),
        worker,
        result: { summary: 'fabricated work' },
      },
      actor: worker.actor,
      epoch: 1,
      grantId: originalGrant.grantId,
    },
    assignment.envelope.recordId
  );
  const disposition = record(
    {
      recordId: id(30),
      recordType: 'record-disposition',
      payload: {
        schema: 'aitm.record-disposition/v1',
        decision: 'accepted',
        issue,
        assignmentRecordId: assignment.envelope.recordId,
        assignmentCommentNodeId: assignment.commentNodeId,
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
  );
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
    disposition.envelope.recordId
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
  return {
    records: [root, assignment, submission, disposition, revocation, replacementRecord],
    replacement,
    replacementRecord,
  };
}

test('a predecessor without assign-work cannot create a replay adoption obligation', () => {
  for (const reverse of [false, true]) {
    const current = operationDeficientHistory();
    const records = reverse ? [...current.records].reverse() : current.records;
    assert.deepEqual(
      resolve(records, {
        ...current.replacement.coordinationProjection,
        adoptionState: 'adopted',
      }).status,
      'active'
    );
    const paused = resolve(records, current.replacement.coordinationProjection);
    assert.equal(
      adoptOutstandingSubmissions({
        authority: paused,
        snapshot: {
          repository,
          issue,
          expectedHeadRecordId: current.replacementRecord.envelope.recordId,
          records,
        },
      }).status,
      'blocked'
    );
  }
});
