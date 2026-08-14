// @story #1072
import { strict as assert } from 'node:assert';
import test from 'node:test';

import {
  createDraftContract,
  amendContract,
  sealContract,
  renderDeliveryContract,
  validateContractProjection,
} from '../../../../../task-tracker/lib/github-records/delivery-contract.mjs';

const recordId = '01J00000000000000000000000';
const coordinatorGrantId = '01J00000000000000000000001';

test('createDraftContract preserves stable logical IDs and renders unchecked definitions', () => {
  const contract = createDraftContract({
    recordId,
    authorityEpoch: 1,
    coordinatorGrantId,
    acceptanceCriteria: [{ logicalId: 'ac-login', text: 'Users can sign in.' }],
    verificationCommands: [{ logicalId: 'vc-unit', command: 'npm test' }],
    definitionOfDone: [{ logicalId: 'dod-review', text: 'Review is complete.' }],
  });

  assert.equal(contract.schema, 'aitm.delivery-contract/v1');
  assert.equal(contract.status, 'draft');
  assert.equal(contract.revision, 1);
  assert.equal(contract.contractEpoch, 1);
  assert.deepEqual(contract.acceptanceCriteria, [
    { logicalId: 'ac-login', text: 'Users can sign in.' },
  ]);
  assert.match(
    renderDeliveryContract({ contract }).markdown,
    /- \[ \] \[ac-login\] Users can sign in\./
  );
});

test('sealContract returns an immutable complete snapshot without claiming persistence', () => {
  const draft = createDraftContract({
    recordId,
    authorityEpoch: 1,
    coordinatorGrantId,
    acceptanceCriteria: [{ logicalId: 'ac-login', text: 'Users can sign in.' }],
    verificationCommands: [{ logicalId: 'vc-unit', command: 'npm test' }],
    definitionOfDone: [{ logicalId: 'dod-review', text: 'Review is complete.' }],
  });

  const sealed = sealContract({
    contract: draft,
    authorityEpoch: 1,
    coordinatorGrantId,
  });

  assert.equal(sealed.contract.status, 'sealed');
  assert.equal(sealed.contract.definitionHash, draft.definitionHash);
  assert.equal(sealed.contract.projectionHash, draft.projectionHash);
  assert.equal(Object.isFrozen(sealed.contract), true);
  assert.equal(Object.isFrozen(sealed.contract.acceptanceCriteria), true);
  assert.deepEqual(sealed.capsule, {
    recordType: 'contract-sealed',
    payload: sealed.contract,
  });
  assert.throws(
    () => sealContract({ contract: sealed.contract, authorityEpoch: 1, coordinatorGrantId }),
    /delivery-contract:already-sealed/
  );
  assert.throws(
    () => sealContract({ contract: draft, authorityEpoch: 2, coordinatorGrantId }),
    /delivery-contract:authority/
  );
  assert.throws(
    () =>
      sealContract({
        contract: createDraftContract({
          recordId,
          authorityEpoch: 1,
          coordinatorGrantId,
          acceptanceCriteria: [],
          verificationCommands: [],
          definitionOfDone: [],
        }),
        authorityEpoch: 1,
        coordinatorGrantId,
      }),
    /delivery-contract:incomplete/
  );
});

