// @story #1861
import test from 'node:test';
import assert from 'node:assert/strict';
import { fork } from 'node:child_process';
import { hostname } from 'node:os';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { writeFileSync, readFileSync, rmSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { createRuntimeRootFixture } from '../../../helpers/runtime-root-fixture.mjs';
import { snapshotTree } from '../../../helpers/runtime-empty-contract-fixture.mjs';
import * as empty from '../../../../task-tracker/lib/runtime-empty-initialize.mjs';
import {
  inspectRuntimeCoordinator,
  recoverRuntimeCoordinator,
} from '../../../../task-tracker/lib/runtime-migration-lock.mjs';
import { assertRuntimeReadable } from '../../../../task-tracker/lib/runtime-storage.mjs';
const childFile = fileURLToPath(
  new URL('../../../fixtures/runtime-empty/empty-publisher.mjs', import.meta.url)
);
const owner = {
  provider: 'fixture',
  sid: 'empty-parent-' + randomUUID(),
  pid: process.pid,
  processToken: randomUUID(),
  host: hostname(),
};
const adapters = {
  identity: () => owner,
  writerCensus: () => ({ complete: true, writers: [], claims: [], unknown: [] }),
};
async function fixture(t) {
  const root = createRuntimeRootFixture('empty-crash-');
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const plan = await empty.planEmptyRuntimeInitialization({
    projectRoot: root,
    mainRoot: root,
    adapters,
  });
  const file = path.join(root, 'approved-empty-plan.json');
  writeFileSync(file, JSON.stringify(plan));
  return {
    root,
    plan,
    file,
    input: { projectRoot: root, mainRoot: root, operationId: plan.operationId },
  };
}
function launch(fixture, boundary, mode = 'apply') {
  const child = fork(childFile, [fixture.file, boundary, mode], {
    cwd: fixture.root,
    env: { PATH: process.env.PATH, TMPDIR: process.env.TMPDIR, LANG: process.env.LANG },
    stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
  });
  let stderr = '';
  const messages = [];
  child.stderr.on('data', (chunk) => {
    stderr += chunk;
  });
  const exited = new Promise((resolve) =>
    child.once('exit', (code, signal) => resolve({ code, signal }))
  );
  const message = new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      reject(Error('boundary not reached: ' + stderr));
    }, 30000);
    child.once('error', (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on('message', (value) => {
      messages.push(value);
      if (value.error) {
        clearTimeout(timer);
        reject(Error(JSON.stringify(value.error)));
      } else if (value.boundary === boundary || value.result) {
        clearTimeout(timer);
        resolve(value);
      }
    });
    child.once('exit', () => {
      clearTimeout(timer);
      if (messages.length === 0) reject(Error('child exited without result: ' + stderr));
    });
  });
  return { child, message, exited };
}
async function killAtBoundary(fixture, boundary, mode = 'apply') {
  const process = launch(fixture, boundary, mode);
  try {
    const value = await process.message;
    assert.equal(value.boundary, boundary);
    assert.equal(value.pid, process.child.pid);
    assert.equal(value.operationId, fixture.plan.operationId);
    assert.equal(process.child.kill('SIGKILL'), true);
    assert.deepEqual(await process.exited, { code: null, signal: 'SIGKILL' });
    return value.pid;
  } finally {
    process.child.kill('SIGKILL');
    await process.exited;
  }
}
function recoverCoordinator(fixture) {
  const observed = inspectRuntimeCoordinator(fixture.input);
  assert.equal(observed.status, 'owned');
  return recoverRuntimeCoordinator({
    ...fixture.input,
    transactionId: fixture.plan.operationId,
    approvedPlanDigest: fixture.plan.digest,
    expectedDigest: observed.digest,
    adapters,
  });
}
// Removing the observed/death gates would let conflicting or live authority mutate.
test('resume refuses unbound first pending artifacts after a real SIGKILL', async (t) => {
  assert.equal(typeof empty.resumeEmptyRuntimeInitialization, 'function');
  const f = await fixture(t);
  await killAtBoundary(f, 'after-empty-first-pending');
  recoverCoordinator(f);
  const before = snapshotTree(f.root);
  assert.throws(() => empty.inspectEmptyRuntimeInitialization(f.input), {
    code: 'RUNTIME_CONTROL_INVALID',
  });
  await assert.rejects(
    empty.resumeEmptyRuntimeInitialization({
      ...f.input,
      observedDigest: 'sha256:' + '0'.repeat(64),
      approvedPlanDigest: f.plan.digest,
      adapters,
    }),
    { code: 'RUNTIME_CONTROL_INVALID' }
  );
  assert.deepEqual(snapshotTree(f.root), before);
});
for (const boundary of [
  'after-empty-first-journal',
  'after-empty-stage-record',
  'after-empty-staging',
  'after-empty-prepared-control',
  'after-empty-store-rename',
  'after-empty-complete-journal',
  'after-empty-active-control',
])
  test('SIGKILL at ' + boundary + ' preserves exact empty recovery', async (t) => {
    assert.equal(typeof empty.resumeEmptyRuntimeInitialization, 'function');
    const f = await fixture(t);
    const pid = await killAtBoundary(f, boundary);
    const retained = inspectRuntimeCoordinator(f.input);
    assert.equal(retained.record.owner.pid, pid);
    if (boundary !== 'after-empty-active-control')
      assert.throws(() => assertRuntimeReadable(f.input), {
        code: 'RUNTIME_TRANSACTION_INCOMPLETE',
      });
    recoverCoordinator(f);
    const before = snapshotTree(f.root);
    const observed = empty.inspectEmptyRuntimeInitialization(f.input);
    assert.deepEqual(snapshotTree(f.root), before);
    const replacement = launch(f, 'no-stop', 'resume');
    const value = await replacement.message;
    assert.equal(value.result.status, 'complete');
    assert.deepEqual(await replacement.exited, { code: 0, signal: null });
    for (const [relative, bytes] of Object.entries(f.plan.records))
      assert.equal(
        readFileSync(path.join(f.root, '.ai-task-manager/runtime/store', relative), 'utf8'),
        bytes
      );
    const completed = empty.inspectEmptyRuntimeInitialization(f.input);
    assert.equal(completed.status, 'complete');
    assert.equal(
      JSON.parse(readFileSync(path.join(f.root, '.ai-task-manager/runtime/control.json'))).status,
      'active'
    );
  });
