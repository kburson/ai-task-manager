#!/usr/bin/env node
// @story #234
// Regression: `/task cancel` is the escape hatch for a stuck discovery
// bucket. It clears the bucket and active binding WITHOUT emitting any timing
// rows, and is a clean no-op when no bucket is active. See issue #234.
// @story #1857
// Fixture: this fixture owns its actor instead of using ambient session state.
import { initializeFixtureActor } from '../../../helpers/fixture-actor.mjs';
initializeFixtureActor(import.meta.url);

import { strict as assert } from 'node:assert';
import { rmSync } from 'node:fs';
import {
  withUnitRuntimeRoot,
  createActivatedUnitRuntimeRoot,
} from '../../../helpers/unit-runtime-root.mjs';
import { loadState, saveState } from '../../../../task-tracker/state.mjs';
import path from 'node:path';
import { verbCancel } from '../../../../task-tracker/verbs/cancel.mjs';

function makeCtx(statePath, dir, rows) {
  return {
    cfg: { repo: 'o/r' },
    statePath,
    projectDir: dir,
    rest: [],
    SKIP_NETWORK: false,
    drainQueueIfAny: async () => {},
    safePostTiming: async (issue, row) => {
      rows.push({ issue, row });
      return { ok: true };
    },
    nowIso: () => new Date().toISOString(),
  };
}

await withUnitRuntimeRoot(async () => {
  // --- Case 1: active discovery bucket is cleared, no timing rows posted ------
  {
    const dir = createActivatedUnitRuntimeRoot('aitm-cancel-active-');
    const statePath = path.join(
      dir,
      '.ai-task-manager/runtime/store/state/task-tracker-state.json'
    );
    const startedAt = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    saveState(
      {
        active: 'discover',
        lastActive: null,
        discoverBucket: {
          startedAt,
          wordsAtStart: 10,
          entries: [{ ts: startedAt, event: 'discover-start', deltaMin: null, deltaWords: null }],
        },
      },
      statePath
    );

    const rows = [];
    await verbCancel(makeCtx(statePath, dir, rows));

    const after = loadState(statePath);
    assert.equal(after.active, null, 'active should be cleared');
    assert.equal(after.discoverBucket, null, 'discoverBucket should be cleared');
    assert.equal(rows.length, 0, 'cancel must emit zero timing rows');
    rmSync(dir, { recursive: true, force: true });
  }

  // --- Case 2: no active bucket — clean no-op, no throw, no rows --------------
  {
    const dir = createActivatedUnitRuntimeRoot('aitm-cancel-noop-');
    const statePath = path.join(
      dir,
      '.ai-task-manager/runtime/store/state/task-tracker-state.json'
    );
    saveState({ active: null, lastActive: null, discoverBucket: null }, statePath);

    const rows = [];
    // Must not throw.
    await verbCancel(makeCtx(statePath, dir, rows));
    assert.equal(rows.length, 0, 'no-op cancel must emit zero timing rows');
    rmSync(dir, { recursive: true, force: true });
  }
});
console.log('discover-cancel.test.mjs: all passed');
