#!/usr/bin/env node
import { strict as assert } from 'node:assert';
import { mkdtempSync, rmSync, existsSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pendingPausePath } from '../hooks/on-stop.mjs';
import { finalizeOrphanPause } from '../orphan-finalize.mjs';

const tmp = mkdtempSync(path.join(tmpdir(), 'tt-orphan-fin-'));

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

// Test 4: sub-threshold gap → marker deleted, returns null
{
  const sid = 'sub-thresh';
  const p = writeMarker(sid, {
    stoppedAt: new Date(Date.now() - 5_000).toISOString(),
    issue: '#100',
    state: 'develop',
    sessionId: sid,
  });
  const calls = [];
  const r = await finalizeOrphanPause({
    sid,
    reason: 'natural',
    projDir: tmp,
    deps: { postTimingEvent: async (a) => calls.push(a) },
  });
  assert.equal(r, null);
  assert.equal(calls.length, 0);
  assert.equal(existsSync(p), false, 'marker deleted on sub-threshold');
}

// Test 5: above threshold → posts to marker.issue (NOT currently-bound)
// with the correct reason marker; returns {finalized, issue, idleSeconds, reason}
{
  const sid = 'above-thresh';
  const p = writeMarker(sid, {
    stoppedAt: new Date(Date.now() - 5 * 60_000).toISOString(),
    issue: '#42',
    state: 'develop',
    sessionId: sid,
  });
  const calls = [];
  const r = await finalizeOrphanPause({
    sid,
    reason: 'orphan-finalize',
    projDir: tmp,
    deps: { postTimingEvent: async (a) => calls.push(a) },
  });
  assert.ok(r, 'returns truthy result');
  assert.equal(r.finalized, true);
  assert.equal(r.issue, '#42');
  assert.equal(r.reason, 'orphan-finalize');
  assert.ok(r.idleSeconds >= 5 * 60 - 2, 'idleSeconds is gap in seconds');
  assert.equal(calls.length, 1);
  assert.equal(calls[0].issueNumber, '#42', 'posts to marker.issue');
  assert.match(calls[0].row, /\| idle \|/);
  assert.match(calls[0].row, /sess: above-thresh reason: orphan-finalize/);
  assert.equal(existsSync(p), false, 'marker deleted after post');
}

// Test 6: post failure → enqueues, marker still deleted
{
  const sid = 'enq';
  writeMarker(sid, {
    stoppedAt: new Date(Date.now() - 5 * 60_000).toISOString(),
    issue: '#7',
    state: 'develop',
    sessionId: sid,
  });
  const enqueued = [];
  const r = await finalizeOrphanPause({
    sid,
    reason: 'natural',
    projDir: tmp,
    deps: {
      postTimingEvent: async () => {
        throw new Error('network down');
      },
      enqueue: (item) => enqueued.push(item),
    },
  });
  assert.ok(r);
  assert.equal(enqueued.length, 1, 'enqueued one item');
  assert.equal(enqueued[0].issue, '#7');
  assert.equal(enqueued[0].kind, 'timing');
  assert.equal(existsSync(pendingPausePath(sid, tmp)), false);
}

// Test 7: marker without `issue` → deleted silently, returns null
{
  const sid = 'no-issue';
  const p = writeMarker(sid, {
    stoppedAt: new Date(Date.now() - 5 * 60_000).toISOString(),
    issue: null,
    state: null,
    sessionId: sid,
  });
  const r = await finalizeOrphanPause({ sid, reason: 'natural', projDir: tmp });
  assert.equal(r, null);
  assert.equal(existsSync(p), false);
}

rmSync(tmp, { recursive: true });
console.log('orphan-finalize.test.mjs: all passed');
