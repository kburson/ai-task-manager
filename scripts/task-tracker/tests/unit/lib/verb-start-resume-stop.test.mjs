// @story #472
import { strict as assert } from 'node:assert';
import { rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';

import { mkdtempProjectIsolated } from '../../../lib/scratch-dir.mjs';
import { loadState } from '../../../state.mjs';
import { verbStart } from '../../../verbs/start.mjs';
import { computePauseIdleSec, verbResume } from '../../../verbs/resume.mjs';
import { verbPause } from '../../../verbs/pause.mjs';
import { verbStop } from '../../../verbs/stop.mjs';

function sandboxState(state) {
  const dir = mkdtempProjectIsolated('tt-start-resume-stop-');
  const statePath = path.join(dir, 'state.json');
  writeFileSync(statePath, JSON.stringify(state), 'utf8');
  return { dir, statePath };
}

function localContext(dir, statePath, rest = []) {
  return {
    rest,
    cfg: {},
    statePath,
    projectDir: dir,
    role: 'agent',
    drainQueueIfAny: async () => {},
    safePostTiming: async () => {},
    flushActiveToGH: async () => ({ deltaMin: 5, deltaWallMin: 5, deltaWords: 100 }),
    nowIso: () => new Date().toISOString(),
  };
}

test('start without an issue remains a read-only exit-1 refusal', async () => {
  const { dir, statePath } = sandboxState({ active: null, lastActive: null });
  const originalExitCode = process.exitCode;
  const originalLog = console.log;
  const lines = [];
  try {
    process.exitCode = 0;
    console.log = (...args) => lines.push(args.join(' '));
    await verbStart(localContext(dir, statePath));
    assert.ok(lines.some((line) => line.includes('no task number provided')));
    assert.equal(loadState(statePath).active, null);
    assert.equal(process.exitCode, 1);
  } finally {
    console.log = originalLog;
    process.exitCode = originalExitCode;
    rmSync(dir, { recursive: true, force: true });
  }
});

test('pause retains lastActive and stop clears the paused flag', async () => {
  const { dir, statePath } = sandboxState({
    active: '#453',
    lastActive: '#453',
    entryStartTs: new Date().toISOString(),
    wordsAtEntryStart: 0,
  });
  try {
    await verbPause(localContext(dir, statePath));
    let state = loadState(statePath);
    assert.equal(state.active, null);
    assert.equal(state.lastActive, '#453');
    assert.equal(state.paused, true);

    writeFileSync(
      statePath,
      JSON.stringify({
        active: '#453',
        lastActive: '#453',
        paused: true,
        entryStartTs: new Date().toISOString(),
        wordsAtEntryStart: 0,
      }),
      'utf8'
    );
    await verbStop(localContext(dir, statePath));
    state = loadState(statePath);
    assert.equal(state.active, null);
    assert.equal(state.lastActive, '#453');
    assert.ok(!state.paused);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('resume exports the governed implementation and preserves pause idle arithmetic', () => {
  assert.equal(typeof verbResume, 'function');
  assert.equal(computePauseIdleSec('2026-07-30T12:00:00.000Z', '2026-07-30T12:00:05.000Z'), 5);
});