// Recovery must check the entire conflict set before replaying any earlier member.
test('staged byte conflict refuses recovery without changing any file', async (t) => {
  assert.equal(typeof empty.resumeEmptyRuntimeInitialization, 'function');
  const f = await fixture(t);
  await killAtBoundary(f, 'after-empty-staging');
  recoverCoordinator(f);
  const stage = path.join(f.root, '.ai-task-manager/runtime', 'empty-stage-' + f.plan.operationId);
  writeFileSync(path.join(stage, 'fleet/occupancy.json'), '{"changed":true}\n');
  const observed = empty.inspectEmptyRuntimeInitialization(f.input),
    before = snapshotTree(f.root);
  await assert.rejects(
    empty.resumeEmptyRuntimeInitialization({
      ...f.input,
      observedDigest: observed.digest,
      approvedPlanDigest: f.plan.digest,
      adapters,
    }),
    { code: 'RUNTIME_MIGRATION_CONFLICT' }
  );
  assert.deepEqual(snapshotTree(f.root), before);
});
test('unexpected ancestor sibling is never adopted by empty recovery', async (t) => {
  assert.equal(typeof empty.resumeEmptyRuntimeInitialization, 'function');
  const f = await fixture(t);
  await killAtBoundary(f, 'after-empty-first-journal');
  recoverCoordinator(f);
  mkdirSync(path.join(f.root, '.ai-task-manager/runtime/future'));
  const observed = empty.inspectEmptyRuntimeInitialization(f.input),
    before = snapshotTree(f.root);
  await assert.rejects(
    empty.resumeEmptyRuntimeInitialization({
      ...f.input,
      observedDigest: observed.digest,
      approvedPlanDigest: f.plan.digest,
      adapters,
    }),
    { code: 'RUNTIME_MIGRATION_CONFLICT' }
  );
  assert.deepEqual(snapshotTree(f.root), before);
});

