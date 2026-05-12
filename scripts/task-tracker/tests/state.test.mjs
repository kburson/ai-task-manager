#!/usr/bin/env node
import { strict as assert } from 'node:assert';
import { mkdtempSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { loadState, saveState, clearActive, EMPTY_STATE } from '../state.mjs';

const tmp = mkdtempSync(path.join(tmpdir(), 'tt-state-'));
const statePath = path.join(tmp, 'state.json');
const preferredStatePath = path.join(tmp, '.ai-task-manager', 'task-tracker-state.json');
const legacyStatePath = path.join(tmp, '.claude', 'task-tracker-state.json');

// Test 1: missing file returns empty state
let s = loadState(statePath);
assert.deepEqual(s, EMPTY_STATE);

// Test 2: save then load
const sample = {
  active: '#107',
  lastActive: '#107',
  entryStartTs: '2026-04-24T14:02:00Z',
  wordsAtEntryStart: 82140,
  planBucket: null,
};
saveState(sample, statePath);
s = loadState(statePath);
assert.equal(s.active, '#107');
assert.equal(s.wordsAtEntryStart, 82140);

// Test 3: clearActive preserves lastActive
clearActive(statePath);
s = loadState(statePath);
assert.equal(s.active, null);
assert.equal(s.lastActive, '#107');

// Test 3a: EMPTY_STATE includes `state` field; default null
assert.ok(Object.prototype.hasOwnProperty.call(EMPTY_STATE, 'state'), 'EMPTY_STATE should declare state field');
assert.equal(EMPTY_STATE.state, null);

// Test 3b: state field round-trips through save/load
saveState({ active: '#400', lastActive: '#400', state: 'development' }, statePath);
s = loadState(statePath);
assert.equal(s.active, '#400');
assert.equal(s.state, 'development');

// Test 3c: clearActive clears state along with active
clearActive(statePath);
s = loadState(statePath);
assert.equal(s.active, null);
assert.equal(s.state, null);
assert.equal(s.lastActive, '#400');

// Test 4: plan bucket round-trip
saveState({
  active: 'plan',
  lastActive: '#107',
  planBucket: { startedAt: 'x', wordsAtStart: 0, entries: [{ ts: 'y', event: 'start' }] },
}, statePath);
s = loadState(statePath);
assert.equal(s.active, 'plan');
assert.equal(s.planBucket.entries.length, 1);

// Test 5: corrupt file returns empty state (does not throw)
writeFileSync(statePath, '{not json');
s = loadState(statePath);
assert.deepEqual(s, EMPTY_STATE);

// Test 6: preferred .ai-task-manager state reads legacy .claude state as fallback
saveState({ active: '#200', lastActive: '#199' }, legacyStatePath);
s = loadState(preferredStatePath);
assert.equal(s.active, '#200');

// Test 7: writes go to preferred path after fallback read
saveState({ ...s, active: '#201' }, preferredStatePath);
assert.ok(existsSync(preferredStatePath), 'preferred state path should be written');
s = loadState(preferredStatePath);
assert.equal(s.active, '#201');

rmSync(tmp, { recursive: true });
console.log('state.test.mjs: all passed');
