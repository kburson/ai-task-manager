// @story #1855
import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { EMPTY_STATE, deriveRecordedStateSave } from '../../../../../task-tracker/state.mjs';
import { actorTimingStateRecord } from '../../../../../task-tracker/lib/actor-timing-state.mjs';
const load = () => import('../../../../../task-tracker/state.mjs');
function input() {
  const identity = { provider: 'claude', sid: 'fixture-tail' };
  const state = { ...EMPTY_STATE, active: '#124', state: 'test', entryStartTs: '2026-10-08T00:00:00.000Z', wordsAtEntryStart: 4, lastWordMarker: 9, lastFullWordMarker: 19 };
  return { identity, stateBytes: JSON.stringify(state), statePath: path.join(process.cwd(), '.tmp/aitm/state/task-tracker.json'), actorBytes: JSON.stringify(actorTimingStateRecord(identity, state)), activeBytes: JSON.stringify({ issue: '#124', boundAt: '2026-10-07T00:00:00.000Z', kanbanState: 'test', worktreeBranch: 'feature/example' }), sharedBytes: JSON.stringify({ state: 'develop', other: 'retained' }), boundAt: null };
}
test('recorded state save uses the original ordered program and preserves complete actor/binding/shared projections', async () => {
  const { deriveRecordedStateSaveProgram: derive } = await load();
  assert.equal(typeof derive, 'function');
  const source = input(), original = structuredClone(source);
  const result = derive(source);
  assert.deepEqual(result.operations.map(value => value.kind), ['mkdir', 'read-actor', 'read-binding', 'set-binding', 'write-actor', 'read-shared', 'write-shared']);
  const expected = deriveRecordedStateSave({ stateBytes: source.stateBytes, identity: source.identity, priorBindingBytes: source.activeBytes, previousBytes: source.sharedBytes });
  assert.deepEqual(JSON.parse(result.resources.actorTiming.bytes), expected.actorRecord);
  assert.equal(result.resources.trackerState.bytes, expected.sharedBytes);
  assert.equal(Object.hasOwn(JSON.parse(result.resources.trackerState.bytes), 'state'), false);
  assert.equal(JSON.parse(result.resources.activeTask.bytes).kanbanState, 'test');
  assert.equal(JSON.parse(result.resources.activeTask.bytes).worktreeBranch, 'feature/example');
  assert.deepEqual(source, original);
  assert.equal(Object.isFrozen(result.operations[3].record), true);
});
test('recorded state save consumes only actual missing-binding clock and preserves clear binding', async () => {
  const { deriveRecordedStateSaveProgram: derive } = await load();
  assert.equal(typeof derive, 'function');
  const source = input();
  source.activeBytes = null;
  source.boundAt = '2026-10-08T00:01:00.000Z';
  assert.equal(JSON.parse(derive(source).resources.activeTask.bytes).boundAt, source.boundAt);
  assert.throws(() => derive({ ...source, boundAt: null }), error => error instanceof TypeError && error.message === 'recorded-state-save-program');
  const cleared = input();
  const state = JSON.parse(cleared.stateBytes); state.active = null; state.entryStartTs = null; state.wordsAtEntryStart = 0; cleared.stateBytes = JSON.stringify(state);
  const result = derive(cleared);
  assert.equal(result.operations[3].kind, 'clear-binding');
  assert.equal(result.resources.activeTask, null);
  assert.throws(() => derive({ ...cleared, boundAt: source.boundAt }), error => error instanceof TypeError && error.message === 'recorded-state-save-program');
});
test('recorded state save rejects foreign actor, nested getters and extra source fields before deriving effects', async () => {
  const { deriveRecordedStateSaveProgram: derive } = await load();
  assert.equal(typeof derive, 'function');
  const source = input();
  const actor = JSON.parse(source.actorBytes); actor.sid = 'foreign';
  assert.throws(() => derive({ ...source, actorBytes: JSON.stringify(actor) }), error => error instanceof TypeError && error.message === 'recorded-state-save-program');
  let gets = 0; Object.defineProperty(source.identity, 'sid', { enumerable: true, get() { gets++; return 'fixture-tail'; } });
  assert.throws(() => derive(source), error => error instanceof TypeError && error.message === 'recorded-state-save-program');
  assert.equal(gets, 0);
  assert.throws(() => derive({ ...input(), ready: true }), error => error instanceof TypeError && error.message === 'recorded-state-save-program');
});
