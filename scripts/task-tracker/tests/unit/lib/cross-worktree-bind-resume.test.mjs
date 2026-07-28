#!/usr/bin/env node
// @story #1018

import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { mkdtempProjectIsolated } from '../../../lib/scratch-dir.mjs';
import {
  classifyEvent,
  lastOpenInterruption,
  shouldSuppressActiveBindEvent,
} from '../../../lib/bind-event.mjs';

const row = (ts, event) => `| ${ts} | ${event} | 0 | 0 | 0 | 0 | test | <!-- row-sec: a=0 i=0 -->`;
const body = (...rows) => ['| Timestamp | Event |', '|---|---|', ...rows].join('\n');

test('confirmed short active phase tail suppresses a duplicate bind event', () => {
  const timingBody = body(row('2026-07-28 01:00:00 -05:00', 'plan:started'));
  assert.equal(
    shouldSuppressActiveBindEvent({
      timingBody,
      readStatus: 'found',
      paused: false,
      nowTs: '2026-07-28 01:05:00 -05:00',
    }),
    true
  );
});

test('fresh, unreadable, paused, and long-gap tails retain their existing bind behavior', () => {
  const activeBody = body(row('2026-07-28 01:00:00 -05:00', 'plan:started'));
  assert.equal(
    shouldSuppressActiveBindEvent({
      timingBody: '',
      readStatus: 'absent',
      nowTs: '2026-07-28 01:05:00 -05:00',
    }),
    false,
    'empty live history still needs start'
  );
  assert.equal(
    shouldSuppressActiveBindEvent({
      timingBody: '',
      readStatus: 'error',
      nowTs: '2026-07-28 01:05:00 -05:00',
    }),
    false,
    'read errors preserve the fail-closed path'
  );
  assert.equal(
    shouldSuppressActiveBindEvent({
      timingBody: activeBody,
      readStatus: 'found',
      paused: true,
      nowTs: '2026-07-28 01:05:00 -05:00',
    }),
    false,
    'local pause evidence still needs a closer'
  );
  assert.equal(
    shouldSuppressActiveBindEvent({
      timingBody: activeBody,
      readStatus: 'found',
      nowTs: '2026-07-28 10:00:01 -05:00',
    }),
    false,
    'the existing long-gap synthetic-departure repair takes precedence'
  );
});

test('pause, switch-out, and stop are recorded departures that still need resumed', () => {
  for (const event of ['pause:question', 'switch-out:#1007', 'stop']) {
    const timingBody = body(
      row('2026-07-28 01:00:00 -05:00', 'plan:started'),
      row('2026-07-28 01:05:00 -05:00', event)
    );
    assert.equal(
      shouldSuppressActiveBindEvent({
        timingBody,
        readStatus: 'found',
        nowTs: '2026-07-28 01:10:00 -05:00',
      }),
      false,
      event
    );
    assert.equal(lastOpenInterruption(timingBody)?.kind, event.split(':')[0], event);
  }
  assert.deepEqual(classifyEvent('stop'), { role: 'open', kind: 'stop' });
});

const tmp = mkdtempProjectIsolated('tt-cross-worktree-bind-');
process.env.AI_TASK_MANAGER_PROJECT_DIR = tmp;
process.env.AI_TASK_MANAGER_TRANSCRIPT_DIR = path.join(tmp, 'transcripts');
mkdirSync(process.env.AI_TASK_MANAGER_TRANSCRIPT_DIR, { recursive: true });

const { verbResume } = await import('../../../verbs/resume.mjs');
const { loadState } = await import('../../../state.mjs');

test('fresh worktree binds locally but posts no row over an already-active live span', async () => {
  process.env.AI_TASK_MANAGER_SESSION_ID = 'cross-worktree-active-tail-1018';
  const statePath = path.join(tmp, 'state.json');
  writeFileSync(statePath, JSON.stringify({ active: null, lastActive: null }), 'utf8');
  const posts = [];
  const now = new Date();
  const fiveMinutesAgo = new Date(now.getTime() - 5 * 60_000)
    .toISOString()
    .replace('T', ' ')
    .replace('Z', ' +00:00');
  const timingBody = body(row(fiveMinutesAgo, 'plan:started'));

  await verbResume({
    rest: ['#1018'],
    cfg: { repo: 'owner/repo' },
    statePath,
    projectDir: tmp,
    role: 'agent',
    drainQueueIfAny: async () => {},
    safePostTiming: async (issue, timingRow) => posts.push({ issue, timingRow }),
    nowIso: () => now.toISOString(),
    readTimingCommentBody: async () => ({ status: 'found', body: timingBody }),
    seedKanban: async () => ({ kanbanState: 'develop' }),
  });

  assert.equal(loadState(statePath).active, '#1018', 'the new local session is bound');
  assert.equal(posts.length, 0, 'no duplicate active→active reengagement row is posted');
});

test.after(() => rmSync(tmp, { recursive: true, force: true }));
