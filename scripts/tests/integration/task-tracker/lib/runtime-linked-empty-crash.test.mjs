// @story #1861
import test from 'node:test';
import assert from 'node:assert/strict';
import { fork, execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { hostname } from 'node:os';
import { fileURLToPath } from 'node:url';
import { rmSync, writeFileSync, readFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { createRuntimeRootFixture } from '../../../helpers/runtime-root-fixture.mjs';
import { snapshotTree } from '../../../helpers/runtime-empty-contract-fixture.mjs';
import * as initialization from '../../../../task-tracker/lib/runtime-initialize.mjs';
import {
  planEmptyRuntimeInitialization,
  applyEmptyRuntimeInitialization,
} from '../../../../task-tracker/lib/runtime-empty-initialize.mjs';
import {
  inspectRuntimeCoordinator,
  recoverRuntimeCoordinator,
} from '../../../../task-tracker/lib/runtime-migration-lock.mjs';
import { assertRuntimeReadable } from '../../../../task-tracker/lib/runtime-storage.mjs';
const owner = {
  provider: 'fixture',
  sid: randomUUID(),
  pid: process.pid,
  processToken: randomUUID(),
  host: hostname(),
};
const adapters = {
  identity: () => owner,
  writerCensus: () => ({ complete: true, writers: [], claims: [], unknown: [] }),
};
const childFile = fileURLToPath(
  new URL('../../../fixtures/runtime-empty/linked-publisher.mjs', import.meta.url)
);
async function fixture(t) {
  const root = createRuntimeRootFixture('linked-empty-crash-'),
    linked = root + '-linked';
  t.after(() => {
    rmSync(linked, { recursive: true, force: true });
    rmSync(root, { recursive: true, force: true });
  });
  execFileSync('git', [
    '-C',
    root,
    '-c',
    'user.name=fixture',
    '-c',
    'user.email=fixture@example.test',
    'commit',
    '--allow-empty',
    '-qm',
    'fixture',
  ]);
  const mainPlan = await planEmptyRuntimeInitialization({
    projectRoot: root,
    mainRoot: root,
    adapters,
  });
  await applyEmptyRuntimeInitialization({
    plan: mainPlan,
    approvedPlanDigest: mainPlan.digest,
    adapters,
  });
  execFileSync('git', ['-C', root, 'worktree', 'add', '-qb', 'linked', linked]);
  const input = { projectRoot: linked, mainRoot: root },
    plan = initialization.planRuntimeInitialization(input);
  const file = path.join(root, 'approved-linked-plan.json');
  writeFileSync(file, JSON.stringify(plan));
  return {
    root,
    linked,
    input: { ...input, operationId: plan.operationId },
    plan,
    file,
    journal: path.join(root, '.ai-task-manager/runtime/initializations', plan.id + '.json'),
  };
}
async function kill(f, boundary, mode = 'apply') {
  const child = fork(childFile, [f.file, boundary, mode], {
    cwd: f.root,
    env: { PATH: process.env.PATH, TMPDIR: process.env.TMPDIR, LANG: process.env.LANG },
    stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
  });
  const exited = new Promise((resolve) =>
    child.once('exit', (code, signal) => resolve({ code, signal }))
  );
  let stderr = '';
  child.stderr.on('data', (x) => (stderr += x));
  try {
    const value = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(Error('boundary timeout: ' + stderr)), 30000);
      child.on('message', (value) => {
        clearTimeout(timer);
        value.error ? reject(Error(JSON.stringify(value.error))) : resolve(value);
      });
      child.once('exit', () => {
        clearTimeout(timer);
        reject(Error('early exit: ' + stderr));
      });
    });
    assert.equal(value.boundary, boundary);
    assert.equal(value.pid, child.pid);
    child.kill('SIGKILL');
    assert.deepEqual(await exited, { code: null, signal: 'SIGKILL' });
    return child.pid;
  } finally {
    child.kill('SIGKILL');
    await exited;
  }
}
function recover(f) {
  const coordinator = inspectRuntimeCoordinator(f.input);
  if (coordinator.status === 'owned')
    recoverRuntimeCoordinator({
      ...f.input,
      transactionId: f.plan.operationId,
      approvedPlanDigest: f.plan.digest,
      expectedDigest: coordinator.digest,
      adapters,
    });
}
// Wrong operation or stale observation must fail before creating any writer/recovery artifacts.
test('linked-v2 requires exact root operation and observation even on completed retry', async (t) => {
  const f = await fixture(t);
  await initialization.applyRuntimeInitialization({
    plan: f.plan,
    approvedPlanDigest: f.plan.digest,
    adapters,
  });
  const before = snapshotTree(f.root),
    local = snapshotTree(f.linked);
  for (const args of [
    { operationId: randomUUID(), observedDigest: 'sha256:' + '0'.repeat(64) },
    { operationId: f.plan.operationId },
    { operationId: f.plan.operationId, observedDigest: 'sha256:' + '0'.repeat(64) },
  ])
    await assert.rejects(
      initialization.resumeRuntimeInitialization({
        ...f.input,
        ...args,
        approvedPlanDigest: f.plan.digest,
        adapters,
      }),
      { code: 'RUNTIME_MIGRATION_CONFLICT' }
    );
  assert.deepEqual(snapshotTree(f.root), before);
  assert.deepEqual(snapshotTree(f.linked), local);
});
for (const boundary of [
  'after-initialization-claim',
  'after-initialization-stage',
  'after-initialization-publish',
  'after-initialization-journal',
  'after-initialization-control',
])
  test('linked-v2 real SIGKILL at ' + boundary + ' retains exact recovery', async (t) => {
    assert.equal(typeof initialization.inspectRuntimeInitialization, 'function');
    const f = await fixture(t),
      pid = await kill(f, boundary);
    recover(f);
    const before = snapshotTree(f.root),
      local = snapshotTree(f.linked);
    const observed = initialization.inspectRuntimeInitialization(f.input);
    assert.equal(observed.journal.owner.pid, pid);
    assert.deepEqual(snapshotTree(f.root), before);
    assert.deepEqual(snapshotTree(f.linked), local);
    if (boundary !== 'after-initialization-control')
      assert.throws(() => assertRuntimeReadable(f.input), {
        code:
          boundary === 'after-initialization-claim'
            ? 'RUNTIME_CONTROL_INVALID'
            : 'RUNTIME_TRANSACTION_INCOMPLETE',
      });
    assert.equal(
      (
        await initialization.resumeRuntimeInitialization({
          ...f.input,
          observedDigest: observed.digest,
          approvedPlanDigest: f.plan.digest,
          adapters,
        })
      ).status,
      'complete'
    );
    assertRuntimeReadable(f.input);
    const journal = JSON.parse(readFileSync(f.journal));
    if (boundary !== 'after-initialization-control')
      assert.deepEqual(
        journal.ownerHistory.map((x) => x.pid),
        [pid, process.pid]
      );
    const complete = initialization.inspectRuntimeInitialization(f.input);
    assert.equal(
      (
        await initialization.resumeRuntimeInitialization({
          ...f.input,
          observedDigest: complete.digest,
          approvedPlanDigest: f.plan.digest,
          adapters,
        })
      ).status,
      'complete'
    );
  });
