// @story #2163 — shared invocation contract for independently bounded public test files.
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { createInflationPublicEntryFixture } from './inflation-public-entry-fixture.mjs';
import { readDecompositionRecords } from '../../task-tracker/lib/decomposition-records.mjs';
export const root = fileURLToPath(new URL('../../../', import.meta.url));
export const source = process.env.INFLATION_FIXTURE_SOURCE_COMMIT
  ? { commit: process.env.INFLATION_FIXTURE_SOURCE_COMMIT }
  : { root };
export const inflation = [
  'inflate-estimate',
  '4242',
  '--size',
  'M',
  '--estimate',
  '6h',
  '--reason',
  'Discovered integration work.',
  '--item',
  'Integration validation (~4h)',
];
export async function startFixture(t, options = {}) {
  const retired = options.scenario === 'retired-forecast';
  const relocated = retired && Boolean(options.sourceBundle);
  const fixture = await createInflationPublicEntryFixture({
    source,
    ...options,
    ...(retired ? { scenario: relocated ? 'retired-snapshot' : 'retirement-input' } : {}),
  });
  t.after(() => fixture.close());
  const start = await fixture.run([
    'start',
    '4242',
    '--role',
    'agent',
    ...(relocated ? ['--confirm-relocation'] : []),
  ]);
  assert.equal(start.status, 0, `SETUP/ADMISSION FAILURE: ${start.stderr}`);
  assert.deepEqual(
    fixture.readLedger().filter((e) => e.outcome === 'refused'),
    []
  );
  if (retired) {
    if (!relocated) {
      const cancel = await fixture.run([
        'cancel-plan',
        '4242',
        '--reason',
        'Restart fictional planning.',
      ]);
      assert.equal(cancel.status, 0, `SETUP/RETIREMENT FAILURE: ${cancel.stderr}`);
    }
    const state = fixture.readState().provider,
      publication = readDecompositionRecords(state.body).publication;
    assert.equal(state.status, 'Ready for Planning');
    assert.ok(
      state.body.includes('aitm-move-complete state=ready-for-plan'),
      'actual retired state must retain move-complete evidence'
    );
    assert.equal(publication.writerId, 'cancel-plan');
    assert.equal(publication.status, 'complete');
    assert.equal(state.body.includes('<!-- aitm-estimation-forecast-ready'), false);
    assert.deepEqual(
      fixture.readLedger().filter((e) => e.outcome === 'refused'),
      []
    );
  }
  return { fixture, start };
}
