// @story #1861
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { once } from 'node:events';
import { hostname } from 'node:os';
import { cpSync, readFileSync, readdirSync, rmSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import {
  createRuntimeRootFixture,
  activateRuntimeRootFixture,
} from '../../../helpers/runtime-root-fixture.mjs';
import { snapshotTree } from '../../../helpers/runtime-empty-contract-fixture.mjs';
import {
  assertRuntimeReadable,
  resolveRuntimeRoot,
} from '../../../../task-tracker/lib/runtime-storage.mjs';
import {
  planRuntimeInitialization,
  applyRuntimeInitialization,
  resumeRuntimeInitialization,
} from '../../../../task-tracker/lib/runtime-initialize.mjs';

function fixture(t) {
  const root = createRuntimeRootFixture('1861-v1-admission-');
  const linked = root + '-linked';
  const replacement = root + '-replacement';
  t.after(() => {
    for (const p of [linked, replacement, root]) rmSync(p, { recursive: true, force: true });
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
  return { root, linked, replacement };
}
function addLinked(f, target = f.linked) {
  execFileSync('git', ['-C', f.root, 'worktree', 'add', '--detach', target], { stdio: 'pipe' });
}

test('migration-v1 original root recreation with unchanged runtime bytes refuses ordinary reads', async (t) => {
  const f = fixture(t);
  addLinked(f);
  await activateRuntimeRootFixture(f.root, [f.linked]);
  const roots = { projectRoot: f.linked, mainRoot: f.root };
  assert.equal(assertRuntimeReadable(roots).schema, 'aitm.runtime-control/v1');
  const old = resolveRuntimeRoot({ cwd: f.linked, env: {} }).worktreeIdentity.gitDir;
  const original = path.join(f.linked, '.ai-task-manager/runtime');
  const saved = path.join(f.root, 'saved-linked-runtime');
  cpSync(original, saved, { recursive: true });
  execFileSync('git', ['-C', f.root, 'worktree', 'remove', '--force', f.linked], { stdio: 'pipe' });
  addLinked(f, f.replacement);
  execFileSync('git', ['-C', f.root, 'worktree', 'move', f.replacement, f.linked], {
    stdio: 'pipe',
  });
  cpSync(saved, path.join(f.linked, '.ai-task-manager/runtime'), { recursive: true });
  assert.notEqual(resolveRuntimeRoot({ cwd: f.linked, env: {} }).worktreeIdentity.gitDir, old);
  const before = snapshotTree(f.root),
    local = snapshotTree(f.linked);
  assert.throws(() => assertRuntimeReadable(roots), { code: 'RUNTIME_CONTROL_INVALID' });
  assert.deepEqual(snapshotTree(f.root), before);
  assert.deepEqual(snapshotTree(f.linked), local);
});

test('migration-v1 killed linked resumer after active control fences ordinary reads until recovery finishes', async (t) => {
  const f = fixture(t);
  await activateRuntimeRootFixture(f.root);
  addLinked(f);
  const roots = { projectRoot: f.linked, mainRoot: f.root };
  const plan = planRuntimeInitialization(roots);
  assert.equal(plan.schema, 'aitm.runtime-initialization-plan/v1');
  const url = new URL('../../../../task-tracker/lib/runtime-initialize.mjs', import.meta.url).href;
  const launch = async (mode) => {
    const code = [
      'import {applyRuntimeInitialization,resumeRuntimeInitialization} from ' +
        JSON.stringify(url) +
        ';',
      'import {hostname} from "node:os";',
      'const [plan,mode]=JSON.parse(process.argv[1]);',
      'const adapters={identity:()=>({provider:"fixture",sid:"v1-child-"+process.pid,pid:process.pid,processToken:"v1-child-"+process.pid,host:hostname()}),fault:point=>{if(point===(mode==="apply"?"after-initialization-journal":"after-initialization-control"))process.kill(process.pid,"SIGKILL");}};',
      'if(mode==="apply")await applyRuntimeInitialization({plan,approvedPlanDigest:plan.digest,adapters});',
      'else await resumeRuntimeInitialization({projectRoot:plan.projectRoot,mainRoot:plan.mainRoot,approvedPlanDigest:plan.digest,adapters});',
    ].join(String.fromCharCode(10));
    const child = spawn(
      process.execPath,
      ['--input-type=module', '-e', code, JSON.stringify([plan, mode])],
      { stdio: ['ignore', 'pipe', 'pipe'] }
    );
    const ended = once(child, 'exit');
    let stderr = '';
    child.stderr.on('data', (b) => (stderr += b));
    t.after(async () => {
      if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
      await ended;
    });
    const [status, signal] = await ended;
    assert.equal(status, null, stderr);
    assert.equal(signal, 'SIGKILL', stderr);
    return child.pid;
  };
  await launch('apply');
  const pid = await launch('resume');
  const journalFile = path.join(
    f.root,
    '.ai-task-manager/runtime/initializations',
    plan.id + '.json'
  );
  const journal = JSON.parse(readFileSync(journalFile));
  assert.equal(journal.status, 'complete');
  assert.equal(journal.owner.pid, pid);
  assert.equal(
    JSON.parse(readFileSync(path.join(f.linked, '.ai-task-manager/runtime/control.json'))).status,
    'active'
  );
  const dir = path.join(f.root, '.ai-task-manager/runtime/initialization-recoveries', plan.id);
  assert.deepEqual(readdirSync(dir), ['000000.json']);
  assert.equal(JSON.parse(readFileSync(path.join(dir, '000000.json'))).phase, 'active');
  const before = snapshotTree(f.root),
    local = snapshotTree(f.linked);
  assert.throws(() => assertRuntimeReadable(roots), { code: 'RUNTIME_TRANSACTION_INCOMPLETE' });
  assert.deepEqual(snapshotTree(f.root), before);
  assert.deepEqual(snapshotTree(f.linked), local);
  const adapters = {
    identity: () => ({
      provider: 'fixture',
      sid: 'v1-parent-' + process.pid,
      pid: process.pid,
      processToken: 'v1-parent-' + process.pid,
      host: hostname(),
    }),
  };
  assert.equal(
    (await resumeRuntimeInitialization({ ...roots, approvedPlanDigest: plan.digest, adapters }))
      .status,
    'complete'
  );
  assert.equal(assertRuntimeReadable(roots).schema, 'aitm.runtime-control/v1');
  assert.equal(JSON.stringify(JSON.parse(readFileSync(journalFile)).plan), JSON.stringify(plan));
  const complete = snapshotTree(f.root),
    completedLocal = snapshotTree(f.linked);
  assert.equal(
    (await resumeRuntimeInitialization({ ...roots, approvedPlanDigest: plan.digest, adapters }))
      .status,
    'complete'
  );
  assert.deepEqual(snapshotTree(f.root), complete);
  assert.deepEqual(snapshotTree(f.linked), completedLocal);
});

test('migration-v1 null linked recovery proof produces a typed protected refusal', async (t) => {
  const f = fixture(t);
  await activateRuntimeRootFixture(f.root);
  addLinked(f);
  const roots = { projectRoot: f.linked, mainRoot: f.root };
  const plan = planRuntimeInitialization(roots);
  const adapters = {
    identity: () => ({
      provider: 'fixture',
      sid: 'v1-parent-' + process.pid,
      pid: process.pid,
      processToken: 'v1-parent-' + process.pid,
      host: hostname(),
    }),
  };
  await applyRuntimeInitialization({ plan, approvedPlanDigest: plan.digest, adapters });
  assert.equal(assertRuntimeReadable(roots).schema, 'aitm.runtime-control/v1');
  const dir = path.join(f.root, '.ai-task-manager/runtime/initialization-recoveries', plan.id);
  mkdirSync(dir, { recursive: true });
  writeFileSync(path.join(dir, '000000.json'), 'null');
  const before = snapshotTree(f.root),
    local = snapshotTree(f.linked);
  assert.throws(() => assertRuntimeReadable(roots), { code: 'RUNTIME_CONTROL_INVALID' });
  assert.deepEqual(snapshotTree(f.root), before);
  assert.deepEqual(snapshotTree(f.linked), local);
});
