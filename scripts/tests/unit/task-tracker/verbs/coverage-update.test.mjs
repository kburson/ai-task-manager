#!/usr/bin/env node
// @story #599
// Coverage tests for scripts/task-tracker/verbs/update.mjs.
//
// `verbUpdate` drains the queue, loads state, and short-circuits with "nothing
// to update" when there is no active task (or the active task is the `discover`
// pseudo-bind). Otherwise it flushes the active task's timing/word delta to
// GitHub (via the injected `flushActiveToGH`), re-marks the session word count,
// persists the advanced entry cursor through `saveState`, and prints a summary
// whose wall-clock note appears only when wall time diverges from active time.
//
// `flushActiveToGH` and `drainQueueIfAny` are injected, so no GitHub call is
// made. `currentSessionId()` is not injectable but falls back to
// 'default-session', whose transcript file does not exist — `countWords`
// short-circuits to zero and `saveMarker` writes a marker under the project's
// state dir, which we redirect to an isolated temp dir via
// AI_TASK_MANAGER_PROJECT_DIR so the live repo is never touched.

import { strict as assert } from 'node:assert';
import { test, before, after } from 'node:test';
import path from 'node:path';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';

import { verbUpdate } from '../../../../task-tracker/verbs/update.mjs';
import { mkdtempOutsideRepo } from '../../../../task-tracker/lib/scratch-dir.mjs';

let tmpRoot;
let savedProjectDir;

before(() => {
  tmpRoot = mkdtempOutsideRepo('update-cov-');
  savedProjectDir = process.env.AI_TASK_MANAGER_PROJECT_DIR;
  // Redirect projectDir() so saveMarker writes its session-tracking marker into
  // the isolated temp dir instead of the live repo's state dir.
  process.env.AI_TASK_MANAGER_PROJECT_DIR = tmpRoot;
});

after(() => {
  if (savedProjectDir === undefined) delete process.env.AI_TASK_MANAGER_PROJECT_DIR;
  else process.env.AI_TASK_MANAGER_PROJECT_DIR = savedProjectDir;
  try {
    rmSync(tmpRoot, { recursive: true, force: true });
  } catch {
    /* best-effort */
  }
});

function stateFile(active, extra = {}) {
  const p = path.join(tmpRoot, `state-${Math.abs(hashish(String(active)))}.json`);
  writeFileSync(p, JSON.stringify({ active, lastActive: active, ...extra }));
  return p;
}
function hashish(s) {
  let h = 0;
  for (const c of String(s)) h = (h * 31 + c.charCodeAt(0)) | 0;
  return h;
}

// Run verbUpdate with console.log trapped; returns the captured output and the
// description that the injected flushActiveToGH observed.
async function runUpdate({ statePath, rest = [], flush }) {
  const realLog = console.log;
  let out = '';
  console.log = (...args) => {
    out += args.join(' ') + '\n';
  };
  let seenDescription;
  let flushCalled = false;
  const flushActiveToGH = async (_s, _verb, description) => {
    flushCalled = true;
    seenDescription = description;
    return (
      flush ?? {
        deltaMin: 3,
        idleMin: 1,
        deltaWallMin: 3,
        deltaWords: 42,
        wordMarker: 1234,
        ts: '2026-06-29T00:00:00.000Z',
      }
    );
  };
  try {
    await verbUpdate({
      statePath,
      projectDir: tmpRoot,
      rest,
      drainQueueIfAny: async () => {},
      flushActiveToGH,
      heartbeatBindingOccupancy: () => ({ status: 'updated' }),
    });
  } finally {
    console.log = realLog;
  }
  return { out, seenDescription, flushCalled };
}

test('no active task → "nothing to update", no flush', async () => {
  const { out, flushCalled } = await runUpdate({ statePath: stateFile(null) });
  assert.match(out, /nothing to update/);
  assert.equal(flushCalled, false, 'flush must not be called on the early return');
});

test('active === discover → "nothing to update"', async () => {
  const { out } = await runUpdate({ statePath: stateFile('discover') });
  assert.match(out, /nothing to update/);
});

test('happy path: default "checkpoint" description, wall == active → no wall note', async () => {
  const { out, seenDescription } = await runUpdate({
    statePath: stateFile('#42', { totalActiveMinutes: 10 }),
    rest: [],
    flush: {
      deltaMin: 5,
      idleMin: 2,
      deltaWallMin: 5, // equal → no "(wall …)" note
      deltaWords: 99,
      wordMarker: 2048,
      ts: '2026-06-29T01:00:00.000Z',
    },
  });
  assert.equal(seenDescription, 'checkpoint');
  assert.match(out, /Update #42: \+5 active min, \+2 idle min, \+99 words\./);
  assert.doesNotMatch(out, /\(wall/);
  assert.match(out, /Total: 15 active min, 2,048 words\./);
});

test('happy path: rest joins to description, wall != active → wall note shown', async () => {
  const { out, seenDescription } = await runUpdate({
    statePath: stateFile('#77'),
    rest: ['mid', 'task', 'note'],
    flush: {
      deltaMin: 4,
      idleMin: 0,
      deltaWallMin: 9, // differs → "(wall 9)" note
      deltaWords: 7,
      wordMarker: 500,
      ts: '2026-06-29T02:00:00.000Z',
    },
  });
  assert.equal(seenDescription, 'mid task note');
  assert.match(out, /\+4 active min, \+0 idle min \(wall 9\), \+7 words\./);
  assert.match(out, /Total: 4 active min, 500 words\./);
});

console.log('coverage-update.test.mjs: defined');
