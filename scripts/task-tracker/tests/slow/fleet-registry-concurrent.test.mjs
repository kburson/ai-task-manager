#!/usr/bin/env node
// @story #7
import { strict as assert } from 'node:assert';
import { execFile, execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, mkdirSync, utimesSync } from 'node:fs';
import path from 'node:path';
import { promisify } from 'node:util';
import { fleetRegistryPath, readFleet, withLock } from '../../fleet-registry.mjs';
import { projectScratchDir } from '../../lib/scratch-dir.mjs';

const exec = promisify(execFile);
const lockedHelper = new URL('./fleet-registry-concurrent-helper.mjs', import.meta.url).pathname;
const unlockedHelper = new URL('./fleet-registry-unlocked-helper.mjs', import.meta.url).pathname;

const N = 8;
const DELAY_MS = '500'; // long enough that all N procs complete read() before any write() — node proc spawn alone can exceed 75ms under load

async function runConcurrent(helper, projectDir) {
  const env = { ...process.env, FLEET_REGISTRY_TEST_DELAY_MS: DELAY_MS };
  const procs = [];
  for (let i = 0; i < N; i++) {
    procs.push(exec(process.execPath, [helper, projectDir, `#${100 + i}`, `b-${i}`, '0'], { env }));
  }
  // #304 — `allSettled`, not `all`: the unlocked control case is *designed*
  // to race on `task-fleet.json.tmp` and surface ENOENT on rename. Propagating
  // that as a `Promise.all` rejection turned the intended race into a flaky
  // test failure. The downstream assertion checks survivor count, not exec
  // success.
  await Promise.allSettled(procs);
}

// Test 1: control — without the lock, the race destroys entries.
const ctlDir = mkdtempSync(path.join(projectScratchDir('test'), 'tt-fleet-ctl-'));
// #304 — sandbox sits inside this repo's worktree. `findMainWorktreePath`
// walks up to the nearest git root, so without an isolating `git init` the
// helper procs would resolve to the real repo root and clobber the live
// `.ai-task-manager/task-fleet.json`. `/tmp/` previously hid this by being
// outside the repo; init each sandbox to restore that boundary.
execFileSync('git', ['init', '-q'], { cwd: ctlDir });
try {
  await runConcurrent(unlockedHelper, ctlDir);
  const fleet = readFleet(fleetRegistryPath(ctlDir));
  const survivors = Object.keys(fleet).length;
  assert.ok(
    survivors < N,
    `control: expected lost entries to prove race exists, but all ${N} survived (test setup is not exercising the race)`
  );
  console.log(
    `fleet-registry-concurrent.test.mjs: control proved race exists — ${survivors}/${N} survived without lock`
  );
} finally {
  rmSync(ctlDir, { recursive: true });
}

// Test 2: with the lock, all entries survive under the same race conditions.
const tmp = mkdtempSync(path.join(projectScratchDir('test'), 'tt-fleet-cc-'));
execFileSync('git', ['init', '-q'], { cwd: tmp });
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
  withLock(rPath, () => {
    acquired = true;
  });
  assert.equal(acquired, true, 'stale lock must be force-cleared');

  console.log('fleet-registry-concurrent.test.mjs: all passed');
} finally {
  rmSync(tmp, { recursive: true });
}
