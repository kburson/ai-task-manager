// @story #1912
// Live source and sentinel input continuity after original preparation/awaits.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  budget,
  discoverOriginalCases,
  qualifyOriginalCases,
} from '../../../helpers/criteria-revision-transition-profiles.mjs';

const discovered = discoverOriginalCases();
const custody = discovered.filter(
  (value) => value.mode === 'late-sources' || value.mode.startsWith('sentinel-late-')
);

test('independent descriptors include current-source drift and all eleven sentinel late inputs', (t) => {
  assert.equal(custody.filter((value) => value.mode === 'late-sources').length, 1);
  assert.deepEqual(
    custody
      .filter((value) => value.mode.startsWith('sentinel-late-'))
      .map((value) => value.mode)
      .sort(),
    [
      'persist-token-accessor',
      'persist-token-identity',
      'persist-invocation-accessor',
      'persist-invocation-identity',
      'persist-step-accessor',
      'persist-step-identity',
      'effect-token-accessor',
      'effect-token-identity',
      'context-issue-accessor',
      'context-executor-accessor',
      'context-identity',
    ]
      .map((value) => `sentinel-late-${value}`)
      .sort()
  );
  assert.equal(new Set(custody.map((value) => value.filename)).size, 12);
  t.diagnostic(JSON.stringify(custody));
});

test(
  'actual original source drift and late custody mutations refuse without effects',
  { timeout: budget, concurrency: true },
  (t) => qualifyOriginalCases(custody, t)
);
