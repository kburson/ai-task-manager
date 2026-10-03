// @story #1857
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