// A killed resumer must become the protected owner, rather than inheriting the publisher's death.
test('SIGKILLed empty resumer requires its own exact death before another recovery', async (t) => {
  const f = await fixture(t);
  await killAtBoundary(f, 'after-empty-first-journal');
  const resumedPid = await killAtBoundary(f, 'after-empty-recovery-claim', 'resume');
  const observed = empty.inspectEmptyRuntimeInitialization(f.input);
  assert.equal(observed.journal.owner.pid, resumedPid);
  assert.equal(observed.journal.ownerHistory.length, 2);
  const before = snapshotTree(f.root);
  await assert.rejects(
    empty.resumeEmptyRuntimeInitialization({
      ...f.input,
      observedDigest: observed.digest,
      approvedPlanDigest: f.plan.digest,
      adapters,
    }),
    { code: 'RUNTIME_MIGRATION_CONFLICT' }
  );
  assert.deepEqual(snapshotTree(f.root), before);
  recoverCoordinator(f);
  const replacement = launch(f, 'no-stop', 'resume');
  assert.equal((await replacement.message).result.status, 'complete');
  assert.deepEqual(await replacement.exited, { code: 0, signal: null });
  assert.equal(empty.inspectEmptyRuntimeInitialization(f.input).journal.ownerHistory.length, 3);
});
// Existing coordinator recovery has an ordered prepared predecessor/complete successor chain.
test('SIGKILL during coordinator recovery claim retains a resumable ordered history', async (t) => {
  const f = await fixture(t);
  await killAtBoundary(f, 'after-empty-first-journal');
  await killAtBoundary(f, 'after-recovery-claim', 'resume');
  recoverCoordinator(f);
  const replacement = launch(f, 'no-stop', 'resume');
  assert.equal((await replacement.message).result.status, 'complete');
  assert.deepEqual(await replacement.exited, { code: 0, signal: null });
});
// Owner sampling must never bless a live or foreign/reused process as dead.
test('live empty publisher cannot be recovered and all protected bytes stay unchanged', async (t) => {
  const f = await fixture(t);
  const running = launch(f, 'after-empty-first-journal');
  try {
    await running.message;
    const coordinator = inspectRuntimeCoordinator(f.input),
      before = snapshotTree(f.root);
    assert.throws(
      () =>
        recoverRuntimeCoordinator({
          ...f.input,
          transactionId: f.plan.operationId,
          approvedPlanDigest: f.plan.digest,
          expectedDigest: coordinator.digest,
          adapters,
        }),
      { code: 'RUNTIME_MIGRATION_OWNER_UNCONFIRMED' }
    );
    assert.deepEqual(snapshotTree(f.root), before);
  } finally {
    running.child.kill('SIGKILL');
    assert.deepEqual(await running.exited, { code: null, signal: 'SIGKILL' });
  }
});
// A malformed proof cannot add caller-selected paths or change original ownership.
for (const mutation of ['stage-path', 'owner-extra', 'owner-history'])
  test('closed empty journal refuses ' + mutation + ' without writes', async (t) => {
    const f = await fixture(t);
    await empty.applyEmptyRuntimeInitialization({
      plan: f.plan,
      approvedPlanDigest: f.plan.digest,
      adapters,
    });
    const observed = empty.inspectEmptyRuntimeInitialization(f.input),
      journal = observed.journal;
    if (mutation === 'stage-path')
      journal.stage['unapproved.json'] = {
        kind: 'file',
        identity: journal.stage['fleet/occupancy.json'].identity,
        digest: journal.stage['fleet/occupancy.json'].digest,
      };
    if (mutation === 'owner-extra') {
      journal.owner.extra = 'unapproved';
      journal.ownerHistory.at(-1).extra = 'unapproved';
    }
    if (mutation === 'owner-history')
      journal.ownerHistory.unshift({ ...owner, sid: 'unrelated-original' });
    writeFileSync(observed.journalPath, JSON.stringify(journal) + '\n');
    const before = snapshotTree(f.root);
    assert.throws(() => empty.inspectEmptyRuntimeInitialization(f.input), {
      code: 'RUNTIME_CONTROL_INVALID',
    });
    assert.deepEqual(snapshotTree(f.root), before);
  });

