// @story #1670
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { test } from 'node:test';

import { listLifecycleActions } from '../../../../task-tracker/lib/lifecycle-policy/actions.mjs';

const FIXTURE_ROOT = new URL('../../../fixtures/1558/', import.meta.url);
const ACTIONS = ['bind', 'resume', 'promote', 'test', 'review', 'deliver', 'close'];
const SCENARIOS = ['ready', 'blocked', 'indeterminate', 'changedAuthority', 'postReadyFailure'];

function fixture(name) {
  const url = new URL(name, FIXTURE_ROOT);
  assert.ok(existsSync(url), `${name} must be captured before A2 certification`);
  return JSON.parse(readFileSync(url, 'utf8'));
}

test('aggregate parity matrix covers every lifecycle action and required scenario', () => {
  const matrix = fixture('action-parity-matrix.json');
  assert.equal(matrix.schema, 'aitm.action-parity-matrix/v1');
  assert.deepEqual(
    matrix.actions.map(({ id }) => id),
    ACTIONS
  );
  assert.deepEqual(
    listLifecycleActions()
      .filter(({ explainReady }) => explainReady)
      .map(({ id }) => id),
    ACTIONS
  );
  for (const action of matrix.actions) {
    assert.deepEqual(Object.keys(action.scenarios), SCENARIOS, `${action.id} scenario coverage`);
    for (const [scenario, evidence] of Object.entries(action.scenarios)) {
      assert.ok(['typed', 'manual'].includes(evidence.disposition), `${action.id}.${scenario}`);
      assert.ok(evidence.file.startsWith('scripts/tests/'), `${action.id}.${scenario} source`);
      assert.ok(
        existsSync(new URL(`../../../../../${evidence.file}`, import.meta.url)),
        `${action.id}.${scenario} must cite an existing test suite`
      );
    }
  }
});

test('aggregate parity executes the seven action suites, not only their metadata', () => {
  const matrix = fixture('action-parity-matrix.json');
  const files = [
    ...new Set(
      matrix.actions.flatMap((action) => Object.values(action.scenarios).map((e) => e.file))
    ),
  ];
  const env = { ...process.env };
  delete env.NODE_TEST_CONTEXT;
  const run = spawnSync(process.execPath, ['--test', ...files], {
    cwd: new URL('../../../../../', import.meta.url),
    encoding: 'utf8',
    env,
    timeout: 120_000,
  });
  assert.equal(run.status, 0, run.stderr || run.stdout);
  assert.match(run.stdout, /ℹ fail 0\b/);
  for (const action of matrix.actions) {
    for (const [scenario, evidence] of Object.entries(action.scenarios)) {
      assert.ok(
        run.stdout.includes(`✔ ${evidence.test} (`),
        `${action.id}.${scenario} must execute and pass its named test`
      );
    }
  }
});

test('authority cost and residual legacy evidence are complete before A2 certification', () => {
  const cost = fixture('action-authority-cost.json');
  const residual = fixture('residual-legacy-review.json');
  assert.equal(cost.schema, 'aitm.action-authority-cost/v1');
  assert.equal(residual.schema, 'aitm.residual-legacy-review/v1');
  assert.deepEqual(
    cost.actions.map(({ id }) => id),
    ACTIONS
  );
  assert.ok(residual.entries.length > 0);
});
