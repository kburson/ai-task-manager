// @story #1861
// @story #1772
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, rmSync } from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';

import { GUIDANCE_CONTEXT_BUDGETS } from '../../../../task-tracker/lib/context-budgets.mjs';
import { buildGuidanceContextReport } from '../../../../task-tracker/measure-guidance-context.mjs';
import { formatReleaseMeasurement, measure } from '../../../../task-tracker/measure-context.mjs';
import { buildPairedContext } from '../../../helpers/guidance-paired-context.mjs';
import {
  archivedObligationMapRoot,
  assertCurrentCaptureSources,
  publishedCaptureSource,
} from '../../../helpers/guidance-capture-provenance.mjs';
import { currentCaptureManifest } from '../../../helpers/generate-current-guidance-evidence.mjs';
import { mkdtempProjectIsolated } from '../../../../task-tracker/lib/scratch-dir.mjs';

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
    path.resolve('scripts/tests/fixtures/1857/1866-current/actual-explain-traffic-final.json')
  );
  const report = await buildGuidanceContextReport({ captureBytes: finalBytes });
  const capture = JSON.parse(finalBytes);
  const manifest = JSON.parse(
    readFileSync(
      path.resolve('scripts/tests/fixtures/1857/1866-current/final-capture-manifest.json')
    )
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
    assert.equal(paired.identities.currentSourceCommit, manifest.sourceCommit);
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

test('committed final package and public-CLI archive regenerate byte for byte from its source commit', () => {
  const expected = readFileSync(
    path.resolve('scripts/tests/fixtures/1857/1866-current/actual-explain-traffic-final.json'),
    'utf8'
  );
  const manifest = JSON.parse(
    readFileSync(
      path.resolve('scripts/tests/fixtures/1857/1866-current/final-capture-manifest.json'),
      'utf8'
    )
  );
  const sourceCommit = publishedCaptureSource(
    JSON.parse(expected),
    manifest.sourceCommit,
    path.resolve('.')
  );
  const fixture = mkdtempProjectIsolated('guidance-pinned-release-');
  try {
    // Regenerate immutable evidence with its immutable implementation. Changed
    // candidate sources require a new capture and cannot inherit this receipt.
    execFileSync('git', ['fetch', '--no-tags', path.resolve('.'), sourceCommit], {
      cwd: fixture,
    });
    execFileSync('git', ['checkout', '-q', '--detach', 'FETCH_HEAD'], { cwd: fixture });
    assert.equal(
      execFileSync('git', ['rev-parse', 'HEAD'], { cwd: fixture, encoding: 'utf8' }).trim(),
      sourceCommit
    );
    assertCurrentCaptureSources(JSON.parse(expected), sourceCommit, fixture);
    const regenerated = execFileSync(
      process.execPath,
      [path.join(fixture, 'scripts/tests/helpers/capture-guidance-release.mjs'), '--final'],
      { cwd: fixture, encoding: 'utf8', timeout: 600_000, maxBuffer: 8 * 1024 * 1024 }
    );
    assert.equal(regenerated, expected);
  } finally {
    rmSync(fixture, { recursive: true, force: true });
  }
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

test('accepted final archive stays intact and cannot certify changed current sources', async () => {
  const bytes = readFileSync(
    path.resolve('scripts/tests/fixtures/1558/actual-explain-traffic-final.json')
  );
  const archived = JSON.parse(bytes);
  const manifest = JSON.parse(
    readFileSync(path.resolve('scripts/tests/fixtures/1558/final-capture-manifest.json'))
  );
  const digest = (value) => `sha256:${createHash('sha256').update(value).digest('hex')}`;
  assert.equal(manifest.captureSha256, digest(bytes));
  assert.equal(archived.identity.transcriptSha256, digest(JSON.stringify(archived.events)));
  assert.deepEqual(
    manifest.eventNames,
    archived.events.map(({ name }) => name)
  );
  assert.deepEqual(manifest.trafficCategories, archived.measurement.traffic.categories);
  assert.ok(
    archived.identity.implementationFiles.some(
      ({ path: file, sha256 }) => digest(readFileSync(path.resolve(file))) !== sha256
    )
  );
  await assert.rejects(
    buildGuidanceContextReport({
      captureBytes: bytes,
      capturePath: manifest.capturePath,
      manifestBytes: Buffer.from(JSON.stringify(manifest)),
    }),
    /final capture identity drift/
  );
});

test('internally consistent dirty installed guidance cannot inherit a committed source identity', () => {
  const originalCapture = JSON.parse(
    readFileSync(
      path.resolve('scripts/tests/fixtures/1857/1866-current/actual-explain-traffic-final.json')
    )
  );
  const originalManifest = JSON.parse(
    readFileSync(
      path.resolve('scripts/tests/fixtures/1857/1866-current/final-capture-manifest.json')
    )
  );
  const sourceCommit = publishedCaptureSource(
    originalCapture,
    originalManifest.sourceCommit,
    path.resolve('.')
  );
  const fixture = mkdtempProjectIsolated('guidance-dirty-source-');
  const digest = (value) => `sha256:${createHash('sha256').update(value).digest('hex')}`;
  const git = (args) => execFileSync('git', args, { cwd: fixture, encoding: 'utf8' }).trim();
  try {
    git(['fetch', '--no-tags', path.resolve('.'), sourceCommit]);
    git(['checkout', '-q', '--detach', 'FETCH_HEAD']);
    assert.equal(assertCurrentCaptureSources(originalCapture, sourceCommit, fixture), sourceCommit);
    for (const [sourcePath, packagePath] of [
      ['skill/shared/router.md', 'skill/shared/router.md'],
      ['.ai-task-manager/templates/pickup-directive.md', 'templates/pickup-directive.md'],
    ]) {
      const capture = structuredClone(originalCapture);
      const original = readFileSync(path.join(fixture, sourcePath), 'utf8');
      const dirty = original.replace(/[A-Za-z]/, (letter) =>
        letter === letter.toUpperCase() ? letter.toLowerCase() : letter.toUpperCase()
      );
      assert.notEqual(dirty, original);
      for (const file of new Set([sourcePath, packagePath]))
        writeFileSync(path.join(fixture, file), dirty);
      for (const adapter of Object.values(capture.measurement.installedStatic)) {
        for (const file of adapter.files)
          if (file.sourcePath === sourcePath) file.sha256 = digest(dirty);
      }
      for (const file of capture.identity.productionPackage.files)
        if (file.path === packagePath) file.sha256 = digest(dirty);
      capture.identity.productionPackage.filesSha256 = digest(
        JSON.stringify(capture.identity.productionPackage.files)
      );
      capture.identity.sourceInputsSha256 = digest(
        JSON.stringify({
          implementationFiles: capture.identity.implementationFiles,
          productionPackage: capture.identity.productionPackage,
        })
      );
      const captureBytes = Buffer.from(JSON.stringify(capture));
      const manifest = currentCaptureManifest(capture, captureBytes, sourceCommit);
      assert.equal(manifest.captureSha256, digest(captureBytes));
      assert.deepEqual(manifest.installedStatic, capture.measurement.installedStatic);
      assert.equal(git(['rev-parse', 'HEAD']), manifest.sourceCommit);
      assert.throws(
        () => assertCurrentCaptureSources(capture, manifest.sourceCommit, fixture),
        /uncommitted captured source/
      );
      for (const file of new Set([sourcePath, packagePath]))
        writeFileSync(path.join(fixture, file), original);
    }
  } finally {
    rmSync(fixture, { recursive: true, force: true });
  }
});

test('recertification refuses a relabeled or altered lifecycle capture', async (t) => {
  const projectRoot = process.cwd();
  const fixtureRoot = path.join(projectRoot, 'scripts/tests/fixtures/1558');
  // #1857: current replay uses an isolated fixture actor; archived captures
  // and their original provenance assertions remain unchanged.
  const keys = ['AI_TASK_MANAGER_SESSION_ID', 'AI_TASK_MANAGER_APP_NAME'];
  const prior = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
  process.env.AI_TASK_MANAGER_SESSION_ID = 'fixture-guidance-replay';
  process.env.AI_TASK_MANAGER_APP_NAME = 'codex';
  t.after(() => {
    for (const [key, value] of Object.entries(prior)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });
  const { buildCurrentRecertificationDecision } =
    await import('../../../../maintenance/measure-guidance-candidate.mjs');
  assert.throws(
    () => buildCurrentRecertificationDecision({ projectRoot }),
    /guidance-feasibility:obligation-map-drift/
  );
  const archived = archivedObligationMapRoot(projectRoot);
  t.after(archived.cleanup);
  const committed = JSON.parse(
    readFileSync(path.join(fixtureRoot, 'actual-explain-traffic-recertification.json'), 'utf8')
  );
  const modeDrift = structuredClone(committed);
  modeDrift.identity.mode = 'historical';
  assert.throws(
    () => buildCurrentRecertificationDecision({ projectRoot: archived.root, capture: modeDrift }),
    /guidance-feasibility:capture-mode/
  );
  const transcriptDrift = structuredClone(committed);
  transcriptDrift.events.find(({ name }) => name === 'lifecycle-close').typed.status = 'blocked';
  assert.throws(
    () =>
      buildCurrentRecertificationDecision({ projectRoot: archived.root, capture: transcriptDrift }),
    /guidance-feasibility:capture-transcript-digest/
  );
  const sourceDrift = structuredClone(committed);
  sourceDrift.identity.implementationFiles[0].sha256 = `sha256:${'0'.repeat(64)}`;
  assert.throws(
    () => buildCurrentRecertificationDecision({ projectRoot: archived.root, capture: sourceDrift }),
    /guidance-feasibility:capture-committed-source/
  );
  const selfConsistentDrift = structuredClone(committed);
  const first = selfConsistentDrift.events.find(({ name }) => name === 'ready-first-load');
  first.stdout = first.stdout.replace('"query":"bind"', '"query":"noop"');
  selfConsistentDrift.identity.transcriptSha256 = `sha256:${createHash('sha256')
    .update(JSON.stringify(selfConsistentDrift.events))
    .digest('hex')}`;
  assert.throws(
    () =>
      buildCurrentRecertificationDecision({
        projectRoot: archived.root,
        capture: selfConsistentDrift,
      }),
    /capture-replay/
  );
});
