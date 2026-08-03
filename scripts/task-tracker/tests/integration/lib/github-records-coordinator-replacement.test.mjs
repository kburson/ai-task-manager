// @story #1075
import { strict as assert } from 'node:assert';
import test from 'node:test';

import {
  authorizeCoordinatorOperation,
  replaceCoordinator,
  resolveCoordinatorAuthority,
} from '../../../lib/github-records/coordination-authority.mjs';
import { createAitmRecordEnvelope } from '../../../lib/github-records/record-envelope.mjs';

const repository = 'kburson/ai-task-manager';
const issue = 100;
const coordinator = { actor: 'codex', platform: 'codex', session: 'parent-session' };
const replacementCoordinator = {
  actor: 'claude',
  platform: 'claude',
  session: 'replacement-session',
};
const hierarchy = [
  { issue: 100, parentIssue: null },
  { issue: 101, parentIssue: 100 },
  { issue: 102, parentIssue: 100 },
];

function id(number) {
  return `01J0000000000000000000${String(number).padStart(4, '0')}`;
}

function grant({ grantId, coordinator: grantCoordinator, epoch, issuer = null } = {}) {
  return {
    schema: 'aitm.coordinator-grant/v1',
    grantId,
    scope: { scopeRootIssue: 100, includedIssues: [101, 102], excludedIssues: [102] },
    coordinator: grantCoordinator,
    parentGrantId: null,
    issuer,
    epoch,
    operations: ['advance', 'integrate'],
    branchBoundary: ['epic/100', 'work/101'],
    integrationBoundary: { sourceBranches: ['work/101'], destinationBranches: ['epic/100'] },
    activatedAt: '2026-08-03T20:00:00.000Z',
    expiresAt: null,
  };
}

function capsule({ recordId, predecessor = null, recordType, payload, epoch, grantId, actor }) {
  return Object.freeze({
    commentNodeId: `IC_kwDOCoordinator${recordId.slice(-4)}`,
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
      supersedes: null,
      createdAt: '2026-08-03T20:00:00.000Z',
    }),
  });
}

function resolve({ records, coordinationProjection }) {
  return resolveCoordinatorAuthority({
    issueHierarchy: hierarchy,
    records,
    repository,
    issue,
    coordinationProjection,
    now: '2026-08-03T20:05:00.000Z',
  });
}

test('accepted capsule history closes old authority and pauses replacement until explicit adoption', () => {
  const originalGrant = grant({ grantId: 'grant-original', coordinator, epoch: 1 });
  const original = capsule({
    recordId: id(1),
    recordType: 'coordinator-grant',
    payload: originalGrant,
    epoch: 1,
    grantId: id(9001),
    actor: coordinator.actor,
  });
  const initial = resolve({
    records: [original],
    coordinationProjection: {
      schema: 'aitm.coordination-projection/v1',
      grantId: 'grant-original',
      epoch: 1,
      adoptionState: 'adopted',
    },
  });
  const replacementGrant = grant({
    grantId: 'grant-replacement',
    coordinator: replacementCoordinator,
    epoch: 2,
    issuer: coordinator,
  });
  const replacement = replaceCoordinator({
    authority: initial,
    expectedGrantId: 'grant-original',
    expectedEpoch: 1,
    replacementGrant,
  });
  const revocation = capsule({
    recordId: id(2),
    predecessor: id(1),
    recordType: 'coordinator-revocation',
    payload: replacement.revocation,
    epoch: 1,
    grantId: id(9001),
    actor: coordinator.actor,
  });
  const replacementRecord = capsule({
    recordId: id(3),
    predecessor: id(2),
    recordType: 'coordinator-grant',
    payload: replacementGrant,
    epoch: 1,
    grantId: id(9001),
    actor: coordinator.actor,
  });
  const paused = resolve({
    records: [replacementRecord, original, revocation],
    coordinationProjection: replacement.coordinationProjection,
  });

  assert.deepEqual(paused, { status: 'paused', diagnostic: { reason: 'adoption-required' } });
  assert.equal(
    authorizeCoordinatorOperation({
      authority: paused,
      grantId: 'grant-original',
      epoch: 1,
      coordinator,
      issue: 101,
      operation: 'advance',
      branch: 'work/101',
    }).authorized,
    false
  );
  const adopted = resolve({
    records: [original, revocation, replacementRecord],
    coordinationProjection: {
      schema: 'aitm.coordination-projection/v1',
      grantId: 'grant-replacement',
      epoch: 2,
      adoptionState: 'adopted',
    },
  });
  assert.equal(
    authorizeCoordinatorOperation({
      authority: adopted,
      grantId: 'grant-replacement',
      epoch: 2,
      coordinator: replacementCoordinator,
      issue: 101,
      operation: 'integrate',
      branch: 'epic/100',
      integration: { sourceBranch: 'work/101', destinationBranch: 'epic/100' },
    }).authorized,
    true
  );
  assert.equal(
    authorizeCoordinatorOperation({
      authority: adopted,
      grantId: 'grant-replacement',
      epoch: 2,
      coordinator: replacementCoordinator,
      issue: 102,
      operation: 'advance',
      branch: 'work/101',
    }).authorized,
    false
  );
});

test('a replacement capsule must retain old coordinator provenance and its exact prior epoch', () => {
  const originalGrant = grant({ grantId: 'grant-original', coordinator, epoch: 1 });
  const original = capsule({
    recordId: id(11),
    recordType: 'coordinator-grant',
    payload: originalGrant,
    epoch: 1,
    grantId: id(9001),
    actor: coordinator.actor,
  });
  const initial = resolve({
    records: [original],
    coordinationProjection: {
      schema: 'aitm.coordination-projection/v1',
      grantId: 'grant-original',
      epoch: 1,
      adoptionState: 'adopted',
    },
  });
  const replacementGrant = grant({
    grantId: 'grant-replacement',
    coordinator: replacementCoordinator,
    epoch: 2,
    issuer: coordinator,
  });
  const replacement = replaceCoordinator({
    authority: initial,
    expectedGrantId: 'grant-original',
    expectedEpoch: 1,
    replacementGrant,
  });
  const revocation = capsule({
    recordId: id(12),
    predecessor: id(11),
    recordType: 'coordinator-revocation',
    payload: replacement.revocation,
    epoch: 1,
    grantId: id(9001),
    actor: coordinator.actor,
  });
  const forgedReplacement = capsule({
    recordId: id(13),
    predecessor: id(12),
    recordType: 'coordinator-grant',
    payload: replacementGrant,
    epoch: 7,
    grantId: id(9002),
    actor: replacementCoordinator.actor,
  });

  assert.deepEqual(
    resolve({
      records: [original, revocation, forgedReplacement],
      coordinationProjection: replacement.coordinationProjection,
    }),
    { status: 'blocked', diagnostic: { reason: 'invalid-replacement' } }
  );
});
