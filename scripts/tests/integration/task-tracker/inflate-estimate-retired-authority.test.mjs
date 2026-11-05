// @story #2163 — retirement is reached through actual registered commands.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { startFixture, inflation } from '../../fixtures/inflation-test-context.mjs';
import { readDecompositionRecords } from '../../../task-tracker/lib/decomposition-records.mjs';

test('registered cancellation then inflation preserves retired forecast authority', async (t) => {
  const { fixture } = await startFixture(t, { scenario: 'retired-forecast' });
  const result = await fixture.run(inflation);
  assert.equal(
    result.status,
    0,
    JSON.stringify({
      stderr: result.stderr,
      refused: fixture.readLedger().filter((e) => e.outcome === 'refused'),
    })
  );
  const final = readDecompositionRecords(fixture.readState().provider.body);
  assert.equal(final.publication.status, 'complete');
  assert.equal(final.assessment.inputDigest, final.publication.intendedInputDigest);
  assert.equal(fixture.readLedger().filter((e) => e.outcome === 'refused').length, 0);
});
