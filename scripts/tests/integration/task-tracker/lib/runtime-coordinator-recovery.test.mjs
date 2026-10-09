// @story #1857
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { hostname } from 'node:os';
import { rmSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { createRuntimeRootFixture } from '../../../helpers/runtime-root-fixture.mjs';
import * as coordination from '../../../../task-tracker/lib/runtime-migration-lock.mjs';

const moduleUrl = new URL(
  '../../../../task-tracker/lib/runtime-migration-lock.mjs',
  import.meta.url
).href;
const digest = 'sha256:' + 'c'.repeat(64);

test('a killed whole-operation writer needs exact confirmed-death lease recovery before fencing', async () => {
  assert.equal(typeof coordination.inspectRuntimeWriterLeases, 'function');
  const root = createRuntimeRootFixture('1857-killed-writer-');
  const roots = { projectRoot: root, mainRoot: root };
  const code = [
    'import { withRuntimeWriterLease } from ' + JSON.stringify(moduleUrl) + ';',
    'const input = JSON.parse(process.argv[1]);',
    'setInterval(() => {}, 1000);',
    'await withRuntimeWriterLease(input, async () => { process.stdout.write("HELD"); await new Promise(() => {}); });',
  ].join(String.fromCharCode(10));
  const child = spawn(
    process.execPath,
    ['--input-type=module', '-e', code, JSON.stringify(roots)],
    { stdio: ['ignore', 'pipe', 'pipe'] }
  );
  const exited = once(child, 'exit');
  try {
    await Promise.race([
      new Promise((resolve) => child.stdout.once('data', resolve)),
      exited.then(() => assert.fail('writer exited before holding lease')),
    ]);
    const [lease] = coordination.inspectRuntimeWriterLeases(roots);
    const request = { ...roots, leaseId: lease.record.leaseId, expectedDigest: lease.digest };
    assert.throws(() => coordination.recoverRuntimeWriterLease(request), {
      code: 'RUNTIME_MIGRATION_OWNER_UNCONFIRMED',
    });
    child.kill('SIGKILL');
    const [, signal] = await exited;
    assert.equal(signal, 'SIGKILL');
    assert.throws(
      () => coordination.recoverRuntimeWriterLease({ ...request, expectedDigest: digest }),
      { code: 'RUNTIME_MIGRATION_CONFLICT' }
    );
    const result = coordination.recoverRuntimeWriterLease(request);
    assert.equal(result.status, 'recovered');
    assert.equal(coordination.inspectRuntimeWriterLeases(roots).length, 0);
    assert.equal(JSON.parse(readFileSync(result.receipt)).previous.digest, lease.digest);
    assert.equal(coordination.recoverRuntimeWriterLease(request).status, 'recovered');
  } finally {
    child.kill('SIGKILL');
    await exited;
    rmSync(root, { recursive: true, force: true });
  }
});

test('malformed owner host and null writer leases produce typed refusals without erasing evidence', async () => {
  const root = createRuntimeRootFixture('1857-owner-shapes-');
  const roots = { projectRoot: root, mainRoot: root };
  const owner = {
    provider: 'fixture',
    sid: 'one',
    pid: process.pid,
    processToken: 'one',
    host: hostname(),
  };
  try {
    assert.equal(coordination.isRuntimeMigrationOwner({ ...owner, host: {} }), false);
    const directory = path.join(root, '.ai-task-manager/runtime/migrations/writers');
    mkdirSync(directory, { recursive: true });
    const target = path.join(directory, 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa.json');
    writeFileSync(target, 'null');
    await assert.rejects(
      coordination.withRuntimeWriterLease(
        { ...roots, adapters: { identity: () => owner } },
        async () => assert.fail('must refuse before operation')
      ),
      { code: 'RUNTIME_CONTROL_INVALID' }
    );
    assert.equal(readFileSync(target, 'utf8'), 'null');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('a genuinely SIGKILLed coordinator is observable and recoverable only from exact dead-owner evidence', async () => {
  assert.equal(typeof coordination.inspectRuntimeCoordinator, 'function');
  assert.equal(typeof coordination.recoverRuntimeCoordinator, 'function');
  const root = createRuntimeRootFixture('1857-killed-coordinator-');
  const roots = { projectRoot: root, mainRoot: root };
  const code = [
    'import { fenceRuntimeWriters } from ' + JSON.stringify(moduleUrl) + ';',
    "import { hostname } from 'node:os';",
    'const input = JSON.parse(process.argv[1]);',
    'await fenceRuntimeWriters({ ...input, adapters: {',
    "identity: () => ({ provider: 'fixture', sid: 'killed-owner', pid: process.pid, processToken: 'real-child', host: hostname() }),",
    "writerCensus: () => { process.stdout.write('LOCKED'); Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0); }",
    '} });',
  ].join('\n');
  const child = spawn(
    process.execPath,
    [
      '--input-type=module',
      '-e',
      code,
      JSON.stringify({ ...roots, transactionId: 'kill-one', approvedPlanDigest: digest }),
    ],
    { stdio: ['ignore', 'pipe', 'pipe'] }
  );
  const exited = once(child, 'exit');
  let stderr = '';
  child.stderr.on('data', (chunk) => {
    stderr += chunk;
  });
  try {
    await Promise.race([
      new Promise((resolve) => child.stdout.once('data', resolve)),
      exited.then(() => assert.fail('child exited before lock: ' + stderr)),
    ]);
    const before = coordination.inspectRuntimeCoordinator(roots);
    assert.equal(before.status, 'owned');
    assert.equal(before.record.transactionId, 'kill-one');
    assert.equal(coordination.observeLocalRuntimeOwner(before.record.owner).status, 'live');
    const input = {
      ...roots,
      expectedDigest: before.digest,
      transactionId: 'kill-one',
      approvedPlanDigest: digest,
      adapters: {
        identity: () => ({
          provider: 'fixture',
          sid: 'recoverer',
          pid: process.pid,
          processToken: 'recovery',
          host: hostname(),
        }),
      },
    };
    assert.throws(() => coordination.recoverRuntimeCoordinator(input), {
      code: 'RUNTIME_MIGRATION_OWNER_UNCONFIRMED',
    });
    child.kill('SIGKILL');
    const [, signal] = await exited;
    assert.equal(signal, 'SIGKILL');
    assert.equal(coordination.observeLocalRuntimeOwner(before.record.owner).status, 'dead');
    assert.throws(
      () =>
        coordination.recoverRuntimeCoordinator({
          ...input,
          expectedDigest: 'sha256:' + '0'.repeat(64),
        }),
      { code: 'RUNTIME_MIGRATION_CONFLICT' }
    );
    const recoveryCode = [
      'import { recoverRuntimeCoordinator } from ' + JSON.stringify(moduleUrl) + ';',
      "import { hostname } from 'node:os';",
      'const input = JSON.parse(process.argv[1]);',
      'recoverRuntimeCoordinator({ ...input, adapters: {',
      "identity: () => ({ provider: 'fixture', sid: 'killed-recovery', pid: process.pid, processToken: 'real-recovery-child', host: hostname() }),",
      "faultSync: () => process.kill(process.pid, 'SIGKILL')",
      '} });',
    ].join('\n');
    const recovering = spawn(
      process.execPath,
      [
        '--input-type=module',
        '-e',
        recoveryCode,
        JSON.stringify({
          ...roots,
          expectedDigest: before.digest,
          transactionId: 'kill-one',
          approvedPlanDigest: digest,
        }),
      ],
      { stdio: ['ignore', 'pipe', 'pipe'] }
    );
    const [recoveryCodeResult, recoverySignal] = await once(recovering, 'exit');
    assert.equal(recoveryCodeResult, null);
    assert.equal(recoverySignal, 'SIGKILL');
    assert.equal(coordination.inspectRuntimeCoordinator(roots).digest, before.digest);
    const recovered = coordination.recoverRuntimeCoordinator(input);
    assert.equal(recovered.status, 'recovered');
    assert.equal(coordination.inspectRuntimeCoordinator(roots).status, 'absent');
    assert.equal(
      JSON.parse(readFileSync(recovered.receipt, 'utf8')).previous.digest,
      before.digest
    );
    assert.ok(
      JSON.parse(readFileSync(recovered.receipt, 'utf8')).previousReceipt,
      'dead recovery claim remains in the audit chain'
    );
    await coordination.withRuntimeWriterLease(
      { ...roots, adapters: input.adapters },
      async () => {}
    );
  } finally {
    child.kill('SIGKILL');
    await exited;
    rmSync(root, { recursive: true, force: true });
  }
});

test('foreign host and replacement coordinator evidence cannot authorize recovery', () => {
  assert.equal(typeof coordination.observeLocalRuntimeOwner, 'function');
  assert.equal(
    coordination.observeLocalRuntimeOwner({
      provider: 'fixture',
      sid: 'one',
      pid: process.pid,
      processToken: 'one',
      host: hostname() + '-other',
    }).status,
    'unknown'
  );
  const root = createRuntimeRootFixture('1857-coordinator-corrupt-');
  try {
    const directory = path.join(root, '.ai-task-manager/runtime/migrations');
    mkdirSync(directory, { recursive: true });
    // A malformed record is preserved, never interpreted as absent or age-reapable.
    const target = path.join(directory, 'coordinator.lock');
    writeFileSync(target, '{', { flag: 'w' });
    assert.throws(
      () => coordination.inspectRuntimeCoordinator({ projectRoot: root, mainRoot: root }),
      { code: 'RUNTIME_CONTROL_INVALID' }
    );
    assert.equal(readFileSync(target, 'utf8'), '{');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