test('draft edits retain stable IDs, increment revision, and keep mutable evidence out of definition hashes', () => {
  const first = createDraftContract({
    recordId,
    authorityEpoch: 1,
    coordinatorGrantId,
    acceptanceCriteria: [{ logicalId: 'ac-login', text: 'Users can sign in.' }],
    verificationCommands: [{ logicalId: 'vc-unit', command: 'npm test' }],
    definitionOfDone: [{ logicalId: 'dod-review', text: 'Review is complete.' }],
  });
  const revised = createDraftContract({
    previousContract: first,
    acceptanceCriteria: [{ logicalId: 'ac-login', text: 'Members can sign in.' }],
    verificationCommands: [{ logicalId: 'vc-unit', command: 'npm test' }],
    definitionOfDone: [{ logicalId: 'dod-review', text: 'Review is complete.' }],
    lifecycleProjection: { acceptanceCriteria: { 'ac-login': true } },
    acceptedRecordIds: ['01J00000000000000000000002'],
  });

  assert.equal(revised.revision, 2);
  assert.equal(revised.contractEpoch, first.contractEpoch);
  assert.equal(revised.acceptanceCriteria[0].logicalId, 'ac-login');
  assert.notEqual(revised.definitionHash, first.definitionHash);
  assert.deepEqual(revised.lifecycleProjection, {
    acceptanceCriteria: { 'ac-login': true },
    verificationCommands: {},
    definitionOfDone: {},
  });
  assert.deepEqual(revised.acceptedRecordIds, ['01J00000000000000000000002']);
  assert.match(
    renderDeliveryContract({ contract: revised }).markdown,
    /- \[x\] \[ac-login\] Members/
  );

  const evidenceOnly = createDraftContract({
    previousContract: revised,
    acceptanceCriteria: revised.acceptanceCriteria,
    verificationCommands: revised.verificationCommands,
    definitionOfDone: revised.definitionOfDone,
    lifecycleProjection: { acceptanceCriteria: { 'ac-login': false } },
    acceptedRecordIds: ['01J00000000000000000000003'],
  });
  assert.equal(evidenceOnly.definitionHash, revised.definitionHash);

  const rendered = renderDeliveryContract({ contract: revised });
  assert.equal(
    validateContractProjection({ contract: revised, markdown: rendered.markdown }),
    true
  );
  assert.throws(
    () =>
      validateContractProjection({
        contract: revised,
        markdown: rendered.markdown.replace('[x]', '[ ]'),
      }),
    /delivery-contract:projection-mismatch/
  );
});

test('amendContract advances the epoch and explicitly invalidates earlier lifecycle proof', () => {
  const sealed = sealContract({
    contract: createDraftContract({
      recordId,
      authorityEpoch: 1,
      coordinatorGrantId,
      acceptanceCriteria: [{ logicalId: 'ac-login', text: 'Users can sign in.' }],
      verificationCommands: [{ logicalId: 'vc-unit', command: 'npm test' }],
      definitionOfDone: [{ logicalId: 'dod-review', text: 'Review is complete.' }],
    }),
    authorityEpoch: 1,
    coordinatorGrantId,
  });

  const amended = amendContract({
    contract: sealed.contract,
    expectedContractEpoch: 1,
    authorityEpoch: 1,
    coordinatorGrantId,
    acceptanceCriteria: [{ logicalId: 'ac-login', text: 'Members can sign in.' }],
    verificationCommands: [{ logicalId: 'vc-unit', command: 'npm test' }],
    definitionOfDone: [{ logicalId: 'dod-review', text: 'Review is complete.' }],
  });

  assert.equal(amended.contract.status, 'sealed');
  assert.equal(amended.contract.revision, 2);
  assert.equal(amended.contract.contractEpoch, 2);
  assert.equal(amended.contract.acceptanceCriteria[0].logicalId, 'ac-login');
  assert.notEqual(amended.contract.definitionHash, sealed.contract.definitionHash);
  assert.deepEqual(amended.invalidation, {
    priorContractEpoch: 1,
    invalidatedEvidenceKinds: ['test', 'review', 'approval'],
    removedAcceptedRecordIds: [],
    resetLifecycleChecks: {
      acceptanceCriteria: [],
      verificationCommands: [],
      definitionOfDone: [],
    },
  });
  assert.deepEqual(amended.capsule, {
    recordType: 'contract-amended',
    payload: amended.contract,
  });
  assert.throws(
    () =>
      amendContract({
        contract: sealed.contract,
        expectedContractEpoch: 2,
        authorityEpoch: 1,
        coordinatorGrantId,
        acceptanceCriteria: amended.contract.acceptanceCriteria,
        verificationCommands: amended.contract.verificationCommands,
        definitionOfDone: amended.contract.definitionOfDone,
      }),
    /delivery-contract:stale-epoch/
  );
  assert.throws(
    () =>
      amendContract({
        contract: sealed.contract,
        expectedContractEpoch: 1,
        authorityEpoch: 1,
        coordinatorGrantId,
        acceptanceCriteria: sealed.contract.acceptanceCriteria,
        verificationCommands: sealed.contract.verificationCommands,
        definitionOfDone: sealed.contract.definitionOfDone,
      }),
    /delivery-contract:no-op-amendment/
  );
});

