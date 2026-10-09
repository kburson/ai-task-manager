#!/usr/bin/env node
// @story #213
import { strict as assert } from 'node:assert';
import { rmSync, existsSync, mkdirSync, statSync, writeFileSync, readFileSync } from 'node:fs';
import {
  withUnitRuntimeRoot,
  createActivatedUnitRuntimeRoot,
} from '../../../helpers/unit-runtime-root.mjs';
import { initializeFixtureActor } from '../../../helpers/fixture-actor.mjs';
import {
  runtimeWriterRootsForPath,
  runtimeOperationKey,
} from '../../../../task-tracker/lib/runtime-writer.mjs';
import { inspectRuntimeOperationLock } from '../../../../task-tracker/lib/runtime-migration-lock.mjs';
initializeFixtureActor(import.meta.url);
import path from 'node:path';
import { withLock, LOCK_STALE_MS } from '../../../../task-tracker/locks.mjs';

await withUnitRuntimeRoot(async () => {
  const tmp = createActivatedUnitRuntimeRoot('tt-locks-');
  function target(name) {
    return path.join(tmp, '.ai-task-manager/runtime/store/locks', name + '.lock');
  }
  function status(file) {
    return inspectRuntimeOperationLock({
      ...runtimeWriterRootsForPath(file),
      recordKey: runtimeOperationKey(file),
    }).status;
  }

  // Test 1: basic acquire/release
  {
    const lockPath = target('one');
    let ran = false;
    await withLock(lockPath, async () => {
      ran = true;
      assert.equal(status(lockPath), 'owned', 'protected ownership exists during critical section');
    });
    assert.equal(ran, true);
    assert.equal(existsSync(lockPath), false, 'lock released after fn returns');
  }

  // Test 2: serializes contending callers (second waits for first)
  {
    const lockPath = target('serial');
    const events = [];
    const a = withLock(lockPath, async () => {
      events.push('a-in');
      await new Promise((r) => setTimeout(r, 80));
      events.push('a-out');
    });
    // Give A time to grab the lock before B starts polling.
    await new Promise((r) => setTimeout(r, 10));
    const b = withLock(lockPath, async () => {
      events.push('b-in');
    });
    await Promise.all([a, b]);
    assert.deepEqual(events, ['a-in', 'a-out', 'b-in'], 'B waited for A');
  }

  // Test 3: timeout when lock held longer than timeoutMs
  {
    const lockPath = target('timeout');
    mkdirSync(path.dirname(lockPath), { recursive: true });
    mkdirSync(lockPath); // fake held lock (fresh — not stale)
    let threw = false;
    try {
      await withLock(lockPath, async () => {}, { timeoutMs: 150 });
    } catch (err) {
      threw = err.code === 'RUNTIME_LOCK_RECOVERY_REQUIRED';
    }
    assert.equal(threw, true, 'unknown legacy holder requires explicit recovery');
    rmSync(lockPath, { recursive: true });
  }

  // Test 4: age alone never retires unknown legacy ownership.
  {
    const lockPath = target('stale');
    mkdirSync(lockPath);
    const holder = path.join(lockPath, 'holder.json');
    const bytes = JSON.stringify({ pid: process.pid, unknownOwner: true });
    writeFileSync(holder, bytes);
    const past = new Date(Date.now() - (LOCK_STALE_MS + 5000));
    const { utimesSync } = await import('node:fs');
    utimesSync(lockPath, past, past);
    let ran = false;
    await assert.rejects(
      () =>
        withLock(lockPath, async () => {
          ran = true;
        }),
      { code: 'RUNTIME_LOCK_RECOVERY_REQUIRED' }
    );
    assert.equal(ran, false);
    assert.equal(readFileSync(holder, 'utf8'), bytes);
    rmSync(lockPath, { recursive: true });
  }

  // Test 5: retries re-invoke the body on failure, then succeed
  {
    const lockPath = target('retry');
    let calls = 0;
    const out = await withLock(
      lockPath,
      async () => {
        calls += 1;
        if (calls < 3) throw new Error('transient');
        return 'ok';
      },
      { retries: 3 }
    );
    assert.equal(calls, 3);
    assert.equal(out, 'ok');
  }

  // Test 6: retries=0 bubbles the first error
  {
    const lockPath = target('no-retry');
    let threw = false;
    try {
      await withLock(
        lockPath,
        async () => {
          throw new Error('boom');
        },
        { retries: 0 }
      );
    } catch (err) {
      threw = err.message === 'boom';
    }
    assert.equal(threw, true);
    assert.equal(existsSync(lockPath), false, 'lock released even on body error');
  }

  // stat probe — touch to silence unused import warnings if any
  void statSync;

  rmSync(tmp, { recursive: true });
  console.log('locks.test.mjs: all passed');
});
