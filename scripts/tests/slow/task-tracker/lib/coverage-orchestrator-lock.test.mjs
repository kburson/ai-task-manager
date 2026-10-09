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

import { test, after } from 'node:test';
import { createActivatedRuntimeRootFixture } from '../../../helpers/runtime-root-fixture.mjs';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { mkdirSync, writeFileSync, existsSync, readFileSync, rmSync } from 'node:fs';

import { mkdtempOutsideRepo } from '../../../../task-tracker/lib/scratch-dir.mjs';

const SCRIPT = fileURLToPath(
  new URL('../../../../task-tracker/orchestrator-lock.mjs', import.meta.url)
);

const roots = [];
after(() => {
  for (const root of roots) rmSync(root, { recursive: true, force: true });
});
async function fixture() {
  const root = await createActivatedRuntimeRootFixture('orch-lock-');
  roots.push(root);
  return root;
}

function run(args, cwd) {
  return spawnSync(process.execPath, [SCRIPT, ...args], {
    cwd,
    encoding: 'utf8',
    env: {
      ...process.env,
      AI_TASK_MANAGER_PROJECT_DIR: cwd,
      AI_TASK_MANAGER_SESSION_ID: 'orch-lock',
      AI_TASK_MANAGER_APP_NAME: 'claude',
    },
  });
}

function lockPathFor(cwd) {
  return path.join(cwd, '.ai-task-manager', 'runtime', 'store', 'fleet', 'orchestrator.lock');
}

test('status reports held:false when no lock exists', async () => {
  const dir = await fixture();
  const res = run(['status'], dir);
  assert.equal(res.status, 0);
  assert.deepEqual(JSON.parse(res.stdout), { held: false });
});

test('acquire writes a lock; second acquire refuses while held', async () => {
  const dir = await fixture();
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

test('release removes the lock and is idempotent', async () => {
  const dir = await fixture();
  run(['acquire', '7'], dir);
  const rel = run(['release'], dir);
  assert.equal(rel.status, 0);
  assert.match(rel.stdout, /released/);
  assert.ok(!existsSync(lockPathFor(dir)));

  // idempotent: release again with no lock present
  const rel2 = run(['release'], dir);
  assert.equal(rel2.status, 0);
});

test('acquire refuses an expired ownerless lock and preserves its evidence', async () => {
  const dir = await fixture();
  const p = lockPathFor(dir);
  mkdirSync(path.dirname(p), { recursive: true });
  writeFileSync(
    p,
    JSON.stringify({ epic: '42', startedAt: '2000-01-01T00:00:00.000Z', ttlMs: 1000 }),
    'utf8'
  );
  const before = readFileSync(p);
  const acq = run(['acquire', '42'], dir);
  assert.notEqual(acq.status, 0);
  assert.match(acq.stderr, /explicit owner release or recovery/);
  assert.deepEqual(readFileSync(p), before);
  const status = run(['status'], dir);
  assert.equal(JSON.parse(status.stdout).expired, true);
});

test('status refuses a corrupt lock and preserves its bytes', async () => {
  const dir = await fixture();
  const p = lockPathFor(dir);
  mkdirSync(path.dirname(p), { recursive: true });
  writeFileSync(p, 'not json {{{', 'utf8');
  const res = run(['status'], dir);
  assert.notEqual(res.status, 0);
  assert.match(res.stderr, /RUNTIME_STATE_CORRUPT/);
  assert.equal(readFileSync(p, 'utf8'), 'not json {{{');
});

test('status reports expired:true for a stale lock', async () => {
  const dir = await fixture();
  const p = lockPathFor(dir);
  mkdirSync(path.dirname(p), { recursive: true });
  writeFileSync(
    p,
    JSON.stringify({ epic: '42', startedAt: '2000-01-01T00:00:00.000Z', ttlMs: 1000 }),
    'utf8'
  );
  const res = run(['status'], dir);
  const parsed = JSON.parse(res.stdout);
  assert.equal(parsed.held, true);
  assert.equal(parsed.expired, true);
});

test('acquire without an epic fails with usage', async () => {
  const dir = await fixture();
  const res = run(['acquire'], dir);
  assert.notEqual(res.status, 0);
  assert.match(res.stderr, /usage: orchestrator-lock\.mjs acquire/);
});

test('invalid --ttl-hours fails', async () => {
  const dir = await fixture();
  const res = run(['acquire', '5', '--ttl-hours', 'abc'], dir);
  assert.notEqual(res.status, 0);
  assert.match(res.stderr, /invalid --ttl-hours/);
});

test('unknown verb prints usage and fails', async () => {
  const dir = await fixture();
  const res = run(['bogus'], dir);
  assert.notEqual(res.status, 0);
  assert.match(res.stderr, /usage: orchestrator-lock\.mjs <acquire/);
});