test('draft revisions and amendments reject logical IDs that migrate between definition kinds', () => {
  const draft = createDraftContract({
    recordId,
    authorityEpoch: 1,
    coordinatorGrantId,
    acceptanceCriteria: [{ logicalId: 'ac-login', text: 'Users can sign in.' }],
    verificationCommands: [{ logicalId: 'vc-unit', command: 'npm test' }],
    definitionOfDone: [{ logicalId: 'dod-review', text: 'Review is complete.' }],
  });
  const migratedDefinitions = {
    acceptanceCriteria: [{ logicalId: 'ac-fresh', text: 'Fresh acceptance criterion.' }],
    verificationCommands: [
      { logicalId: 'ac-login', command: 'npm test' },
      { logicalId: 'vc-unit', command: 'npm run test:slow' },
    ],
    definitionOfDone: draft.definitionOfDone,
  };

  assert.throws(
    () => createDraftContract({ previousContract: draft, ...migratedDefinitions }),
    /delivery-contract:logical-id-kind/
  );

  const sealed = sealContract({ contract: draft, authorityEpoch: 1, coordinatorGrantId });
  assert.throws(
    () =>
      amendContract({
        contract: sealed.contract,
        expectedContractEpoch: 1,
        authorityEpoch: 1,
        coordinatorGrantId,
        ...migratedDefinitions,
      }),
    /delivery-contract:logical-id-kind/
  );
});

test('amendments clear prior accepted evidence and checked lifecycle projection', () => {
  const acceptedRecordIds = ['01J00000000000000000000002'];
  const lifecycleProjection = {
    acceptanceCriteria: { 'ac-login': true },
    verificationCommands: { 'vc-unit': true },
    definitionOfDone: { 'dod-review': true },
  };
  const draft = createDraftContract({
    recordId,
    authorityEpoch: 1,
    coordinatorGrantId,
    acceptanceCriteria: [{ logicalId: 'ac-login', text: 'Users can sign in.' }],
    verificationCommands: [{ logicalId: 'vc-unit', command: 'npm test' }],
    definitionOfDone: [{ logicalId: 'dod-review', text: 'Review is complete.' }],
    lifecycleProjection,
    acceptedRecordIds,
  });
  const sealed = sealContract({ contract: draft, authorityEpoch: 1, coordinatorGrantId });
  const amendment = {
    contract: sealed.contract,
    expectedContractEpoch: 1,
    authorityEpoch: 1,
    coordinatorGrantId,
    acceptanceCriteria: [{ logicalId: 'ac-login', text: 'Members can sign in.' }],
    verificationCommands: sealed.contract.verificationCommands,
    definitionOfDone: sealed.contract.definitionOfDone,
  };

  const amended = amendContract(amendment);

  assert.deepEqual(amended.contract.acceptedRecordIds, []);
  assert.deepEqual(amended.contract.lifecycleProjection, {
    acceptanceCriteria: {},
    verificationCommands: {},
    definitionOfDone: {},
  });
  assert.deepEqual(amended.invalidation, {
    priorContractEpoch: 1,
    invalidatedEvidenceKinds: ['test', 'review', 'approval'],
    removedAcceptedRecordIds: acceptedRecordIds,
    resetLifecycleChecks: {
      acceptanceCriteria: ['ac-login'],
      verificationCommands: ['vc-unit'],
      definitionOfDone: ['dod-review'],
    },
  });
  assert.equal(
    validateContractProjection({
      contract: amended.contract,
      markdown: renderDeliveryContract({ contract: amended.contract }).markdown,
    }),
    true
  );
  assert.deepEqual(acceptedRecordIds, ['01J00000000000000000000002']);
  assert.deepEqual(lifecycleProjection, {
    acceptanceCriteria: { 'ac-login': true },
    verificationCommands: { 'vc-unit': true },
    definitionOfDone: { 'dod-review': true },
  });
});

