// @story #1089
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, test } from 'node:test';

import { buildLintFormatSteps } from '../../../verify-develop.mjs';

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

describe('pre-#1089 verification stage ownership characterization', () => {
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

  test('Develop currently runs autofix, format, and full lint in one plan', () => {
    assert.deepEqual(
      buildLintFormatSteps().map(({ label }) => label),
      ['npm run lint:js -- --fix', 'npm run format', 'npm run lint']
    );
  });

  test('Test currently iterates over every parsed Verification Command', () => {
    assert.match(testSource, /for \(const vc of vcs\)/);
    assert.match(
      testSource,
      /execInSandbox\(\{ argv: validation\.argv, path: wtPath, projectDir \}\)/
    );
  });

  test('Review currently trusts standard commands only after sandbox evidence', () => {
    const refusal = reviewSource.indexOf('missing `aitm-dod-verified` marker');
    const seed = reviewSource.indexOf('for (const cmd of STANDARD_DOD_COMMANDS)');
    const consumer = reviewSource.indexOf('evidenceCommands.filter');
    assert.ok(refusal >= 0 && seed > refusal && consumer > seed);
    assert.match(reviewSource, /commandResults\.set\(cmd, true\)/);
  });
});
