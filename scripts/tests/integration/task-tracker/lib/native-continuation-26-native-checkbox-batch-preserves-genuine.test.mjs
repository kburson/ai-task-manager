// @story #1855
import {
  assert,
  nativeCheckboxFixture,
  observeRevision,
  parseFunctionalDodKeys,
  test,
  withRevisionConsumer,
} from './native-continuation-fixtures.mjs';

for (const kind of ['ac', 'dod'])
  test(`native checkbox batch preserves genuine ${kind} execution and preserved legacy proof`, async () => {
    const { f, label, check } = await nativeCheckboxFixture(kind);
    try {
      const preserved = 'Independent DoD';
      const original = structuredClone(f.backend.snapshot.nativeProofRecords);
      await check('unchecked', { rest: [preserved] });
      f.restart();
      const accepted = await withRevisionConsumer(
        {
          repository: f.context.repository,
          issue: f.context.issue,
          backend: f.backend,
          projectDir: f.projectDir,
          activity: 'issue-write',
        },
        () =>
          parseFunctionalDodKeys(f.backend.observation.body.bytes).find(
            (item) => item.key === 'lint'
          )
      );
      assert.ok(
        accepted.evidenceMarker,
        'actual current native reader must retain exact preserved proof after sanctioned untick'
      );
      await check('checked', { rest: ['--label', label, '--label', preserved] });
      f.restart();
      const state = await observeRevision({ context: f.context, deps: f.backend });
      assert.equal(state.status, 'applied', JSON.stringify(state));
      assert.equal(state.nativeIndividualProofs.length, 1);
      assert.deepEqual(f.backend.snapshot.nativeProofRecords[0], original[0]);
      const operation = f.backend.snapshot.nativeProofRecords.at(-1).execution;
      assert.deepEqual(
        operation.proofBases.map((b) => b.kind),
        ['native-individual', 'preserved-individual']
      );
      assert.equal(
        f.effects.filter((x) => x === 'body-push').length,
        3,
        'stamp, untick and one atomic batch write'
      );
      await check('checked', { rest: ['--label', label, '--label', preserved] });
      assert.equal(f.effects.filter((x) => x === 'body-push').length, 3);
    } finally {
      f.dispose();
    }
  });
