// @story #1912
// Qualify actual original native cases without a simulated prefix replay.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  budget,
  discoverOriginalCases,
  qualify,
  qualifyOriginalCases,
} from '../../../helpers/criteria-revision-transition-profiles.mjs';

const discovered = discoverOriginalCases();
const sentinel = discovered.filter((value) =>
  ['sentinel-complete', 'sentinel-prefix'].includes(value.mode)
);
const negativeModes = new Set([
  'guard-fence',
  'sentinel-data',
  'sentinel-history',
  'actor-override',
]);
const negatives = discovered.filter((value) => negativeModes.has(value.mode));

test('independent original descriptors account for the complete sentinel and all eight fault points', (t) => {
  assert.equal(sentinel.filter((value) => value.mode === 'sentinel-complete').length, 1);
  const faults = sentinel.filter((value) => value.mode === 'sentinel-prefix');
  assert.equal(faults.length, 8);
  assert.deepEqual(
    faults.map((value) => `${value.fault.when}:${value.fault.suffix}`).sort(),
    ['failBefore', 'failAfter']
      .flatMap((when) =>
        ['intent-write', 'intent-readback', 'effect-write', 'effect-readback'].map(
          (suffix) => `${when}:${suffix}`
        )
      )
      .sort()
  );
  assert.deepEqual(negatives.map((value) => value.mode).sort(), [...negativeModes].sort());
  assert.equal(new Set([...sentinel, ...negatives].map((value) => value.filename)).size, 13);
  t.diagnostic(JSON.stringify([...sentinel, ...negatives]));
});

test('complete original prefix DATA and custody regressions', { timeout: budget }, (t) =>
  qualify(
    [
      'scripts/tests/unit/task-tracker/lib/criteria-revision/native-stage-execution-resources.test.mjs',
      'scripts/tests/unit/task-tracker/lib/criteria-revision/native-stage-body-data.test.mjs',
      'scripts/tests/unit/task-tracker/lib/criteria-revision/native-stage-local-data.test.mjs',
      'scripts/tests/unit/task-tracker/lib/criteria-revision/native-stage-sentinel-boundary.test.mjs',
      'scripts/tests/unit/task-tracker/lib/criteria-revision/native-stage-board-attempts.test.mjs',
    ],
    61,
    t
  )
);

test(
  'actual original prefix and sentinel transport cases retain verified facts',
  { timeout: budget, concurrency: true },
  (t) => qualifyOriginalCases([...sentinel, ...negatives], t)
);
