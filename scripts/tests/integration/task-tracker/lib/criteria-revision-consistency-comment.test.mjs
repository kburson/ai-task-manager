// @story #1920
// Actual original step16 comment, faults and historical DATA qualifications.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  budget,
  discoverOriginalCases,
  qualify,
  qualifyOriginalCases,
} from '../../../helpers/criteria-revision-transition-profiles.mjs';

const related = discoverOriginalCases().filter(
  ({ mode }) => mode.startsWith('transition-') || mode.startsWith('consistency-')
);
const selected = related.filter(({ mode }) =>
  ['transition-comment', 'transition-comment-prefix', 'transition-history'].includes(mode)
);
const custodyModes = [
  'consistency-current-config',
  'consistency-request-value',
  'consistency-response-accessor',
  'consistency-result-accessor',
  'transition-create-parsed',
  'transition-create-response',
  'transition-current-config',
  'transition-override',
  'transition-read-parsed',
  'transition-read-response',
  'transition-request-accessor',
  'transition-result-custody',
];

test('independent descriptors account for every comment/consistency mode and all eight transport faults', (t) => {
  assert.equal(related.length, 23);
  assert.equal(related.filter(({ mode }) => mode === 'transition-native').length, 1);
  assert.deepEqual(
    related
      .filter(
        ({ mode }) => !selected.some((value) => value.mode === mode) && mode !== 'transition-native'
      )
      .map(({ mode }) => mode)
      .sort(),
    [...custodyModes].sort()
  );
  assert.equal(selected.filter(({ mode }) => mode === 'transition-comment').length, 1);
  assert.equal(selected.filter(({ mode }) => mode === 'transition-history').length, 1);
  const faults = selected.filter(({ mode }) => mode === 'transition-comment-prefix');
  assert.equal(faults.length, 8);
  assert.deepEqual(
    faults.map(({ fault }) => `${fault.when}:${fault.suffix}`).sort(),
    ['failBefore', 'failAfter']
      .flatMap((when) =>
        ['intent-write', 'intent-readback', 'effect-write', 'effect-readback'].map(
          (suffix) => `${when}:${suffix}`
        )
      )
      .sort()
  );
  assert.equal(new Set(selected.map(({ filename }) => filename)).size, 10);
  t.diagnostic(JSON.stringify(selected));
});

test('complete original comment DATA and public quarantine profiles', { timeout: budget }, (t) =>
  qualify(
    [
      'scripts/tests/unit/task-tracker/lib/criteria-revision/native-stage-execution.test.mjs',
      'scripts/tests/unit/task-tracker/lib/criteria-revision/native-stage-data.test.mjs',
      'scripts/tests/unit/task-tracker/lib/criteria-revision/native-stage-source-data.test.mjs',
      'scripts/tests/integration/task-tracker/lib/revision-stage-public-root-quarantine.test.mjs',
    ],
    71,
    t
  )
);

test(
  'actual original positive/comment transport/history cases preserve exact resources',
  { timeout: budget, concurrency: true },
  (t) => qualifyOriginalCases(selected, t)
);
