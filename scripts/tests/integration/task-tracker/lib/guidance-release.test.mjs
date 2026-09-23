// @story #1772
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';

import { GUIDANCE_CONTEXT_BUDGETS } from '../../../../task-tracker/lib/context-budgets.mjs';
import { buildGuidanceContextReport } from '../../../../task-tracker/measure-guidance-context.mjs';
import { measure } from '../../../../task-tracker/measure-context.mjs';
import { buildPairedContext } from '../../../helpers/guidance-paired-context.mjs';

const MEASURE_SCRIPT = path.resolve('scripts/task-tracker/measure-context.mjs');

const captureBytes = readFileSync(
  path.resolve('scripts/tests/fixtures/1558/actual-explain-traffic-recertification.json')
);

function withWorkingLimit(category, limit) {
  return {
    ...GUIDANCE_CONTEXT_BUDGETS,
    [category]: { absolute: limit, working: limit },
  };
}

for (const adapter of ['claude', 'codex']) {
  test(`${adapter} static pickup and captured lifecycle use the same router-plus-pickup budget`, () => {
    const generous = withWorkingLimit('routerPlusPickup', 50000);
    const restrictive = withWorkingLimit('routerPlusPickup', 1);
    assert.equal(
      measure({ mode: 'release-static', scenario: 'invoked+pickup', adapter, budgets: generous })
        .status,
      'OK'
    );
    assert.equal(
      measure({ mode: 'release-static', scenario: 'invoked+pickup', adapter, budgets: restrictive })
        .status,
      'OVER'
    );
    assert.equal(
      buildPairedContext({ captureBytes, adapter, budgets: generous }).currentBudgetVerdicts
        .routerPlusPickup.workingPass,
      true
    );
    assert.equal(
      buildPairedContext({ captureBytes, adapter, budgets: restrictive }).currentBudgetVerdicts
        .routerPlusPickup.workingPass,
      false
    );
  });

  test(`${adapter} static lifecycle and captured lifecycle use the same full-lifecycle budget`, () => {
    const generous = withWorkingLimit('fullLifecycle', 50000);
    const restrictive = withWorkingLimit('fullLifecycle', 1);
    assert.equal(
      measure({ mode: 'release-static', scenario: 'bind+review+close', adapter, budgets: generous })
        .status,
      'OK'
    );
    assert.equal(
      measure({
        mode: 'release-static',
        scenario: 'bind+review+close',
        adapter,
        budgets: restrictive,
      }).status,
      'OVER'
    );
    assert.equal(
      buildPairedContext({ captureBytes, adapter, budgets: generous }).currentBudgetVerdicts
        .fullLifecycle.workingPass,
      true
    );
    assert.equal(
      buildPairedContext({ captureBytes, adapter, budgets: restrictive }).currentBudgetVerdicts
        .fullLifecycle.workingPass,
      false
    );
  });
}

test('pre-slim public CLI capture cannot certify the final installed adapter release', async () => {
  const report = await buildGuidanceContextReport({ captureBytes });
  assert.equal(report.finalInstalledAdapterGate.status, 'pending');
  assert.match(report.finalInstalledAdapterGate.reason, /final installed adapter bytes/i);
});

for (const adapter of ['claude', 'codex']) {
  test(`${adapter} aggregate CLI labels fixed release scenarios and exits on any breach`, () => {
    const run = spawnSync(
      process.execPath,
      [MEASURE_SCRIPT, '--all', '--json', '--adapter', adapter],
      {
        encoding: 'utf8',
      }
    );
    assert.equal(run.error, undefined);
    const reports = JSON.parse(run.stdout);
    for (const name of ['invoked+pickup', 'bind+review+close']) {
      assert.ok(reports.some((entry) => entry.label === `release-static:${name} (${adapter})`));
    }
    assert.ok(reports.some((entry) => entry.label === 'idle'));
    assert.ok(
      reports.some((entry) => entry.label === `scenario:parallel-orchestration (${adapter})`)
    );
    assert.equal(run.status, reports.some((entry) => entry.status === 'OVER') ? 1 : 0);
  });
}
