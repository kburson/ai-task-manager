// @story #1072
import { strict as assert } from 'node:assert';
import test from 'node:test';

import {
  createDraftContract,
  sealContract,
  renderDeliveryContract,
  validateContractProjection,
} from '../../../../lib/github-records/delivery-contract.mjs';

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
  assert.deepEqual(revised.lifecycleProjection, { acceptanceCriteria: { 'ac-login': true } });
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
