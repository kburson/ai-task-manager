// @story #1913
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  budget,
  discoverOriginalCases,
  qualifyOriginalCases,
  qualify,
} from '../../../helpers/criteria-revision-transition-profiles.mjs';
const discovered = discoverOriginalCases();
const original = discovered.filter(
  ({ mode, fault }) =>
    ['tail-dispatch', 'tail-dispatch-reentry', 'phase-pair', 'phase-adversarial'].includes(mode) ||
    (mode === 'phase-12-prefix' &&
      fault?.when === 'failAfter' &&
      fault.suffix === 'effect-readback')
);
test('independent dispatcher and requested phase frontier discovery retains all five originals', (t) => {
  assert.deepEqual(
    original.map(({ filename }) => filename).sort(),
    [
      'native-stage-tail-dispatch.test.mjs',
      'native-stage-tail-dispatch-reentry.test.mjs',
      'native-stage-phase-pair.test.mjs',
      'native-stage-phase-adversarial.test.mjs',
      'native-stage-phase-12-prefix-after-effect-readback.test.mjs',
    ].sort()
  );
  t.diagnostic(JSON.stringify(original));
});
const cacheTransport = discovered.filter(
  ({ mode, fault }) =>
    mode === 'tail-cache' && fault && ['intent-write', 'intent-readback'].includes(fault.suffix)
);
const firstGroup = [...original, ...cacheTransport];
test('cache intent transport membership retains both sides of every original boundary', () => {
  assert.deepEqual(
    cacheTransport.map(({ fault }) => fault.when + ':' + fault.suffix).sort(),
    ['failBefore', 'failAfter']
      .flatMap((when) => ['intent-write', 'intent-readback'].map((suffix) => when + ':' + suffix))
      .sort()
  );
  assert.equal(firstGroup.length, 9);
});
test(
  'complete original dispatcher and phase frontiers preserve actual effects and private window',
  { timeout: budget, concurrency: true },
  (t) => qualifyOriginalCases(firstGroup, t)
);
test('complete ordinary cache and tail profiles remain intact', { timeout: budget }, (t) =>
  qualify(
    [
      'scripts/tests/integration/task-tracker/lib/coverage-cache-unpark.test.mjs',
      'scripts/tests/unit/task-tracker/lib/move-state/move-state-terminal-tail-isolation.test.mjs',
      'scripts/tests/unit/task-tracker/lib/move-state/move-state-tail-profiles.test.mjs',
      'scripts/tests/unit/task-tracker/lib/move-state/local-tail-program.test.mjs',
    ],
    40,
    t
  )
);
