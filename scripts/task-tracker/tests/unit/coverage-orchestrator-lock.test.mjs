// @story #600
// Coverage leaf for `scripts/task-tracker/orchestrator-lock.mjs`.
//
// The script executes its verb dispatch at import time and calls
// `process.exit`, so it cannot be imported — it is exercised by spawning it as
// a child process. c8 (driven by coverage-threshold.mjs) propagates
// NODE_V8_COVERAGE to the child, so each spawn registers real coverage.
//
// Isolation: every spawn uses `cwd` = an out-of-repo temp dir. `git worktree
// list` fails there, so `findMainWorktreePath` falls back to that cwd and the
// lock lands at `<tmp>/.tmp/aitm/fleet/orchestrator.lock` — never the real
// orchestrator lock.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { mkdirSync, writeFileSync, existsSync, readFileSync } from 'node:fs';

import { mkdtempOutsideRepo } from '../../lib/scratch-dir.mjs';

const SCRIPT = fileURLToPath(new URL('../../orchestrator-lock.mjs', import.meta.url));

function run(args, cwd) {
  return spawnSync(process.execPath, [SCRIPT, ...args], {
    cwd,
    encoding: 'utf8',
  });
}

function lockPathFor(cwd) {
  return path.join(cwd, '.tmp', 'aitm', 'fleet', 'orchestrator.lock');
}

test('status reports held:false when no lock exists', () => {
  const dir = mkdtempOutsideRepo('orch-lock-');
  const res = run(['status'], dir);
  assert.equal(res.status, 0);
  assert.deepEqual(JSON.parse(res.stdout), { held: false });
});

test('acquire writes a lock; second acquire refuses while held', () => {
  const dir = mkdtempOutsideRepo('orch-lock-');
  const acq = run(['acquire', '42', '--ttl-hours', '4'], dir);
  assert.equal(acq.status, 0);
  assert.match(acq.stdout, /acquired orchestrator lock for 42/);
  assert.ok(existsSync(lockPathFor(dir)));

  const status = run(['status'], dir);
  const parsed = JSON.parse(status.stdout);
  assert.equal(parsed.held, true);
  assert.equal(parsed.expired, false);
  assert.equal(parsed.epic, '42');

  const again = run(['acquire', '99'], dir);
  assert.notEqual(again.status, 0);
  assert.match(again.stderr, /lock held for 42/);
});

test('release removes the lock and is idempotent', () => {
  const dir = mkdtempOutsideRepo('orch-lock-');
  run(['acquire', '7'], dir);
  const rel = run(['release'], dir);
  assert.equal(rel.status, 0);
  assert.match(rel.stdout, /released/);
  assert.ok(!existsSync(lockPathFor(dir)));

  // idempotent: release again with no lock present
  const rel2 = run(['release'], dir);
  assert.equal(rel2.status, 0);
});

test('acquire replaces an expired lock', () => {
  const dir = mkdtempOutsideRepo('orch-lock-');
  const p = lockPathFor(dir);
  mkdirSync(path.dirname(p), { recursive: true });
  writeFileSync(
    p,
    JSON.stringify({ epic: 'old', startedAt: '2000-01-01T00:00:00.000Z', ttlMs: 1000 }),
    'utf8'
  );
  const acq = run(['acquire', 'fresh'], dir);
  assert.equal(acq.status, 0);
  const lock = JSON.parse(readFileSync(p, 'utf8'));
  assert.equal(lock.epic, 'fresh');

  const status = run(['status'], dir);
  assert.equal(JSON.parse(status.stdout).expired, false);
});

test('status treats a corrupt lock file as no lock', () => {
  const dir = mkdtempOutsideRepo('orch-lock-');
  const p = lockPathFor(dir);
  mkdirSync(path.dirname(p), { recursive: true });
  writeFileSync(p, 'not json {{{', 'utf8');
  const res = run(['status'], dir);
  assert.equal(res.status, 0);
  assert.deepEqual(JSON.parse(res.stdout), { held: false });
});

test('status reports expired:true for a stale lock', () => {
  const dir = mkdtempOutsideRepo('orch-lock-');
  const p = lockPathFor(dir);
  mkdirSync(path.dirname(p), { recursive: true });
  writeFileSync(
    p,
    JSON.stringify({ epic: 'stale', startedAt: '2000-01-01T00:00:00.000Z', ttlMs: 1000 }),
    'utf8'
  );
  const res = run(['status'], dir);
  const parsed = JSON.parse(res.stdout);
  assert.equal(parsed.held, true);
  assert.equal(parsed.expired, true);
});

test('acquire without an epic fails with usage', () => {
  const dir = mkdtempOutsideRepo('orch-lock-');
  const res = run(['acquire'], dir);
  assert.notEqual(res.status, 0);
  assert.match(res.stderr, /usage: orchestrator-lock\.mjs acquire/);
});

test('invalid --ttl-hours fails', () => {
  const dir = mkdtempOutsideRepo('orch-lock-');
  const res = run(['acquire', '5', '--ttl-hours', 'abc'], dir);
  assert.notEqual(res.status, 0);
  assert.match(res.stderr, /invalid --ttl-hours/);
});

test('unknown verb prints usage and fails', () => {
  const dir = mkdtempOutsideRepo('orch-lock-');
  const res = run(['bogus'], dir);
  assert.notEqual(res.status, 0);
  assert.match(res.stderr, /usage: orchestrator-lock\.mjs <acquire/);
});
