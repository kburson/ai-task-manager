// @story #1857
import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { mkdirSync, readFileSync, writeFileSync, rmSync, symlinkSync } from 'node:fs';
import { createActivatedRuntimeRootFixture } from '../../../helpers/runtime-root-fixture.mjs';
import { actorTimingStatePath, readActorTimingState, writeActorTimingState } from '../../../../task-tracker/lib/actor-timing-state.mjs';
import { loadMarker, saveMarker } from '../../../../task-tracker/word-counter.mjs';
import { inspectRuntimeWriterLeases, inspectRuntimeCoordinator, fenceRuntimeWriters } from '../../../../task-tracker/lib/runtime-migration-lock.mjs';
import { readActorFlushJournal } from '../../../../task-tracker/lib/actor-flush-journal.mjs';
import { durableWordMarker, durableWordMarkers } from '../../../../task-tracker/state.mjs';

const identity = { provider: 'codex', sid: 'actor-store-fixture' };
test('actor state and cursor readers reject volatile aliases and unavailable control without resetting evidence', async () => {
  const root = await createActivatedRuntimeRootFixture('actor-durable-');
  try {
    const actor = actorTimingStatePath(identity, root);
    const cursor = path.join(root, '.ai-task-manager', 'runtime', 'store', 'app', 'codex', 'session-tracking', identity.sid + '.json');
    writeActorTimingState(identity, root, { active: '#1857', lastWordMarker: 12 });
    saveMarker(cursor, 2, 12, '#1857', 20, { identity });
    for (const [file, read] of [
      [actor, () => readActorTimingState(identity, root)],
      [cursor, () => loadMarker(cursor, { identity })],
    ]) {
      const original = readFileSync(file);
      const volatile = path.join(root, '.tmp', path.basename(file));
      mkdirSync(path.dirname(volatile), { recursive: true });
      writeFileSync(volatile, original);
      rmSync(file);
      symlinkSync(volatile, file);
      assert.throws(read, { code: 'RUNTIME_OVERRIDE_UNSAFE' });
      rmSync(file);
      writeFileSync(file, original);
    }
    const control = path.join(root, '.ai-task-manager', 'runtime', 'control.json');
    const controlBytes = readFileSync(control);
    writeFileSync(control, '{broken');
    assert.throws(() => readActorTimingState(identity, root), { code: 'RUNTIME_CONTROL_INVALID' });
    assert.throws(() => loadMarker(cursor, { identity }), { code: 'RUNTIME_CONTROL_INVALID' });
    assert.throws(() => durableWordMarker(root), { code: 'RUNTIME_CONTROL_INVALID' }, 'authority loss must not fabricate zero words');
    assert.throws(() => durableWordMarkers(root), { code: 'RUNTIME_CONTROL_INVALID' });
    assert.throws(() => readActorFlushJournal(actor + '.flush.json', identity), { code: 'RUNTIME_CONTROL_INVALID' }, 'an absent optional journal is not evidence of readable authority');
    writeFileSync(control, controlBytes);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('actor projection is evaluated under its whole RMW lease and fence refuses reads and writes', async () => {
  const root = await createActivatedRuntimeRootFixture('actor-fence-');
  const roots = { projectRoot: root, mainRoot: root };
  try {
    const state = { active: '#1857' };
    Object.defineProperty(state, 'lastWordMarker', { enumerable: true, get() {
      assert.equal(inspectRuntimeWriterLeases(roots).length, 1);
      assert.equal(inspectRuntimeCoordinator(roots).status, 'owned');
      return 12;
    } });
    writeActorTimingState(identity, root, state);
    const actor = actorTimingStatePath(identity, root);
    const original = readFileSync(actor);
    const owner = { provider: 'fixture', sid: 'migrator', pid: process.pid, processToken: 'fixture-fence' };
    await fenceRuntimeWriters({ ...roots, transactionId: 'actor-fence', approvedPlanDigest: 'sha256:' + 'a'.repeat(64), adapters: { identity: () => owner, writerCensus: () => ({ complete: true, writers: [], claims: [] }) } });
    assert.throws(() => readActorTimingState(identity, root), { code: 'RUNTIME_TRANSACTION_INCOMPLETE' });
    assert.throws(() => writeActorTimingState(identity, root, { active: null }), { code: 'RUNTIME_TRANSACTION_INCOMPLETE' });
    assert.deepEqual(readFileSync(actor), original);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
