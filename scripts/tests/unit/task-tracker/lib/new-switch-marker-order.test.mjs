// @story #1142
import assert from 'node:assert/strict';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';

import { mkdtempProjectIsolated } from '../../../../task-tracker/lib/scratch-dir.mjs';
import { bankTranscriptTail, loadState, saveState } from '../../../../task-tracker/state.mjs';
import { loadMarker, markerPathFor, saveMarker } from '../../../../task-tracker/word-counter.mjs';
import { verbNew } from '../../../../task-tracker/verbs/new.mjs';
import { verbSwitch } from '../../../../task-tracker/verbs/switch.mjs';

const base = mkdtempProjectIsolated('new-switch-order-1142-', 'test');
const transcriptDir = path.join(base, 'transcripts');
const sid = `new-switch-order-${process.pid}`;
const savedEnv = {
  projectDir: process.env.AI_TASK_MANAGER_PROJECT_DIR,
  transcriptDir: process.env.AI_TASK_MANAGER_TRANSCRIPT_DIR,
  appName: process.env.AI_TASK_MANAGER_APP_NAME,
  sid: process.env.AI_TASK_MANAGER_SESSION_ID,
  fakeIssue: process.env.TT_FAKE_NEW_ISSUE,
};
mkdirSync(transcriptDir, { recursive: true });
writeFileSync(
  path.join(transcriptDir, `${sid}.jsonl`),
  `${JSON.stringify({ type: 'assistant', message: { content: 'one two three' } })}\n`,
  'utf8'
);
process.env.AI_TASK_MANAGER_PROJECT_DIR = base;
process.env.AI_TASK_MANAGER_TRANSCRIPT_DIR = transcriptDir;
process.env.AI_TASK_MANAGER_APP_NAME = 'claude';
process.env.AI_TASK_MANAGER_SESSION_ID = sid;

function makeState(caseDir) {
  const statePath = path.join(caseDir, '.tmp/aitm/state/task-tracker-state.json');
  saveState(
    {
      active: '#700',
      lastActive: '#700',
      entryStartTs: new Date().toISOString(),
      wordsAtEntryStart: 10,
      lastWordMarker: 100,
      lastFullWordMarker: 200,
    },
    statePath
  );
  saveMarker(markerPathFor(sid), 0, 100, '#700', 200);
  return statePath;
}

function baseCtx(caseDir, statePath, observed) {
  return {
    cfg: { autoEndOnSwitch: true },
    statePath,
    projectDir: caseDir,
    role: 'agent',
    drainQueueIfAny: async () => {},
    safePostTiming: async () => {},
    flushActiveToGH: async () => {
      const before = loadMarker(markerPathFor(sid));
      const banked = bankTranscriptTail(caseDir);
      const after = loadMarker(markerPathFor(sid));
      observed.push({ before, banked, after });
      return { deltaMin: 0, deltaWords: 3 };
    },
    nowIso: () => new Date().toISOString(),
  };
}

test('new and switch both flush the outgoing issue before reseeding the cursor for the target', async () => {
  const newDir = path.join(base, 'new-case');
  const newObserved = [];
  const newStatePath = makeState(newDir);
  process.env.TT_FAKE_NEW_ISSUE = '#1142';
  await verbNew({
    ...baseCtx(newDir, newStatePath, newObserved),
    rest: ['new issue'],
    SKIP_NETWORK: true,
    pexec: async () => ({ stdout: '' }),
  });
  assert.equal(newObserved[0].before.task, '#700', 'new flushes the outgoing binding');
  assert.equal(newObserved[0].banked.marker, 103, 'new banks the outgoing primary words');
  assert.equal(newObserved[0].banked.fullMarker, 203, 'new banks the outgoing full words');
  assert.equal(newObserved[0].after.words, 103);
  assert.equal(newObserved[0].after.wordsFull, 203);
  assert.equal(loadMarker(markerPathFor(sid)).task, '#1142');
  assert.equal(loadState(newStatePath).active, '#1142');
  assert.equal(loadState(newStatePath).lastWordMarker, 103);
  assert.equal(loadState(newStatePath).lastFullWordMarker, 203);

  const switchDir = path.join(base, 'switch-case');
  const switchObserved = [];
  const switchStatePath = makeState(switchDir);
  await verbSwitch(
    {
      ...baseCtx(switchDir, switchStatePath, switchObserved),
      runLogIssueTime: async () => {},
      fetchParentIssue: async () => null,
      resolveWorktreeBinding: () => ({}),
    },
    '#1143'
  );
  assert.equal(switchObserved[0].before.task, '#700', 'switch flushes the outgoing binding');
  assert.equal(switchObserved[0].banked.marker, 103, 'switch banks the outgoing primary words');
  assert.equal(switchObserved[0].banked.fullMarker, 203, 'switch banks the outgoing full words');
  assert.equal(switchObserved[0].after.words, 103);
  assert.equal(switchObserved[0].after.wordsFull, 203);
  assert.equal(loadMarker(markerPathFor(sid)).task, '#1143');
  assert.equal(loadState(switchStatePath).active, '#1143');
  assert.equal(loadState(switchStatePath).lastWordMarker, 103);
  assert.equal(loadState(switchStatePath).lastFullWordMarker, 203);
});

test.after(() => {
  for (const [key, value] of Object.entries({
    AI_TASK_MANAGER_PROJECT_DIR: savedEnv.projectDir,
    AI_TASK_MANAGER_TRANSCRIPT_DIR: savedEnv.transcriptDir,
    AI_TASK_MANAGER_APP_NAME: savedEnv.appName,
    AI_TASK_MANAGER_SESSION_ID: savedEnv.sid,
    TT_FAKE_NEW_ISSUE: savedEnv.fakeIssue,
  })) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  rmSync(base, { recursive: true, force: true });
});
