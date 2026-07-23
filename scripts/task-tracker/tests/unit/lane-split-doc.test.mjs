#!/usr/bin/env node
// @story #934
// AC6 — the workflow guide documents the two-lane DoD `tests` verification: it
// names both lanes, states the split is coverage-identical to `test:all`, and
// carries no stale single-command timing figure.

import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../../..');
const GUIDE = readFileSync(path.join(ROOT, 'docs/guides/workflow.md'), 'utf8');

test('workflow guide has a two-lane DoD tests section naming both lanes', () => {
  assert.match(GUIDE, /Two-lane DoD `tests` verification/);
  assert.match(GUIDE, /`npm run test:slow`/);
  assert.match(GUIDE, /`npm test`/);
});

test('the guide records the split is coverage-identical to test:all', () => {
  assert.match(GUIDE, /coverage-identical/);
});

test('the stale single-command timing figure is gone', () => {
  assert.doesNotMatch(GUIDE, /~130s/);
});
