#!/usr/bin/env node
// @story #215
import { strict as assert } from 'node:assert';
import { mkdtempSync, rmSync, existsSync, writeFileSync, mkdirSync } from 'node:fs';
import { projectScratchDir } from '../../lib/scratch-dir.mjs';
import path from 'node:path';
import { pendingPausePath } from '../../hooks/on-stop.mjs';
import { finalizePauseForSwitch } from '../../orphan-finalize.mjs';

// #215 AC5 — `/task #N` switch path: a switch IS a pause, even for a
// sub-threshold gap. The row must go to the OLD issue.

const tmp = mkdtempSync(path.join(projectScratchDir('test'), 'tt-switch-fin-'));

function writeMarker(sid, payload) {
  const p = pendingPausePath(sid, tmp);
  mkdirSync(path.dirname(p), { recursive: true });
  writeFileSync(p, JSON.stringify(payload) + '\n', 'utf8');
  return p;
}

// Test 1: sub-threshold gap on switch → STILL posts (forced) with reason: 'switch'
{
  const sid = 'sw1';
  const p = writeMarker(sid, {
    stoppedAt: new Date(Date.now() - 5_000).toISOString(), // 5s << threshold
    issue: '#oldA',
    state: 'develop',
    sessionId: sid,
  });
  const calls = [];
  const r = await finalizePauseForSwitch({
    sid,
    oldIssue: '#oldA',
    projDir: tmp,
    deps: { postTimingEvent: async (a) => calls.push(a) },
  });
  assert.ok(r, 'returns truthy on sub-threshold (forced)');
  assert.equal(r.finalized, true);
  assert.equal(r.issue, '#oldA', 'row goes to the OLD issue (marker.issue)');
  assert.equal(r.reason, 'switch');
  assert.equal(calls.length, 1, 'one post forced');
  assert.equal(calls[0].issueNumber, '#oldA');
  assert.match(calls[0].row, /sess: sw1 reason: switch/);
  assert.equal(existsSync(p), false, 'marker deleted');
}

// Test 2: no marker → null, no post
{
  const calls = [];
  const r = await finalizePauseForSwitch({
    sid: 'sw-none',
    oldIssue: '#x',
    projDir: tmp,
    deps: { postTimingEvent: async (a) => calls.push(a) },
  });
  assert.equal(r, null);
  assert.equal(calls.length, 0);
}

// Test 3: foreign session → null, marker not deleted, warning logged
{
  const sid = 'sw-caller';
  const p = writeMarker(sid, {
    stoppedAt: new Date(Date.now() - 5_000).toISOString(),
    issue: '#oldB',
    state: 'develop',
    sessionId: 'someone-else',
  });
  const calls = [];
  const r = await finalizePauseForSwitch({
    sid,
    oldIssue: '#oldB',
    projDir: tmp,
    deps: { postTimingEvent: async (a) => calls.push(a) },
  });
  assert.equal(r, null);
  assert.equal(calls.length, 0, 'no post on foreign session');
  assert.equal(existsSync(p), true, 'marker preserved for real owner');
}

// Test 4: above threshold also works (same code path, just non-trivial gap)
{
  const sid = 'sw2';
  writeMarker(sid, {
    stoppedAt: new Date(Date.now() - 5 * 60_000).toISOString(),
    issue: '#oldC',
    state: 'develop',
    sessionId: sid,
  });
  const calls = [];
  const r = await finalizePauseForSwitch({
    sid,
    oldIssue: '#oldC',
    projDir: tmp,
    deps: { postTimingEvent: async (a) => calls.push(a) },
  });
  assert.ok(r);
  assert.equal(r.idleSeconds >= 5 * 60 - 2, true);
  assert.equal(calls[0].issueNumber, '#oldC');
}

rmSync(tmp, { recursive: true });
console.log('switch-finalize.test.mjs: all passed');
