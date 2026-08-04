// @story #1075
import { strict as assert } from 'node:assert';
import test from 'node:test';

import {
  authorizeCoordinatorAdoption as authorizeAdoption,
  authorizeCoordinatorOperation,
  grantNestedEpic,
  replaceCoordinator,
  resolveCoordinatorAuthority,
} from '../../../../lib/github-records/coordination-authority.mjs';
import { createAitmRecordEnvelope } from '../../../../lib/github-records/record-envelope.mjs';

const coordinator = Object.freeze({ actor: 'codex', platform: 'codex', session: 'session-parent' });
const nestedCoordinator = Object.freeze({
  actor: 'claude',
  platform: 'claude',
  session: 'session-nested',
});

const hierarchy = Object.freeze([
  Object.freeze({ issue: 100, parentIssue: null }),
  Object.freeze({ issue: 101, parentIssue: 100 }),
  Object.freeze({ issue: 102, parentIssue: 100 }),
  Object.freeze({ issue: 103, parentIssue: 102 }),
  Object.freeze({ issue: 104, parentIssue: 100 }),
  Object.freeze({ issue: 200, parentIssue: null }),
]);

function recordId(number) {
  return `01J0000000000000000000${String(number).padStart(4, '0')}`;
}

function grant({
  grantId = 'grant-parent',
  scopeRootIssue = 100,
  includedIssues = [101, 102, 103, 104],
  excludedIssues = [104],
  coordinator: grantCoordinator = coordinator,
  parentGrantId = null,
  issuer = null,
  epoch = 1,
  operations = ['advance', 'integrate'],
  branchBoundary = ['epic/100', 'epic/100/nested-102', 'work/101', 'work/103'],
  integrationBoundary = {
    sourceBranches: ['work/101', 'work/103'],
    destinationBranches: ['epic/100', 'epic/100/nested-102'],
  },
  activatedAt = '2026-08-03T20:00:00.000Z',
  expiresAt = null,
} = {}) {
  return {
    schema: 'aitm.coordinator-grant/v1',
    grantId,
    scope: { scopeRootIssue, includedIssues, excludedIssues },
    coordinator: grantCoordinator,
    parentGrantId,
    issuer,
    epoch,
    operations,
    branchBoundary,
    integrationBoundary,
    activatedAt,
    expiresAt,
  };
}

function projection({ grantId = 'grant-parent', epoch = 1, adoptionState = 'adopted' } = {}) {
  return { schema: 'aitm.coordination-projection/v1', grantId, epoch, adoptionState };
}

function resolve({
  grants = [grant()],
  revocations = [],
  coordinationProjection = projection(),
  now,
} = {}) {
  return resolveCoordinatorAuthority({
    issueHierarchy: hierarchy,
    grants,
    revocations,
    coordinationProjection,
    now: now ?? '2026-08-03T20:05:00.000Z',
  });
}

function authorize(authority, overrides = {}) {
  return authorizeCoordinatorOperation({
    authority,
    grantId: 'grant-parent',
    epoch: 1,
    coordinator,
    issue: 101,
    operation: 'advance',
    branch: 'work/101',
    ...overrides,
  });
}

test('resolves only explicit epic and standalone issue scopes, with exclusions winning', () => {
  const epic = resolve();
  const standalone = resolve({
    grants: [
      grant({
        grantId: 'grant-standalone',
        scopeRootIssue: 200,
        includedIssues: [],
        excludedIssues: [],
        branchBoundary: ['issue/200'],
        integrationBoundary: { sourceBranches: [], destinationBranches: [] },
      }),
    ],
    coordinationProjection: projection({ grantId: 'grant-standalone' }),
  });

  assert.deepEqual(epic.scopeIssueIds, [100, 101, 102, 103]);
  assert.deepEqual(standalone.scopeIssueIds, [200]);
  assert.equal(authorize(epic).authorized, true);
  for (const issue of [104, 200]) {
    assert.deepEqual(authorize(epic, { issue }), { authorized: false, reason: 'scope' });
  }
  assert.equal(
    authorizeCoordinatorOperation({
      authority: standalone,
      grantId: 'grant-standalone',
      epoch: 1,
      coordinator,
      issue: 200,
      operation: 'advance',
      branch: 'issue/200',
    }).authorized,
    true
  );
});

