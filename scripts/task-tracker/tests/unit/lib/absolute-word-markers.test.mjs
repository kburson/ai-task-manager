// @story #1142
import assert from 'node:assert/strict';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';

import { buildRow, __internals as timingInternals } from '../../../gh-timing-comment.mjs';
import { parseTimingRow } from '../../../lib/timing-row-reader.mjs';
import { mkdtempProjectIsolated } from '../../../lib/scratch-dir.mjs';
import { bankTranscriptTail, loadState, saveState } from '../../../state.mjs';
import { markerPathFor, saveMarker } from '../../../word-counter.mjs';

const { appendRow, buildInitialComment } = timingInternals;
const now = () => new Date().toISOString();

test('new timing comments name the cumulative Full Word Marker column', () => {
  assert.match(buildInitialComment(), /\| Full Word Marker \|/);
  assert.doesNotMatch(buildInitialComment(), /Δ Words \(full\)/);
});

test('an appended row carries both absolute markers monotonically', () => {
  let body = buildInitialComment();
  body = appendRow(
    body,
    buildRow({
      ts: now(),
      event: 'start',
      activeSec: 0,
      idleSec: 0,
      deltaWords: 99,
      wordMarker: 1_000,
      fullWordMarker: 1_600,
      description: 'start',
    })
  );
  body = appendRow(
    body,
    buildRow({
      ts: now(),
      event: 'update',
      activeSec: 0,
      idleSec: 0,
      deltaWords: 99,
      wordMarker: 900,
      fullWordMarker: 1_500,
      description: 'update',
    })
  );
  const rows = body
    .split('\n')
    .map(parseTimingRow)
    .filter((row) => row?.ts?.startsWith('20'));
  assert.equal(rows[0].wordMarker, '1,000');
  assert.equal(rows[0].fullWordMarker, '1,600');
  assert.equal(rows[1].wordMarker, '1,000');
  assert.equal(rows[1].fullWordMarker, '1,600');
});

test('legacy full deltas migrate to unavailable instead of fabricated cumulative values', () => {
  const legacy = [
    '⏱ Timing Log',
    '',
    '| Timestamp | Event | Active | Idle | Δ Words | Word Marker | Description | Δ Words (full) |',
    '|---|---|---|---|---|---|---|---|',
    '| 2026-08-07 10:00:00 -05:00 | start |  |  | 0 | 1,000 | start | 50 | <!-- row-sec: a=0 i=0 -->',
  ].join('\n');
  const migrated = appendRow(
    legacy,
    buildRow({
      ts: now(),
      event: 'update',
      activeSec: 0,
      idleSec: 0,
      deltaWords: 0,
      wordMarker: 1_000,
      fullWordMarker: null,
      description: 'unavailable transcript',
    })
  );
  assert.match(migrated, /\| Full Word Marker \|/);
  assert.doesNotMatch(migrated, /Δ Words \(full\)/);
  const rows = migrated
    .split('\n')
    .map(parseTimingRow)
    .filter((row) => row?.ts?.startsWith('20'));
  assert.equal(rows[0].fullWordMarker, '—');
  assert.equal(rows[1].fullWordMarker, '—');
});

test('an explicit unavailable full marker is not replaced by a prior numeric observation', () => {
  let body = buildInitialComment();
  body = appendRow(
    body,
    buildRow({
      ts: now(),
      event: 'start',
      activeSec: 0,
      idleSec: 0,
      deltaWords: 0,
      wordMarker: 100,
      fullWordMarker: 200,
      description: 'available',
    })
  );
  body = appendRow(
    body,
    buildRow({
      ts: now(),
      event: 'update',
      activeSec: 0,
      idleSec: 0,
      deltaWords: 0,
      wordMarker: 110,
      fullWordMarker: null,
      description: 'transcript unavailable',
    })
  );
  const rows = body
    .split('\n')
    .map(parseTimingRow)
    .filter((row) => row?.ts?.startsWith('20'));
  assert.equal(rows[1].fullWordMarker, '—');
});

test('bankTranscriptTail carries both durable markers across session ids', () => {
  const projectDir = mkdtempProjectIsolated('absolute-bank-1142-', 'test');
  const transcriptDir = path.join(projectDir, 'transcripts');
  const statePath = path.join(projectDir, '.tmp/aitm/state/task-tracker-state.json');
  const priorEnv = {
    projectDir: process.env.AI_TASK_MANAGER_PROJECT_DIR,
    transcriptDir: process.env.AI_TASK_MANAGER_TRANSCRIPT_DIR,
    appName: process.env.AI_TASK_MANAGER_APP_NAME,
    sid: process.env.AI_TASK_MANAGER_SESSION_ID,
  };
  mkdirSync(transcriptDir, { recursive: true });
  process.env.AI_TASK_MANAGER_PROJECT_DIR = projectDir;
  process.env.AI_TASK_MANAGER_TRANSCRIPT_DIR = transcriptDir;
  process.env.AI_TASK_MANAGER_APP_NAME = 'claude';
  try {
    saveState(
      { active: '#1142', lastActive: '#1142', lastWordMarker: 100, lastFullWordMarker: 200 },
      statePath
    );
    for (const [sid, text] of [
      ['absolute-bank-one', 'one two three'],
      ['absolute-bank-two', 'four five'],
    ]) {
      process.env.AI_TASK_MANAGER_SESSION_ID = sid;
      writeFileSync(
        path.join(transcriptDir, `${sid}.jsonl`),
        `${JSON.stringify({ type: 'assistant', message: { content: text } })}\n`,
        'utf8'
      );
      const current = loadState(statePath);
      saveMarker(
        markerPathFor(sid),
        0,
        current.lastWordMarker,
        '#1142',
        current.lastFullWordMarker
      );
      bankTranscriptTail(projectDir);
    }
    const state = loadState(statePath);
    assert.equal(state.lastWordMarker, 105);
    assert.equal(state.lastFullWordMarker, 205);
  } finally {
    for (const [key, value] of Object.entries({
      AI_TASK_MANAGER_PROJECT_DIR: priorEnv.projectDir,
      AI_TASK_MANAGER_TRANSCRIPT_DIR: priorEnv.transcriptDir,
      AI_TASK_MANAGER_APP_NAME: priorEnv.appName,
      AI_TASK_MANAGER_SESSION_ID: priorEnv.sid,
    })) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    rmSync(projectDir, { recursive: true, force: true });
  }
});

