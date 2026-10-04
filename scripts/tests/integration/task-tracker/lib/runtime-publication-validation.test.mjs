// @story #1857
import { initializeFixtureActor } from '../../../helpers/fixture-actor.mjs';
initializeFixtureActor(import.meta.url);
import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { readFileSync, rmSync } from 'node:fs';
import { createActivatedRuntimeRootFixture } from '../../../helpers/runtime-root-fixture.mjs';
import { writeRuntimeJsonRecord } from '../../../../task-tracker/lib/runtime-writer.mjs';

test('a promise returned through the synchronous record wrapper retains real lease and coordinator evidence', async () => {
  const { withRuntimeRecordLockSync } =
    await import('../../../../task-tracker/lib/runtime-writer.mjs');
  const { inspectRuntimeWriterLeases, inspectRuntimeCoordinator } =
    await import('../../../../task-tracker/lib/runtime-migration-lock.mjs');
  const root = await createActivatedRuntimeRootFixture('1861-sync-promise-');
  const roots = { projectRoot: root, mainRoot: root };
  try {
    const file = path.join(root, '.ai-task-manager/runtime/store/state/task-tracker-state.json');
    const original = readFileSync(file);
    assert.throws(() => withRuntimeRecordLockSync(file, () => Promise.resolve('late operation')), {
      code: 'RUNTIME_SYNC_WRITER_ASYNC',
    });
    await Promise.resolve();
    const leases = inspectRuntimeWriterLeases(roots);
    assert.equal(leases.length, 1);
    assert.equal(leases[0].record.owner.pid, process.pid);
    const coordinator = inspectRuntimeCoordinator(roots);
    assert.equal(coordinator.status, 'owned');
    assert.equal(coordinator.record.owner.pid, process.pid);
    assert.deepEqual(readFileSync(file), original);
    assert.throws(() => writeRuntimeJsonRecord(file, { lastWordMarker: 1861 }), {
      code: 'RUNTIME_MIGRATION_BUSY',
    });
    assert.deepEqual(readFileSync(file), original);
    assert.equal(inspectRuntimeWriterLeases(roots).length, 1);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

for (const mode of ['raw-discarded', 'record-discarded', 'record-propagated', 'record-caught'])
  test(
    'nested synchronous Promise ' + mode + ' retains both protections until exact dead recovery',
    async () => {
      const { spawn } = await import('node:child_process');
      const { once } = await import('node:events');
      const coordination = await import('../../../../task-tracker/lib/runtime-migration-lock.mjs');
      const root = await createActivatedRuntimeRootFixture('1861-nested-promise-');
      const roots = { projectRoot: root, mainRoot: root };
      const target = path.join(
        root,
        '.ai-task-manager/runtime/store/state/task-tracker-state.json'
      );
      const writerUrl = new URL('../../../../task-tracker/lib/runtime-writer.mjs', import.meta.url)
        .href;
      const lockUrl = new URL(
        '../../../../task-tracker/lib/runtime-migration-lock.mjs',
        import.meta.url
      ).href;
      const code = [
        'import { withRuntimeRecordLockSync } from ' + JSON.stringify(writerUrl) + ';',
        'import * as locks from ' + JSON.stringify(lockUrl) + ';',
        'const { roots, target, mode } = JSON.parse(process.argv[1]);',
        'let failure = null;',
        'try {',
        'if (mode === "raw-discarded") locks.withRuntimeWriterLeaseSync(roots, () => locks.withRuntimeStoreLockSync(roots, () => { locks.withRuntimeStoreLockSync(roots, () => Promise.resolve("later")); }));',
        'else withRuntimeRecordLockSync(target, () => {',
        'if (mode === "record-caught") { try { withRuntimeRecordLockSync(target, () => Promise.resolve("later")); } catch (error) { if (error.code !== "RUNTIME_SYNC_WRITER_ASYNC") throw error; } }',
        'else if (mode === "record-propagated") return withRuntimeRecordLockSync(target, () => Promise.resolve("later"));',
        'else { withRuntimeRecordLockSync(target, () => Promise.resolve("later")); }',
        '});',
        '} catch (error) { failure = error.code; }',
        'process.stdout.write(JSON.stringify({ failure, coordinator: locks.inspectRuntimeCoordinator(roots), leases: locks.inspectRuntimeWriterLeases(roots) }) + String.fromCharCode(10));',
        'setInterval(() => {}, 1000);',
      ].join('\n');
      const child = spawn(
        process.execPath,
        ['--input-type=module', '-e', code, JSON.stringify({ roots, target, mode })],
        { stdio: ['ignore', 'pipe', 'pipe'] }
      );
      const exited = once(child, 'exit');
      let stderr = '';
      child.stderr.on('data', (bytes) => (stderr += bytes));
      try {
        const observed = await Promise.race([
          new Promise((resolve) => {
            let bytes = '';
            child.stdout.on('data', (chunk) => {
              bytes += chunk;
              if (bytes.includes('\n')) resolve(JSON.parse(bytes.split('\n')[0]));
            });
          }),
          exited.then(() => assert.fail('child exited before retained protection: ' + stderr)),
        ]);
        assert.equal(observed.failure, 'RUNTIME_SYNC_WRITER_ASYNC');
        assert.equal(observed.coordinator.status, 'owned');
        assert.equal(observed.leases.length, 1);
        assert.equal(observed.coordinator.record.owner.pid, child.pid);
        let entered = false;
        assert.throws(
          () =>
            coordination.withRuntimeWriterLeaseSync(roots, () => {
              entered = true;
            }),
          { code: 'RUNTIME_MIGRATION_BUSY' }
        );
        assert.equal(entered, false);
        assert.throws(
          () =>
            coordination.recoverRuntimeCoordinator({
              ...roots,
              expectedDigest: observed.coordinator.digest,
            }),
          { code: 'RUNTIME_MIGRATION_OWNER_UNCONFIRMED' }
        );
        child.kill('SIGKILL');
        assert.deepEqual(await exited, [null, 'SIGKILL']);
        coordination.recoverRuntimeCoordinator({
          ...roots,
          expectedDigest: observed.coordinator.digest,
        });
        for (const lease of coordination.inspectRuntimeWriterLeases(roots))
          coordination.recoverRuntimeWriterLease({
            ...roots,
            leaseId: lease.record.leaseId,
            expectedDigest: lease.digest,
          });
        coordination.withRuntimeWriterLeaseSync(roots, () => {
          entered = true;
        });
        assert.equal(entered, true);
        assert.equal(coordination.inspectRuntimeCoordinator(roots).status, 'absent');
        assert.deepEqual(coordination.inspectRuntimeWriterLeases(roots), []);
      } finally {
        child.kill('SIGKILL');
        await exited;
        rmSync(root, { recursive: true, force: true });
      }
    }
  );