test('blocks a forked coordinator capsule chain without selecting a grant by input order', () => {
  const root = createAitmRecordEnvelope({
    recordId: recordId(1),
    recordType: 'coordinator-grant',
    repository: 'kburson/ai-task-manager',
    issue: 100,
    payload: grant(),
    actor: coordinator.actor,
    epoch: 1,
    grantId: recordId(9001),
    createdAt: '2026-08-03T20:00:00.000Z',
  });
  const sibling = (number) =>
    createAitmRecordEnvelope({
      recordId: recordId(number),
      recordType: 'coordinator-grant',
      repository: 'kburson/ai-task-manager',
      issue: 100,
      payload: grant({ grantId: `grant-${number}` }),
      actor: coordinator.actor,
      epoch: 1,
      grantId: recordId(9001),
      predecessor: recordId(1),
      createdAt: '2026-08-03T20:00:00.000Z',
    });
  const first = Object.freeze({ commentNodeId: 'IC_kwDOForkRoot', envelope: root });
  const second = Object.freeze({ commentNodeId: 'IC_kwDOForkFirst', envelope: sibling(2) });
  const third = Object.freeze({ commentNodeId: 'IC_kwDOForkSecond', envelope: sibling(3) });

  for (const records of [
    [first, second, third],
    [third, second, first],
  ]) {
    assert.deepEqual(
      resolveCoordinatorAuthority({
        issueHierarchy: hierarchy,
        records,
        repository: 'kburson/ai-task-manager',
        issue: 100,
        coordinationProjection: projection(),
        now: '2026-08-03T20:05:00.000Z',
      }),
      { status: 'blocked', diagnostic: { reason: 'forked-capsule-history' } }
    );
  }
});

test('authorizes operations only when exact identity, scope, operation, and normalized bounds agree', () => {
  const authority = resolve();
  const allowedIntegration = authorize(authority, {
    operation: 'integrate',
    issue: 103,
    branch: 'epic/100/nested-102',
    integration: { sourceBranch: 'work/103', destinationBranch: 'epic/100/nested-102' },
  });
  assert.equal(allowedIntegration.authorized, true);

  for (const overrides of [
    { grantId: 'other-grant' },
    { epoch: 2 },
    { coordinator: nestedCoordinator },
    { operation: 'review' },
    { branch: 'work/101/escape' },
    {
      operation: 'integrate',
      integration: { sourceBranch: 'work/103/escape', destinationBranch: 'epic/100' },
    },
    {
      operation: 'integrate',
      integration: { sourceBranch: 'work/103', destinationBranch: 'epic/100/escape' },
    },
  ]) {
    assert.equal(authorize(authority, overrides).authorized, false);
  }
});

test('delegates a nested epic only as a strict subset of the active parent grant', () => {
  const parent = resolve();
  const child = grant({
    grantId: 'grant-nested',
    scopeRootIssue: 102,
    includedIssues: [103],
    excludedIssues: [],
    coordinator: nestedCoordinator,
    parentGrantId: 'grant-parent',
    issuer: coordinator,
    operations: ['advance'],
    branchBoundary: ['epic/100/nested-102', 'work/103'],
    integrationBoundary: {
      sourceBranches: ['work/103'],
      destinationBranches: ['epic/100/nested-102'],
    },
  });
  const delegated = grantNestedEpic({
    parentAuthority: parent,
    issueHierarchy: hierarchy,
    grant: child,
  });

  assert.deepEqual(delegated.scopeIssueIds, [102, 103]);
  assert.equal(Object.isFrozen(delegated.grant), true);
  assert.equal(
    authorizeCoordinatorOperation({
      authority: delegated.authority,
      grantId: 'grant-nested',
      epoch: 1,
      coordinator: nestedCoordinator,
      issue: 103,
      operation: 'advance',
      branch: 'work/103',
    }).authorized,
    true
  );
  for (const issue of [100, 101]) {
    assert.equal(
      authorizeCoordinatorOperation({
        authority: delegated.authority,
        grantId: 'grant-nested',
        epoch: 1,
        coordinator: nestedCoordinator,
        issue,
        operation: 'advance',
        branch: 'work/103',
      }).authorized,
      false
    );
  }
  for (const invalid of [
    { ...child, scope: { ...child.scope, scopeRootIssue: 100, includedIssues: [101] } },
    { ...child, scope: structuredClone(parent.grant.scope) },
    { ...child, operations: ['integrate', 'advance'] },
    {
      ...child,
      branchBoundary: ['epic/100', 'epic/100/nested-102', 'work/101', 'work/103'],
    },
    {
      ...child,
      branchBoundary: ['epic/100/nested-102', 'work/101', 'work/103'],
      integrationBoundary: {
        sourceBranches: ['work/101', 'work/103'],
        destinationBranches: ['epic/100/nested-102'],
      },
    },
    {
      ...child,
      branchBoundary: ['epic/100', 'epic/100/nested-102', 'work/103'],
      integrationBoundary: {
        sourceBranches: ['work/103'],
        destinationBranches: ['epic/100', 'epic/100/nested-102'],
      },
    },
  ]) {
    assert.throws(
      () => grantNestedEpic({ parentAuthority: parent, issueHierarchy: hierarchy, grant: invalid }),
      /coordination-authority:nested-scope/
    );
  }
});

