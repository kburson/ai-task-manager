// @story #1857

test('spawn guard requires the same durable orchestrator actor and refuses volatile aliases', async () => {
  const root = await createActivatedRuntimeRootFixture('orchestrator-guard-');
  const guard = fileURLToPath(new URL('../../../../task-tracker/agent-guard.mjs', import.meta.url));
  const target = path.join(
    root,
    '.ai-task-manager',
    'runtime',
    'store',
    'fleet',
    'orchestrator.lock'
  );
  function observe(sid) {
    const env = { ...process.env, AI_TASK_MANAGER_SESSION_ID: sid, PWD: root };
    for (const key of [
      'AI_TASK_MANAGER_PROJECT_DIR',
      'TASK_TRACKER_PROJECT_DIR',
      'CLAUDE_PROJECT_DIR',
      'AITM_CAPTURE_PROJECT_DIR',
    ])
      delete env[key];
    return spawnSync(process.execPath, [guard], {
      cwd: root,
      env,
      input: JSON.stringify({ tool_input: { isolation: 'worktree' } }),
      encoding: 'utf8',
      timeout: 10000,
    });
  }
  try {
    assert.equal(run(root, ['acquire', '1857']).status, 0);
    assert.equal(observe('fixture-owner').stdout, '');
    assert.equal(JSON.parse(observe('fixture-other').stdout).decision, 'block');
    const original = readFileSync(target);
    rmSync(target);
    const volatile = path.join(root, '.tmp', 'orchestrator');
    mkdirSync(path.dirname(volatile), { recursive: true });
    writeFileSync(volatile, original);
    symlinkSync(volatile, target);
    const refusal = observe('fixture-owner');
    assert.equal(refusal.status, 0);
    assert.equal(JSON.parse(refusal.stdout).decision, 'block');
    assert.match(JSON.parse(refusal.stdout).reason, /RUNTIME_OVERRIDE_UNSAFE/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
// @story #1857
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, rmSync, mkdirSync, symlinkSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createActivatedRuntimeRootFixture } from '../../../helpers/runtime-root-fixture.mjs';
const script = fileURLToPath(
  new URL('../../../../task-tracker/orchestrator-lock.mjs', import.meta.url)
);
function run(root, args, sid = 'fixture-owner') {
  const env = { ...process.env, AI_TASK_MANAGER_SESSION_ID: sid, PWD: root };
  for (const key of [
    'AI_TASK_MANAGER_PROJECT_DIR',
    'TASK_TRACKER_PROJECT_DIR',
    'CLAUDE_PROJECT_DIR',
    'AITM_CAPTURE_PROJECT_DIR',
  ])
    delete env[key];
  return spawnSync(process.execPath, [script, ...args], {
    cwd: root,
    env,
    encoding: 'utf8',
    timeout: 10000,
  });
}
test('orchestrator permission is durable, owner-released and never age-reclaimed', async () => {
  const root = await createActivatedRuntimeRootFixture('orchestrator-durable-');
  const target = path.join(
    root,
    '.ai-task-manager',
    'runtime',
    'store',
    'fleet',
    'orchestrator.lock'
  );
  try {
    const first = run(root, ['acquire', '1857']);
    assert.equal(first.status, 0, first.stderr);
    const original = readFileSync(target);
    const foreign = run(root, ['release'], 'fixture-other');
    assert.notEqual(foreign.status, 0, 'another actor cannot release the owner');
    assert.deepEqual(readFileSync(target), original);
    const expired = { ...JSON.parse(original), startedAt: '2000-01-01T00:00:00.000Z', ttlMs: 1 };
    writeFileSync(target, JSON.stringify(expired));
    assert.notEqual(
      run(root, ['acquire', '1858']).status,
      0,
      'expiry denies capability but does not authorize takeover'
    );
    assert.equal(JSON.parse(readFileSync(target)).epic, '1857');
    assert.equal(run(root, ['release']).status, 0);
    writeFileSync(target, 'not-json');
    assert.notEqual(run(root, ['status']).status, 0, 'corruption is unavailable, not absent');
    assert.equal(readFileSync(target, 'utf8'), 'not-json');
    rmSync(target);
    const volatile = path.join(root, '.tmp', 'orchestrator');
    mkdirSync(path.dirname(volatile), { recursive: true });
    writeFileSync(volatile, original);
    symlinkSync(volatile, target);
    assert.notEqual(run(root, ['release']).status, 0);
    assert.deepEqual(readFileSync(volatile), original);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
