// @story #1077
import { strict as assert } from 'node:assert';
import test from 'node:test';

import {
  replaceCoordinator,
  resolveCoordinatorAuthority,
} from '../../../../lib/github-records/coordination-authority.mjs';
import { createAitmRecordEnvelope } from '../../../../lib/github-records/record-envelope.mjs';
import { adoptOutstandingSubmissions } from '../../../../lib/github-records/work-assignment.mjs';

const repository = 'kburson/ai-task-manager';
const issue = 1077;
const branch = 'feature/child/1077';
const coordinator = { actor: 'claude/coordinator', platform: 'claude', session: 'boundary' };
const replacementCoordinator = {
  actor: 'codex/replacement',
  platform: 'codex',
  session: 'boundary',
};
const worker = { actor: 'codex/worker', platform: 'codex', session: 'boundary' };

function id(number) {
  return `01J0000000000000000005${String(number).padStart(4, '0')}`;
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
    operations: ['assign-work', 'dispose-submission', 'adopt-submissions'],
    branchBoundary: [branch],
    integrationBoundary: { sourceBranches: [], destinationBranches: [] },
    activatedAt: '2026-08-03T20:00:00.000Z',
    expiresAt: null,
  };
}

function record({ recordId, recordType, payload, actor, epoch, grantId }, predecessor = null) {
  return Object.freeze({
    commentNodeId: `IC_kwDOBoundary${recordId.slice(-4)}`,
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

function zeroOutstandingHistory() {
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
    root.envelope.recordId
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
  return { records: [root, revocation, replacementRecord], replacement, replacementRecord };
}

function adopt(authority, records, expectedHeadRecordId) {
  return adoptOutstandingSubmissions({
    authority,
    snapshot: { repository, issue, expectedHeadRecordId, records },
  });
}

test('a lifecycle capsule appended after the paused head blocks adoption', () => {
  const current = zeroOutstandingHistory();
  const lifecycle = record(
    {
      recordId: id(42),
      recordType: 'lifecycle-transition',
      payload: { kind: 'lifecycle-transition', result: 'must not extend adoption authority' },
      actor: replacementCoordinator.actor,
      epoch: 2,
      grantId: id(9002),
    },
    current.replacementRecord.envelope.recordId
  );
  const records = [...current.records, lifecycle];
  for (const inputRecords of [records, [...records].reverse()]) {
    assert.deepEqual(
      resolve(inputRecords, {
        ...current.replacement.coordinationProjection,
        adoptionState: 'adopted',
      }),
      { status: 'paused', diagnostic: { reason: 'adoption-required' } }
    );
    const paused = resolve(inputRecords, current.replacement.coordinationProjection);
    assert.deepEqual(adopt(paused, inputRecords, lifecycle.envelope.recordId), {
      status: 'blocked',
      diagnostic: { reason: 'authority' },
    });
  }
});

test('an unrelated orphan submission is ignored consistently by replay and adoption', () => {
  const current = zeroOutstandingHistory();
  const orphanSubmission = record(
    {
      recordId: id(42),
      recordType: 'execution-result',
      payload: {
        schema: 'aitm.worker-submission/v1',
        status: 'submitted',
        assignmentRecordId: id(70),
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
        result: { summary: 'unrelated submission' },
      },
      actor: worker.actor,
      epoch: 1,
      grantId: id(9001),
    },
    current.replacementRecord.envelope.recordId
  );
  const records = [...current.records, orphanSubmission];
  for (const inputRecords of [records, [...records].reverse()]) {
    assert.equal(
      resolve(inputRecords, {
        ...current.replacement.coordinationProjection,
        adoptionState: 'adopted',
      }).status,
      'active'
    );
    const paused = resolve(inputRecords, current.replacement.coordinationProjection);
    assert.deepEqual(adopt(paused, inputRecords, orphanSubmission.envelope.recordId), {
      status: 'ready-to-adopt',
      coordinationProjection: {
        ...current.replacement.coordinationProjection,
        adoptionState: 'adopted',
      },
      acceptedSubmissionRecordIds: [],
      rejectedSubmissionRecordIds: [],
    });
  }
});
