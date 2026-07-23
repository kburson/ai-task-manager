#!/usr/bin/env node
// @story #215
// EPIC #823 (timing model v2) C1 — the onSessionStart sweep no longer finalizes
// an idle row for a stale marker; it only removes stale session dirs (after
// stripping any marker as cleanup). `sweepStaleSessionDirs` returns `{ swept }`
// only — the `finalized` count and the timing-post are retired.
import { strict as assert } from 'node:assert';
import { mkdtempSync, rmSync, existsSync, writeFileSync, mkdirSync, utimesSync } from 'node:fs';
import { projectScratchDir } from '../../../lib/scratch-dir.mjs';
import path from 'node:path';
import { sweepStaleSessionDirs } from '../../../orphan-finalize.mjs';
import { pendingPausePath } from '../../../hooks/on-stop.mjs';

// #215 AC6 — onSessionStart sweep: finalize pending-pause for each session
// dir older than `sessionRetentionDays` BEFORE removing it.

const tmp = mkdtempSync(path.join(projectScratchDir('test'), 'tt-sweep-'));

function makeSession(sid, { ageDays = 0, withMarker = false, markerPayload } = {}) {
  const dir = path.dirname(pendingPausePath(sid, tmp));
  mkdirSync(dir, { recursive: true });
  if (withMarker) {
    writeFileSync(
      pendingPausePath(sid, tmp),
      JSON.stringify(
        markerPayload || {
          stoppedAt: new Date(Date.now() - 10 * 60_000).toISOString(),
          issue: '#sw-' + sid,
          state: 'develop',
          sessionId: sid,
        }
      )
    );
  }
  if (ageDays > 0) {
    const past = (Date.now() - ageDays * 86_400_000) / 1000;
    utimesSync(dir, past, past);
  }
  return dir;
}

// Scenario: fresh dir (not stale), stale dir with marker, stale dir without marker
const fresh = makeSession('fresh', { ageDays: 0, withMarker: true });
const staleWithMarker = makeSession('stale-with', { ageDays: 5, withMarker: true });
const staleNoMarker = makeSession('stale-empty', { ageDays: 5, withMarker: false });

const r = await sweepStaleSessionDirs({
  projDir: tmp,
  maxAgeMs: 2 * 86_400_000,
});

assert.equal(existsSync(fresh), true, 'fresh dir preserved');
assert.equal(existsSync(staleWithMarker), false, 'stale-with-marker dir removed');
assert.equal(existsSync(staleNoMarker), false, 'stale-no-marker dir removed');
assert.equal(r.swept, 2, 'swept count = 2 stale dirs');

rmSync(tmp, { recursive: true });
console.log('session-sweep.test.mjs: all passed');
