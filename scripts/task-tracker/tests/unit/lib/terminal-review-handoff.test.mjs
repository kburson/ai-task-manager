// @story #1097
import { strict as assert } from 'node:assert';
import { mkdirSync, rmSync } from 'node:fs';
import path from 'node:path';
import test, { after } from 'node:test';

import { mkdtempProjectIsolated } from '../../../lib/scratch-dir.mjs';

const sandbox = mkdtempProjectIsolated('terminal-review-handoff-');
const transcriptDir = path.join(sandbox, 'transcripts');
mkdirSync(transcriptDir, { recursive: true });

process.env.AI_TASK_MANAGER_PROJECT_DIR = sandbox;
process.env.AI_TASK_MANAGER_TRANSCRIPT_DIR = transcriptDir;
process.env.AI_TASK_MANAGER_APP_NAME = 'codex';
process.env.CODEX_THREAD_ID = 'terminal-review-handoff-test';

const { loadState, saveState, EMPTY_STATE } = await import('../../../state.mjs');
const { verbStop } = await import('../../../verbs/stop.mjs');

const terminalTimingBody = [
  '| Timestamp | Event | Active | Idle | Δ Words | Word Marker | Description | Δ Words (full) |',
  '|---|---|---|---|---|---|---|---|',
  '| 2026-08-04 07:21:43 -05:00 | review:passed |  |  |  | 101,167 | agent review passed | <!-- row-sec: a=0 i=0 -->',
].join('\n');

function captureLog(fn) {
  const lines = [];
  const original = console.log;
  console.log = (...args) => lines.push(args.join(' '));
  return fn()
    .then(() => lines)
    .finally(() => {
      console.log = original;
    });
}

test('stop keeps a stale worktree bound after durable review:passed', async () => {
  const statePath = path.join(sandbox, '.tmp', 'aitm', 'state', 'task-tracker-state.json');
  saveState(
    {
      ...EMPTY_STATE,
      active: '#1077',
      lastActive: '#1077',
      entryStartTs: '2026-08-04T12:25:20.000Z',
      wordsAtEntryStart: 85514,
      lastWordMarker: 101167,
    },
    statePath
  );

  const flushCalls = [];
  const lines = await captureLog(() =>
    verbStop({
      cfg: { repo: 'owner/repo' },
      statePath,
      projectDir: sandbox,
      rest: ['1077'],
      drainQueueIfAny: async () => {},
      readTimingCommentBody: async () => ({
        status: 'found',
        body: terminalTimingBody,
        error: null,
      }),
      flushActiveToGH: async (...args) => {
        flushCalls.push(args);
        return { deltaMin: 0, deltaWallMin: 748, deltaWords: 17631 };
      },
    })
  );

  const state = loadState(statePath);
  assert.equal(flushCalls.length, 0, 'terminal handoff must not flush the stale span');
  assert.equal(state.active, '#1077', 'terminal handoff keeps the issue bound');
  assert.equal(
    state.entryStartTs,
    '2026-08-04T12:25:20.000Z',
    'terminal handoff does not rewrite the local entry clock'
  );
  assert.ok(lines.some((line) => line.includes('review handoff')));
  assert.ok(lines.some((line) => line.includes('/task close 1077')));
});

after(() => {
  rmSync(sandbox, { recursive: true, force: true });
});
