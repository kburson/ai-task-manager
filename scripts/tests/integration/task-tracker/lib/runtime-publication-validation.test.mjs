// @story #1857
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, rmSync } from 'node:fs';
import { createActivatedRuntimeRootFixture } from '../../../helpers/runtime-root-fixture.mjs';
import { statePath } from '../../../../task-tracker/paths.mjs';
import { saveState, loadState } from '../../../../task-tracker/state.mjs';
import { setActiveTask, activeTaskPath } from '../../../../task-tracker/session-state.mjs';
import { currentSessionId, aiAppName } from '../../../../task-tracker/word-counter.mjs';
import { actorTimingStatePath } from '../../../../task-tracker/lib/actor-timing-state.mjs';
import { writeRuntimeJsonRecord } from '../../../../task-tracker/lib/runtime-writer.mjs';

test('registered discovery state roundtrips as a supported non-issue binding without invented issue authority', async () => {
  const root = await createActivatedRuntimeRootFixture('discovery-record-');
  try {
    const file = statePath(root);
    saveState(
      {
        active: 'discover',
        entryStartTs: '2026-10-01T00:00:00Z',
        wordsAtEntryStart: 0,
        discoverBucket: { entries: [], startedAt: '2026-10-01T00:00:00Z' },
      },
      file
    );
    assert.equal(loadState(file).active, 'discover');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('unsupported publication refuses before changing any global, binding or actor bytes', async () => {
  const root = await createActivatedRuntimeRootFixture('invalid-publication-');
  try {
    const identity = { provider: aiAppName(), sid: currentSessionId() };
    const file = statePath(root);
    const state = {
      active: '#1857',
      entryStartTs: '2026-10-01T00:00:00Z',
      wordsAtEntryStart: 0,
      lastWordMarker: 12,
    };
    saveState(state, file);
    const paths = [file, activeTaskPath(identity.sid, root), actorTimingStatePath(identity, root)];
    const original = paths.map((target) => readFileSync(target));
    assert.throws(
      () => saveState({ ...state, schema: 'unsupported', active: null, entryStartTs: null }, file),
      { code: 'RUNTIME_STATE_CORRUPT' }
    );
    paths.forEach((target, index) => assert.deepEqual(readFileSync(target), original[index]));
    assert.throws(
      () => setActiveTask(identity.sid, { issue: '#1857', schema: 'unsupported' }, root),
      { code: 'RUNTIME_STATE_CORRUPT' }
    );
    paths.forEach((target, index) => assert.deepEqual(readFileSync(target), original[index]));
    assert.throws(() => writeRuntimeJsonRecord(file, undefined), { code: 'RUNTIME_STATE_CORRUPT' });
    paths.forEach((target, index) => assert.deepEqual(readFileSync(target), original[index]));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('a promise returned through the synchronous record wrapper retains real lease and coordinator evidence', async () => {
  const { withRuntimeRecordLockSync } =
    await import('../../../../task-tracker/lib/runtime-writer.mjs');
  const { inspectRuntimeWriterLeases, inspectRuntimeCoordinator } =
    await import('../../../../task-tracker/lib/runtime-migration-lock.mjs');
  const root = await createActivatedRuntimeRootFixture('1861-sync-promise-');
  const roots = { projectRoot: root, mainRoot: root };
  try {
    const file = statePath(root);
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
