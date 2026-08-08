// @story #1089
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, test } from 'node:test';

import { buildFinalSteps, buildIterationSteps } from '../../../verify-develop.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../../../..');
const fixture = JSON.parse(
  readFileSync(
    path.join(
      ROOT,
      'scripts/task-tracker/tests/fixtures/verification/stage-command-classifications.json'
    ),
    'utf8'
  )
);
const testSource = readFileSync(path.join(ROOT, 'scripts/task-tracker/verbs/test.mjs'), 'utf8');
const reviewSource = readFileSync(path.join(ROOT, 'scripts/task-tracker/verbs/review.mjs'), 'utf8');

describe('#1089 verification stage ownership', () => {
  test('pins the shared command-classification vocabulary and owning stages', () => {
    assert.equal(fixture.schema, 1);
    assert.deepEqual(
      fixture.commands.map(({ classification, owner }) => [classification, owner]),
      [
        ['lint-full', 'develop-final'],
        ['format-full', 'develop-final'],
        ['test-unit', 'test'],
        ['test-integration', 'test'],
        ['test-slow', 'test'],
        ['review-probe', 'review'],
      ]
    );
  });

  test('Develop separates affected iteration checks from exact-SHA finalization', () => {
    assert.deepEqual(
      buildIterationSteps(['src/a.mjs']).map(({ classification }) => classification),
      ['lint-affected-fix', 'format-affected-fix']
    );
    assert.deepEqual(
      buildFinalSteps().map(({ classification }) => classification),
      ['lint-full', 'format-full']
    );
  });

  test('Test reuses finalization evidence and executes complete lanes plus targeted commands', () => {
    assert.match(testSource, /partitionVerificationCommands/);
    assert.match(testSource, /for \(const lane of partition\.completeLanes\)/);
    assert.match(testSource, /for \(const reused of partition\.reused\)/);
    assert.match(
      testSource,
      /execInSandbox\(\{ argv: validation\.argv, path: wtPath, projectDir \}\)/
    );
  });

  test('Review validates exact-SHA Test evidence and does not run standard commands', () => {
    const refusal = reviewSource.indexOf('missing `aitm-dod-verified` marker');
    const resolver = reviewSource.indexOf('resolveReviewVerificationEvidence');
    const consumer = reviewSource.indexOf('evidenceCommands.filter');
    assert.ok(refusal >= 0 && resolver >= 0 && consumer > resolver);
    assert.match(reviewSource, /validateVerificationReceipt/);
    assert.doesNotMatch(reviewSource, /for \(const cmd of STANDARD_DOD_COMMANDS\)/);
  });
});