test('resolves persisted nested delegation as a partitioned parent-child authority graph', () => {
  const parentGrant = grant();
  const childGrant = grant({
    grantId: 'grant-nested-persisted',
    scopeRootIssue: 102,
    includedIssues: [103],
    excludedIssues: [],
    coordinator: nestedCoordinator,
    parentGrantId: 'grant-parent',
    issuer: coordinator,
    operations: ['advance'],
    branchBoundary: ['epic/100/nested-102', 'work/103'],
    integrationBoundary: {
      sourceBranches: ['work/103'],
      destinationBranches: ['epic/100/nested-102'],
    },
  });
  const childAuthority = resolve({
    grants: [parentGrant, childGrant],
    coordinationProjection: projection({ grantId: childGrant.grantId }),
  });

  assert.deepEqual(childAuthority.scopeIssueIds, [102, 103]);
  assert.equal(
    authorizeCoordinatorOperation({
      authority: childAuthority,
      grantId: childGrant.grantId,
      epoch: 1,
      coordinator: nestedCoordinator,
      issue: 103,
      operation: 'advance',
      branch: 'work/103',
    }).authorized,
    true
  );
  assert.equal(
    authorizeCoordinatorOperation({
      authority: childAuthority,
      grantId: childGrant.grantId,
      epoch: 1,
      coordinator: nestedCoordinator,
      issue: 103,
      operation: 'advance',
      branch: 'work/101',
    }).authorized,
    false
  );

  const parentAuthority = resolve({
    grants: [parentGrant, childGrant],
    coordinationProjection: projection(),
  });
  assert.deepEqual(parentAuthority.scopeIssueIds, [100, 101]);
  assert.equal(authorize(parentAuthority).authorized, true);
  assert.equal(authorize(parentAuthority, { issue: 103, branch: 'work/103' }).authorized, false);

  const malformed = { ...childGrant, branchBoundary: [...parentGrant.branchBoundary] };
  assert.deepEqual(
    resolve({
      grants: [parentGrant, malformed],
      coordinationProjection: projection({ grantId: malformed.grantId }),
    }),
    { status: 'blocked', diagnostic: { reason: 'invalid-delegation' } }
  );

  const competingChild = {
    ...childGrant,
    grantId: 'grant-nested-competing',
    coordinator: { actor: 'gemini', platform: 'gemini', session: 'session-competing' },
  };
  assert.deepEqual(
    resolve({
      grants: [parentGrant, childGrant, competingChild],
      coordinationProjection: projection({ grantId: childGrant.grantId }),
    }),
    { status: 'blocked', diagnostic: { reason: 'overlapping-grants' } }
  );
});

test('cannot mint a competing child from a parent whose scope is already partitioned', () => {
  const parentGrant = grant();
  const existingChild = grant({
    grantId: 'grant-existing-child',
    scopeRootIssue: 102,
    includedIssues: [103],
    excludedIssues: [],
    coordinator: nestedCoordinator,
    parentGrantId: 'grant-parent',
    issuer: coordinator,
    operations: ['advance'],
    branchBoundary: ['epic/100/nested-102', 'work/103'],
    integrationBoundary: {
      sourceBranches: ['work/103'],
      destinationBranches: ['epic/100/nested-102'],
    },
  });
  const partitionedParent = resolve({ grants: [parentGrant, existingChild] });
  const competingChild = { ...existingChild, grantId: 'grant-competing-child' };

  assert.deepEqual(partitionedParent.scopeIssueIds, [100, 101]);
  assert.throws(
    () =>
      grantNestedEpic({
        parentAuthority: partitionedParent,
        issueHierarchy: hierarchy,
        grant: competingChild,
      }),
    /coordination-authority:nested-scope/
  );
});

