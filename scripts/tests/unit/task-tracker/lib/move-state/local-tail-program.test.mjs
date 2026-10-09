// @story #1855
import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { EMPTY_STATE, deriveRecordedState } from '../../../../../task-tracker/state.mjs';
import { actorTimingStateRecord } from '../../../../../task-tracker/lib/actor-timing-state.mjs';
const load = () => import('../../../../../task-tracker/lib/move-state/cache-unpark.mjs');
function source(kind) {
  const identity = { provider: 'claude', sid: 'fixture-tail' };
  return {
    kind,
    issue: '124',
    projectDir: process.cwd(),
    statePath: path.join(process.cwd(), '.tmp/aitm/state/task-tracker.json'),
    identity,
    boundAt: null,
    local: {
      activeTask: {
        bytes: JSON.stringify({
          issue: '#124',
          boundAt: '2026-10-08T00:00:00.000Z',
          kanbanState: 'develop',
          worktreeBranch: 'feature/example',
        }),
      },
      actorTiming: {
        bytes: JSON.stringify(
          actorTimingStateRecord(identity, {
            ...EMPTY_STATE,
            active: '#124',
            entryStartTs: '2026-10-08T00:00:00.000Z',
          })
        ),
      },
      actorFlush: null,
      wordCursor: null,
      trackerState: { bytes: JSON.stringify({ other: 'retained', state: 'develop' }) },
      queue: { bytes: '[]' },
    },
  };
}
test('recorded refresh runs the original branch and changes only the current same-issue kanban cache', async () => {
  const { deriveRecordedNativeLocalTail: derive } = await load();
  assert.equal(typeof derive, 'function');
  const input = source('refreshKanbanStateCache'),
    before = structuredClone(input);
  const result = derive(input);
  assert.deepEqual(
    result.operations.map((value) => value.kind),
    ['modules', 'sid', 'root', 'active', 'root', 'set']
  );
  const expected = structuredClone(input.local);
  const active = JSON.parse(expected.activeTask.bytes);
  active.kanbanState = 'test';
  expected.activeTask.bytes = JSON.stringify(active, null, 2) + '\n';
  assert.deepEqual(result.local, expected);
  assert.deepEqual(input, before);
  assert.equal(result.stateSave, null);
  input.local.activeTask.bytes = JSON.stringify({ issue: '#999', kanbanState: 'develop' });
  const foreign = derive(input);
  assert.deepEqual(foreign.local, input.local);
  assert.equal(foreign.operations.at(-1).kind, 'active');
});
test('recorded tracker runs original load/state/save and retains every unaffected local resource', async () => {
  const { deriveRecordedNativeLocalTail: derive } = await load();
  assert.equal(typeof derive, 'function');
  const input = source('syncTrackerState'),
    before = structuredClone(input.local);
  const result = derive(input);
  assert.deepEqual(
    result.operations.map((value) => value.kind),
    ['root', 'path', 'load', 'save']
  );
  assert.equal(result.operations.at(-1).state.state, 'test');
  assert.equal(Object.hasOwn(JSON.parse(result.local.trackerState.bytes), 'state'), false);
  for (const key of ['actorFlush', 'wordCursor', 'queue'])
    assert.deepEqual(result.local[key], before[key]);
  const state = deriveRecordedState({
    sharedBytes: result.local.trackerState.bytes,
    identity: input.identity,
    actorBytes: result.local.actorTiming.bytes,
    cursor: null,
    activeBytes: result.local.activeTask.bytes,
  });
  assert.equal(state.active, '#124');
  assert.equal(state.lastWordMarker, 0);
  assert.deepEqual(
    result.stateSave.operations.map((value) => value.kind),
    [
      'mkdir',
      'read-actor',
      'read-binding',
      'set-binding',
      'write-actor',
      'read-shared',
      'write-shared',
    ]
  );
});
test('recorded local tail refuses nested getters, foreign actor and unrelated operation choices', async () => {
  const { deriveRecordedNativeLocalTail: derive } = await load();
  assert.equal(typeof derive, 'function');
  const input = source('syncTrackerState');
  let gets = 0;
  Object.defineProperty(input.local, 'activeTask', {
    enumerable: true,
    get() {
      gets++;
      return null;
    },
  });
  assert.throws(
    () => derive(input),
    (error) => error instanceof TypeError && error.message === 'native-local-tail-data'
  );
  assert.equal(gets, 0);
  const foreign = source('syncTrackerState');
  foreign.identity.sid = 'another-actor';
  assert.throws(
    () => derive(foreign),
    (error) => error instanceof TypeError && error.message === 'native-local-tail-data'
  );
  assert.throws(
    () => derive(source('writeAnything')),
    (error) => error instanceof TypeError && error.message === 'native-local-tail-data'
  );
});

test('recorded tracker reads cursor only when original actor timing overlay is absent', async () => {
  const { deriveRecordedNativeLocalTail: derive } = await load();
  const input = source('syncTrackerState');
  input.local.wordCursor = { bytes: 'not parsed by original loadState when actor exists' };
  const result = derive(input);
  assert.deepEqual(result.local.wordCursor, input.local.wordCursor);
  input.local.actorTiming = null;
  assert.throws(
    () => derive(input),
    (error) => error instanceof TypeError && error.message === 'native-local-tail-data'
  );
});