test('bankTranscriptTail preserves a legacy per-session full cursor above global state', () => {
  const projectDir = mkdtempProjectIsolated('absolute-legacy-bank-1142-', 'test');
  const transcriptDir = path.join(projectDir, 'transcripts');
  const statePath = path.join(projectDir, '.tmp/aitm/state/task-tracker-state.json');
  const sid = 'absolute-legacy-bank';
  const priorEnv = {
    projectDir: process.env.AI_TASK_MANAGER_PROJECT_DIR,
    transcriptDir: process.env.AI_TASK_MANAGER_TRANSCRIPT_DIR,
    appName: process.env.AI_TASK_MANAGER_APP_NAME,
    sid: process.env.AI_TASK_MANAGER_SESSION_ID,
  };
  mkdirSync(transcriptDir, { recursive: true });
  writeFileSync(
    path.join(transcriptDir, `${sid}.jsonl`),
    `${JSON.stringify({ type: 'assistant', message: { content: 'one two three' } })}\n`,
    'utf8'
  );
  process.env.AI_TASK_MANAGER_PROJECT_DIR = projectDir;
  process.env.AI_TASK_MANAGER_TRANSCRIPT_DIR = transcriptDir;
  process.env.AI_TASK_MANAGER_APP_NAME = 'claude';
  process.env.AI_TASK_MANAGER_SESSION_ID = sid;
  try {
    saveState({ active: '#1142', lastActive: '#1142', lastWordMarker: 100 }, statePath);
    saveMarker(markerPathFor(sid), 0, 100, '#1142', 200);
    const banked = bankTranscriptTail(projectDir);
    const state = loadState(statePath);
    assert.equal(banked.fullMarker, 203);
    assert.equal(state.lastFullWordMarker, 203);
  } finally {
    for (const [key, value] of Object.entries({
      AI_TASK_MANAGER_PROJECT_DIR: priorEnv.projectDir,
      AI_TASK_MANAGER_TRANSCRIPT_DIR: priorEnv.transcriptDir,
      AI_TASK_MANAGER_APP_NAME: priorEnv.appName,
      AI_TASK_MANAGER_SESSION_ID: priorEnv.sid,
    })) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    rmSync(projectDir, { recursive: true, force: true });
  }
});

test('a fresh governed bind emits the available full-expansion marker', async () => {
  const projectDir = mkdtempProjectIsolated('absolute-bind-1142-', 'test');
  const transcriptDir = path.join(projectDir, 'transcripts');
  const sid = 'absolute-bind-1142';
  const statePath = path.join(projectDir, 'state.json');
  const priorEnv = {
    projectDir: process.env.AI_TASK_MANAGER_PROJECT_DIR,
    transcriptDir: process.env.AI_TASK_MANAGER_TRANSCRIPT_DIR,
    appName: process.env.AI_TASK_MANAGER_APP_NAME,
    sid: process.env.AI_TASK_MANAGER_SESSION_ID,
  };
  mkdirSync(transcriptDir, { recursive: true });
  writeFileSync(
    path.join(transcriptDir, `${sid}.jsonl`),
    `${JSON.stringify({ type: 'assistant', message: { content: [{ type: 'text', text: 'one two three' }] } })}\n`,
    'utf8'
  );
  writeFileSync(statePath, JSON.stringify({ active: null, lastActive: null }), 'utf8');
  process.env.AI_TASK_MANAGER_PROJECT_DIR = projectDir;
  process.env.AI_TASK_MANAGER_TRANSCRIPT_DIR = transcriptDir;
  process.env.AI_TASK_MANAGER_APP_NAME = 'claude';
  process.env.AI_TASK_MANAGER_SESSION_ID = sid;
  try {
    const { verbResume } = await import('../../../verbs/resume.mjs');
    const posts = [];
    await verbResume({
      rest: ['#1142'],
      cfg: {},
      statePath,
      projectDir,
      role: 'agent',
      drainQueueIfAny: async () => {},
      safePostTiming: async (issue, row) => posts.push({ issue, row }),
      nowIso: () => new Date().toISOString(),
    });
    assert.equal(posts.length, 1);
    const posted = parseTimingRow(posts[0].row);
    assert.equal(posted.wordMarker, '3');
    assert.equal(posted.fullWordMarker, '3');
  } finally {
    for (const [key, value] of Object.entries({
      AI_TASK_MANAGER_PROJECT_DIR: priorEnv.projectDir,
      AI_TASK_MANAGER_TRANSCRIPT_DIR: priorEnv.transcriptDir,
      AI_TASK_MANAGER_APP_NAME: priorEnv.appName,
      AI_TASK_MANAGER_SESSION_ID: priorEnv.sid,
    })) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    rmSync(projectDir, { recursive: true, force: true });
  }
});
