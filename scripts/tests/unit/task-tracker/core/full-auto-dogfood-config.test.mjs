#!/usr/bin/env node
// @story #1696
// The dogfood repository inherits Full-Auto unless an operator explicitly opts out.

import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

import { resolveGate } from '../../../../task-tracker/lib/gate-resolve.mjs';

const projectConfig = JSON.parse(
  readFileSync(
    new URL('../../../../../.ai-task-manager/task-tracker.json', import.meta.url),
    'utf8'
  )
);

test('dogfood config inherits every Full-Auto review boundary', () => {
  const gates = [
    ['analysisToDevelopment', 'gateAnalysisToDevelopment'],
    ['pullRequestReview', 'gatePullRequestReview'],
    ['reviewToDone', 'gateReviewToDone'],
  ];

  for (const [gateName, projectKey] of gates) {
    assert.equal(
      Object.prototype.hasOwnProperty.call(projectConfig, projectKey),
      false,
      `${projectKey} must be absent so the repository inherits Full-Auto`
    );
    assert.equal(resolveGate(gateName, { projectConfig }), false);
  }
});
