#!/usr/bin/env node
// @story #216
// #216 AC7 — `withLock` from `scripts/task-tracker/locks.mjs` (the async
// primitive Seq 1 settled on) serializes concurrent acquirers. Exactly one
// holder runs at a time; the others retry within the timeout.

import { strict as assert } from 'node:assert';
import { mkdtempSync, rmSync } from 'node:fs';
import { projectScratchDir } from '../../lib/scratch-dir.mjs';
import path from 'node:path';
import { withLock } from '../../locks.mjs';

const tmp = mkdtempSync(path.join(projectScratchDir('test'), 'tt-flock-'));
const lockPath = path.join(tmp, 'shared.lock');

// 1. Serial admission — N concurrent withLock calls never overlap.
{
  let inFlight = 0;
  let maxInFlight = 0;
  const N = 8;
  const tasks = Array.from({ length: N }, (_, i) =>
    withLock(
      lockPath,
      async () => {
        inFlight += 1;
        maxInFlight = Math.max(maxInFlight, inFlight);
        // Hold the lock briefly so contenders queue.
        await new Promise((r) => setTimeout(r, 15));
        inFlight -= 1;
        return i;
      },
      { timeoutMs: 5_000 }
    )
  );
  const results = await Promise.all(tasks);
  assert.equal(results.length, N);
  assert.equal(maxInFlight, 1, 'withLock serializes; max concurrency must be 1');
  assert.equal(inFlight, 0, 'all acquirers released');
}

// 2. Release-on-throw — a body that throws must still release the lock so
//    the next acquirer can proceed without timing out.
{
  await assert.rejects(
    () =>
      withLock(
        lockPath,
        async () => {
          throw new Error('boom');
        },
        { timeoutMs: 1_000 }
      ),
    /boom/
  );
  // If the prior call leaked the lock, this would time out.
  const ok = await withLock(lockPath, async () => 'recovered', { timeoutMs: 1_000 });
  assert.equal(ok, 'recovered', 'lock recovered after thrown body');
}

// 3. Timeout — an acquirer that cannot enter within timeoutMs rejects.
{
  let release;
  const holder = withLock(lockPath, async () => {
    await new Promise((r) => {
      release = r;
    });
  });
  // Give holder a tick to acquire.
  await new Promise((r) => setTimeout(r, 20));
  await assert.rejects(
    () => withLock(lockPath, async () => 'never', { timeoutMs: 150 }),
    (err) => /timeout|acquiring/i.test(String(err && err.message))
  );
  release();
  await holder;
}

rmSync(tmp, { recursive: true });
console.log('flock-contention.test.mjs: all passed');