test('an unchanged amendment cannot erase accepted evidence through a reset-only projection change', () => {
  const draft = createDraftContract({
    recordId,
    authorityEpoch: 1,
    coordinatorGrantId,
    acceptanceCriteria: [{ logicalId: 'ac-login', text: 'Users can sign in.' }],
    verificationCommands: [{ logicalId: 'vc-unit', command: 'npm test' }],
    definitionOfDone: [{ logicalId: 'dod-review', text: 'Review is complete.' }],
    lifecycleProjection: {
      acceptanceCriteria: { 'ac-login': true },
      verificationCommands: { 'vc-unit': true },
      definitionOfDone: { 'dod-review': true },
    },
    acceptedRecordIds: ['01J00000000000000000000002'],
  });
  const sealed = sealContract({ contract: draft, authorityEpoch: 1, coordinatorGrantId });
  const amendment = {
    contract: sealed.contract,
    expectedContractEpoch: 1,
    authorityEpoch: 1,
    coordinatorGrantId,
    acceptanceCriteria: sealed.contract.acceptanceCriteria,
    verificationCommands: sealed.contract.verificationCommands,
    definitionOfDone: sealed.contract.definitionOfDone,
  };

  assert.throws(() => amendContract(amendment), /delivery-contract:no-op-amendment/);
  assert.deepEqual(sealed.contract.acceptedRecordIds, ['01J00000000000000000000002']);
  assert.deepEqual(sealed.contract.lifecycleProjection, {
    acceptanceCriteria: { 'ac-login': true },
    verificationCommands: { 'vc-unit': true },
    definitionOfDone: { 'dod-review': true },
  });
});

test('reordered post-seal definitions amend visible projection without changing semantic definition identity', () => {
  const acceptanceCriteria = [
    { logicalId: 'ac-alpha', text: 'Alpha is accepted.' },
    { logicalId: 'ac-beta', text: 'Beta is accepted.' },
  ];
  const verificationCommands = [
    { logicalId: 'vc-fast', command: 'npm test' },
    { logicalId: 'vc-slow', command: 'npm run test:slow' },
  ];
  const definitionOfDone = [
    { logicalId: 'dod-review', text: 'Review is complete.' },
    { logicalId: 'dod-merge', text: 'Merge is complete.' },
  ];
  const sealed = sealContract({
    contract: createDraftContract({
      recordId,
      authorityEpoch: 1,
      coordinatorGrantId,
      acceptanceCriteria,
      verificationCommands,
      definitionOfDone,
      lifecycleProjection: {
        acceptanceCriteria: { 'ac-alpha': true },
        verificationCommands: { 'vc-fast': true },
        definitionOfDone: { 'dod-review': true },
      },
      acceptedRecordIds: ['01J00000000000000000000002'],
    }),
    authorityEpoch: 1,
    coordinatorGrantId,
  });

  const amended = amendContract({
    contract: sealed.contract,
    expectedContractEpoch: 1,
    authorityEpoch: 1,
    coordinatorGrantId,
    acceptanceCriteria: [...acceptanceCriteria].reverse(),
    verificationCommands: [...verificationCommands].reverse(),
    definitionOfDone: [...definitionOfDone].reverse(),
  });

  assert.equal(amended.contract.contractEpoch, 2);
  assert.equal(amended.contract.definitionHash, sealed.contract.definitionHash);
  assert.notEqual(amended.contract.projectionHash, sealed.contract.projectionHash);
  assert.deepEqual(amended.contract.acceptedRecordIds, []);
  assert.deepEqual(amended.contract.lifecycleProjection, {
    acceptanceCriteria: {},
    verificationCommands: {},
    definitionOfDone: {},
  });
  assert.deepEqual(amended.invalidation.removedAcceptedRecordIds, ['01J00000000000000000000002']);
  assert.deepEqual(amended.invalidation.resetLifecycleChecks, {
    acceptanceCriteria: ['ac-alpha'],
    verificationCommands: ['vc-fast'],
    definitionOfDone: ['dod-review'],
  });
});

