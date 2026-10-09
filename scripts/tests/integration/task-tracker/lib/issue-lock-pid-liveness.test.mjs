#!/usr/bin/env node
// @story #656
// cspell:ignore TOCTOU
// PID probing remains diagnostic; compatibility helpers cannot retire legacy
// locks. Only registered, exact observed recovery plus confirmed owner death
// admits protected lock recovery (covered by runtime-operation-recovery tests).
// These cases preserve live, dead, reused-PID and foreign-host evidence.

import { strict as assert } from 'node:assert';
import test, { after } from 'node:test';
const fixtureDirs = [];
after(() => {
  for (const dir of fixtureDirs) rmSync(dir, { recursive: true, force: true });
});
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, utimesSync, rmSync } from 'node:fs';
import { spawn } from 'node:child_process';
import path from 'node:path';

import { projectScratchDir } from '../../../../task-tracker/lib/scratch-dir.mjs';
import {
  tryReclaimStale,
  isProcessAlive,
  ISSUE_LOCK_STALE_MS,
  THIS_HOST,
  PROCESS_START_TOKEN,
} from '../../../../task-tracker/issue-mutator-lock.mjs';

const OLD_TTL_MS = 30_000; // the pre-#656 threshold the defect tripped over

function makeLock({ holder, ageMs = 0 } = {}) {
  const dir = mkdtempSync(path.join(projectScratchDir('test'), 'aitm-lock-'));
  fixtureDirs.push(dir);
  const lockPath = path.join(dir, 'issue-1.lock');
  mkdirSync(lockPath);
  if (holder) {
    writeFileSync(path.join(lockPath, 'holder.json'), JSON.stringify(holder, null, 2) + '\n');
  }
  if (ageMs > 0) {
    const when = new Date(Date.now() - ageMs);
    utimesSync(lockPath, when, when);
  }
  return lockPath;
}

function deadPid() {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, ['-e', ''], { stdio: 'ignore' });
    child.on('exit', () => resolve(child.pid));
  });
}

test('a live same-host holder aged past the OLD 30s TTL is NOT reclaimed', () => {
  const lockPath = makeLock({
    holder: { pid: process.pid, host: THIS_HOST, startToken: PROCESS_START_TOKEN, verb: 'test' },
    ageMs: OLD_TTL_MS * 4, // ~2 min old — would have been reclaimed pre-#656
  });
  // Real probe: process.pid is unquestionably alive; default raised TTL applies.
  assert.equal(tryReclaimStale(lockPath), false);
  assert.ok(existsSync(lockPath), 'live holder lock dir must survive');
});

test('a dead legacy holder is preserved for explicit observed recovery', async () => {
  const pid = await deadPid();
  const lockPath = makeLock({
    holder: { pid, host: THIS_HOST, startToken: 'whatever', verb: 'test' },
    ageMs: 0, // fresh mtime — far inside any TTL
  });
  assert.ok(!isProcessAlive(pid), 'precondition: pid must be dead');
  assert.equal(tryReclaimStale(lockPath), false);
  assert.ok(existsSync(lockPath), 'dead legacy holder evidence remains');
});

test('PID reuse does not grant implicit reclamation authority', () => {
  const lockPath = makeLock({
    holder: { pid: process.pid, host: THIS_HOST, startToken: 'stale-incarnation', verb: 'test' },
    ageMs: 0, // fresh mtime: only the token-aware probe can justify reclaim
  });
  // Seam models the real impossibility of reading another process's token:
  // the recycled PID is alive, but its persisted token no longer matches the
  // live incarnation, so the probe reports it dead.
  const tokenAwareProbe = (pid, token) => pid === process.pid && token === PROCESS_START_TOKEN;
  assert.equal(tryReclaimStale(lockPath, { isProcessAlive: tokenAwareProbe }), false);
  assert.ok(existsSync(lockPath), 'reused-PID legacy evidence remains');
});

test('cross-host legacy ownership is preserved regardless of age', () => {
  const fresh = makeLock({
    holder: { pid: process.pid, host: 'some-other-host', startToken: 'x', verb: 'test' },
    ageMs: OLD_TTL_MS * 4, // old vs the legacy TTL, fresh vs the raised one
  });
  // PID probing is meaningless across hosts; within the raised TTL → keep.
  assert.equal(tryReclaimStale(fresh), false);
  assert.ok(existsSync(fresh));

  const ancient = makeLock({
    holder: { pid: process.pid, host: 'some-other-host', startToken: 'x', verb: 'test' },
    ageMs: ISSUE_LOCK_STALE_MS + 60_000, // past the raised backstop → reclaim
  });
  assert.equal(tryReclaimStale(ancient), false);
  assert.ok(existsSync(ancient));
});

test('matching dead legacy ownership still requires explicit recovery', async () => {
  const pid = await deadPid();
  const holder = { pid, host: THIS_HOST, startToken: 'same', verb: 'test' };
  const lockPath = makeLock({ holder, ageMs: 0 });
  // Holder unchanged between the two reads → recheck passes → reclaim proceeds.
  assert.equal(tryReclaimStale(lockPath), false);
  assert.ok(existsSync(lockPath));
});

test('isProcessAlive: true for self, false for a reaped child', async () => {
  assert.equal(isProcessAlive(process.pid), true);
  const pid = await deadPid();
  assert.equal(isProcessAlive(pid), false);
  assert.equal(isProcessAlive(null), false);
});

test('the raised TTL backstop sits well above the legacy 30s threshold', () => {
  assert.ok(ISSUE_LOCK_STALE_MS > OLD_TTL_MS, 'TTL must be raised above the old 30s value');
});
