#!/usr/bin/env node
// #407 regression — verb→verb sequencing must preserve the active binding.
//
// Before #407, the `test` and `review` verbs wrote `active: null` in their
// success branches, conflating "close the timing session" with "drop the
// binding." That forced a redundant `start <N>` re-bind before the next verb.
//
// This test drives the EXACT state-write path both verbs now use
// (`pauseTimingKeepBinding` → `saveState`) against a real state file, then
// reloads and asserts:
//   1. After a successful `test`, the issue is still bound (`active` survives),
//      and the timing session is closed (`entryStartTs` reset).
//   2. A following `review` against the same issue runs with no intervening
//      re-bind and the binding still survives.
//   3. The binding is dropped ONLY by an explicit unbind (`clearActive`,
//      which backs `pause`) — confirming the AC2 "cleared only by explicit
//      pause / session-end / blocking-question pause" contract.

import { strict as assert } from 'node:assert';
import { mkdtempSync, rmSync } from 'node:fs';
import path from 'node:path';

import { projectScratchDir } from '../lib/scratch-dir.mjs';
import { saveState, loadState, pauseTimingKeepBinding, clearActive } from '../state.mjs';

const sandbox = mkdtempSync(path.join(projectScratchDir('test'), 'tt-407-binding-'));
const prevProjectDir = process.env.AI_TASK_MANAGER_PROJECT_DIR;
process.env.AI_TASK_MANAGER_PROJECT_DIR = sandbox;
try {
  const statePath = path.join(sandbox, '.ai-task-manager', 'task-tracker-state.json');

  // Bind #999 with an OPEN timing session, as `start #999` would leave it.
  saveState(
    {
      active: '#999',
      lastActive: '#999',
      entryStartTs: '2026-06-15T10:00:00.000Z',
      wordsAtEntryStart: 1000,
      totalActiveMinutes: 0,
      discoverBucket: null,
    },
    statePath
  );

  // --- Verb 1: `test #999` passes. Writes via pauseTimingKeepBinding. ---
  let s = loadState(statePath);
  assert.equal(s.active, '#999', 'precondition: #999 is bound');
  saveState(pauseTimingKeepBinding(s, '#999'), statePath);

  let afterTest = loadState(statePath);
  assert.equal(afterTest.active, '#999', 'AC1/AC2: binding must survive a successful `test`');
  assert.equal(afterTest.entryStartTs, null, 'test closes the timing session');
  assert.equal(afterTest.wordsAtEntryStart, 0, 'test resets the word marker');
  assert.equal(afterTest.lastActive, '#999', 'lastActive records the issue');

  // --- Verb 2: `review #999` runs with NO intervening `start #999`. ---
  // The binding from verb 1 is still present, so review operates directly.
  s = loadState(statePath);
  assert.equal(
    s.active,
    '#999',
    'AC1: second verb must find the issue still bound — no re-bind required'
  );
  saveState(pauseTimingKeepBinding(s, '#999'), statePath);

  const afterReview = loadState(statePath);
  assert.equal(afterReview.active, '#999', 'AC3: binding survives across the verb→verb sequence');
  assert.equal(afterReview.entryStartTs, null, 'review leaves the timing session closed');

  // --- AC2 contrast: only an explicit unbind clears `active`. ---
  clearActive(statePath);
  const afterPause = loadState(statePath);
  assert.equal(afterPause.active, null, 'AC2: explicit pause/unbind is what clears the binding');

  console.log('test-407-binding-survives.test.mjs: all passed');
} finally {
  if (prevProjectDir === undefined) delete process.env.AI_TASK_MANAGER_PROJECT_DIR;
  else process.env.AI_TASK_MANAGER_PROJECT_DIR = prevProjectDir;
  rmSync(sandbox, { recursive: true, force: true });
}
