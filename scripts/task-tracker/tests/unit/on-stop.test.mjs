#!/usr/bin/env node
// @story #213
import { strict as assert } from 'node:assert';
import { mkdtempSync, rmSync, existsSync, readFileSync } from 'node:fs';
import { projectScratchDir } from '../../lib/scratch-dir.mjs';
import path from 'node:path';
import { setActiveTask } from '../../session-state.mjs';
import { recordPendingPause, pendingPausePath } from '../../hooks/on-stop.mjs';

const tmp = mkdtempSync(path.join(projectScratchDir('test'), 'tt-on-stop-'));

// Test 1: no session id → no-op
{
  const r = recordPendingPause({ env: {} });
  assert.equal(r.status, 'no-session');
}

// Test 2: session id present but no active task → no-op (no marker written)
{
  const env = { CLAUDE_SESSION_ID: 's1', AI_TASK_MANAGER_PROJECT_DIR: tmp };
  const r = recordPendingPause({ env });
  assert.equal(r.status, 'no-active');
  assert.equal(existsSync(pendingPausePath('s1', tmp)), false);
}

// Test 3: bound active task → marker written with expected payload, zero
// network I/O (we don't mock gh — if the hook tried network this'd hang or
// fail).
{
  setActiveTask('s2', { issue: '#213', entryStartTs: 'x', wordsAtStart: 0 }, tmp);
  const env = { CLAUDE_SESSION_ID: 's2', AI_TASK_MANAGER_PROJECT_DIR: tmp };
  const fixedNow = '2026-05-25T15:00:00.000Z';
  const r = recordPendingPause({ env, now: () => fixedNow });
  assert.equal(r.status, 'ok');
  const p = pendingPausePath('s2', tmp);
  assert.equal(existsSync(p), true, 'marker file written');
  const payload = JSON.parse(readFileSync(p, 'utf8'));
  assert.equal(payload.issue, '#213');
  assert.equal(payload.state, undefined, '#218: state field is no longer in pending-pause payload');
  assert.equal(payload.sessionId, 's2');
  assert.equal(payload.stoppedAt, fixedNow);
}

rmSync(tmp, { recursive: true });
console.log('on-stop.test.mjs: all passed');