test('blocks ambiguous, stale, revoked, expired, and projection-mismatched grant authority deterministically', () => {
  const overlap = grant({ grantId: 'grant-overlap', includedIssues: [101], excludedIssues: [] });
  const revoked = {
    schema: 'aitm.coordinator-revocation/v1',
    grantId: 'grant-parent',
    epoch: 1,
    state: 'revoked',
  };
  const expired = grant({ expiresAt: '2026-08-03T20:01:00.000Z' });
  const cases = [
    [{ grants: [grant(), overlap] }, { grants: [overlap, grant()] }, 'overlapping-grants'],
    [{ coordinationProjection: projection({ epoch: 2 }) }, undefined, 'stale-epoch'],
    [{ revocations: [revoked] }, undefined, 'revoked'],
    [{ grants: [expired] }, undefined, 'expired'],
    [
      { coordinationProjection: projection({ grantId: 'other-grant' }) },
      undefined,
      'projection-mismatch',
    ],
  ];

  for (const [first, second, reason] of cases) {
    assert.deepEqual(resolve(first), { status: 'blocked', diagnostic: { reason } });
    if (second !== undefined)
      assert.deepEqual(resolve(second), { status: 'blocked', diagnostic: { reason } });
  }
});

test('replaces only the exact active epoch, pauses authority, and resumes only after explicit adoption', () => {
  const authority = resolve();
  const replacementGrant = grant({
    grantId: 'grant-replacement',
    coordinator: nestedCoordinator,
    epoch: 2,
    parentGrantId: null,
    issuer: coordinator,
  });
  for (const invalid of [
    { ...replacementGrant, epoch: 1 },
    { ...replacementGrant, epoch: 3 },
  ]) {
    assert.throws(
      () =>
        replaceCoordinator({
          authority,
          expectedGrantId: 'grant-parent',
          expectedEpoch: 1,
          replacementGrant: invalid,
        }),
      /coordination-authority:replacement-epoch/
    );
  }
  assert.throws(
    () =>
      replaceCoordinator({
        authority,
        expectedGrantId: 'grant-parent',
        expectedEpoch: 1,
        replacementGrant: { ...replacementGrant, parentGrantId: 'other-parent' },
      }),
    /coordination-authority:replacement/
  );
  assert.equal(authorize(authority).authorized, true);
  const replacement = replaceCoordinator({
    authority,
    expectedGrantId: 'grant-parent',
    expectedEpoch: 1,
    replacementGrant,
  });

  assert.equal(authorize(authority).authorized, false);
  assert.throws(
    () =>
      grantNestedEpic({
        parentAuthority: authority,
        issueHierarchy: hierarchy,
        grant: grant({
          grantId: 'old-epoch-child',
          scopeRootIssue: 102,
          includedIssues: [103],
          excludedIssues: [],
          coordinator: nestedCoordinator,
          parentGrantId: 'grant-parent',
          issuer: coordinator,
          operations: ['advance'],
          branchBoundary: ['epic/100/nested-102', 'work/103'],
          integrationBoundary: {
            sourceBranches: ['work/103'],
            destinationBranches: ['epic/100/nested-102'],
          },
        }),
      }),
    /coordination-authority:nested-scope/
  );
  assert.throws(
    () =>
      replaceCoordinator({
        authority,
        expectedGrantId: 'grant-parent',
        expectedEpoch: 1,
        replacementGrant,
      }),
    /coordination-authority:stale-epoch/
  );

  assert.deepEqual(replacement.revocation, {
    schema: 'aitm.coordinator-revocation/v1',
    grantId: 'grant-parent',
    epoch: 1,
    state: 'replaced',
    replacementGrantId: 'grant-replacement',
  });
  assert.deepEqual(
    replacement.coordinationProjection,
    projection({ grantId: 'grant-replacement', epoch: 2, adoptionState: 'required' })
  );
  const paused = resolve({
    grants: [grant(), replacementGrant],
    revocations: [replacement.revocation],
    coordinationProjection: replacement.coordinationProjection,
  });
  assert.deepEqual(paused, { status: 'paused', diagnostic: { reason: 'adoption-required' } });
  assert.equal(authorizeAdoption({ authority: paused, operation: 'advance' }).authorized, false);

  const adopted = resolve({
    grants: [grant(), replacementGrant],
    revocations: [replacement.revocation],
    coordinationProjection: projection({ grantId: 'grant-replacement', epoch: 2 }),
  });
  assert.equal(
    authorizeCoordinatorOperation({
      authority: adopted,
      grantId: 'grant-replacement',
      epoch: 2,
      coordinator: nestedCoordinator,
      issue: 101,
      operation: 'advance',
      branch: 'work/101',
    }).authorized,
    true
  );
  assert.throws(
    () =>
      replaceCoordinator({
        authority,
        expectedGrantId: 'grant-parent',
        expectedEpoch: 2,
        replacementGrant,
      }),
    /coordination-authority:stale-epoch/
  );
});

