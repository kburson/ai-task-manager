#!/usr/bin/env node
// Regression: `/task cancel` is the escape hatch for a stuck discovery
// bucket. It clears the bucket and active binding WITHOUT emitting any timing
// rows, and is a clean no-op when no bucket is active. See issue #234.
import { strict as assert } from 'node:assert';
import { mkdtempSync, writeFileSync, readFileSync } from 'node:fs';
import { projectScratchDir } from '../lib/scratch-dir.mjs';
import path from 'node:path';
import { verbCancel } from '../verbs/cancel.mjs';

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

// --- Case 1: active discovery bucket is cleared, no timing rows posted ------
{
  const dir = mkdtempSync(path.join(projectScratchDir('test'), 'aitm-cancel-active-'));
  const statePath = path.join(dir, 'state.json');
  const startedAt = new Date(Date.now() - 5 * 60 * 1000).toISOString();
  writeFileSync(
    statePath,
    JSON.stringify({
      active: 'discover',
      lastActive: null,
      discoverBucket: {
        startedAt,
        wordsAtStart: 10,
        entries: [{ ts: startedAt, event: 'discover-start', deltaMin: null, deltaWords: null }],
      },
    }),
    'utf8'
  );

  const rows = [];
  await verbCancel(makeCtx(statePath, dir, rows));

  const after = JSON.parse(readFileSync(statePath, 'utf8'));
  assert.equal(after.active, null, 'active should be cleared');
  assert.equal(after.discoverBucket, null, 'discoverBucket should be cleared');
  assert.equal(rows.length, 0, 'cancel must emit zero timing rows');
}

// --- Case 2: no active bucket — clean no-op, no throw, no rows --------------
{
  const dir = mkdtempSync(path.join(projectScratchDir('test'), 'aitm-cancel-noop-'));
  const statePath = path.join(dir, 'state.json');
  writeFileSync(
    statePath,
    JSON.stringify({ active: null, lastActive: null, discoverBucket: null }),
    'utf8'
  );

  const rows = [];
  // Must not throw.
  await verbCancel(makeCtx(statePath, dir, rows));
  assert.equal(rows.length, 0, 'no-op cancel must emit zero timing rows');
}

console.log('discover-cancel.test.mjs: all passed');