test('killed linked-v2 resumer records genuine owner history and permits exact later recovery', async (t) => {
  assert.equal(typeof initialization.inspectRuntimeInitialization, 'function');
  const f = await fixture(t),
    first = await kill(f, 'after-initialization-stage');
  recover(f);
  const second = await kill(f, 'after-initialization-recovery-claim', 'resume');
  recover(f);
  const observed = initialization.inspectRuntimeInitialization(f.input);
  assert.deepEqual(
    observed.journal.ownerHistory.map((x) => x.pid),
    [first, second]
  );
  await initialization.resumeRuntimeInitialization({
    ...f.input,
    observedDigest: observed.digest,
    approvedPlanDigest: f.plan.digest,
    adapters,
  });
  assert.deepEqual(
    JSON.parse(readFileSync(f.journal)).ownerHistory.map((x) => x.pid),
    [first, second, process.pid]
  );
  assertRuntimeReadable(f.input);
});
test('same-path recreated linked worktree retains protected history despite retirement receipt', async (t) => {
  const f = await fixture(t);
  await initialization.applyRuntimeInitialization({
    plan: f.plan,
    approvedPlanDigest: f.plan.digest,
    adapters,
  });
  const retained = readFileSync(f.journal),
    old = f.plan.gitDir;
  execFileSync('git', ['-C', f.root, 'worktree', 'remove', '--force', f.linked]);
  const different = f.linked + '-different';
  execFileSync('git', ['-C', f.root, 'worktree', 'add', '--detach', different]);
  execFileSync('git', ['-C', f.root, 'worktree', 'move', different, f.linked]);
  const gitDir = execFileSync('git', ['-C', f.linked, 'rev-parse', '--absolute-git-dir'], {
    encoding: 'utf8',
  }).trim();
  assert.notEqual(gitDir, old);
  const receipt = path.join(f.root, '.ai-task-manager/runtime/retirements/fixture.json');
  mkdirSync(path.dirname(receipt), { recursive: true });
  writeFileSync(
    receipt,
    JSON.stringify({
      schema: 'fixture.retirement/v1',
      root: f.linked,
      gitDir: old,
      status: 'verified',
    })
  );
  assert.throws(
    () => initialization.planRuntimeInitialization(f.input),
    (e) => e.code === 'RUNTIME_CONTROL_INVALID' && e.message.includes('history')
  );
  assert.deepEqual(readFileSync(f.journal), retained);
});
// Unbound or active recovery history must not be ignored by status or ordinary admission.
test('unknown linked recovery artifacts refuse without acquiring new ownership', async (t) => {
  const f = await fixture(t);
  await initialization.applyRuntimeInitialization({
    plan: f.plan,
    approvedPlanDigest: f.plan.digest,
    adapters,
  });
  const directory = path.join(
    f.root,
    '.ai-task-manager/runtime/initialization-recoveries',
    f.plan.id
  );
  mkdirSync(directory, { recursive: true });
  writeFileSync(path.join(directory, 'unbound.json'), '{}\n');
  const before = snapshotTree(f.root),
    local = snapshotTree(f.linked);
  assert.throws(() => initialization.inspectRuntimeInitialization(f.input), {
    code: 'RUNTIME_CONTROL_INVALID',
  });
  assert.throws(() => assertRuntimeReadable(f.input), { code: 'RUNTIME_CONTROL_INVALID' });
  assert.deepEqual(snapshotTree(f.root), before);
  assert.deepEqual(snapshotTree(f.linked), local);
});
test('killed resumer after active linked control retains a read barrier until its claim completes', async (t) => {
  const f = await fixture(t);
  await kill(f, 'after-initialization-stage');
  recover(f);
  const pid = await kill(f, 'after-initialization-control', 'resume');
  recover(f);
  const observed = initialization.inspectRuntimeInitialization(f.input);
  assert.equal(observed.journal.owner.pid, pid);
  assert.throws(() => assertRuntimeReadable(f.input), { code: 'RUNTIME_TRANSACTION_INCOMPLETE' });
  await initialization.resumeRuntimeInitialization({
    ...f.input,
    observedDigest: observed.digest,
    approvedPlanDigest: f.plan.digest,
    adapters,
  });
  assertRuntimeReadable(f.input);
});
for (const kind of ['extra-control-field', 'wrong-control-root', 'missing-queue'])
  test('completed linked status rejects ' + kind + ' before recovery ownership', async (t) => {
    const f = await fixture(t);
    await initialization.applyRuntimeInitialization({
      plan: f.plan,
      approvedPlanDigest: f.plan.digest,
      adapters,
    });
    const control = path.join(f.linked, '.ai-task-manager/runtime/control.json');
    if (kind === 'missing-queue')
      rmSync(path.join(f.linked, '.ai-task-manager/runtime/store/state/task-tracker-queue.json'));
    else {
      const value = JSON.parse(readFileSync(control));
      if (kind === 'extra-control-field') value.unapproved = true;
      else value.projectRoot = f.root;
      writeFileSync(control, JSON.stringify(value));
    }
    const before = snapshotTree(f.root),
      local = snapshotTree(f.linked);
    assert.throws(() => initialization.inspectRuntimeInitialization(f.input), {
      code: kind === 'missing-queue' ? 'RUNTIME_STATE_CORRUPT' : 'RUNTIME_CONTROL_INVALID',
    });
    assert.deepEqual(snapshotTree(f.root), before);
    assert.deepEqual(snapshotTree(f.linked), local);
  });

