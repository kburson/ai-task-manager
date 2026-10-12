// @story #1924
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  budget,
  discoverOriginalCases,
  qualifyOriginalCases,
  qualify,
} from '../../../helpers/criteria-revision-transition-profiles.mjs';
const discovered = discoverOriginalCases();
const reports = discovered.filter(({ mode }) => mode.startsWith('partial-reporting-'));
const base = reports.filter(({ mode }) =>
  [
    'partial-reporting-14',
    'partial-reporting-15',
    'partial-reporting-16',
    'partial-reporting-unknown',
  ].includes(mode)
);
const current = reports.filter(({ mode }) => !base.some((item) => item.mode === mode));
const originalNames = [
  'native-stage-phase-12-prefix-after-effect-readback.test.mjs',
  'native-stage-board-effect-readback-failAfter.test.mjs',
  'native-stage-sentinel-effect-readback-failAfter.test.mjs',
  'native-stage-transition-comment.test.mjs',
];
const originals = discovered.filter(({ filename }) => originalNames.includes(filename));
test('partial reporting retains all genuine verified, interrupted, cancellation and current profiles', () => {
  assert.deepEqual(
    reports.map(({ mode }) => mode).sort(),
    [
      'partial-reporting-14',
      'partial-reporting-15',
      'partial-reporting-16',
      'partial-reporting-unknown',
      'partial-reporting-cancel',
      'partial-reporting-late-source',
      'partial-reporting-late-input',
      'partial-reporting-late-authority',
      'partial-reporting-final-source',
      'partial-reporting-final-authority',
    ].sort()
  );
  assert.equal(base.length, 4);
  assert.equal(current.length, 6);
  assert.deepEqual(originals.map(({ filename }) => filename).sort(), originalNames.sort());
  assert.equal(new Set([...reports, ...originals].map(({ filename }) => filename)).size, 14);
});
test(
  'actual original failure reports verified committed facts after joined work',
  { timeout: budget, concurrency: true },
  (t) => qualifyOriginalCases(base, t)
);
test(
  'current authority, cancellation and original interruption profiles stay truthful',
  { timeout: budget, concurrency: true },
  (t) => qualifyOriginalCases([...current, ...originals], t)
);
test(
  'complete original ordinary facade and public reporting boundaries stay intact',
  { timeout: budget },
  (t) =>
    qualify(
      [
        'scripts/tests/unit/task-tracker/lib/criteria-revision/native-stage-partial-boundary.test.mjs',
        'scripts/tests/unit/task-tracker/lib/move-state/move-state-core.test.mjs',
        'scripts/tests/unit/task-tracker/lib/move-state/move-state-idempotent.test.mjs',
        'scripts/tests/unit/task-tracker/lib/move-state/move-state-board-marker-atomicity.test.mjs',
        'scripts/tests/unit/task-tracker/lib/move-state/move-state-sentinel-write.test.mjs',
        'scripts/tests/unit/task-tracker/lib/move-state/move-state-output.test.mjs',
        'scripts/tests/unit/task-tracker/lib/move-state/move-state-policy.test.mjs',
        'scripts/tests/unit/task-tracker/lib/move-state/move-state-tail-error-diagnostics.test.mjs',
      ],
      65,
      t
    )
);
