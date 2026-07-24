#!/usr/bin/env node
// @story #745
// Content assertions for the CI-environment fix (#745, child of epic #727) that
// materializes a local `refs/heads/trunk` on `pull_request` checkouts so the
// real-git close-gate tests (#733) resolve trunk in a detached merge-ref
// checkout. Backs AC1 (both lanes materialize the ref), AC2 (the step is
// pull_request-scoped), and AC4 (trunk-resolution logic + gate assertions
// intact — #927 later relocated that logic from `close-gates.mjs` into the
// shared `lib/trunk-ref.mjs`, which close-gates now delegates to).

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
const closeGateTests = read('scripts/task-tracker/tests/unit/lib/coverage-close-gates.test.mjs');

const STEP_NAME = 'Materialize local trunk ref for real-git tests (#745)';
// #949 dropped the `--depth=1` this fetch used to carry. The #745 contract is
// "both lanes materialize a local trunk ref, on pull_request only" — the depth
// flag was incidental to it, and actively harmful: grafting a shallow trunk
// re-introduced the truncated history that made #868's `git log --follow`
// provenance check unanswerable. `meta/ci-workflow-history.test.mjs` now fails
// the build if any `git fetch` in the workflow forces a `--depth` again.
const MATERIALIZE_RUN = 'git fetch --no-tags origin trunk:trunk';
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