test('registered recovery completes an exact dead receipt after durable coordinator removal', async (t) => {
  const { spawnSync } = await import('node:child_process');
  const f = await fixture(t);
  await killAtBoundary(f, 'after-empty-first-journal');
  const original = inspectRuntimeCoordinator(f.input);
  const child = fork(childFile, [f.file, 'unused', 'resume-after-coordinator-release'], {
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
  assert.deepEqual(await exited, { code: null, signal: 'SIGKILL' });
  assert.equal(inspectRuntimeCoordinator(f.input).status, 'absent');
  const observed = empty.inspectEmptyRuntimeInitialization(f.input),
    before = snapshotTree(f.root);
  await assert.rejects(
    empty.resumeEmptyRuntimeInitialization({
      ...f.input,
      observedDigest: observed.digest,
      approvedPlanDigest: f.plan.digest,
      adapters,
    }),
    { code: 'RUNTIME_MIGRATION_CONFLICT' }
  );
  assert.deepEqual(snapshotTree(f.root), before);
  const executable = fileURLToPath(new URL('../../../../../bin/aitm.mjs', import.meta.url));
  // Isolated fixture session only; this is not genuine native-host admission.
  const env = {
    PATH: process.env.PATH,
    TMPDIR: process.env.TMPDIR,
    LANG: process.env.LANG,
    CODEX_THREAD_ID: randomUUID(),
  };
  const invoke = (digest) =>
    spawnSync(
      process.execPath,
      [
        executable,
        'migrate-runtime',
        'recover-coordinator',
        '--observed',
        digest,
        '--transaction',
        f.plan.operationId,
        '--approved-plan',
        f.plan.digest,
      ],
      { cwd: f.root, env, encoding: 'utf8', timeout: 30000 }
    );
  const wrong = invoke('sha256:' + '0'.repeat(64));
  assert.notEqual(wrong.status, 0);
  assert.deepEqual(snapshotTree(f.root), before);
  const priorReceipt = path.join(
    f.root,
    '.ai-task-manager/runtime/migrations/coordinator-recoveries',
    original.digest.slice(7) + '-000000.json'
  );
  const originalReceipt = readFileSync(priorReceipt);
  for (const mutate of [
    (record) => {
      record.owner.pid = process.pid;
    },
    (record) => {
      record.owner.host = hostname() + '-foreign';
    },
    (record) => {
      record.previous.bytes += ' ';
    },
    (record) => {
      record.previousReceipt = priorReceipt;
    },
  ]) {
    const record = JSON.parse(originalReceipt);
    mutate(record);
    writeFileSync(priorReceipt, JSON.stringify(record));
    const conflictTree = snapshotTree(f.root);
    const refused = invoke(original.digest);
    assert.notEqual(refused.status, 0, refused.stdout);
    assert.match(refused.stderr, new RegExp('RUNTIME_MIGRATION_(?:CONFLICT|OWNER_UNCONFIRMED)'));
    assert.deepEqual(snapshotTree(f.root), conflictTree);
    writeFileSync(priorReceipt, originalReceipt);
  }
  const replacementLock = path.join(f.root, '.ai-task-manager/runtime/migrations/coordinator.lock');
  writeFileSync(replacementLock, original.bytes);
  const replacementTree = snapshotTree(f.root),
    refusedReplacement = invoke(original.digest);
  assert.notEqual(refusedReplacement.status, 0);
  assert.match(refusedReplacement.stderr, new RegExp('RUNTIME_MIGRATION_CONFLICT'));
  assert.deepEqual(snapshotTree(f.root), replacementTree);
  rmSync(replacementLock);
  const completed = invoke(original.digest);
  assert.equal(completed.status, 0, completed.stderr + completed.stdout);
  const receipt = JSON.parse(completed.stdout).receipt;
  assert.equal(JSON.parse(readFileSync(receipt)).phase, 'complete');
  const completeTree = snapshotTree(f.root),
    repeated = invoke(original.digest);
  assert.equal(repeated.status, 0, repeated.stderr + repeated.stdout);
  assert.deepEqual(snapshotTree(f.root), completeTree);
  const next = empty.inspectEmptyRuntimeInitialization(f.input);
  await empty.resumeEmptyRuntimeInitialization({
    ...f.input,
    observedDigest: next.digest,
    approvedPlanDigest: f.plan.digest,
    adapters,
  });
  assertRuntimeReadable(f.input);
});
