// @story #863 #1307
/**
 * Bounded async worker pool for the runner (#863).
 *
 * `run-tests.mjs` historically drove a blocking `for … spawnSync` loop — one
 * file at a time, one core busy on an otherwise-idle box. This module is the
 * testable scheduling seam that lets the pure-unit lane run concurrently at a
 * bounded `cpus - 1` pool instead.
 *
 * The split of responsibility is deliberate and is what keeps concurrency
 * unit-testable without spawning the real 642-file suite:
 *
 *   - {@link runPool} owns ONLY scheduling and stable-order result collection.
 *     It is generic: hand it any `runOne(entry, index)` and it never exceeds the
 *     concurrency cap, returns results in INPUT order regardless of completion
 *     order, and reports the observed peak concurrency.
 *   - {@link spawnTestChild} is the concrete `runOne` primitive — it launches one
 *     `node <file>` child and resolves to a **spawnSync-shaped** result
 *     (`{ status, signal, error, stdout, stderr }`) so the caller's existing
 *     pass/fail/timing/`describeSpawnResult` handling is unchanged. The runner
 *     still owns the POLICY (env, timeout, maxBuffer); this module owns only the
 *     MECHANISM.
 *
 * No test-framework migration ships (#863 AC9): children are still plain
 * `node <file>` invocations of Node's built-in runner. Only scheduling changes.
 */

import { spawn } from 'node:child_process';
import os from 'node:os';

/**
 * The bounded concurrency for the unit lane: one worker per core, minus one core
 * reserved for the parent process + OS, floored at 1.
 *
 * @param {number} [cpus] - detected core count (injectable for tests)
 * @returns {number} concurrency cap ≥ 1
 */
export function poolConcurrency(cpus = os.cpus().length) {
  const n = Number.isFinite(cpus) ? Math.floor(cpus) : 1;
  return Math.max(1, n - 1);
}

/**
 * Conservative cap for direct-subprocess unit files. This phase runs only
 * after the saturated pure pool drains, and never admits more than two files.
 */
export function subprocessPoolConcurrency(cpus = os.cpus().length) {
  return Math.min(2, poolConcurrency(cpus));
}

/**
 * Conservative cap for explicitly audited slow tests. The dedicated phase is
 * isolated behind barriers and never admits more than two files at once.
 */
export function slowPoolConcurrency(cpus = os.cpus().length) {
  return Math.min(2, poolConcurrency(cpus));
}

/**
 * Run every entry through `runOne` at bounded concurrency.
 *
 * Invariants (each is asserted by run-tests-pool.test.mjs):
 *   - at most `concurrency` invocations of `runOne` are ever in flight at once;
 *   - `results[i]` is the resolution of `runOne(entries[i], i)` — INPUT order,
 *     independent of the order in which children finish;
 *   - the returned `peakConcurrency` is the high-water mark actually observed.
 *
 * `runOne` is expected not to reject (the spawn primitive below captures spawn
 * failures onto the result). If it does reject, that rejection propagates out of
 * `runPool` — the runner's `runOne` never throws, so this stays deterministic.
 *
 * @template T
 * @param {object} args
 * @param {T[]} args.entries
 * @param {number} args.concurrency
 * @param {(entry: T, index: number) => Promise<any>} args.runOne
 * @returns {Promise<{ results: any[], peakConcurrency: number }>}
 */
export async function runPool({ entries, concurrency, runOne }) {
  const list = Array.isArray(entries) ? entries : [];
  const results = new Array(list.length);
  if (list.length === 0) return { results, peakConcurrency: 0 };

  const cap = Math.max(1, Math.min(Math.floor(concurrency) || 1, list.length));
  let next = 0;
  let active = 0;
  let peak = 0;

  const worker = async () => {
    for (;;) {
      const i = next++;
      if (i >= list.length) return;
      active++;
      if (active > peak) peak = active;
      try {
        results[i] = await runOne(list[i], i);
      } finally {
        active--;
      }
    }
  };

  await Promise.all(Array.from({ length: cap }, () => worker()));
  return { results, peakConcurrency: peak };
}

/**
 * Launch one `node <full>` child and resolve to a **spawnSync-shaped** result.
 * Never rejects: a spawn error, a timeout kill, or a maxBuffer overflow is all
 * reported through the resolved object exactly as `spawnSync` would report it,
 * so `describeSpawnResult` in run-tests-report.mjs handles it with no change.
 *
 *   - clean/normal exit → `{ status: <code>, signal: null, error: undefined }`
 *   - timeout kill      → `{ status: null, signal, error: { code: 'ETIMEDOUT' } }`
 *   - maxBuffer overflow → `{ status: null, signal, error: { code: 'ENOBUFS' } }`
 *   - spawn failure      → `{ status: null, signal: null, error }`
 *
 * @param {object} args
 * @param {string} args.full - absolute path to the test file
 * @param {NodeJS.ProcessEnv} args.env - child environment (caller-owned policy)
 * @param {number} [args.timeout] - ms before SIGTERM (0/undefined = no timeout)
 * @param {number} [args.maxBuffer] - max combined stdout+stderr bytes
 * @param {(cmd: string, args: string[], opts: object) => any} [args._spawn]
 *   - injectable spawn (tests); defaults to node:child_process spawn
 * @returns {Promise<{status: number|null, signal: string|null, error: (Error|undefined), stdout: string, stderr: string}>}
 */
export function spawnTestChild({ full, env, timeout, maxBuffer, _spawn = spawn }) {
  return new Promise((resolve) => {
    let stdout = '';
    let stderr = '';
    let settled = false;
    let killedForTimeout = false;
    let killedForBuffer = false;

    const child = _spawn('node', [full], {
      stdio: ['ignore', 'pipe', 'pipe'],
      env,
    });

    let timer = null;
    if (timeout && timeout > 0) {
      timer = setTimeout(() => {
        killedForTimeout = true;
        child.kill('SIGTERM');
      }, timeout);
    }

    const capture = (chunk, which) => {
      if (which === 'out') stdout += chunk;
      else stderr += chunk;
      if (maxBuffer && stdout.length + stderr.length > maxBuffer) {
        killedForBuffer = true;
        child.kill('SIGTERM');
      }
    };
    child.stdout?.setEncoding('utf8');
    child.stderr?.setEncoding('utf8');
    child.stdout?.on('data', (c) => capture(c, 'out'));
    child.stderr?.on('data', (c) => capture(c, 'err'));

    const finish = (result) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      resolve(result);
    };

    child.on('error', (error) => {
      finish({ status: null, signal: null, error, stdout, stderr });
    });
    child.on('close', (code, signal) => {
      let error;
      if (killedForTimeout)
        error = Object.assign(new Error('spawn ETIMEDOUT'), { code: 'ETIMEDOUT' });
      else if (killedForBuffer)
        error = Object.assign(new Error('spawn ENOBUFS'), { code: 'ENOBUFS' });
      finish({ status: code, signal, error, stdout, stderr });
    });
  });
}
