#!/usr/bin/env node
// @story #213
// EPIC #823 (timing model v2) C1 — the Stop hook no longer auto-writes a
// `pending-pause.json` marker. An ordinary turn-end is NOT a pause (Option A),
// so `recordPendingPause` is an inert no-op: it writes nothing and stages no
// pause. `pendingPausePath` / `buildPayload` remain exported for the
// marker-cleanup path (orphan-finalize.mjs) and are still exercised here.
import { strict as assert } from 'node:assert';
import { mkdtempSync, rmSync, existsSync } from 'node:fs';
import { projectScratchDir } from '../../lib/scratch-dir.mjs';
import path from 'node:path';
import { setActiveTask } from '../../session-state.mjs';
import { recordPendingPause, pendingPausePath, buildPayload } from '../../hooks/on-stop.mjs';

const tmp = mkdtempSync(path.join(projectScratchDir('test'), 'tt-on-stop-'));

// Test 1: no args → retired no-op, no throw
{
  const r = recordPendingPause();
  assert.equal(r.status, 'retired');
}

// Test 2: even with a bound active task, NO marker is written (the auto-writer
// is removed). The Stop hook manufactures no idle time in v2.
{
  setActiveTask('s2', { issue: '#213', entryStartTs: 'x', wordsAtStart: 0 }, tmp);
  const env = { CLAUDE_SESSION_ID: 's2', AI_TASK_MANAGER_PROJECT_DIR: tmp };
  const r = recordPendingPause({ env });
  assert.equal(r.status, 'retired');
  assert.equal(
    existsSync(pendingPausePath('s2', tmp)),
    false,
    'no pending-pause marker is written on turn-end'
  );
}

// Test 3: the retained exports still work — `pendingPausePath` resolves under
// the session dir and `buildPayload` shapes the legacy marker record (used by
// explicit-pause paths and the cleanup consumer).
{
  const p = pendingPausePath('s3', tmp);
  assert.ok(p.endsWith(path.join('s3', 'pending-pause.json')), 'path under session dir');
  const payload = buildPayload({ issue: '#213' }, 's3', '2026-05-25T15:00:00.000Z');
  assert.equal(payload.issue, '#213');
  assert.equal(payload.sessionId, 's3');
  assert.equal(payload.stoppedAt, '2026-05-25T15:00:00.000Z');
  assert.equal(payload.state, undefined, '#218: no state field in the payload');
}

rmSync(tmp, { recursive: true });
console.log('on-stop.test.mjs: all passed');
