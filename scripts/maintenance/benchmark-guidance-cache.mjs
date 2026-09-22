#!/usr/bin/env node
// @story #1674
// Five fresh-process runtime cases. CI owns budget calibration; local output is diagnostic.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { fileURLToPath } from 'node:url';

import { mkdtempProjectIsolated } from '../task-tracker/lib/scratch-dir.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const CACHE_URL = new URL('../../guidance/cache.mjs', import.meta.url).href;
const CASES = ['cold', 'warmManifest', 'warmAgent', 'human', 'invalidDiagnostics'];
const BUDGET_PATH = path.join(ROOT, 'scripts/tests/fixtures/1558/cache-budgets.json');

function processLoad(projectRoot, need) {
  const script = `
    import { loadGuidance } from ${JSON.stringify(CACHE_URL)};
    const result = loadGuidance({ projectRoot: process.cwd(), need: ${JSON.stringify(need)} });
    process.stderr.write(JSON.stringify({
      valid: result.valid,
      agent: Boolean(result.agentIndex?.byId?.['action.bind']),
      human: Boolean(result.humanCatalog?.byId?.['action.bind']),
      errors: result.errors?.length ?? null,
    }));
  `;
  const start = performance.now();
  const child = spawnSync(process.execPath, ['--input-type=module', '-e', script], {
    cwd: projectRoot,
    encoding: 'utf8',
    timeout: 30_000,
  });
  const elapsedMs = performance.now() - start;
  assert.equal(child.error, undefined, child.error?.message);
  assert.equal(child.status, 0, child.stderr);
  assert.equal(child.stdout, '', 'guidance loader must be silent');
  return { elapsedMs, result: JSON.parse(child.stderr) };
}

function stats(samples) {
  const sorted = [...samples].sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)];
  const p95 = sorted[Math.ceil(sorted.length * 0.95) - 1];
  return {
    samplesMs: samples.map((value) => Number(value.toFixed(2))),
    medianMs: Number(median.toFixed(2)),
    p95Ms: Number(p95.toFixed(2)),
  };
}

export function benchmarkGuidanceCache({ samples = 7 } = {}) {
  if (!Number.isInteger(samples) || samples < 3) throw new TypeError('samples must be at least 3');
  const validRoot = mkdtempProjectIsolated('guidance-benchmark-valid-');
  const invalidRoot = mkdtempProjectIsolated('guidance-benchmark-invalid-');
  const validCache = path.join(validRoot, '.tmp/aitm/guidance-cache');
  const observed = Object.fromEntries(CASES.map((name) => [name, []]));
  try {
    const override = path.join(invalidRoot, '.ai-task-manager', 'aitm-guidance.yml');
    mkdirSync(path.dirname(override), { recursive: true });
    writeFileSync(override, 'schema: invalid\n');
    const staged = spawnSync('git', ['add', '-f', '.ai-task-manager/aitm-guidance.yml'], {
      cwd: invalidRoot,
      encoding: 'utf8',
    });
    assert.equal(staged.status, 0, staged.stderr);
    for (let index = 0; index < samples; index += 1) {
      rmSync(validCache, { recursive: true, force: true });
      const cold = processLoad(validRoot, 'manifest');
      assert.equal(cold.result.valid, true);
      observed.cold.push(cold.elapsedMs);
      for (const [name, need] of [
        ['warmManifest', 'manifest'],
        ['warmAgent', 'agent'],
        ['human', 'human'],
      ]) {
        const warm = processLoad(validRoot, need);
        assert.equal(warm.result.valid, true);
        if (need === 'agent') assert.equal(warm.result.agent, true);
        if (need === 'human') assert.equal(warm.result.human, true);
        observed[name].push(warm.elapsedMs);
      }
      if (!existsSync(path.join(invalidRoot, '.tmp/aitm/guidance-cache/manifest.v1.json'))) {
        assert.equal(processLoad(invalidRoot, 'diagnostics').result.valid, false);
      }
      const invalid = processLoad(invalidRoot, 'diagnostics');
      assert.equal(invalid.result.valid, false);
      assert.ok(invalid.result.errors > 0);
      observed.invalidDiagnostics.push(invalid.elapsedMs);
    }
    return {
      schema: 'aitm.guidance-cache-benchmark/v1',
      node: process.version,
      platform: process.platform,
      architecture: process.arch,
      samples,
      cases: Object.fromEntries(CASES.map((name) => [name, stats(observed[name])])),
    };
  } finally {
    rmSync(validRoot, { recursive: true, force: true });
    rmSync(invalidRoot, { recursive: true, force: true });
  }
}

export function checkCacheBudgets(
  measured,
  budget = JSON.parse(readFileSync(BUDGET_PATH, 'utf8'))
) {
  assert.equal(budget.schema, 'aitm.guidance-cache-budgets/v1');
  for (const name of CASES) {
    const limit = budget.cases?.[name];
    assert.ok(Number.isFinite(limit?.ceilingMs) && limit.ceilingMs > 0, `${name} ceiling missing`);
    assert.ok(Number.isFinite(limit?.ciP95Ms) && limit.ciP95Ms > 0, `${name} CI baseline missing`);
    assert.ok(limit.ciP95Ms <= limit.ceilingMs * 0.8, `${name} budget lacks 20% headroom`);
    assert.ok(
      measured.cases[name].p95Ms <= limit.ceilingMs * 0.8,
      `${name} p95 ${measured.cases[name].p95Ms}ms exceeds 80% working ceiling ${limit.ceilingMs}ms`
    );
  }
  assert.ok(measured.cases.warmManifest.medianMs < measured.cases.cold.medianMs);
  assert.ok(measured.cases.warmAgent.medianMs < measured.cases.cold.medianMs);
  return true;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const check = process.argv.includes('--check-budget');
  const sampleArg = process.argv.find((arg) => arg.startsWith('--samples='));
  const samples = sampleArg ? Number(sampleArg.split('=')[1]) : 7;
  const measured = benchmarkGuidanceCache({ samples });
  process.stdout.write(`${JSON.stringify(measured)}\n`);
  if (check) checkCacheBudgets(measured);
}
