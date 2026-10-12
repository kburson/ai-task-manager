// @story #1920
// Actual original consistency and comment create/read/return custody boundaries.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  budget,
  discoverOriginalCases,
  qualifyOriginalCases,
} from '../../../helpers/criteria-revision-transition-profiles.mjs';

const related = discoverOriginalCases().filter(
  ({ mode }) => mode.startsWith('transition-') || mode.startsWith('consistency-')
);
const custody = related.filter(
  ({ mode }) =>
    ![
      'transition-comment',
      'transition-comment-prefix',
      'transition-history',
      'transition-native',
    ].includes(mode)
);

test('all original consistency and comment custody boundaries execute', (t) => {
  assert.deepEqual(
    custody.map(({ mode }) => mode).sort(),
    [
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
    ].sort()
  );
  assert.equal(new Set(custody.map(({ filename }) => filename)).size, 12);
  t.diagnostic(JSON.stringify(custody));
});

test(
  'actual original consistency and comment custody mutations refuse before unauthorized effects',
  { timeout: budget, concurrency: true },
  (t) => qualifyOriginalCases(custody, t)
);