test('replacement edges require complete old and new durable history with continuous authority', () => {
  const original = grant();
  const replacement = grant({
    grantId: 'grant-replacement',
    coordinator: nestedCoordinator,
    epoch: 2,
    issuer: coordinator,
  });
  const revocation = {
    schema: 'aitm.coordinator-revocation/v1',
    grantId: 'grant-parent',
    epoch: 1,
    state: 'replaced',
    replacementGrantId: 'grant-replacement',
  };

  for (const invalid of [
    { ...replacement, epoch: 7 },
    { ...replacement, issuer: nestedCoordinator },
    { ...replacement, parentGrantId: 'other-parent' },
  ]) {
    assert.deepEqual(
      resolve({
        grants: [original, invalid],
        revocations: [revocation],
        coordinationProjection: projection({
          grantId: 'grant-replacement',
          epoch: invalid.epoch,
          adoptionState: 'required',
        }),
      }),
      { status: 'blocked', diagnostic: { reason: 'invalid-replacement' } }
    );
  }
  assert.deepEqual(
    resolve({
      grants: [replacement],
      revocations: [revocation],
      coordinationProjection: projection({
        grantId: 'grant-replacement',
        epoch: 2,
        adoptionState: 'required',
      }),
    }),
    { status: 'blocked', diagnostic: { reason: 'invalid-replacement' } }
  );
});

test('blocks forked replacement histories even when the competing successor is expired', () => {
  const original = grant();
  const successorA = grant({
    grantId: 'grant-successor-a',
    coordinator: nestedCoordinator,
    epoch: 2,
    issuer: coordinator,
  });
  const successorB = grant({
    grantId: 'grant-successor-b',
    coordinator: { actor: 'gemini', platform: 'gemini', session: 'session-successor-b' },
    epoch: 2,
    issuer: coordinator,
    expiresAt: '2026-08-03T20:01:00.000Z',
  });
  const revocation = (replacementGrantId) => ({
    schema: 'aitm.coordinator-revocation/v1',
    grantId: 'grant-parent',
    epoch: 1,
    state: 'replaced',
    replacementGrantId,
  });
  const first = revocation('grant-successor-a');
  const second = revocation('grant-successor-b');

  for (const [grants, revocations] of [
    [
      [original, successorA, successorB],
      [first, second],
    ],
    [
      [successorB, original, successorA],
      [second, first],
    ],
  ]) {
    assert.deepEqual(
      resolve({
        grants,
        revocations,
        coordinationProjection: projection({ grantId: 'grant-successor-a', epoch: 2 }),
      }),
      { status: 'blocked', diagnostic: { reason: 'invalid-replacement' } }
    );
  }
});

