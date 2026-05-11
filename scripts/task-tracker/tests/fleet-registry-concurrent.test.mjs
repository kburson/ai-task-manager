#!/usr/bin/env node
import { strict as assert } from 'node:assert';
import { execFile } from 'node:child_process';
import { mkdtempSync, rmSync, mkdirSync, utimesSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { fleetRegistryPath, readFleet, withLock } from '../fleet-registry.mjs';

const exec = promisify(execFile);
const lockedHelper = new URL('./fleet-registry-concurrent-helper.mjs', import.meta.url).pathname;
const unlockedHelper = new URL('./fleet-registry-unlocked-helper.mjs', import.meta.url).pathname;

const N = 8;
const DELAY_MS = '75'; // forces RMW windows to overlap across all N procs

async function runConcurrent(helper, projectDir) {
  const env = { ...process.env, FLEET_REGISTRY_TEST_DELAY_MS: DELAY_MS };
  const procs = [];
  for (let i = 0; i < N; i++) {
    procs.push(exec(process.execPath, [helper, projectDir, `#${100 + i}`, `b-${i}`, '0'], { env }));
  }
  await Promise.all(procs);
}

// Test 1: control — without the lock, the race destroys entries.
const ctlDir = mkdtempSync(path.join(tmpdir(), 'tt-fleet-ctl-'));
try {
  await runConcurrent(unlockedHelper, ctlDir);
  const fleet = readFleet(fleetRegistryPath(ctlDir));
  const survivors = Object.keys(fleet).length;
  assert.ok(survivors < N,
    `control: expected lost entries to prove race exists, but all ${N} survived (test setup is not exercising the race)`);
  console.log(`fleet-registry-concurrent.test.mjs: control proved race exists — ${survivors}/${N} survived without lock`);
} finally {
  rmSync(ctlDir, { recursive: true });
}

// Test 2: with the lock, all entries survive under the same race conditions.
const tmp = mkdtempSync(path.join(tmpdir(), 'tt-fleet-cc-'));
try {
  await runConcurrent(lockedHelper, tmp);
  const fleet = readFleet(fleetRegistryPath(tmp));
  for (let i = 0; i < N; i++) {
    assert.ok(fleet[`#${100 + i}`], `#${100 + i} should survive concurrent register`);
    assert.equal(fleet[`#${100 + i}`].branch, `b-${i}`);
  }

  // Test 3: stale lock (older than TTL) is force-cleared.
  const rPath = fleetRegistryPath(tmp);
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
