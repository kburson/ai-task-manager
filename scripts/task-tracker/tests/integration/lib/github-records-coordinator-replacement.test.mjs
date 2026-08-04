// @story #1075
import { strict as assert } from 'node:assert';
import test from 'node:test';

import {
  authorizeCoordinatorAdoption,
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

function grant({
  grantId,
  coordinator: grantCoordinator,
  epoch,
  issuer = null,
  operations = ['advance', 'integrate'],
} = {}) {
  return {
    schema: 'aitm.coordinator-grant/v1',
    grantId,
    scope: { scopeRootIssue: 100, includedIssues: [101, 102], excludedIssues: [102] },
    coordinator: grantCoordinator,
    parentGrantId: null,
    issuer,
    epoch,
    operations,
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

function resolve({
  records,
  grants,
  revocations,
  coordinationProjection,
  onReplacementHistoryVisit,
}) {
  return resolveCoordinatorAuthority({
    issueHierarchy: hierarchy,
    records,
    grants,
    revocations,
    repository,
    issue,
    coordinationProjection,
    now: '2026-08-03T20:05:00.000Z',
    onReplacementHistoryVisit,
  });
}

test('accepted capsule history closes old authority and pauses replacement until explicit adoption', () => {
  const operations = ['advance', 'integrate', 'dispose-submission', 'adopt-submissions'];
  const originalGrant = grant({ grantId: 'grant-original', coordinator, epoch: 1, operations });
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
    operations,
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
    authorizeCoordinatorAdoption({
      authority: paused,
      repository,
      issue,
      operation: 'adopt-submissions',
      records: [replacementRecord, original, revocation],
    }).authorized,
    true
  );
  assert.equal(
    authorizeCoordinatorAdoption({
      authority: paused,
      repository,
      issue,
      operation: 'advance',
      branch: 'work/101',
    }).authorized,
    false
  );
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

test('a replacement capsule must retain the exact prior authority grant identifier', () => {
  const originalGrant = grant({ grantId: 'grant-original', coordinator, epoch: 1 });
  const original = capsule({
    recordId: id(21),
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
    recordId: id(22),
    predecessor: id(21),
    recordType: 'coordinator-revocation',
    payload: replacement.revocation,
    epoch: 1,
    grantId: id(9001),
    actor: coordinator.actor,
  });
  const forgedReplacement = capsule({
    recordId: id(23),
    predecessor: id(22),
    recordType: 'coordinator-grant',
    payload: replacementGrant,
    epoch: 1,
    grantId: id(9002),
    actor: coordinator.actor,
  });

  assert.deepEqual(
    resolve({
      records: [original, revocation, forgedReplacement],
      coordinationProjection: replacement.coordinationProjection,
    }),
    { status: 'blocked', diagnostic: { reason: 'invalid-replacement' } }
  );
});

test('a persisted nested delegation capsule must use its exact parent authority', () => {
  const parentGrant = grant({ grantId: 'grant-parent', coordinator, epoch: 1 });
  const parent = capsule({
    recordId: id(31),
    recordType: 'coordinator-grant',
    payload: parentGrant,
    epoch: 1,
    grantId: id(9001),
    actor: coordinator.actor,
  });
  const childGrant = {
    ...grant({
      grantId: 'grant-child',
      coordinator: replacementCoordinator,
      epoch: 1,
      issuer: coordinator,
    }),
    scope: { scopeRootIssue: 101, includedIssues: [], excludedIssues: [] },
    parentGrantId: 'grant-parent',
    operations: ['advance'],
    branchBoundary: ['work/101'],
    integrationBoundary: { sourceBranches: [], destinationBranches: [] },
  };
  const validChild = capsule({
    recordId: id(32),
    predecessor: id(31),
    recordType: 'coordinator-grant',
    payload: childGrant,
    epoch: 1,
    grantId: id(9001),
    actor: coordinator.actor,
  });
  const active = resolve({
    records: [parent, validChild],
    coordinationProjection: {
      schema: 'aitm.coordination-projection/v1',
      grantId: 'grant-child',
      epoch: 1,
      adoptionState: 'adopted',
    },
  });
  assert.equal(
    authorizeCoordinatorOperation({
      authority: active,
      grantId: 'grant-child',
      epoch: 1,
      coordinator: replacementCoordinator,
      issue: 101,
      operation: 'advance',
      branch: 'work/101',
    }).authorized,
    true
  );

  for (const [actor, epoch, grantId] of [
    ['attacker', 1, id(9001)],
    [coordinator.actor, 2, id(9001)],
    [coordinator.actor, 1, id(9002)],
  ]) {
    const forgedChild = capsule({
      recordId: id(32),
      predecessor: id(31),
      recordType: 'coordinator-grant',
      payload: childGrant,
      epoch,
      grantId,
      actor,
    });
    assert.deepEqual(
      resolve({
        records: [parent, forgedChild],
        coordinationProjection: {
          schema: 'aitm.coordination-projection/v1',
          grantId: 'grant-child',
          epoch: 1,
          adoptionState: 'adopted',
        },
      }),
      { status: 'blocked', diagnostic: { reason: 'invalid-delegation' } }
    );
  }
});

test('a persisted nested coordinator replacement pauses and resumes under its original parent authority', () => {
  const parentGrant = grant({ grantId: 'grant-parent', coordinator, epoch: 1 });
  const parent = capsule({
    recordId: id(41),
    recordType: 'coordinator-grant',
    payload: parentGrant,
    epoch: 1,
    grantId: id(9001),
    actor: coordinator.actor,
  });
  const childGrant = {
    ...grant({
      grantId: 'grant-child',
      coordinator: replacementCoordinator,
      epoch: 1,
      issuer: coordinator,
    }),
    scope: { scopeRootIssue: 101, includedIssues: [], excludedIssues: [] },
    parentGrantId: 'grant-parent',
    operations: ['advance'],
    branchBoundary: ['work/101'],
    integrationBoundary: { sourceBranches: [], destinationBranches: [] },
  };
  const child = capsule({
    recordId: id(42),
    predecessor: id(41),
    recordType: 'coordinator-grant',
    payload: childGrant,
    epoch: 1,
    grantId: id(9001),
    actor: coordinator.actor,
  });
  const childAuthority = resolve({
    records: [parent, child],
    coordinationProjection: {
      schema: 'aitm.coordination-projection/v1',
      grantId: 'grant-child',
      epoch: 1,
      adoptionState: 'adopted',
    },
  });
  const successorGrant = {
    ...childGrant,
    grantId: 'grant-child-successor',
    coordinator: { actor: 'gemini', platform: 'gemini', session: 'successor-session' },
    epoch: 2,
    issuer: replacementCoordinator,
  };
  const replacement = replaceCoordinator({
    authority: childAuthority,
    expectedGrantId: 'grant-child',
    expectedEpoch: 1,
    replacementGrant: successorGrant,
  });
  const revocation = capsule({
    recordId: id(43),
    predecessor: id(42),
    recordType: 'coordinator-revocation',
    payload: replacement.revocation,
    epoch: 1,
    grantId: id(9001),
    actor: replacementCoordinator.actor,
  });
  const successor = capsule({
    recordId: id(44),
    predecessor: id(43),
    recordType: 'coordinator-grant',
    payload: successorGrant,
    epoch: 1,
    grantId: id(9001),
    actor: replacementCoordinator.actor,
  });
  const records = [parent, child, revocation, successor];

  assert.deepEqual(
    resolve({ records, coordinationProjection: replacement.coordinationProjection }),
    {
      status: 'paused',
      diagnostic: { reason: 'adoption-required' },
    }
  );
  const adopted = resolve({
    records,
    coordinationProjection: { ...replacement.coordinationProjection, adoptionState: 'adopted' },
  });
  assert.equal(
    authorizeCoordinatorOperation({
      authority: adopted,
      grantId: 'grant-child-successor',
      epoch: 2,
      coordinator: successorGrant.coordinator,
      issue: 101,
      operation: 'advance',
      branch: 'work/101',
    }).authorized,
    true
  );

  const forgedSuccessor = capsule({
    recordId: id(44),
    predecessor: id(43),
    recordType: 'coordinator-grant',
    payload: successorGrant,
    epoch: 1,
    grantId: id(9002),
    actor: replacementCoordinator.actor,
  });
  assert.deepEqual(
    resolve({
      records: [parent, child, revocation, forgedSuccessor],
      coordinationProjection: replacement.coordinationProjection,
    }),
    { status: 'blocked', diagnostic: { reason: 'invalid-replacement' } }
  );
});

test('bounds a 10k replacement history before rejecting overlong nested delegation', () => {
  const parentGrant = grant({ grantId: 'grant-parent', coordinator, epoch: 1 });
  const initialChild = {
    ...grant({
      grantId: 'grant-child-1',
      coordinator: replacementCoordinator,
      epoch: 1,
      issuer: coordinator,
    }),
    scope: { scopeRootIssue: 101, includedIssues: [], excludedIssues: [] },
    parentGrantId: 'grant-parent',
    operations: ['advance'],
    branchBoundary: ['work/101'],
    integrationBoundary: { sourceBranches: [], destinationBranches: [] },
  };
  const grants = [parentGrant, initialChild];
  const revocations = [];
  let predecessor = initialChild;
  for (let epoch = 2; epoch <= 10001; epoch += 1) {
    const successor = {
      ...predecessor,
      grantId: `grant-child-${epoch}`,
      epoch,
      issuer: predecessor.coordinator,
    };
    grants.push(successor);
    revocations.push({
      schema: 'aitm.coordinator-revocation/v1',
      grantId: predecessor.grantId,
      epoch: predecessor.epoch,
      state: 'replaced',
      replacementGrantId: successor.grantId,
    });
    predecessor = successor;
  }
  const startedAt = performance.now();

  assert.deepEqual(
    resolve({
      grants,
      revocations,
      coordinationProjection: {
        schema: 'aitm.coordination-projection/v1',
        grantId: predecessor.grantId,
        epoch: predecessor.epoch,
        adoptionState: 'adopted',
      },
    }),
    { status: 'blocked', diagnostic: { reason: 'delegation-depth' } }
  );
  assert.ok(performance.now() - startedAt < 3000);
});

test('ignores unknown resolver callbacks so validation cannot be raced', () => {
  const original = grant({ grantId: 'grant-original', coordinator, epoch: 1 });
  const successor = {
    ...grant({
      grantId: 'grant-successor',
      coordinator: replacementCoordinator,
      epoch: 2,
      issuer: coordinator,
    }),
    operations: ['advance'],
    branchBoundary: ['work/101'],
    integrationBoundary: { sourceBranches: [], destinationBranches: [] },
  };
  const expectedSuccessor = structuredClone(successor);
  let callbackCalls = 0;
  const authority = resolve({
    grants: [original, successor],
    revocations: [
      {
        schema: 'aitm.coordinator-revocation/v1',
        grantId: 'grant-original',
        epoch: 1,
        state: 'replaced',
        replacementGrantId: 'grant-successor',
      },
    ],
    coordinationProjection: {
      schema: 'aitm.coordination-projection/v1',
      grantId: 'grant-successor',
      epoch: 2,
      adoptionState: 'adopted',
    },
    onReplacementHistoryVisit: () => {
      callbackCalls += 1;
      successor.coordinator = { actor: 'attacker', platform: 'attacker', session: 'attacker' };
      successor.operations.push('integrate');
      successor.branchBoundary.push('epic/100');
      successor.integrationBoundary = {
        sourceBranches: ['work/101'],
        destinationBranches: ['epic/100'],
      };
    },
  });

  assert.equal(callbackCalls, 0);
  assert.deepEqual(successor, expectedSuccessor);
  assert.equal(
    authorizeCoordinatorOperation({
      authority,
      grantId: 'grant-successor',
      epoch: 2,
      coordinator: replacementCoordinator,
      issue: 101,
      operation: 'advance',
      branch: 'work/101',
    }).authorized,
    true
  );
  assert.equal(
    authorizeCoordinatorOperation({
      authority,
      grantId: 'grant-successor',
      epoch: 2,
      coordinator: { actor: 'attacker', platform: 'attacker', session: 'attacker' },
      issue: 101,
      operation: 'integrate',
      branch: 'epic/100',
      integration: { sourceBranch: 'work/101', destinationBranch: 'epic/100' },
    }).authorized,
    false
  );
});
