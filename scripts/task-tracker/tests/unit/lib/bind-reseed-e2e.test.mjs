// @story #273
// #273 — end-to-end: the writer (session-state.setActiveTask) and the reader
// (lib/session-id.resolveSessionId) must land on the SAME file. Pre-#273 the
// writer used `'default-session'` while the reader returned a mtime-sorted
// .jsonl basename; the resulting "wedged" session is impossible to recover
// without a manual JSON patch.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, existsSync } from 'node:fs';
import path from 'node:path';
import { projectScratchDir } from '../../../lib/scratch-dir.mjs';

import { setActiveTask, setSessionKanbanState, getActiveTask } from '../../../session-state.mjs';
import { activeTaskPath } from '../../../paths.mjs';
import { resolveSessionId } from '../../../lib/session-id.mjs';

function makeProjDir() {
  const root = mkdtempSync(path.join(projectScratchDir('test'), 'bind-reseed-'));
  mkdirSync(path.join(root, '.ai-task-manager', 'sessions'), { recursive: true });
  return root;
}

test('writer + reader resolve identical sid (no env, no transcripts)', () => {
  const dir = makeProjDir();
  // Both pretend to be the writer and the reader — same inputs → same sid.
  const writerSid = resolveSessionId({ env: {}, transcriptDir: () => dir });
  const readerSid = resolveSessionId({ env: {}, transcriptDir: () => dir });
  assert.equal(writerSid, readerSid);
});

test('writer-resolved sid points at the same file the reader scans', () => {
  const projDir = makeProjDir();
  const sid = resolveSessionId({ env: {}, transcriptDir: () => projDir });

  setActiveTask(
    sid,
    {
      issue: '#273',
      entryStartTs: '2026-06-03T00:00:00.000Z',
      wordsAtStart: 0,
      boundAt: '2026-06-03T00:00:00.000Z',
    },
    projDir
  );

  const writtenAt = activeTaskPath(sid, projDir);
  assert.ok(existsSync(writtenAt), `expected active-task.json at ${writtenAt}`);

  // Now simulate the seeder writing kanbanState through the same sid.
  setSessionKanbanState(sid, 'develop', projDir);
  const active = getActiveTask(sid, projDir);
  assert.equal(active.issue, '#273');
  assert.equal(active.kanbanState, 'develop');
});

test('explicit orchestrator env var lands writer and reader on the same dir', () => {
  const projDir = makeProjDir();
  const env = { AI_TASK_MANAGER_SESSION_ID: 'explicit-sid-273' };
  const sid = resolveSessionId({ env, transcriptDir: () => projDir });
  assert.equal(sid, 'explicit-sid-273');

  setActiveTask(
    sid,
    {
      issue: '#273',
      entryStartTs: '2026-06-03T00:00:00.000Z',
      wordsAtStart: 0,
      boundAt: '2026-06-03T00:00:00.000Z',
      kanbanState: 'develop',
    },
    projDir
  );

  const readerSid = resolveSessionId({ env, transcriptDir: () => projDir });
  const active = getActiveTask(readerSid, projDir);
  assert.equal(active.kanbanState, 'develop');
});
