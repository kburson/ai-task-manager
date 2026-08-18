// @story #863
/**
 * Pool-correctness verifier for #863 (vc:1).
 *
 * Proves the scheduling seam that parallelizes the runner's unit lane without
 * spawning the real 642-file suite: bounded concurrency, stable INPUT-order
 * results, exit-code shaping, env/timeout/maxBuffer policy propagation, the
 * describeSpawnResult contract on the failure path, and — the reason #862 gated
 * this work — that a concurrent child's side effect is still bracketed by the
 * whole-run snapshot the fleet-registry leak guard relies on.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  runPool,
  poolConcurrency,
  slowPoolConcurrency,
  subprocessPoolConcurrency,
  spawnTestChild,
} from '../../../../run-tests-pool.mjs';
import { describeSpawnResult } from '../../../../run-tests-report.mjs';
import { mkdtempProjectIsolated } from '../../../../task-tracker/lib/scratch-dir.mjs';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---- poolConcurrency: cpus - 1, floored at 1 -----------------------------
test('poolConcurrency reserves one core and never drops below 1', () => {
  assert.equal(poolConcurrency(10), 9);
  assert.equal(poolConcurrency(2), 1);
  assert.equal(poolConcurrency(1), 1);
  assert.equal(poolConcurrency(0), 1);
  assert.equal(poolConcurrency(undefined), Math.max(1, os.cpus().length - 1));
});

test('subprocessPoolConcurrency is capped at two and floored at one', () => {
  assert.equal(subprocessPoolConcurrency(10), 2);
  assert.equal(subprocessPoolConcurrency(3), 2);
  assert.equal(subprocessPoolConcurrency(2), 1);
  assert.equal(subprocessPoolConcurrency(1), 1);
  assert.equal(subprocessPoolConcurrency(Number.NaN), 1);
  assert.equal(subprocessPoolConcurrency(undefined), Math.min(2, poolConcurrency()));
});

test('slowPoolConcurrency is independently capped at two and floored at one', () => {
  assert.equal(slowPoolConcurrency(10), 2);
  assert.equal(slowPoolConcurrency(3), 2);
  assert.equal(slowPoolConcurrency(2), 1);
  assert.equal(slowPoolConcurrency(1), 1);
  assert.equal(slowPoolConcurrency(Number.NaN), 1);
  assert.equal(slowPoolConcurrency(undefined), Math.min(2, poolConcurrency()));
});

test('runPool honors the reduced subprocess cap and preserves input order', async () => {
  const entries = [0, 1, 2, 3, 4, 5];
  let active = 0;
  let peak = 0;
  const { results, peakConcurrency } = await runPool({
    entries,
    concurrency: subprocessPoolConcurrency(10),
    runOne: async (entry) => {
      active += 1;
      peak = Math.max(peak, active);
      await sleep((entries.length - entry) * 2);
      active -= 1;
      return entry * 10;
    },
  });
  assert.equal(peak, 2);
  assert.equal(peakConcurrency, 2);
  assert.deepEqual(
    results,
    entries.map((entry) => entry * 10)
  );
});

// ---- runPool: never exceeds the concurrency cap --------------------------
test('runPool keeps at most `concurrency` invocations in flight', async () => {
  let active = 0;
  let observedPeak = 0;
  const runOne = async () => {
    active++;
    observedPeak = Math.max(observedPeak, active);
    await sleep(15);
    active--;
    return active;
  };
  const entries = Array.from({ length: 12 }, (_, i) => i);
  const { peakConcurrency } = await runPool({ entries, concurrency: 3, runOne });
  assert.ok(observedPeak <= 3, `peak ${observedPeak} exceeded cap 3`);
  assert.equal(peakConcurrency, 3, 'with 12 entries and cap 3 the pool should saturate');
});

// ---- runPool: results follow INPUT order, not completion order -----------
test('runPool returns results in input order despite reversed completion', async () => {
  const entries = [0, 1, 2, 3, 4, 5];
  // Earlier entries sleep longer, so completion order is the reverse of input.
  const runOne = async (n) => {
    await sleep((entries.length - n) * 8);
    return n * 10;
  };
  const { results } = await runPool({ entries, concurrency: 6, runOne });
  assert.deepEqual(
    results,
    entries.map((n) => n * 10),
    'results[i] must be runOne(entries[i]) regardless of finish order'
  );
});

test('runPool handles an empty entry list', async () => {
  const { results, peakConcurrency } = await runPool({
    entries: [],
    concurrency: 4,
    runOne: async () => 1,
  });
  assert.deepEqual(results, []);
  assert.equal(peakConcurrency, 0);
});

test('runPool caps concurrency at the entry count for tiny lists', async () => {
  let active = 0;
  let peak = 0;
  const runOne = async () => {
    active++;
    peak = Math.max(peak, active);
    await sleep(10);
    active--;
  };
  await runPool({ entries: [1, 2], concurrency: 16, runOne });
  assert.ok(peak <= 2, `peak ${peak} should not exceed the 2-entry list`);
});

// ---- leak-guard-under-concurrency: the whole-run barrier holds -----------
// The runner snapshots the live fleet-registry key-set BEFORE the suite and
// compares AFTER runPool resolves. That guard only works if every concurrent
// child's registry write has landed by the time runPool resolves. Model a set of
// children each writing a unique key concurrently; after the pool resolves, the
// after-snapshot must observe ALL of them — none slips past the barrier.
test('runPool brackets every concurrent side effect (leak guard remains sound)', async () => {
  const liveRegistry = new Set(['#before']);
  const before = new Set(liveRegistry);
  const entries = Array.from({ length: 20 }, (_, i) => `#leak-${i}`);
  const runOne = async (key, i) => {
    // Stagger so writes land out of order and overlap across the pool.
    await sleep((i % 5) * 3);
    liveRegistry.add(key);
    return key;
  };
  await runPool({ entries, concurrency: poolConcurrency(8), runOne });
  const after = new Set(liveRegistry);
  const leaked = [...after].filter((k) => !before.has(k));
  assert.equal(
    leaked.length,
    entries.length,
    'every concurrent write must be visible after the barrier'
  );
});

// ---- spawnTestChild: spawnSync-shaped results from a real child ----------
function makeFixtures() {
  const dir = mkdtempProjectIsolated('pool-fixtures-');
  const files = {
    pass: path.join(dir, 'pass.mjs'),
    fail: path.join(dir, 'fail.mjs'),
    sleeper: path.join(dir, 'sleeper.mjs'),
    chatty: path.join(dir, 'chatty.mjs'),
    envEcho: path.join(dir, 'env-echo.mjs'),
  };
  writeFileSync(files.pass, 'process.exit(0);\n');
  writeFileSync(files.fail, 'process.exit(3);\n');
  writeFileSync(files.sleeper, 'setTimeout(() => {}, 10000);\n');
  writeFileSync(
    files.chatty,
    "process.stdout.write('x'.repeat(100000)); setTimeout(() => {}, 2000);\n"
  );
  writeFileSync(files.envEcho, "process.stdout.write(process.env.POOL_MARKER || 'MISSING');\n");
  return { dir, files };
}

test('spawnTestChild shapes a clean exit like spawnSync', async () => {
  const { dir, files } = makeFixtures();
  try {
    const res = await spawnTestChild({ full: files.pass, env: process.env });
    assert.equal(res.status, 0);
    assert.equal(res.signal, null);
    assert.equal(res.error, undefined);
    assert.equal(describeSpawnResult({ status: res.status }), 'ok');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('spawnTestChild reports a non-zero exit code', async () => {
  const { dir, files } = makeFixtures();
  try {
    const res = await spawnTestChild({ full: files.fail, env: process.env });
    assert.equal(res.status, 3);
    assert.equal(describeSpawnResult({ status: res.status }), 'FAIL (exit 3)');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('spawnTestChild timeout kills the child and surfaces ETIMEDOUT', async () => {
  const { dir, files } = makeFixtures();
  try {
    const res = await spawnTestChild({ full: files.sleeper, env: process.env, timeout: 150 });
    assert.equal(res.status, null);
    assert.equal(res.error?.code, 'ETIMEDOUT');
    const desc = describeSpawnResult({ status: res.status, signal: res.signal, error: res.error });
    assert.match(desc, /ETIMEDOUT/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('spawnTestChild enforces maxBuffer and surfaces ENOBUFS', async () => {
  const { dir, files } = makeFixtures();
  try {
    const res = await spawnTestChild({
      full: files.chatty,
      env: process.env,
      timeout: 5000,
      maxBuffer: 1000,
    });
    assert.equal(res.status, null);
    assert.equal(res.error?.code, 'ENOBUFS');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('spawnTestChild propagates the caller-owned env policy to the child', async () => {
  const { dir, files } = makeFixtures();
  try {
    const res = await spawnTestChild({
      full: files.envEcho,
      env: { ...process.env, POOL_MARKER: 'carried-through' },
    });
    assert.equal(res.status, 0);
    assert.equal(res.stdout, 'carried-through');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('spawnTestChild resolves (never rejects) on a spawn failure', async () => {
  // Inject a spawn that emits an 'error' event, mimicking ENOENT.
  const fakeSpawn = () => {
    const listeners = {};
    const child = {
      stdout: { setEncoding() {}, on() {} },
      stderr: { setEncoding() {}, on() {} },
      kill() {},
      on(ev, fn) {
        listeners[ev] = fn;
        return child;
      },
    };
    queueMicrotask(() =>
      listeners.error?.(Object.assign(new Error('spawn ENOENT'), { code: 'ENOENT' }))
    );
    return child;
  };
  const res = await spawnTestChild({ full: '/nope', env: process.env, _spawn: fakeSpawn });
  assert.equal(res.status, null);
  assert.equal(res.error?.code, 'ENOENT');
});
