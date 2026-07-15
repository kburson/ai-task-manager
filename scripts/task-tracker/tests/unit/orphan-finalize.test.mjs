#!/usr/bin/env node
// @story #215
// EPIC #823 (timing model v2) C1 — `finalizeOrphanPause` no longer emits any
// timing row. It is now a marker-cleanup helper: it reads a stale
// `pending-pause.json`, deletes it (when same-session), and always returns null.
// Idle time exists only inside an explicit `/task pause` (or `switch-out`) →
// `/task resume` bracket, so there is nothing to finalize into an `idle` row.
//
// The retired emission behaviors (threshold gating, `idleSeconds`, `finalized`,
// enqueue-on-post-failure, the `deps.postTimingEvent` row text) are gone. C5
// (#828) completes the v2 reconciliation: this suite asserts the finalize path
// produces NO row at all (no `idle`/`active-work`, no emission of any kind) — the
// v2 contract that idle time lives only inside explicit departure/return
// brackets, never a synthesized finalize row.
import { strict as assert } from 'node:assert';
import { mkdtempSync, rmSync, existsSync, writeFileSync, mkdirSync } from 'node:fs';
import { projectScratchDir } from '../../lib/scratch-dir.mjs';
import path from 'node:path';
import { pendingPausePath } from '../../hooks/on-stop.mjs';
import { finalizeOrphanPause } from '../../orphan-finalize.mjs';

const tmp = mkdtempSync(path.join(projectScratchDir('test'), 'tt-orphan-fin-'));

function writeMarker(sid, payload) {
  const p = pendingPausePath(sid, tmp);
  mkdirSync(path.dirname(p), { recursive: true });
  writeFileSync(p, JSON.stringify(payload) + '\n', 'utf8');
  return p;
}

// Test 1: missing sid → null, no error
{
  const r = await finalizeOrphanPause({ sid: '', reason: 'natural', projDir: tmp });
  assert.equal(r, null);
}

// Test 2: invalid reason → throws
{
  await assert.rejects(
    () => finalizeOrphanPause({ sid: 'a', reason: 'bogus', projDir: tmp }),
    /invalid reason/
  );
}

// Test 3: no marker → null
{
  const r = await finalizeOrphanPause({ sid: 'no-marker-sid', reason: 'natural', projDir: tmp });
  assert.equal(r, null);
}

// Test 4: same-session marker → deleted, returns null, posts nothing.
{
  const sid = 'same-sess';
  const p = writeMarker(sid, {
    stoppedAt: new Date(Date.now() - 5 * 60_000).toISOString(),
    issue: '#42',
    sessionId: sid,
  });
  const r = await finalizeOrphanPause({ sid, reason: 'orphan-finalize', projDir: tmp });
  assert.equal(r, null, 'v2 finalize returns null (no idle row)');
  assert.equal(existsSync(p), false, 'stale marker deleted');
}

// Test 5: marker without `issue` → still deleted (same session), returns null
{
  const sid = 'no-issue';
  const p = writeMarker(sid, {
    stoppedAt: new Date(Date.now() - 5 * 60_000).toISOString(),
    issue: null,
    sessionId: sid,
  });
  const r = await finalizeOrphanPause({ sid, reason: 'natural', projDir: tmp });
  assert.equal(r, null);
  assert.equal(existsSync(p), false);
}

// Test 6: corrupt JSON marker → null, marker NOT deleted (preserved for
// operator inspection).
{
  const sid = 'corrupt';
  const p = pendingPausePath(sid, tmp);
  mkdirSync(path.dirname(p), { recursive: true });
  writeFileSync(p, '{not-json,,,', 'utf8');
  const r = await finalizeOrphanPause({ sid, reason: 'natural', projDir: tmp });
  assert.equal(r, null, 'corrupt JSON returns null');
  assert.equal(existsSync(p), true, 'corrupt marker is preserved for inspection');
}

// Test 7: foreign-session marker → null, NOT deleted (the real owner can still
// recover it). This is the preserved refusal from the emission era.
{
  const sid = 'mine';
  const p = writeMarker(sid, {
    stoppedAt: new Date(Date.now() - 5 * 60_000).toISOString(),
    issue: '#7',
    sessionId: 'someone-else',
  });
  const r = await finalizeOrphanPause({ sid, reason: 'stale-session', projDir: tmp });
  assert.equal(r, null);
  assert.equal(existsSync(p), true, 'foreign-session marker is left untouched');
}

// Test 8: every valid reason is accepted (natural/orphan-finalize/switch/
// stale-session) and yields null on a clean (no-marker) session.
for (const reason of ['natural', 'orphan-finalize', 'switch', 'stale-session']) {
  const r = await finalizeOrphanPause({ sid: `clean-${reason}`, reason, projDir: tmp });
  assert.equal(r, null, `reason ${reason} → null`);
}

rmSync(tmp, { recursive: true });
console.log('orphan-finalize.test.mjs: all passed');
