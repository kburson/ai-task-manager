// @story #1916
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  budget,
  discoverOriginalCases,
  qualifyOriginalCases,
  qualify,
} from '../../../helpers/criteria-revision-transition-profiles.mjs';
const related = discoverOriginalCases().filter(({ mode }) => mode.startsWith('compensation'));
const custody = related.filter(
  ({ mode }) => !['compensation', 'compensation-return-custody'].includes(mode)
);
test('all audit and late-source cases are classified independently', (t) => {
  assert.equal(custody.length, 12);
  const audit = custody.filter(({ mode }) => mode === 'compensation-audit');
  assert.equal(audit.filter(({ fault }) => fault === null).length, 1);
  const redundant = audit.filter(
    ({ filename }) => filename === 'criteria-revision-compensation-audit-interrupted.test.mjs'
  );
  assert.equal(redundant.length, 1);
  assert.deepEqual(redundant[0].fault, { when: 'failAfter', suffix: 'audit-effect-write' });
  assert.deepEqual(
    audit
      .filter((value) => value.fault && !redundant.includes(value))
      .map(({ fault }) => `${fault.when}:${fault.suffix}`)
      .sort(),
    ['failBefore', 'failAfter']
      .flatMap((when) =>
        [
          'audit-intent-write',
          'audit-intent-readback',
          'audit-effect-write',
          'audit-effect-readback',
        ].map((suffix) => `${when}:${suffix}`)
      )
      .sort()
  );
  assert.deepEqual(
    custody
      .filter(({ mode }) => mode !== 'compensation-audit')
      .map(({ mode }) => mode)
      .sort(),
    ['compensation-late-config', 'compensation-late-read']
  );
  t.diagnostic(JSON.stringify(custody));
});
test('complete actual public compensation boundary profile', { timeout: budget }, (t) =>
  qualify(
    [
      'scripts/tests/unit/task-tracker/lib/criteria-revision/native-stage-compensation-boundary.test.mjs',
    ],
    21,
    t
  )
);
test(
  'actual original audit and late custody cases preserve verified committed facts',
  { timeout: budget, concurrency: true },
  (t) => qualifyOriginalCases(custody, t)
);
