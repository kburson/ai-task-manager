#!/usr/bin/env node
// @story #212
// Tests for scripts/task-tracker/session-state.mjs (#212). Validates the per-
// session active-task storage, the paths.mjs helpers, and the missing-dir
// tolerance contract.

import { strict as assert } from 'node:assert';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { projectScratchDir } from '../../../../task-tracker/lib/scratch-dir.mjs';
import path from 'node:path';
import {
  getActiveTask,
  setActiveTask,
  setSessionKanbanState,
  clearActiveTask,
  sessionDir,
  activeTaskPath,
} from '../../../../task-tracker/session-state.mjs';

const tmp = mkdtempSync(path.join(projectScratchDir('test'), 'tt-session-state-'));

// AC: paths.mjs exports sessionDir(sid) returning .tmp/aitm/sessions/<sid> (#573)
const dir = sessionDir('sess-1', tmp);
assert.equal(dir, path.join(tmp, '.tmp', 'aitm', 'sessions', 'sess-1'));

// AC: paths.mjs exports activeTaskPath(sid) under sessionDir
assert.equal(activeTaskPath('sess-1', tmp), path.join(dir, 'active-task.json'));

// Sanitization: weird sids do not escape the sessions/ dir
const evilDir = sessionDir('../../etc/passwd', tmp);
assert.ok(
  evilDir.startsWith(path.join(tmp, '.tmp', 'aitm', 'sessions') + path.sep),
  'sessionDir sanitizes path separators in sid'
);

// AC: getActiveTask returns null when no session file exists (missing-dir tolerated)
assert.equal(getActiveTask('sess-1', tmp), null);
assert.equal(existsSync(dir), false, 'getActiveTask must not create the session dir');

// AC: setActiveTask persists the record; atomic write succeeds first time
const record = {
  issue: '#212',
  entryStartTs: '2026-05-25T07:00:00Z',
  wordsAtStart: 80000,
  state: 'develop', // #218: provided here to verify it's stripped on write
};
setActiveTask('sess-1', record, tmp);
const round = getActiveTask('sess-1', tmp);
assert.equal(round.issue, '#212');
assert.equal(round.entryStartTs, '2026-05-25T07:00:00Z');
assert.equal(round.wordsAtStart, 80000);
assert.equal(round.state, undefined, '#218: state field is stripped on write');
assert.ok(round.boundAt, 'setActiveTask should stamp boundAt when caller omits it');

// AC: setActiveTask overwrites cleanly (atomic via tmp + rename — no half-write)
setActiveTask('sess-1', { issue: '#999', wordsAtStart: 0 }, tmp);
const second = getActiveTask('sess-1', tmp);
assert.equal(second.issue, '#999');
assert.equal(second.wordsAtStart, 0);

// AC: clearActiveTask removes the file; idempotent on second call
clearActiveTask('sess-1', tmp);
assert.equal(getActiveTask('sess-1', tmp), null);
clearActiveTask('sess-1', tmp); // must not throw on missing file

// AC: two distinct sids do not see each other's bound issue
setActiveTask('sess-a', { issue: '#100' }, tmp);
setActiveTask('sess-b', { issue: '#200' }, tmp);
assert.equal(getActiveTask('sess-a', tmp).issue, '#100');
assert.equal(getActiveTask('sess-b', tmp).issue, '#200');
clearActiveTask('sess-a', tmp);
assert.equal(getActiveTask('sess-a', tmp), null);
assert.equal(getActiveTask('sess-b', tmp).issue, '#200', 'clearing sess-a must not affect sess-b');

// AC: corrupt JSON read returns null (does not throw)
const corruptPath = activeTaskPath('sess-c', tmp);
mkdirSync(path.dirname(corruptPath), { recursive: true });
writeFileSync(corruptPath, '{not json');
assert.equal(getActiveTask('sess-c', tmp), null);

// #218 follow-up: setSessionKanbanState seeds the derived cache, and
// subsequent setActiveTask calls that don't carry kanbanState must preserve
// it (sticky). state.mjs#saveState mints records without kanbanState on
// every bind; without stickiness the activity-guard would deadlock.
setActiveTask('sess-sticky', { issue: '#42', wordsAtStart: 100 }, tmp);
setSessionKanbanState('sess-sticky', 'develop', tmp);
assert.equal(getActiveTask('sess-sticky', tmp).kanbanState, 'develop');

// Re-bind to the SAME issue without passing kanbanState — must preserve.
setActiveTask('sess-sticky', { issue: '#42', wordsAtStart: 200 }, tmp);
assert.equal(
  getActiveTask('sess-sticky', tmp).kanbanState,
  'develop',
  'kanbanState should survive a setActiveTask call that omits it (same issue)'
);

// #1297: a terminal stamp must survive ordinary same-issue state saves when a
// close sweep could not remove the file. A later explicit reopen bind can
// supersede it through a newer worktreeResolvedAt, but generic saves must not
// silently erase the fail-safe marker.
setActiveTask('sess-terminal-sticky', { issue: '#42', closedAt: '2026-08-19T15:00:00Z' }, tmp);
setActiveTask('sess-terminal-sticky', { issue: '#42', wordsAtStart: 300 }, tmp);
assert.equal(getActiveTask('sess-terminal-sticky', tmp).closedAt, '2026-08-19T15:00:00Z');
setActiveTask('sess-terminal-sticky', { issue: '#43' }, tmp);
assert.equal(
  getActiveTask('sess-terminal-sticky', tmp).closedAt,
  undefined,
  'closedAt must not bleed across issues'
);

// Explicit kanbanState in the new record wins.
setActiveTask('sess-sticky', { issue: '#42', kanbanState: 'test' }, tmp);
assert.equal(getActiveTask('sess-sticky', tmp).kanbanState, 'test');

// Switching to a different issue must NOT carry the prior issue's kanbanState.
setActiveTask('sess-sticky', { issue: '#43' }, tmp);
assert.equal(
  getActiveTask('sess-sticky', tmp).kanbanState,
  undefined,
  'kanbanState must not bleed across different bound issues'
);

// #1206: an in-flight cache written before the rename remains readable, while
// every subsequent write persists only the canonical state id.
const legacyPath = activeTaskPath('sess-legacy-assigned', tmp);
mkdirSync(path.dirname(legacyPath), { recursive: true });
writeFileSync(legacyPath, JSON.stringify({ issue: '#1206', kanbanState: 'on-deck' }));
assert.equal(getActiveTask('sess-legacy-assigned', tmp).kanbanState, 'ready-for-plan');
setSessionKanbanState('sess-legacy-assigned', 'on-deck', tmp);
assert.equal(JSON.parse(readFileSync(legacyPath, 'utf8')).kanbanState, 'ready-for-plan');

rmSync(tmp, { recursive: true });
console.log('session-state.test.mjs: all passed');