test('drafts normalize mutable projections without changing definition identity', () => {
  const input = {
    recordId,
    authorityEpoch: 1,
    coordinatorGrantId,
    acceptanceCriteria: [
      { logicalId: 'ac-alpha', text: 'Alpha is accepted.' },
      { logicalId: 'ac-beta', text: 'Beta is accepted.' },
    ],
    verificationCommands: [{ logicalId: 'vc-unit', command: 'npm test' }],
    definitionOfDone: [{ logicalId: 'dod-review', text: 'Review is complete.' }],
    lifecycleProjection: { acceptanceCriteria: { 'ac-alpha': true } },
    acceptedRecordIds: ['01J00000000000000000000004', '01J00000000000000000000002'],
  };
  const first = createDraftContract(input);
  const reordered = createDraftContract({
    previousContract: first,
    acceptanceCriteria: [...input.acceptanceCriteria].reverse(),
    verificationCommands: input.verificationCommands,
    definitionOfDone: input.definitionOfDone,
    lifecycleProjection: input.lifecycleProjection,
    acceptedRecordIds: input.acceptedRecordIds,
  });

  assert.equal(reordered.definitionHash, first.definitionHash);
  assert.notEqual(reordered.projectionHash, first.projectionHash);
  assert.deepEqual(first.acceptedRecordIds, [
    '01J00000000000000000000002',
    '01J00000000000000000000004',
  ]);
  assert.deepEqual(first.lifecycleProjection, {
    acceptanceCriteria: { 'ac-alpha': true },
    verificationCommands: {},
    definitionOfDone: {},
  });
  input.acceptanceCriteria[0].text = 'Mutated by caller.';
  input.acceptedRecordIds.push('01J00000000000000000000005');
  assert.equal(first.acceptanceCriteria[0].text, 'Alpha is accepted.');
  assert.equal(first.acceptedRecordIds.length, 2);
  assert.equal(Object.isFrozen(first.acceptanceCriteria[0]), true);
});

test('draft revisions and amendments refuse to retire a logical ID', () => {
  const draft = createDraftContract({
    recordId,
    authorityEpoch: 1,
    coordinatorGrantId,
    acceptanceCriteria: [
      { logicalId: 'ac-alpha', text: 'Alpha is accepted.' },
      { logicalId: 'ac-beta', text: 'Beta is accepted.' },
    ],
    verificationCommands: [{ logicalId: 'vc-unit', command: 'npm test' }],
    definitionOfDone: [{ logicalId: 'dod-review', text: 'Review is complete.' }],
  });

  assert.throws(
    () =>
      createDraftContract({
        previousContract: draft,
        acceptanceCriteria: [{ logicalId: 'ac-alpha', text: 'Alpha is accepted.' }],
        verificationCommands: draft.verificationCommands,
        definitionOfDone: draft.definitionOfDone,
      }),
    /delivery-contract:retired-logical-id/
  );

  const sealed = sealContract({ contract: draft, authorityEpoch: 1, coordinatorGrantId });
  assert.throws(
    () =>
      amendContract({
        contract: sealed.contract,
        expectedContractEpoch: 1,
        authorityEpoch: 1,
        coordinatorGrantId,
        acceptanceCriteria: [{ logicalId: 'ac-alpha', text: 'Alpha is accepted.' }],
        verificationCommands: sealed.contract.verificationCommands,
        definitionOfDone: sealed.contract.definitionOfDone,
      }),
    /delivery-contract:retired-logical-id/
  );
});

test('drafts reject non-plain lifecycle projection containers and accessor-backed states', () => {
  const base = {
    recordId,
    authorityEpoch: 1,
    coordinatorGrantId,
    acceptanceCriteria: [{ logicalId: 'ac-login', text: 'Users can sign in.' }],
    verificationCommands: [{ logicalId: 'vc-unit', command: 'npm test' }],
    definitionOfDone: [{ logicalId: 'dod-review', text: 'Review is complete.' }],
  };
  const accessorProjection = {};
  Object.defineProperty(accessorProjection, 'acceptanceCriteria', {
    enumerable: true,
    get: () => ({ 'ac-login': true }),
  });
  const accessorState = {};
  Object.defineProperty(accessorState, 'ac-login', {
    enumerable: true,
    get: () => true,
  });
  class Projection {}
  class State {}

  for (const lifecycleProjection of [
    new Map([['acceptanceCriteria', { 'ac-login': true }]]),
    new Projection(),
    accessorProjection,
    { acceptanceCriteria: new Map([['ac-login', true]]) },
    { acceptanceCriteria: new State() },
    { acceptanceCriteria: accessorState },
  ]) {
    assert.throws(
      () => createDraftContract({ ...base, lifecycleProjection }),
      /delivery-contract:lifecycle-projection/
    );
  }

  const nullPrototypeProjection = Object.create(null);
  const nullPrototypeState = Object.create(null);
  nullPrototypeState['ac-login'] = true;
  nullPrototypeProjection.acceptanceCriteria = nullPrototypeState;
  const normalized = createDraftContract({ ...base, lifecycleProjection: nullPrototypeProjection });
  assert.equal(normalized.lifecycleProjection.acceptanceCriteria['ac-login'], true);
});

