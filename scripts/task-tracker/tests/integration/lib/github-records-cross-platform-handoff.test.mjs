// @story #1077
import { strict as assert } from 'node:assert';
import test from 'node:test';

import {
  replaceCoordinator,
  resolveCoordinatorAuthority,
} from '../../../lib/github-records/coordination-authority.mjs';
import { resolveSupersession } from '../../../lib/github-records/capsule-chain.mjs';
import { createAitmRecordEnvelope } from '../../../lib/github-records/record-envelope.mjs';
import {
  acceptSubmission,
  adoptOutstandingSubmissions,
  createWorkAssignment,
  evaluateAssignment,
} from '../../../lib/github-records/work-assignment.mjs';

const repository = 'kburson/ai-task-manager';
const issue = 1077;
const branch = 'feature/child/1077';

function id(number) {
  return `01J0000000000000000000${String(number).padStart(4, '0')}`;
}

function identity(platform, role) {
  return { actor: `${platform}/${role}-1077`, platform, session: `${role}-1077` };
}

function grant({ grantId, coordinator, epoch, issuer = null }) {
  return {
    schema: 'aitm.coordinator-grant/v1',
    grantId,
    scope: { scopeRootIssue: issue, includedIssues: [], excludedIssues: [] },
    coordinator,
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

function capsule({ number, predecessor = null, recordType, payload, actor, epoch, grantId }) {
  return Object.freeze({
    commentNodeId: `IC_kwDOHandoff${String(number).padStart(4, '0')}`,
    envelope: createAitmRecordEnvelope({
      recordId: id(number),
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

function resolve(records, coordinationProjection) {
  return resolveCoordinatorAuthority({
    issueHierarchy: [{ issue, parentIssue: null }],
    records,
    repository,
    issue,
    coordinationProjection,
    now: '2026-08-03T20:05:00.000Z',
  });
}

function runFlow({ coordinatorPlatform, workerPlatform, replacementPlatform, offset }) {
  const coordinator = identity(coordinatorPlatform, 'coordinator');
  const worker = identity(workerPlatform, 'worker');
  const replacementCoordinator = identity(replacementPlatform, 'replacement');
  const originalGrant = grant({ grantId: id(offset + 90), coordinator, epoch: 1 });
  const root = capsule({
    number: offset + 1,
    recordType: 'coordinator-grant',
    payload: originalGrant,
    actor: coordinator.actor,
    epoch: 1,
    grantId: id(offset + 89),
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
    dependency: {
      baselineSha: 'c2ae3db785468fb496f2be1f54aca144e636b172',
      recordIds: [root.envelope.recordId],
    },
    verification: { contractEpoch: 1, verifierIds: ['vc-6'] },
    worker,
  });
  const assignment = capsule({
    number: offset + 2,
    predecessor: root.envelope.recordId,
    recordType: assignmentCandidate.recordType,
    payload: assignmentCandidate.payload,
    actor: coordinator.actor,
    epoch: 1,
    grantId: originalGrant.grantId,
  });
  const submission = capsule({
    number: offset + 3,
    predecessor: assignment.envelope.recordId,
    recordType: workerPlatform === 'codex' ? 'execution-result' : 'verification-evidence',
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
      result: { platform: workerPlatform, outcome: 'passed' },
    },
    actor: worker.actor,
    epoch: 1,
    grantId: originalGrant.grantId,
  });
  const activeWithWork = resolve([root, assignment, submission], {
    schema: 'aitm.coordination-projection/v1',
    grantId: originalGrant.grantId,
    epoch: 1,
    adoptionState: 'adopted',
  });
  const beforeDisposition = evaluateAssignment({
    assignment,
    submission,
    authority: activeWithWork,
  });
  assert.equal(beforeDisposition.status, 'matched');
  assert.equal(Object.hasOwn(beforeDisposition, 'accepted'), false);

  const replacementGrant = grant({
    grantId: id(offset + 91),
    coordinator: replacementCoordinator,
    epoch: 2,
    issuer: coordinator,
  });
  const replacement = replaceCoordinator({
    authority: activeWithWork,
    expectedGrantId: originalGrant.grantId,
    expectedEpoch: 1,
    replacementGrant,
  });
  assert.throws(
    () => acceptSubmission({ assignment, submission, authority: activeWithWork }),
    /work-assignment:authority/
  );
  const revocation = capsule({
    number: offset + 4,
    predecessor: submission.envelope.recordId,
    recordType: 'coordinator-revocation',
    payload: replacement.revocation,
    actor: coordinator.actor,
    epoch: 1,
    grantId: root.envelope.authority.grantId,
  });
  const replacementRecord = capsule({
    number: offset + 5,
    predecessor: revocation.envelope.recordId,
    recordType: 'coordinator-grant',
    payload: replacementGrant,
    actor: coordinator.actor,
    epoch: 1,
    grantId: root.envelope.authority.grantId,
  });
  const persisted = [root, assignment, submission, revocation, replacementRecord];
  const paused = resolve([...persisted].reverse(), replacement.coordinationProjection);
  const dispositionCandidate = acceptSubmission({ assignment, submission, authority: paused });
  const disposition = capsule({
    number: offset + 6,
    predecessor: replacementRecord.envelope.recordId,
    recordType: dispositionCandidate.recordType,
    payload: dispositionCandidate.payload,
    actor: replacementCoordinator.actor,
    epoch: 2,
    grantId: replacementGrant.grantId,
  });
  const completeRecords = [...persisted, disposition];
  const permutations = [
    completeRecords,
    [...completeRecords].reverse(),
    [submission, replacementRecord, root, disposition, assignment, revocation],
  ];
  assert.deepEqual(
    adoptOutstandingSubmissions({
      authority: paused,
      snapshot: {
        repository,
        issue,
        expectedHeadRecordId: disposition.envelope.recordId,
        records: completeRecords,
      },
    }),
    { status: 'blocked', diagnostic: { reason: 'authority' } }
  );
  const adoptions = permutations.map((records) =>
    adoptOutstandingSubmissions({
      authority: resolve(records, replacement.coordinationProjection),
      snapshot: {
        repository,
        issue,
        expectedHeadRecordId: disposition.envelope.recordId,
        records,
      },
    })
  );
  const [adoption] = adoptions;
  assert.deepEqual(adoptions[1], adoption);
  assert.deepEqual(adoptions[2], adoption);
  const foreignRepository = completeRecords.map((record) => ({
    ...record,
    envelope: { ...record.envelope, repository: 'foreign/repository' },
  }));
  assert.deepEqual(
    adoptOutstandingSubmissions({
      authority: paused,
      snapshot: {
        repository: 'foreign/repository',
        issue,
        expectedHeadRecordId: disposition.envelope.recordId,
        records: foreignRepository,
      },
    }),
    { status: 'blocked', diagnostic: { reason: 'authority' } }
  );
  const mixedRepository = [...completeRecords];
  mixedRepository[1] = foreignRepository[1];
  assert.deepEqual(
    adoptOutstandingSubmissions({
      authority: resolve(completeRecords, replacement.coordinationProjection),
      snapshot: {
        repository,
        issue,
        expectedHeadRecordId: disposition.envelope.recordId,
        records: mixedRepository,
      },
    }),
    { status: 'blocked', diagnostic: { reason: 'authority' } }
  );
  assert.deepEqual(adoption.acceptedSubmissionRecordIds, [submission.envelope.recordId]);
  assert.equal(disposition.envelope.payload.assignmentCommentNodeId, assignment.commentNodeId);
  assert.equal(disposition.envelope.payload.submissionCommentNodeId, submission.commentNodeId);
  const chain = resolveSupersession({
    records: [...completeRecords].reverse(),
    repository,
    issue,
  });
  assert.equal(chain.effectiveRecords.length, 6);
  return adoption;
}

test('preserves exact provenance for Codex-to-Claude and Claude-to-Codex handoff', () => {
  const first = runFlow({
    coordinatorPlatform: 'claude',
    workerPlatform: 'codex',
    replacementPlatform: 'claude',
    offset: 0,
  });
  const second = runFlow({
    coordinatorPlatform: 'codex',
    workerPlatform: 'claude',
    replacementPlatform: 'codex',
    offset: 100,
  });
  assert.equal(first.status, 'ready-to-adopt');
  assert.equal(second.status, 'ready-to-adopt');
});
