#!/usr/bin/env node
import { strict as assert } from 'node:assert';
import { mkdtempSync, rmSync, existsSync, writeFileSync, mkdirSync, utimesSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { sweepStaleSessionDirs } from '../orphan-finalize.mjs';
import { pendingPausePath } from '../hooks/on-stop.mjs';

// #215 AC6 — onSessionStart sweep: finalize pending-pause for each session
// dir older than `sessionRetentionDays` BEFORE removing it.

const tmp = mkdtempSync(path.join(tmpdir(), 'tt-sweep-'));

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

const calls = [];
const r = await sweepStaleSessionDirs({
  projDir: tmp,
  maxAgeMs: 2 * 86_400_000,
  deps: { postTimingEvent: async (a) => calls.push(a) },
});

assert.equal(existsSync(fresh), true, 'fresh dir preserved');
assert.equal(existsSync(staleWithMarker), false, 'stale-with-marker dir removed');
assert.equal(existsSync(staleNoMarker), false, 'stale-no-marker dir removed');
assert.equal(r.swept, 2, 'swept count = 2 stale dirs');
assert.equal(r.finalized, 1, 'finalized count = 1 (the one with marker)');
assert.equal(calls.length, 1, 'one timing post for the stale marker');
assert.equal(calls[0].issueNumber, '#sw-stale-with', 'post goes to the marker.issue');
assert.match(calls[0].row, /sess: stale-with reason: stale-session/);

rmSync(tmp, { recursive: true });
console.log('session-sweep.test.mjs: all passed');
