// @story #876
import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  CANONICAL_LANES,
  CANONICAL_TEST_ROOT,
  canonicalLayoutViolations,
  parseCanonicalTestPath,
} from '../../../lib/test-lanes.mjs';

test('canonical test root exposes the three supported lanes', () => {
  assert.equal(CANONICAL_TEST_ROOT, 'scripts/tests');
  assert.deepEqual(CANONICAL_LANES, ['unit', 'integration', 'slow']);
  assert.ok(Object.isFrozen(CANONICAL_LANES));
});

test('parseCanonicalTestPath returns lane and test-relative path for canonical tests', () => {
  assert.deepEqual(parseCanonicalTestPath('scripts/tests/unit/gh/create-issue.test.mjs'), {
    lane: 'unit',
    relative: 'gh/create-issue.test.mjs',
  });
  assert.deepEqual(parseCanonicalTestPath('scripts\\tests\\integration\\lib\\flow.test.mjs'), {
    lane: 'integration',
    relative: 'lib/flow.test.mjs',
  });
});

test('parseCanonicalTestPath rejects noncanonical paths', () => {
  assert.equal(parseCanonicalTestPath('scripts/gh/create-issue.test.mjs'), null);
  assert.equal(parseCanonicalTestPath('scripts/tests/fixtures/data.test.mjs'), null);
  assert.equal(parseCanonicalTestPath('scripts/tests/unit/../gh/create-issue.test.mjs'), null);
  assert.equal(parseCanonicalTestPath('scripts/tests/unit/./gh/create-issue.test.mjs'), null);
  assert.equal(parseCanonicalTestPath('scripts/tests/unit//gh/create-issue.test.mjs'), null);
});

test('canonicalLayoutViolations returns sorted noncanonical paths', () => {
  assert.deepEqual(
    canonicalLayoutViolations([
      'scripts/tests/slow/articles/publish-articles-e2e.test.mjs',
      'scripts/reports/generate-value-report.test.mjs',
    ]),
    ['scripts/reports/generate-value-report.test.mjs']
  );
});
