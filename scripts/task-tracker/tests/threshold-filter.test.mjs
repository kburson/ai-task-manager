#!/usr/bin/env node
// #216 AC2 — `pauseThresholdSeconds` filter behavior.
// Sub-threshold gaps produce ZERO timing rows (marker is deleted silently).
// Supra-threshold gaps produce EXACTLY ONE timing row.
//
// Uses the orphan-finalize lib (the shared finalize implementation that all
// four triggers route through). Default threshold is 30s — see
// `scripts/task-tracker/config.mjs`.

import { strict as assert } from 'node:assert';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pendingPausePath } from '../hooks/on-stop.mjs';
import { finalizeOrphanPause } from '../orphan-finalize.mjs';
import { loadConfig } from '../config.mjs';

const tmp = mkdtempSync(path.join(tmpdir(), 'tt-threshold-'));
const threshold = Number(loadConfig().pauseThresholdSeconds) || 30;

function writeMarker(sid, ageSec) {
  const p = pendingPausePath(sid, tmp);
  mkdirSync(path.dirname(p), { recursive: true });
  writeFileSync(
    p,
    JSON.stringify({
      stoppedAt: new Date(Date.now() - ageSec * 1000).toISOString(),
      issue: '#thr',
      state: 'develop',
      sessionId: sid,
    }) + '\n'
  );
  return p;
}

// Just below threshold → zero rows
{
  const sid = 'just-below';
  const p = writeMarker(sid, Math.max(threshold - 5, 1));
  const calls = [];
  const r = await finalizeOrphanPause({
    sid,
    reason: 'natural',
    projDir: tmp,
    deps: { postTimingEvent: async (a) => calls.push(a) },
  });
  assert.equal(r, null, 'sub-threshold returns null');
  assert.equal(calls.length, 0, 'sub-threshold posts zero rows');
  assert.equal(existsSync(p), false, 'marker deleted on sub-threshold');
}

// Far below threshold → zero rows
{
  const sid = 'far-below';
  writeMarker(sid, 1);
  const calls = [];
  await finalizeOrphanPause({
    sid,
    reason: 'natural',
    projDir: tmp,
    deps: { postTimingEvent: async (a) => calls.push(a) },
  });
  assert.equal(calls.length, 0);
}

// Just above threshold → exactly one row
{
  const sid = 'just-above';
  writeMarker(sid, threshold + 5);
  const calls = [];
  const r = await finalizeOrphanPause({
    sid,
    reason: 'natural',
    projDir: tmp,
    deps: { postTimingEvent: async (a) => calls.push(a) },
  });
  assert.ok(r && r.finalized, 'supra-threshold posts a row');
  assert.equal(calls.length, 1, 'exactly one row posted');
  assert.match(calls[0].row, /\| idle \|/);
}

// Far above threshold → still exactly one row (idempotent post)
{
  const sid = 'far-above';
  writeMarker(sid, threshold * 60); // an hour
  const calls = [];
  await finalizeOrphanPause({
    sid,
    reason: 'natural',
    projDir: tmp,
    deps: { postTimingEvent: async (a) => calls.push(a) },
  });
  assert.equal(calls.length, 1, 'one row per marker regardless of gap size');
}

rmSync(tmp, { recursive: true });
console.log('threshold-filter.test.mjs: all passed');
