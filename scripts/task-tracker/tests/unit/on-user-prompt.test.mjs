#!/usr/bin/env node
// @story #213
import { strict as assert } from 'node:assert';
import { mkdtempSync, rmSync, existsSync, writeFileSync, mkdirSync } from 'node:fs';
import { projectScratchDir } from '../../lib/scratch-dir.mjs';
import path from 'node:path';
import { setActiveTask } from '../../session-state.mjs';
import { recordPendingPause, pendingPausePath } from '../../hooks/on-stop.mjs';
import { processPendingPause, computeGapSeconds } from '../../hooks/on-user-prompt.mjs';

// Pause threshold default is 30s — see config.mjs DEFAULTS.
// After #215, on-user-prompt.mjs delegates to finalizeOrphanPause. The hook
// returns a coarse {status} signal; finer-grained outcomes (sub-threshold,
// foreign-session, no-marker) collapse to `no-op` here. Detailed semantics
// are covered by orphan-finalize.test.mjs.

const tmp = mkdtempSync(path.join(projectScratchDir('test'), 'tt-on-up-'));

// Test 1: no session → no-op
{
  const r = await processPendingPause({ env: {} });
  assert.equal(r.status, 'no-session');
}

// Test 2: no marker file → no-op
{
  const env = { CLAUDE_SESSION_ID: 'u1', AI_TASK_MANAGER_PROJECT_DIR: tmp };
  const r = await processPendingPause({ env });
  assert.equal(r.status, 'no-op');
}

// Test 3: gap below threshold → marker deleted, no post, no-op status
{
  const sid = 'u2';
  setActiveTask(sid, { issue: '#213', state: 'develop' }, tmp);
  const env = { CLAUDE_SESSION_ID: sid, AI_TASK_MANAGER_PROJECT_DIR: tmp };
  recordPendingPause({ env, now: () => new Date(Date.now() - 5_000).toISOString() });
  const calls = [];
  const r = await processPendingPause({
    env,
    deps: { postTimingEvent: async (a) => calls.push(a) },
  });
  assert.equal(r.status, 'no-op');
  assert.equal(calls.length, 0, 'no post for sub-threshold gap');
  assert.equal(existsSync(pendingPausePath(sid, tmp)), false, 'marker deleted');
}

// Test 4: gap above threshold → one idle row posted, marker deleted
{
  const sid = 'u3';
  setActiveTask(sid, { issue: '#213', state: 'develop' }, tmp);
  const env = { CLAUDE_SESSION_ID: sid, AI_TASK_MANAGER_PROJECT_DIR: tmp };
  // Stop happened 5 minutes ago (>> 30s threshold).
  recordPendingPause({ env, now: () => new Date(Date.now() - 5 * 60_000).toISOString() });
  const calls = [];
  const r = await processPendingPause({
    env,
    deps: { postTimingEvent: async (a) => calls.push(a) },
  });
  assert.equal(r.status, 'posted');
  assert.equal(calls.length, 1, 'one post');
  assert.equal(calls[0].issueNumber, '#213');
  assert.match(calls[0].row, /\| idle \|/, 'row has idle event');
  assert.match(calls[0].row, /sess: u3 reason: natural/, 'marker carries session + natural reason');
  assert.equal(existsSync(pendingPausePath(sid, tmp)), false);
}

// Test 5: marker references a different issue than the current bound task
// — after #215, the row goes to the issue NAMED IN THE MARKER (not the
// currently-bound issue). The old "rebound = drop" behavior is gone.
{
  const sid = 'u4';
  setActiveTask(sid, { issue: '#999', state: 'develop' }, tmp);
  const env = { CLAUDE_SESSION_ID: sid, AI_TASK_MANAGER_PROJECT_DIR: tmp };
  const p = pendingPausePath(sid, tmp);
  mkdirSync(path.dirname(p), { recursive: true });
  writeFileSync(
    p,
    JSON.stringify({
      stoppedAt: new Date(Date.now() - 5 * 60_000).toISOString(),
      issue: '#213',
      state: 'develop',
      sessionId: sid,
    })
  );
  const calls = [];
  const r = await processPendingPause({
    env,
    deps: { postTimingEvent: async (a) => calls.push(a) },
  });
  assert.equal(r.status, 'posted');
  assert.equal(calls.length, 1, 'posts to marker.issue, not currently-bound');
  assert.equal(calls[0].issueNumber, '#213');
  assert.equal(existsSync(p), false);
}

// Test 6: computeGapSeconds basic math
assert.equal(computeGapSeconds(new Date(Date.now() - 60_000).toISOString()), 60);
assert.equal(computeGapSeconds('not-a-date'), 0);

rmSync(tmp, { recursive: true });
console.log('on-user-prompt.test.mjs: all passed');
