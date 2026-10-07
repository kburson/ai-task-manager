// @story #1855
import { assert, nativeFinalFixture, observeRevision, parseVerificationCommands, test } from './native-continuation-fixtures.mjs';

test('stage historical receipt requires exact earlier native final execution and original dependencies', async () => {
  const f = await nativeFinalFixture();
  try {
    const executed = await f.invoke();
    assert.equal(executed.finalization.ok, true);
    const observed = await observeRevision({ context: f.context, deps: f.backend });
    assert.equal(observed.status, 'applied');
    const stage = await import('../../../../task-tracker/lib/criteria-revision/stage-execution.mjs');
    const { parseVerificationReceipt, upsertVerificationReceipt } = await import('../../../../task-tracker/lib/verification-receipt.mjs');
    const original = f.backend.snapshot.nativeProofRecords;
    const receipt = parseVerificationReceipt(observed.observation.body.bytes, 'develop-final');
    const input = { observation: observed.observation, definitions: observed.effectiveProposal.after.definitions,
      headSha: receipt.commitSha, proofs: original };
    const data = stage.reconstructNativeStageReceiptEvidence(input);
    assert.equal(data.journalId, original[0].id);
    assert.equal(data.receiptId, receipt.receiptId);
    assert.ok(Object.isFrozen(data));
    for (const [label, change] of [
      ['absent history', value => { value.proofs = []; }],
      ['duplicate history', value => { value.proofs.push(structuredClone(value.proofs[0])); }],
      ['result drift', value => { value.proofs[0].execution.commands[0].exitCode = 1; }],
      ['original context drift', value => { value.proofs[0].execution.provenance.branch = 'foreign'; }],
      ['current HEAD', value => { value.headSha = '1'.repeat(40); }],
      ['current revision', value => { value.observation.revisionId = 'foreign-revision'; }],
      ['current source definition', value => { value.definitions[0].sourceBindings[0].hash = 'sha256:' + '0'.repeat(64); }],
      ['current commands', value => { value.observation.body.bytes = value.observation.body.bytes.replace(parseVerificationCommands(value.observation.body.bytes)[0].command, 'node other.test.mjs'); }],
      ['receipt-only replacement', value => { value.observation.body.bytes = upsertVerificationReceipt(value.observation.body.bytes, { ...receipt, receiptId: '01ARZ3NDEKTSV4RRFFQ69G5FAV' }); }],
      ['caller approval', value => { value.approved = true; }],
    ]) {
      const bad = structuredClone(input); change(bad);
      assert.notDeepEqual(bad, input, label + ' must actually change the fixture');
      assert.throws(() => stage.reconstructNativeStageReceiptEvidence(bad), /criteria-revision:native-stage-receipt-evidence/, label);
    }
    assert.deepEqual(f.backend.snapshot.nativeProofRecords, original);
  } finally { f.dispose(); }
});
