#!/usr/bin/env node
import { strict as assert } from 'node:assert';
import { execFile } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { fleetRegistryPath, readFleet, withLock } from '../fleet-registry.mjs';

const exec = promisify(execFile);
const helper = new URL('./fleet-registry-concurrent-helper.mjs', import.meta.url).pathname;

const tmp = mkdtempSync(path.join(tmpdir(), 'tt-fleet-cc-'));
try {
  const rPath = fleetRegistryPath(tmp);

  // Test 1: two concurrent registers — both survive.
  const N = 8;
  const procs = [];
  for (let i = 0; i < N; i++) {
    procs.push(exec(process.execPath, [helper, tmp, `#${100 + i}`, `b-${i}`, '0']));
  }
  await Promise.all(procs);
  const fleet = readFleet(rPath);
  for (let i = 0; i < N; i++) {
    assert.ok(fleet[`#${100 + i}`], `#${100 + i} should survive concurrent register`);
    assert.equal(fleet[`#${100 + i}`].branch, `b-${i}`);
  }

  // Test 2: stale lock (older than TTL) is force-cleared.
  const { mkdirSync, utimesSync } = await import('node:fs');
  const lockDir = rPath + '.lock';
  mkdirSync(lockDir);
  const ancient = new Date(Date.now() - 60_000);
  utimesSync(lockDir, ancient, ancient);
  let acquired = false;
  withLock(rPath, () => { acquired = true; });
  assert.equal(acquired, true, 'stale lock must be force-cleared');

  console.log('fleet-registry-concurrent.test.mjs: all passed');
} finally {
  rmSync(tmp, { recursive: true });
}
