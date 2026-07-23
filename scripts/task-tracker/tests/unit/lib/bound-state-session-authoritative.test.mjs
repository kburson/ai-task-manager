#!/usr/bin/env node
// @story #666
// readBoundState must be authoritative for the CURRENT session's own binding.
//
// Defect #666: the global active pointer (`task-tracker-state.json#active`) is a
// single-slot-per-tree cache, but `readBoundState` treats it as the source of
// truth — it reads the global `active` and then scans EVERY session record for
// one whose `issue` matches that global value, never preferring the current
// session's own `active-task.json`. When the global pointer holds another
// session's ghost, the current session adopts the ghost's issue + kanban state,
// and the activity-guard then refuses the real bound issue's writes.
//
// Asserts:
//   AC1 — readBoundState returns the current session's own bound issue even when
//         the global pointer names a different (ghost) issue.
//   AC2 — the returned `state` is derived from the current session's own record,
//         never adopted from a different session's active-task.json.
//   AC3 — when the current session has NO active-task.json, readBoundState falls
//         back to the global pointer + cross-session scan (legacy behavior).

import { strict as assert } from 'node:assert';
import { test, beforeEach, afterEach } from 'node:test';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import path from 'node:path';

import { readBoundState } from '../../../lib/bound-state.mjs';
import { mkdtempOutsideRepo } from '../../../lib/scratch-dir.mjs';

const CURRENT_SID = 'current-session-666';
const GHOST_SID = 'ghost-session-628';

let root;
let savedSid;

function statePath(r) {
  return path.join(r, '.tmp', 'aitm', 'state', 'task-tracker-state.json');
}
function sessionActiveTaskPath(r, sid) {
  return path.join(r, '.tmp', 'aitm', 'sessions', sid, 'active-task.json');
}

function writeJson(p, obj) {
  mkdirSync(path.dirname(p), { recursive: true });
  writeFileSync(p, JSON.stringify(obj, null, 2), 'utf8');
}

beforeEach(() => {
  root = mkdtempOutsideRepo('aitm-bound-state-');
  savedSid = process.env.AI_TASK_MANAGER_SESSION_ID;
  process.env.AI_TASK_MANAGER_SESSION_ID = CURRENT_SID;
});

afterEach(() => {
  if (savedSid === undefined) delete process.env.AI_TASK_MANAGER_SESSION_ID;
  else process.env.AI_TASK_MANAGER_SESSION_ID = savedSid;
  rmSync(root, { recursive: true, force: true });
});

test('AC1/AC2 — current session record wins over a ghost global pointer', () => {
  // Global pointer holds a prior session's ghost: #628 in refine.
  writeJson(statePath(root), { active: '#628', state: 'refine' });
  // The ghost-holding session's own record (the one the legacy scan would adopt).
  writeJson(sessionActiveTaskPath(root, GHOST_SID), {
    issue: '#628',
    kanbanState: 'refine',
  });
  // The CURRENT session's own authoritative record: #665 in backlog.
  writeJson(sessionActiveTaskPath(root, CURRENT_SID), {
    issue: '#665',
    kanbanState: 'backlog',
  });

  const result = readBoundState(root);

  assert.equal(result.activeIssue, '#665', 'AC1: must return the current session own issue');
  assert.equal(result.state, 'backlog', 'AC2: state derived from current session own record');
});

test('AC3 — no current-session record falls back to global pointer + cross-session scan', () => {
  writeJson(statePath(root), { active: '#628', state: 'refine' });
  writeJson(sessionActiveTaskPath(root, GHOST_SID), {
    issue: '#628',
    kanbanState: 'refine',
  });
  // No active-task.json for CURRENT_SID.

  const result = readBoundState(root);

  assert.equal(result.activeIssue, '#628', 'AC3: falls back to the global pointer');
  assert.equal(result.state, 'refine', 'AC3: legacy cross-session scan still resolves state');
});
