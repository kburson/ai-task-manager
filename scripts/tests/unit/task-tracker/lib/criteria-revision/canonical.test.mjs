// @story #1854
import { amendContract } from '../../../../../task-tracker/lib/github-records/delivery-contract.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { makeCanonicalRevisionFixture } from '../../../../fixtures/criteria-revision.mjs';
const canonical =
  await import('../../../../../task-tracker/lib/criteria-revision/canonical.mjs').catch((error) => {
    if (error.code === 'ERR_MODULE_NOT_FOUND') return {};
    throw error;
  });
test('canonical amendment advances its epoch and retires every accepted current proof', () => {
  const f = makeCanonicalRevisionFixture();
  assert.equal(typeof canonical.deriveCanonicalWrites, 'function');
  const result = canonical.deriveCanonicalWrites({
    proposal: f.proposal,
    contract: f.contract,
    grant: f.grant,
  });
  assert.equal(result.after.contractEpoch, f.contract.contractEpoch + 1);
  assert.equal(result.after.status, 'sealed');
  assert.deepEqual(result.after.acceptedRecordIds, []);
  assert.deepEqual(result.after.lifecycleProjection, {
    acceptanceCriteria: {},
    verificationCommands: {},
    definitionOfDone: {},
  });
  assert.ok(!result.after.acceptanceCriteria.some((item) => item.logicalId === 'ac-hook'));
});
test('canonical proposal seals capsule before contract, proof projection and body', () => {
  const { proposal } = makeCanonicalRevisionFixture();
  assert.deepEqual(
    proposal.writeSet
      .filter((write) => write.resource !== 'revision-record')
      .map((write) => write.resource),
    ['capsule', 'delivery-contract', 'proof-projection', 'issue-body']
  );
});

test('ordinary amendments still refuse removal and forged revision capability', () => {
  const { contract } = makeCanonicalRevisionFixture();
  const input = {
    contract,
    expectedContractEpoch: contract.contractEpoch,
    authorityEpoch: contract.authorityEpoch,
    coordinatorGrantId: contract.coordinatorGrantId,
    acceptanceCriteria: contract.acceptanceCriteria.slice(1),
    verificationCommands: contract.verificationCommands,
    definitionOfDone: contract.definitionOfDone,
  };
  assert.throws(() => amendContract(input), /retired-logical-id/);
  assert.throws(
    () => amendContract({ ...input, criteriaRevisionCapability: {} }),
    /canonical-amendment-capability/
  );
});

test('ordinary sealed proof invalidation retains its original independent authority guard', async () => {
  const { invalidateContractProof } =
    await import('../../../../../task-tracker/lib/github-records/delivery-contract.mjs');
  const f = makeCanonicalRevisionFixture();
  const result = invalidateContractProof({
    contract: f.contract,
    authorityEpoch: f.contract.authorityEpoch,
    coordinatorGrantId: f.contract.coordinatorGrantId,
  });
  assert.equal(result.contract.contractEpoch, f.contract.contractEpoch + 1);
});
