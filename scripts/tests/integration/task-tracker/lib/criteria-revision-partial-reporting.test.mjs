// @story #1924
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  budget,
  discoverOriginalCases,
  qualifyOriginalCases,
} from '../../../helpers/criteria-revision-transition-profiles.mjs';
const cases = discoverOriginalCases().filter(({ mode }) => mode.startsWith('partial-reporting-'));
test('partial reporting retains all genuine verified and interrupted prefix profiles', () => {
  assert.deepEqual(cases.map(({ mode }) => mode).sort(), [
    'partial-reporting-14',
    'partial-reporting-15',
    'partial-reporting-16',
    'partial-reporting-unknown',
  ]);
});
test(
  'actual original failure reports verified committed facts after joined work',
  { timeout: budget, concurrency: true },
  (t) => qualifyOriginalCases(cases, t)
);
