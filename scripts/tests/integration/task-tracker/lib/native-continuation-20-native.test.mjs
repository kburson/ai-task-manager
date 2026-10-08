// @story #1855
import {
  assert,
  nativeCheckboxFixture,
  observeRevision,
  test,
} from './native-continuation-fixtures.mjs';

for (const kind of ['ac', 'dod'])
  test(`native ${kind} checkbox preserves proof across check uncheck recheck and restart`, async () => {
    const { f, check } = await nativeCheckboxFixture(kind);
    try {
      const originalProof = structuredClone(f.backend.snapshot.nativeProofRecords[0]);
      for (const desired of ['checked', 'unchecked', 'checked']) {
        await check(desired);
        f.restart();
        const state = await observeRevision({ context: f.context, deps: f.backend });
        assert.equal(state.status, 'applied', JSON.stringify(state));
        assert.equal(
          state.nativeIndividualProofs.length,
          1,
          'checkbox operation cannot become verifier witness'
        );
      }
      assert.deepEqual(f.backend.snapshot.nativeProofRecords[0], originalProof);
      assert.equal(f.backend.snapshot.nativeProofRecords.length, 4);
      const before = structuredClone(f.backend.snapshot),
        pushes = f.effects.filter((x) => x === 'body-push').length;
      await check('checked');
      assert.deepEqual(f.backend.snapshot, before);
      assert.equal(f.effects.filter((x) => x === 'body-push').length, pushes);
    } finally {
      f.dispose();
    }
  });
