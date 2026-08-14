// @story #1040

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const CONSUMERS = [
  'scripts/task-tracker/lib/agent-review/review-gate.mjs',
  'scripts/task-tracker/lib/agent-review/validators/v6-marker-organization.mjs',
];

test('review-failure consumers delegate delimiter grammar and span location to the shared leaf', () => {
  for (const file of CONSUMERS) {
    const source = readFileSync(file, 'utf8');
    assert.match(
      source,
      /from ['"].*review-failure-block\.mjs['"]/,
      `${file} must import the boundary helper`
    );
    assert.doesNotMatch(
      source,
      /const\s+REVIEW_FAILED_(?:START|END)(?:_LINE)?_RE\b/,
      `${file} owns a review-failure delimiter expression`
    );
    assert.doesNotMatch(
      source,
      /function\s+findReviewFailedLineSpan\b/,
      `${file} owns a review-failure span scan`
    );
    assert.doesNotMatch(
      source,
      /while\s*\([^)]*REVIEW_FAILED_END/,
      `${file} owns a review-failure end scan`
    );
  }
});