test('a real kill between linked receipt and owned journal remains exactly recoverable', async (t) => {
  const f = await fixture(t),
    first = await kill(f, 'after-initialization-stage');
  recover(f);
  const child = fork(childFile, [f.file, 'unused', 'resume-before-owned-journal'], {
    cwd: f.root,
    env: { PATH: process.env.PATH, TMPDIR: process.env.TMPDIR, LANG: process.env.LANG },
    stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
  });
  const exited = new Promise((resolve) =>
    child.once('exit', (code, signal) => resolve({ code, signal }))
  );
  t.after(async () => {
    child.kill('SIGKILL');
    await exited;
  });
  let diagnostic = '';
  child.stderr.on('data', (bytes) => (diagnostic += bytes));
  child.on('message', (message) => {
    if (message.error) diagnostic += JSON.stringify(message.error);
  });
  assert.deepEqual(await exited, { code: null, signal: 'SIGKILL' }, diagnostic);
  recover(f);
  const observed = initialization.inspectRuntimeInitialization(f.input);
  assert.equal(observed.journal.owner.pid, first);
  await initialization.resumeRuntimeInitialization({
    ...f.input,
    observedDigest: observed.digest,
    approvedPlanDigest: f.plan.digest,
    adapters,
  });
  assertRuntimeReadable(f.input);
  const complete = initialization.inspectRuntimeInitialization(f.input);
  assert.deepEqual(
    complete.journal.ownerHistory.map((owner) => owner.pid),
    [first, child.pid, process.pid]
  );
  assert.equal(
    (
      await initialization.resumeRuntimeInitialization({
        ...f.input,
        observedDigest: complete.digest,
        approvedPlanDigest: f.plan.digest,
        adapters,
      })
    ).status,
    'complete'
  );
});
