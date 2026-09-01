// @story #863
/**
 * Deterministic speedup proof for #863 (vc:2).
 *
 * The runner's own end-to-end numbers depend on machine + ambient load, so they
 * are captured at the Test stage. THIS bench isolates the scheduling win with a
 * fixed synthetic workload — N sleeper tasks of equal duration — so the speedup
 * is machine-independent and repeatable:
 *
 *   serial (pool=1)   wall ≈ N · SLEEP
 *   parallel (pool=P) wall ≈ ⌈N / P⌉ · SLEEP
 *
 * It asserts the parallel wall is materially below the serial wall and records
 * the measured walls, ratio, and observed peak concurrency to a real artifact —
 * so AC2/AC3/AC10's "recorded as a real number" is produced by a run, never
 * hand-typed.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { runPool } from '../../../../run-tests-pool.mjs';

const __dir = path.dirname(fileURLToPath(import.meta.url)) + '/..';
const repoRoot = path.resolve(__dir, '../../../..');
const ARTIFACT = path.resolve(repoRoot, '.tmp', 'aitm', 'pool-bench.json');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

test('bounded pool beats serial on an equal-duration workload, and records the number', async () => {
  const N = 8;
  const SLEEP = 120; // ms per synthetic "file"
  const POOL = 4;
  const sleeper = async () => {
    await sleep(SLEEP);
    return 0;
  };
  const entries = Array.from({ length: N }, (_, i) => i);

  const serialStart = Date.now();
  await runPool({ entries, concurrency: 1, runOne: sleeper });
  const serialWallMs = Date.now() - serialStart;

  const parallelStart = Date.now();
  const { peakConcurrency } = await runPool({ entries, concurrency: POOL, runOne: sleeper });
  const parallelWallMs = Date.now() - parallelStart;

  const ratio = serialWallMs / parallelWallMs;

  // Theory: serial ≈ 8·120 = 960ms, parallel ≈ ⌈8/4⌉·120 = 240ms → ~4×. Assert a
  // conservative bound that tolerates scheduler jitter but still proves real
  // concurrency (a serial fallback would score ~1×).
  assert.ok(
    parallelWallMs * 2 < serialWallMs,
    `expected parallel (${parallelWallMs}ms) to be well under serial (${serialWallMs}ms)`
  );
  assert.equal(peakConcurrency, POOL, 'the pool should saturate to its cap under load');

  const artifact = {
    story: '#863',
    workload: { tasks: N, perTaskMs: SLEEP, pool: POOL },
    serialWallMs,
    parallelWallMs,
    speedupRatio: Number(ratio.toFixed(2)),
    peakConcurrency,
  };
  mkdirSync(path.dirname(ARTIFACT), { recursive: true });
  writeFileSync(ARTIFACT, `${JSON.stringify(artifact, null, 2)}\n`);

  // The artifact must round-trip a real, positive speedup number.
  assert.ok(
    artifact.speedupRatio > 1.5,
    `recorded speedup ${artifact.speedupRatio} should reflect real parallelism`
  );
});
