#!/usr/bin/env node
// @story #216
// #216 AC1 — `on-stop.mjs` and `on-user-prompt.mjs` correctly consume the
// hook payload shape Claude Code provides. In this implementation the
// session id is read from `CLAUDE_SESSION_ID` (the documented Claude Code
// env var) with an `AI_TASK_MANAGER_SESSION_ID` fallback for self-test.
// The project root is resolved via `AI_TASK_MANAGER_PROJECT_DIR`.
//
// This test asserts both entry points:
//   1. No `CLAUDE_SESSION_ID` → both hooks no-op (returns no-session).
//   2. `CLAUDE_SESSION_ID` set + no active task → on-stop returns no-active,
//      on-user-prompt returns no-op.
//   3. `CLAUDE_SESSION_ID` set + active task bound → on-stop writes the
//      marker payload `{stoppedAt, issue, state, sessionId}` matching the sid.
//   4. `AI_TASK_MANAGER_SESSION_ID` fallback works when `CLAUDE_SESSION_ID`
//      is absent.
//   5. Codex hook payload `session_id` works when session env vars are absent.

import { strict as assert } from 'node:assert';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { projectScratchDir } from '../../lib/scratch-dir.mjs';
import path from 'node:path';
import { recordPendingPause, pendingPausePath, buildPayload } from '../../hooks/on-stop.mjs';
import { processPendingPause } from '../../hooks/on-user-prompt.mjs';

const tmp = mkdtempSync(path.join(projectScratchDir('test'), 'tt-hook-payload-'));

function setActive(sid, issue) {
  // Mirror the format session-state.mjs writes.
  const dir = path.join(tmp, '.ai-task-manager', 'sessions', sid);
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    path.join(dir, 'active-task.json'),
    JSON.stringify({ issue, state: 'develop' }, null, 2),
    'utf8'
  );
}

// 1. No sid in env → no-session
{
  const env = { AI_TASK_MANAGER_PROJECT_DIR: tmp };
  const r = recordPendingPause({ env });
  assert.equal(r.status, 'no-session');
  const r2 = await processPendingPause({ env });
  assert.equal(r2.status, 'no-session');
}

// 2. sid present, no active task → no-active / no-op
{
  const env = {
    AI_TASK_MANAGER_PROJECT_DIR: tmp,
    CLAUDE_SESSION_ID: 'sid-noactive',
  };
  const r = recordPendingPause({ env });
  assert.equal(r.status, 'no-active');
  const r2 = await processPendingPause({ env });
  assert.equal(r2.status, 'no-op');
  assert.equal(existsSync(pendingPausePath('sid-noactive', tmp)), false);
}

// 3. sid + active task → marker written with full payload
{
  const sid = 'sid-active';
  setActive(sid, '#hp-1');
  const env = {
    AI_TASK_MANAGER_PROJECT_DIR: tmp,
    CLAUDE_SESSION_ID: sid,
  };
  const r = recordPendingPause({ env, now: () => '2026-05-25T16:00:00.000Z' });
  assert.equal(r.status, 'ok');
  assert.ok(r.path.endsWith(`/sessions/${sid}/pending-pause.json`));
  const raw = readFileSync(pendingPausePath(sid, tmp), 'utf8');
  const payload = JSON.parse(raw);
  assert.equal(payload.stoppedAt, '2026-05-25T16:00:00.000Z');
  assert.equal(payload.issue, '#hp-1');
  assert.equal(payload.state, undefined, '#218: state field is not part of pending-pause payload');
  assert.equal(payload.sessionId, sid);
}

// 4. AI_TASK_MANAGER_SESSION_ID fallback when CLAUDE_SESSION_ID absent
{
  const sid = 'sid-fallback';
  setActive(sid, '#hp-2');
  const env = {
    AI_TASK_MANAGER_PROJECT_DIR: tmp,
    AI_TASK_MANAGER_SESSION_ID: sid,
  };
  const r = recordPendingPause({ env });
  assert.equal(r.status, 'ok');
  assert.equal(r.payload.sessionId, sid);
  assert.equal(r.payload.issue, '#hp-2');
}

// 5. buildPayload is deterministic given inputs (unit-level)
{
  // #218: state is no longer part of the payload, even if passed in.
  const p = buildPayload({ issue: '#x', state: 'test' }, 'sid-x', '2026-01-01T00:00:00.000Z');
  assert.deepEqual(p, {
    stoppedAt: '2026-01-01T00:00:00.000Z',
    issue: '#x',
    sessionId: 'sid-x',
  });
}

// 6. Codex hook payload `session_id` fallback when env vars are absent
{
  const sid = 'sid-codex-payload';
  setActive(sid, '#hp-3');
  const env = {
    AI_TASK_MANAGER_PROJECT_DIR: tmp,
  };
  const hookInput = JSON.stringify({ session_id: sid, hook_event_name: 'Stop' });
  const r = recordPendingPause({ env, hookInput });
  assert.equal(r.status, 'ok');
  assert.equal(r.payload.sessionId, sid);
  assert.equal(r.payload.issue, '#hp-3');
}

rmSync(tmp, { recursive: true });
console.log('hook-payload.test.mjs: all passed');
