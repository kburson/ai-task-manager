#!/usr/bin/env node
import { strict as assert } from 'node:assert';
import { mkdtempSync, rmSync, existsSync, mkdirSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { withLock, LOCK_STALE_MS } from '../locks.mjs';

const tmp = mkdtempSync(path.join(tmpdir(), 'tt-locks-'));

// Test 1: basic acquire/release
{
  const lockPath = path.join(tmp, 'a', 'one.lock');
  let ran = false;
  await withLock(lockPath, async () => {
    ran = true;
    assert.equal(existsSync(lockPath), true, 'lock dir exists during critical section');
  });
  assert.equal(ran, true);
  assert.equal(existsSync(lockPath), false, 'lock released after fn returns');
}

// Test 2: serializes contending callers (second waits for first)
{
  const lockPath = path.join(tmp, 'b', 'serial.lock');
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
  const lockPath = path.join(tmp, 'c', 'timeout.lock');
  mkdirSync(path.dirname(lockPath), { recursive: true });
  mkdirSync(lockPath); // fake held lock (fresh — not stale)
  let threw = false;
  try {
    await withLock(lockPath, async () => {}, { timeoutMs: 150 });
  } catch (err) {
    threw = /timeout/i.test(err.message);
  }
  assert.equal(threw, true, 'timed out acquiring held lock');
  rmSync(lockPath, { recursive: true });
}

// Test 4: stale lock is reclaimed
{
  const lockPath = path.join(tmp, 'd', 'stale.lock');
  mkdirSync(path.dirname(lockPath), { recursive: true });
  mkdirSync(lockPath);
  // Backdate the lock dir well past LOCK_STALE_MS by faking ctime via utimes.
  const past = new Date(Date.now() - (LOCK_STALE_MS + 5_000));
  // fs.utimesSync only adjusts atime/mtime — mtime is what stale detection
  // reads.
  const { utimesSync } = await import('node:fs');
  utimesSync(lockPath, past, past);
  let ran = false;
  await withLock(lockPath, async () => {
    ran = true;
  });
  assert.equal(ran, true, 'reclaimed stale lock');
  // Sanity — lock released.
  assert.equal(existsSync(lockPath), false);
}

// Test 5: retries re-invoke the body on failure, then succeed
{
  const lockPath = path.join(tmp, 'e', 'retry.lock');
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
  const lockPath = path.join(tmp, 'f', 'no-retry.lock');
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
