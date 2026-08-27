#!/usr/bin/env node
// @story #745
// Content assertions for the current CI contract: #745 materializes a local
// `refs/heads/trunk` on `pull_request` checkouts so real-git close-gate tests
// (#733) resolve trunk in a detached merge ref. Fast checkout depth 2 also
// retains the PR merge parents needed for current `trunk...HEAD` docs-only
// diff classification; it is not a historical-provenance requirement. Backs
// AC1 (both lanes materialize the ref), AC2 (pull_request-only), and AC4
// (trunk resolution + gate assertions intact — #927 relocated that logic into
// shared `lib/trunk-ref.mjs`, which close-gates delegates to).

import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url)) + '/..';
const REPO_ROOT = resolve(HERE, '../../../..');
const read = (rel) => readFileSync(resolve(REPO_ROOT, rel), 'utf8');

const ci = read('.github/workflows/ci.yml');
const closeGates = read('scripts/task-tracker/lib/close-gates.mjs');
const trunkRef = read('scripts/task-tracker/lib/trunk-ref.mjs');
const closeGateTests = read('scripts/tests/slow/task-tracker/lib/coverage-close-gates.test.mjs');

const STEP_NAME = 'Materialize local trunk ref for real-git tests (#745)';
// The #745 contract is that both lanes materialize a local trunk ref only on
// pull_request events, where the checkout is a detached merge ref.
const MATERIALIZE_RUN = 'git fetch --no-tags origin trunk:trunk';
const PR_GUARD = "if: github.event_name == 'pull_request'";
const DOCS_ONLY_DIFF = 'git diff --name-only trunk...HEAD';
const FAST_JOB = ci.slice(ci.indexOf('  fast:'), ci.indexOf('\n  slow:'));
const SLOW_JOB = ci.slice(ci.indexOf('  slow:'));

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

test('AC3: Fast checkout retains the PR merge base for docs-only classification', () => {
  assert.equal(
    ci.split('fetch-depth: 2').length - 1,
    1,
    'only the Fast checkout uses depth 2 for the current PR merge base'
  );
  assert.equal(ci.split('fetch-depth: 0').length - 1, 0, 'no full-history checkout remains');
  assert.ok(
    FAST_JOB.indexOf('fetch-depth: 2') > FAST_JOB.indexOf('- uses: actions/checkout@v5'),
    'Fast checkout declares depth 2'
  );
  assert.ok(!SLOW_JOB.includes('fetch-depth:'), 'Slow checkout keeps its default depth 1');
  assert.ok(FAST_JOB.includes(DOCS_ONLY_DIFF), 'docs-only classifier keeps its trunk...HEAD diff');
  assert.equal(
    ci.split(MATERIALIZE_RUN).length - 1,
    2,
    'both #745 local-trunk materialization steps remain'
  );
});

test('AC4: production trunk resolution and gate assertions are intact (now via the shared resolver)', () => {
  // #927 relocated trunk resolution out of close-gates.mjs into the one shared
  // `lib/trunk-ref.mjs`. The documented [trunk, main, master] order and the
  // local refs/heads probe still exist — they just live in the shared module
  // now, and close-gates.mjs delegates to `resolveTrunkRef`.
  assert.match(trunkRef, /TRUNK_BRANCHES\s*=\s*\[\s*'trunk',\s*'main',\s*'master'\s*\]/);
  assert.match(
    trunkRef,
    /refs\/heads\/\$\{branch\}/,
    'probes refs/heads/<branch> for a local branch'
  );
  assert.match(
    closeGates,
    /resolveTrunkRef[^\n]*from '\.\/trunk-ref\.mjs'/,
    'close-gates delegates to the shared resolver'
  );
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
