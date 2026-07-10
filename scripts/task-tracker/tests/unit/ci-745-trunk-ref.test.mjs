#!/usr/bin/env node
// @story #745
// Content assertions for the CI-environment fix (#745, child of epic #727) that
// materializes a local `refs/heads/trunk` on `pull_request` checkouts so the
// real-git close-gate tests (#733) resolve trunk in a detached merge-ref
// checkout. Backs AC1 (both lanes materialize the ref), AC2 (the step is
// pull_request-scoped), and AC4 (no change to close-gate assertions or the
// production `close-gates.mjs` trunk-resolution logic — the fix is CI-only).

import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, '../../../..');
const read = (rel) => readFileSync(resolve(REPO_ROOT, rel), 'utf8');

const ci = read('.github/workflows/ci.yml');
const closeGates = read('scripts/task-tracker/lib/close-gates.mjs');
const closeGateTests = read('scripts/task-tracker/tests/unit/coverage-close-gates.test.mjs');

const STEP_NAME = 'Materialize local trunk ref for real-git tests (#745)';
const MATERIALIZE_RUN = 'git fetch --no-tags --depth=1 origin trunk:trunk';
const PR_GUARD = "if: github.event_name == 'pull_request'";

test('AC1: both Fast and Slow lanes materialize a local trunk ref', () => {
  const runs = ci.split(MATERIALIZE_RUN).length - 1;
  assert.equal(runs, 2, 'both lane jobs run the trunk-materialize fetch');
  const stepNames = ci.split(STEP_NAME).length - 1;
  assert.equal(stepNames, 2, 'both lanes carry the named materialize step');
});

test('AC2: the materialize step is scoped to pull_request events only', () => {
  // Every materialize step block must carry the pull_request guard before the
  // fetch run, so it does not run on push/schedule/workflow_dispatch.
  const blocks = ci.split(STEP_NAME).slice(1);
  assert.equal(blocks.length, 2, 'two materialize step blocks');
  for (const block of blocks) {
    const head = block.slice(0, 200);
    assert.ok(head.includes(PR_GUARD), 'step guarded by pull_request');
    assert.ok(
      head.indexOf(PR_GUARD) < head.indexOf(MATERIALIZE_RUN),
      'guard precedes the fetch run'
    );
  }
});

test('AC4: production close-gates trunk resolution and gate assertions are unchanged', () => {
  // The fix touched only CI config: the production trunk-resolution logic still
  // probes local refs/heads in the documented [trunk, main, master] order...
  assert.match(closeGates, /TRUNK_FALLBACKS\s*=\s*\[\s*'trunk',\s*'main',\s*'master'\s*\]/);
  assert.match(closeGates, /refs\/heads\/\$\{ref\}/, 'probes refs/heads/<ref> for a local branch');
  // ...and the close-gate tests still exercise the real message-attribution
  // path, tolerating the "nothing attributed on trunk" blocker (assertions not
  // weakened by the #745 fix).
  assert.match(
    closeGateTests,
    /close-no-attributed-commit-on-trunk/,
    'tolerated-blocker assertion intact'
  );
  assert.match(
    closeGateTests,
    /commitsOnTrunkGate: cfg\.trunkRef short-circuits defaultResolveTrunkRef/,
    'test 22 present and unchanged'
  );
});
