// @story #1772
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';

import { GUIDANCE_CONTEXT_BUDGETS } from '../../../../task-tracker/lib/context-budgets.mjs';
import { captureGuidanceLifecycle } from '../../../helpers/capture-guidance-release.mjs';
import { buildGuidanceContextReport } from '../../../../task-tracker/measure-guidance-context.mjs';
import { formatReleaseMeasurement, measure } from '../../../../task-tracker/measure-context.mjs';
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

test('final release requires a complete installed-byte and public-CLI capture', async () => {
  const finalBytes = readFileSync(
    path.resolve('scripts/tests/fixtures/1558/actual-explain-traffic-final.json')
  );
  const report = await buildGuidanceContextReport({ captureBytes: finalBytes });
  const capture = JSON.parse(finalBytes);
  const manifest = JSON.parse(
    readFileSync(path.resolve('scripts/tests/fixtures/1558/final-capture-manifest.json'))
  );
  assert.equal(report.classification, 'final-installed-consumer-release');
  assert.equal(report.finalInstalledAdapterGate.status, 'passed');
  assert.deepEqual(
    manifest.eventNames,
    capture.events.map(({ name }) => name)
  );
  assert.deepEqual(manifest.trafficCategories, capture.measurement.traffic.categories);
  assert.deepEqual(Object.keys(manifest.trafficCategories).sort(), [
    'diagnostic',
    'external',
    'query',
  ]);
  assert.equal(report.tokenizerCalibration.calibration.tokenizer.package, 'js-tiktoken');
  assert.equal(report.tokenizerCalibration.calibration.tokenizer.encoding, 'o200k_base');
  assert.equal(capture.identity.productionPackage.productionOnly, true);
  assert.equal(capture.identity.productionPackage.name, '@kburson/ai-task-manager');
  assert.ok(capture.measurement.budgets.fullLifecycleTarget === 6000);
  assert.ok(capture.measurement.budgets.fullLifecycleWorking === 6500);
  assert.equal(report.heavyCase.observedPublicCli.captureKind, 'actual-installed-public-cli');
  assert.equal(report.heavyCase.observedPublicCli.declaredInputs.childIds.length, 4);
  assert.equal(report.heavyCase.observedPublicCli.declaredInputs.dependencyIds.length, 3);
  assert.equal(report.heavyCase.observedPublicCli.status, 'blocked');
  assert.equal(report.heavyCase.observedPublicCli.blockerCount, 2);
  assert.ok(report.heavyCase.observedPublicCli.traffic.proxyTokens > 0);
  for (const adapter of ['claude', 'codex']) {
    const paired = report.adapters[adapter];
    assert.equal(paired.current.captureKind, 'actual-public-cli-traffic-plus-installed-static');
    assert.equal(paired.current.uncountedAgentVisibleBytes, 0);
    assert.ok(paired.eventManifest.length >= 24);
    assert.ok(Object.values(paired.currentBudgetVerdicts).every((verdict) => verdict.workingPass));
    assert.ok(paired.current.proxyTokens < paired.legacy.proxyTokens);
  }
  const incomplete = structuredClone(capture);
  incomplete.events.splice(
    incomplete.events.findIndex(({ name }) => name === 'diagnostic'),
    1
  );
  await assert.rejects(
    buildGuidanceContextReport({ captureBytes: Buffer.from(JSON.stringify(incomplete)) }),
    /missing diagnostic|required:diagnostic|capture identity drift/
  );
  const missingHeavy = structuredClone(capture);
  delete missingHeavy.heavyCase;
  await assert.rejects(
    buildGuidanceContextReport({ captureBytes: Buffer.from(JSON.stringify(missingHeavy)) }),
    /reachable heavy public-CLI evidence/
  );
});

test('final package and public-CLI capture regenerate byte for byte', () => {
  const expected = readFileSync(
    path.resolve('scripts/tests/fixtures/1558/actual-explain-traffic-final.json'),
    'utf8'
  );
  assert.equal(
    `${JSON.stringify(captureGuidanceLifecycle({ mode: 'final' }), null, 2)}\n`,
    expected
  );
});

test('fixed release measurement refuses a missing required instruction file', () => {
  const report = formatReleaseMeasurement(
    'release-static:invoked+pickup (codex)',
    [{ rel: 'skill/shared/router.md', tokens: 0, missing: true }],
    { absolute: 5000, working: 4000 }
  );
  assert.equal(report.status, 'OVER');
  assert.deepEqual(report.missingFiles, ['skill/shared/router.md']);
  assert.match(report.text, /MISSING/);
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
