#!/usr/bin/env node
// @story #213
// EPIC #823 (timing model v2) C1 — the UserPromptSubmit hook no longer
// manufactures idle time. `recordPendingPause` writes no marker and
// `finalizeOrphanPause` posts no row, so `processPendingPause` collapses to a
// marker-cleanup pass that returns a coarse {status} signal only. The retired
// threshold-gap / idle-row / rebind assertions are gone; what remains is the
// no-session / no-marker signalling and the exported gap helper.
import { strict as assert } from 'node:assert';
import { mkdtempSync, rmSync } from 'node:fs';
import { projectScratchDir } from '../../../lib/scratch-dir.mjs';
import path from 'node:path';
import { processPendingPause, computeGapSeconds } from '../../../hooks/on-user-prompt.mjs';

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

// Test 3: computeGapSeconds basic math (retained export)
assert.equal(computeGapSeconds(new Date(Date.now() - 60_000).toISOString()), 60);
assert.equal(computeGapSeconds('not-a-date'), 0);

rmSync(tmp, { recursive: true });
console.log('on-user-prompt.test.mjs: all passed');
