#!/usr/bin/env node
// @story #949
// CI-config drift guard: the checked-in workflow must give every job full git
// history, or the #868 git-mv provenance check silently stops checking.
//
// Two halves, both required. The synthetic cases pin the audit itself — a guard
// that cannot detect the pre-fix workflow is no guard at all. The live case
// runs that audit against the real .github/workflows/ci.yml, so the day someone
// drops `fetch-depth: 0` this fails instead of the provenance check quietly
// skipping.

import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { auditCheckoutHistory } from '../../../task-tracker/lib/ci-workflow-history.mjs';

// scripts/tests/unit/task-tracker/meta/ → five levels up is the repo root.
const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, '../../../..');
const WORKFLOW = path.join(REPO_ROOT, '.github/workflows/ci.yml');

// The exact shape trunk carried while it was red (#949).
const PRE_FIX = `jobs:
  fast:
    steps:
      - uses: actions/checkout@v5
      - name: Materialize local trunk ref (#745)
        run: git fetch --no-tags --depth=1 origin trunk:trunk
      - run: npm test
`;

const FIXED = `jobs:
  fast:
    steps:
      - uses: actions/checkout@v5
        with:
          fetch-depth: 0
      - name: Materialize local trunk ref (#745)
        run: git fetch --no-tags origin trunk:trunk
      - run: npm test
`;

test('the audit flags a default (shallow) checkout', () => {
  const { checkoutCount, shallowCheckouts } = auditCheckoutHistory(PRE_FIX);
  assert.equal(checkoutCount, 1);
  assert.equal(shallowCheckouts.length, 1);
  assert.equal(shallowCheckouts[0].line, 4);
});

test('the audit flags a git fetch that forces a --depth', () => {
  const { shallowFetches } = auditCheckoutHistory(PRE_FIX);
  assert.equal(shallowFetches.length, 1);
  assert.match(shallowFetches[0].text, /--depth=1/);
});

test('the audit clears a workflow with full history', () => {
  const { checkoutCount, shallowCheckouts, shallowFetches } = auditCheckoutHistory(FIXED);
  assert.equal(checkoutCount, 1);
  assert.deepEqual(shallowCheckouts, []);
  assert.deepEqual(shallowFetches, []);
});

test('a `with:` belongs to its own step, not the next one', () => {
  // Scoping is the one thing line-based parsing can get wrong: a `fetch-depth`
  // under a LATER step must not launder an earlier bare checkout.
  const twoSteps = `    steps:
      - uses: actions/checkout@v5
      - uses: actions/setup-node@v5
        with:
          fetch-depth: 0
`;
  const { shallowCheckouts } = auditCheckoutHistory(twoSteps);
  assert.equal(shallowCheckouts.length, 1, 'the bare checkout must still be flagged');
});

test('the live ci.yml gives every lane full history (#949)', () => {
  const { checkoutCount, shallowCheckouts, shallowFetches } = auditCheckoutHistory(
    readFileSync(WORKFLOW, 'utf8')
  );
  // Every assertion below is over a list. Zero checkouts would pass vacuously.
  assert.ok(checkoutCount >= 2, `expected a checkout per lane, found ${checkoutCount}`);
  assert.deepEqual(
    shallowCheckouts.map((c) => `ci.yml:${c.line}`),
    [],
    'an actions/checkout without `fetch-depth: 0` leaves `git log --follow` — and so the ' +
      '#868 git-mv provenance check — unanswerable'
  );
  assert.deepEqual(
    shallowFetches.map((f) => `ci.yml:${f.line}: ${f.text}`),
    [],
    'a `git fetch --depth=…` re-shallows the history that `fetch-depth: 0` just made complete'
  );
});