test('fails closed when a nested replacement lineage exceeds the deterministic depth bound', () => {
  const parent = grant();
  const initialChild = grant({
    grantId: 'grant-child-1',
    scopeRootIssue: 102,
    includedIssues: [103],
    excludedIssues: [],
    coordinator: nestedCoordinator,
    parentGrantId: 'grant-parent',
    issuer: coordinator,
    operations: ['advance'],
    branchBoundary: ['epic/100/nested-102', 'work/103'],
    integrationBoundary: {
      sourceBranches: ['work/103'],
      destinationBranches: ['epic/100/nested-102'],
    },
  });
  const grants = [parent, initialChild],
    revocations = [];
  let predecessor = initialChild;
  for (let epoch = 2; epoch <= 130; epoch += 1) {
    const successor = {
      ...predecessor,
      grantId: `grant-child-${epoch}`,
      coordinator: { actor: `coordinator-${epoch}`, platform: 'test', session: `session-${epoch}` },
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

  const target = projection({ grantId: predecessor.grantId, epoch: predecessor.epoch });
  assert.deepEqual(
    resolve({
      grants,
      revocations,
      coordinationProjection: target,
    }),
    { status: 'blocked', diagnostic: { reason: 'delegation-depth' } }
  );
});

test('each completed resolution retires the prior authority generation for that epoch', () => {
  const beforeExpired = resolve();
  assert.deepEqual(resolve({ grants: [grant({ expiresAt: '2026-08-03T20:01:00.000Z' })] }), {
    status: 'blocked',
    diagnostic: { reason: 'expired' },
  });
  assert.equal(authorize(beforeExpired).authorized, false);

  const beforeOverlap = resolve();
  assert.deepEqual(
    resolve({
      grants: [
        grant(),
        grant({ grantId: 'grant-overlap', includedIssues: [101], excludedIssues: [] }),
      ],
    }),
    { status: 'blocked', diagnostic: { reason: 'overlapping-grants' } }
  );
  assert.equal(authorize(beforeOverlap).authorized, false);

  const beforeRefresh = resolve();
  const refreshed = resolve();
  assert.equal(authorize(beforeRefresh).authorized, false);
  assert.equal(authorize(refreshed).authorized, true);
});

test('a valid revocation replay retires a previously resolved authority capability', () => {
  const authority = resolve();
  const revocation = {
    schema: 'aitm.coordinator-revocation/v1',
    grantId: 'grant-parent',
    epoch: 1,
    state: 'revoked',
  };

  assert.deepEqual(resolve({ revocations: [revocation] }), {
    status: 'blocked',
    diagnostic: { reason: 'revoked' },
  });
  assert.equal(authorize(authority).authorized, false);
  assert.throws(
    () =>
      replaceCoordinator({
        authority,
        expectedGrantId: 'grant-parent',
        expectedEpoch: 1,
        replacementGrant: grant({
          grantId: 'revoked-replacement',
          coordinator: nestedCoordinator,
          epoch: 2,
          issuer: coordinator,
        }),
      }),
    /coordination-authority:stale-epoch/
  );
});

test('rejects opaque data and preserves caller inputs and immutable outputs', () => {
  const input = { grants: [grant()], revocations: [], coordinationProjection: projection() };
  const before = structuredClone(input);
  const result = resolve(input);

  assert.deepEqual(input, before);
  assert.equal(Object.isFrozen(result), true);
  assert.equal(Object.isFrozen(result.scopeIssueIds), true);
  assert.throws(() => resolve({ grants: [new Map()] }), /coordination-authority:grant/);
  assert.throws(
    () =>
      resolve({
        grants: [
          grant({
            integrationBoundary: { sourceBranches: ['work/101'], destinationBranches: 7 },
          }),
        ],
      }),
    /coordination-authority:grant/
  );
  assert.throws(
    () => resolve({ grants: [grant({ activatedAt: '2026-99-03T20:00:00.000Z' })] }),
    /coordination-authority:grant/
  );
  assert.deepEqual(
    authorizeCoordinatorOperation({
      authority: { status: 'active', grant: null, scopeIssueIds: [] },
      grantId: 'grant-parent',
      epoch: 1,
      coordinator,
      issue: 101,
      operation: 'advance',
      branch: 'work/101',
    }),
    { authorized: false, reason: 'authority' }
  );
  const forgedAuthority = {
    status: 'active',
    grant: structuredClone(result.grant),
    scopeIssueIds: [...result.scopeIssueIds],
  };
  assert.equal(authorize(forgedAuthority).authorized, false);
  assert.throws(
    () =>
      grantNestedEpic({
        parentAuthority: forgedAuthority,
        issueHierarchy: hierarchy,
        grant: grant({
          grantId: 'forged-child',
          scopeRootIssue: 102,
          includedIssues: [103],
          excludedIssues: [],
          coordinator: nestedCoordinator,
          parentGrantId: 'grant-parent',
          issuer: coordinator,
          operations: ['advance'],
          branchBoundary: ['epic/100/nested-102', 'work/103'],
          integrationBoundary: {
            sourceBranches: ['work/103'],
            destinationBranches: ['epic/100/nested-102'],
          },
        }),
      }),
    /coordination-authority:nested-scope/
  );
  assert.throws(
    () =>
      replaceCoordinator({
        authority: forgedAuthority,
        expectedGrantId: 'grant-parent',
        expectedEpoch: 1,
        replacementGrant: grant({
          grantId: 'forged-replacement',
          coordinator: nestedCoordinator,
          epoch: 2,
          issuer: coordinator,
        }),
      }),
    /coordination-authority:stale-epoch/
  );
  const accessorGrant = grant();
  Object.defineProperty(accessorGrant, 'epoch', { enumerable: true, get: () => 1 });
  assert.throws(() => resolve({ grants: [accessorGrant] }), /coordination-authority:grant/);
});
