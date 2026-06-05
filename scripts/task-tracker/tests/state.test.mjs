#!/usr/bin/env node
import { strict as assert } from 'node:assert';
import { mkdtempSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { projectScratchDir } from '../lib/scratch-dir.mjs';
import path from 'node:path';
import { loadState, saveState, clearActive, EMPTY_STATE } from '../state.mjs';

const tmp = mkdtempSync(path.join(projectScratchDir('test'), 'tt-state-'));
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
  discoverBucket: null,
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

// Test 3a (#218): EMPTY_STATE no longer declares `state` — the issue body
// `aitm-last-known-state` marker is the source of truth.
assert.ok(
  !Object.prototype.hasOwnProperty.call(EMPTY_STATE, 'state'),
  'EMPTY_STATE should not declare state field (#218)'
);

// Test 3b (#218): a stale `state` value in the file is stripped on load.
saveState({ active: '#400', lastActive: '#400' }, statePath);
// Hand-write a state field into the file to simulate legacy data.
const rawWithState = JSON.parse((await import('node:fs')).readFileSync(statePath, 'utf8'));
rawWithState.state = 'develop';
(await import('node:fs')).writeFileSync(statePath, JSON.stringify(rawWithState));
s = loadState(statePath);
assert.equal(s.active, '#400');
assert.equal(s.state, undefined, 'stale state field is stripped on load');

// Test 3c: clearActive still resets active while preserving lastActive
clearActive(statePath);
s = loadState(statePath);
assert.equal(s.active, null);
assert.equal(s.lastActive, '#400');

// Test 4: discover bucket round-trip
saveState(
  {
    active: 'discover',
    lastActive: '#107',
    discoverBucket: { startedAt: 'x', wordsAtStart: 0, entries: [{ ts: 'y', event: 'start' }] },
  },
  statePath
);
s = loadState(statePath);
assert.equal(s.active, 'discover');
assert.equal(s.discoverBucket.entries.length, 1);

// Test 4b: legacy planBucket + 'plan' sentinel migrates on load
saveState(
  {
    active: 'plan',
    lastActive: 'plan',
    planBucket: { startedAt: 'x', wordsAtStart: 0, entries: [] },
  },
  statePath
);
s = loadState(statePath);
assert.equal(s.active, 'discover', 'legacy plan sentinel migrates to discover');
assert.equal(s.lastActive, 'discover', 'legacy plan in lastActive migrates');
assert.ok(s.discoverBucket, 'planBucket migrates to discoverBucket');
assert.equal(s.planBucket, undefined, 'legacy planBucket is dropped');

// Test 5: corrupt file returns empty state (does not throw)
// Note (#212): per-session bound-issue state now lives in
// .ai-task-manager/sessions/<sid>/active-task.json. Clear it first so this
// test exercises the corrupt-global-file path in isolation.
clearActive(statePath);
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

// Test 8 (#212): relative state-path must resolve project dir to CWD, not
// the immediate parent. Regression for the bug that produced a nested
// .ai-task-manager/.ai-task-manager/sessions/ tree when callers passed
// '.ai-task-manager/task-tracker-state.json' relative to repo root.
{
  const cwdBefore = process.cwd();
  const relTmp = mkdtempSync(path.join(projectScratchDir('test'), 'tt-state-rel-'));
  // #273 — sid resolution now consults the provider registry env keys
  // (CLAUDE_CODE_SESSION_ID, CLAUDE_SESSION_ID, CODEX_SESSION_ID, plus
  // AI_TASK_MANAGER_SESSION_ID). Save+restore so this test pins the
  // fallback path regardless of the ambient shell.
  const savedEnv = {
    CLAUDE_CODE_SESSION_ID: process.env.CLAUDE_CODE_SESSION_ID,
    CLAUDE_SESSION_ID: process.env.CLAUDE_SESSION_ID,
    CODEX_SESSION_ID: process.env.CODEX_SESSION_ID,
    AI_TASK_MANAGER_SESSION_ID: process.env.AI_TASK_MANAGER_SESSION_ID,
  };
  for (const k of Object.keys(savedEnv)) delete process.env[k];
  try {
    process.chdir(relTmp);
    const rel = '.ai-task-manager/task-tracker-state.json';
    saveState(
      {
        active: '#212',
        lastActive: '#212',
        entryStartTs: 'x',
        wordsAtEntryStart: 1,
      },
      rel
    );
    const nested = path.join(relTmp, '.ai-task-manager', '.ai-task-manager');
    assert.equal(
      existsSync(nested),
      false,
      'projectDirForState must resolve relative paths to CWD; no nested .ai-task-manager/.ai-task-manager/ tree'
    );
    const sessionFile = path.join(
      relTmp,
      '.ai-task-manager',
      'sessions',
      'default-session',
      'active-task.json'
    );
    assert.equal(
      existsSync(sessionFile),
      true,
      'per-session active-task should land under the real project root'
    );
  } finally {
    process.chdir(cwdBefore);
    rmSync(relTmp, { recursive: true });
    for (const [k, v] of Object.entries(savedEnv)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  }
}

rmSync(tmp, { recursive: true });
console.log('state.test.mjs: all passed');