test('public projection validation validates contract authority before comparing rendered bytes', () => {
  const valid = createDraftContract({
    recordId,
    authorityEpoch: 1,
    coordinatorGrantId,
    acceptanceCriteria: [{ logicalId: 'ac-login', text: 'Users can sign in.' }],
    verificationCommands: [{ logicalId: 'vc-unit', command: 'npm test' }],
    definitionOfDone: [{ logicalId: 'dod-review', text: 'Review is complete.' }],
  });
  const unknownKey = { ...structuredClone(valid), unexpected: true };
  unknownKey.projectionHash = renderDeliveryContract({ contract: unknownKey }).projectionHash;
  const forgedDefinition = structuredClone(valid);
  forgedDefinition.acceptanceCriteria[0].text = 'Forged definition.';
  forgedDefinition.projectionHash = renderDeliveryContract({
    contract: forgedDefinition,
  }).projectionHash;

  for (const [contract, expectedError] of [
    [unknownKey, /delivery-contract:keys/],
    [forgedDefinition, /delivery-contract:definition-hash/],
  ]) {
    const markdown = renderDeliveryContract({ contract }).markdown;
    assert.throws(() => validateContractProjection({ contract, markdown }), expectedError);
  }
});

test('contract lifecycle rejects malformed authority, definitions, payloads, and projections', () => {
  const valid = createDraftContract({
    recordId,
    authorityEpoch: 1,
    coordinatorGrantId,
    acceptanceCriteria: [{ logicalId: 'ac-login', text: 'Users can sign in.' }],
    verificationCommands: [{ logicalId: 'vc-unit', command: 'npm test' }],
    definitionOfDone: [{ logicalId: 'dod-review', text: 'Review is complete.' }],
  });
  const cases = [
    [
      {
        ...valid,
        schema: 'aitm.delivery-contract/v2',
      },
      /delivery-contract:unsupported-schema/,
    ],
    [
      {
        ...valid,
        unexpected: true,
      },
      /delivery-contract:keys/,
    ],
    [
      {
        ...valid,
        definitionHash: 'sha256:not-a-hash',
      },
      /delivery-contract:definition-hash/,
    ],
  ];
  for (const [previousContract, error] of cases) {
    assert.throws(
      () =>
        createDraftContract({
          previousContract,
          acceptanceCriteria: valid.acceptanceCriteria,
          verificationCommands: valid.verificationCommands,
          definitionOfDone: valid.definitionOfDone,
        }),
      error
    );
  }
  for (const definitions of [
    {
      acceptanceCriteria: [
        { logicalId: 'ac-login', text: 'First.' },
        { logicalId: 'ac-login', text: 'Duplicate.' },
      ],
      verificationCommands: valid.verificationCommands,
      definitionOfDone: valid.definitionOfDone,
    },
    {
      acceptanceCriteria: valid.acceptanceCriteria,
      verificationCommands: [{ logicalId: 'ac-login', command: 'npm test' }],
      definitionOfDone: valid.definitionOfDone,
    },
  ]) {
    assert.throws(
      () =>
        createDraftContract({ recordId, authorityEpoch: 1, coordinatorGrantId, ...definitions }),
      /delivery-contract:duplicate-logical-id/
    );
  }
  assert.throws(
    () =>
      createDraftContract({
        recordId,
        authorityEpoch: 1,
        coordinatorGrantId,
        acceptanceCriteria: [{ logicalId: 'ac-login', text: 'Authorization: Bearer abcdefghijk' }],
        verificationCommands: valid.verificationCommands,
        definitionOfDone: valid.definitionOfDone,
      }),
    /delivery-contract:durable-data/
  );
  const rendered = renderDeliveryContract({ contract: valid }).markdown;
  for (const tampered of [
    rendered.replace('## Delivery Contract', '## Edited Contract'),
    rendered.replace('npm test', 'npm run test:slow'),
    rendered.replace('[ac-login]', '[ac-edited]'),
    rendered.replace('Users can sign in.', 'A human edit.'),
  ]) {
    assert.throws(
      () => validateContractProjection({ contract: valid, markdown: tampered }),
      /delivery-contract:projection-mismatch/
    );
  }
});
