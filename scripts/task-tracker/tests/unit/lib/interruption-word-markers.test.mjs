// @story #1142
import assert from 'node:assert/strict';
import { appendFileSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';

import { buildRow, __internals as timingInternals } from '../../../gh-timing-comment.mjs';
import { computePhaseCloseDelta } from '../../../lib/timing-rows.mjs';
import { parseTimingRow } from '../../../lib/timing-row-reader.mjs';
import { mkdtempProjectIsolated } from '../../../lib/scratch-dir.mjs';
import { bankTranscriptTail, loadState, saveState } from '../../../state.mjs';
import { markerPathFor, saveMarker } from '../../../word-counter.mjs';
import { verbResume } from '../../../verbs/resume.mjs';

const { appendRow, buildInitialComment } = timingInternals;

function row(event, wordMarker, fullWordMarker, ts = new Date().toISOString()) {
  return buildRow({
    ts,
    event,
    activeSec: 0,
    idleSec: 0,
    deltaWords: 0,
    wordMarker,
    fullWordMarker,
    description: event,
  });
}

test('departure rows flush both absolute markers', () => {
  let body = buildInitialComment();
  body = appendRow(body, row('start', 100, 150));
  body = appendRow(body, row('pause:question', 125, 190));
  const departure = body
    .split('\n')
    .map(parseTimingRow)
    .find((candidate) => candidate?.event === 'pause:question');
  assert.equal(departure.wordMarker, '125');
  assert.equal(departure.fullWordMarker, '190');
});

test('a lifecycle opener after departure is preceded by canonical resumed', () => {
  let body = buildInitialComment();
  body = appendRow(body, row('start', 100, 150));
  body = appendRow(body, row('switch-out:#99', 125, 190));
  body = appendRow(body, row('develop:started', 200, 300));
  const events = body
    .split('\n')
    .map(parseTimingRow)
    .filter((candidate) => candidate?.ts?.startsWith('20'))
    .map((candidate) => candidate.event);
  assert.deepEqual(events, ['start', 'switch-out:#99', 'resumed', 'develop:started']);
});

test('departure-to-resume marker growth is excluded from own-issue phase words', () => {
  const body = [
    '| Timestamp | Event | Active | Idle | Δ Words | Word Marker | Description | Full Word Marker |',
    '|---|---|---|---|---|---|---|---|',
    '| 2026-08-07 10:00:00 -05:00 | develop:started |  |  | 0 | 59,800 | start | 70,000 |',
    '| 2026-08-07 10:01:00 -05:00 | switch-out:#99 |  |  | 50 | 59,850 | away | 70,100 |',
    '| 2026-08-07 10:02:00 -05:00 | resumed |  |  | 150 | 60,000 | back | 70,400 |',
  ].join('\n');
  const result = computePhaseCloseDelta(body, 'develop', '2026-08-07T15:03:00Z', 60_025);
  assert.equal(result.matched, true);
  assert.equal(result.deltaWords, 75);
});

test('real pause and switch-out flushes preserve both markers while away growth stays excluded', async () => {
  const projectDir = mkdtempProjectIsolated('interruption-runtime-1142-', 'test');
  const transcriptDir = path.join(projectDir, 'transcripts');
  const sid = `interruption-runtime-${process.pid}`;
  const transcriptPath = path.join(transcriptDir, `${sid}.jsonl`);
  const savedEnv = {
    projectDir: process.env.AI_TASK_MANAGER_PROJECT_DIR,
    transcriptDir: process.env.AI_TASK_MANAGER_TRANSCRIPT_DIR,
    appName: process.env.AI_TASK_MANAGER_APP_NAME,
    sid: process.env.CLAUDE_SESSION_ID,
    aitmSid: process.env.AI_TASK_MANAGER_SESSION_ID,
    skipFields: process.env.TT_SKIP_FIELD_SELF_CHECK,
    skipNetwork: process.env.TT_SKIP_NETWORK,
  };
  const message = (text) =>
    `${JSON.stringify({ type: 'assistant', message: { content: text } })}\n`;
  try {
    mkdirSync(transcriptDir, { recursive: true });
    mkdirSync(path.join(projectDir, '.ai-task-manager'), { recursive: true });
    writeFileSync(
      path.join(projectDir, '.ai-task-manager/task-tracker.json'),
      JSON.stringify({ repo: '', statePath: '.tmp/aitm/state/task-tracker-state.json' }),
      'utf8'
    );
    writeFileSync(transcriptPath, message('one two three'), 'utf8');
    process.env.AI_TASK_MANAGER_PROJECT_DIR = projectDir;
    process.env.AI_TASK_MANAGER_TRANSCRIPT_DIR = transcriptDir;
    process.env.AI_TASK_MANAGER_APP_NAME = 'claude';
    process.env.CLAUDE_SESSION_ID = sid;
    process.env.AI_TASK_MANAGER_SESSION_ID = sid;
    process.env.TT_SKIP_FIELD_SELF_CHECK = '1';
    process.env.TT_SKIP_NETWORK = '1';

    const { buildContext } = await import('../../../runtime.mjs');
    const ctx = buildContext(['status']);
    const rows = [];
    ctx.safePostTiming = async (_issue, timingRow) => {
      rows.push(timingRow);
      return { ok: true };
    };
    ctx.safeRecordSessionRef = async () => ({ ok: true });
    ctx.safeReadLastRow = async () => null;
    ctx.resolveWorktreeBinding = () => ({});

    saveState(
      {
        active: '#1142',
        lastActive: '#1142',
        entryStartTs: new Date(Date.now() - 1_000).toISOString(),
        wordsAtEntryStart: 0,
        lastWordMarker: 0,
        lastFullWordMarker: 0,
      },
      ctx.statePath
    );
    saveMarker(markerPathFor(sid), 0, 0, '#1142', 0);

    const state = loadState(ctx.statePath);
    const paused = await ctx.flushActiveToGH(state, 'pause:question', 'question', undefined, {
      suppressRowWords: true,
    });
    assert.equal(parseTimingRow(paused.row).wordMarker, '3');
    assert.equal(parseTimingRow(paused.row).fullWordMarker, '3');

    saveState(
      {
        ...state,
        active: null,
        lastActive: '#1142',
        paused: true,
        pausedAtTs: paused.ts,
        pauseReasonSlug: 'question',
      },
      ctx.statePath
    );
    appendFileSync(transcriptPath, message('four five six seven eight'));
    await verbResume({ ...ctx, rest: [] });
    const resumed = parseTimingRow(rows.at(-1));
    assert.equal(resumed.wordMarker, '8');
    assert.equal(resumed.fullWordMarker, '8');

    appendFileSync(transcriptPath, message('nine ten'));
    const pauseBank = bankTranscriptTail(projectDir);
    assert.equal(pauseBank.marker, 10);
    assert.equal(pauseBank.fullMarker, 10);

    let pauseBody = buildInitialComment();
    pauseBody = appendRow(pauseBody, row('develop:started', 0, 0));
    pauseBody = appendRow(pauseBody, paused.row);
    pauseBody = appendRow(pauseBody, rows.at(-1));
    const pauseClose = computePhaseCloseDelta(
      pauseBody,
      'develop',
      new Date().toISOString(),
      pauseBank.marker
    );
    assert.equal(pauseClose.deltaWords, 5, 'five away words are excluded from pause span');

    saveState(
      {
        active: '#1142',
        lastActive: '#1142',
        entryStartTs: new Date(Date.now() - 1_000).toISOString(),
        wordsAtEntryStart: 10,
        lastWordMarker: 10,
        lastFullWordMarker: 10,
      },
      ctx.statePath
    );
    saveMarker(markerPathFor(sid), 3, 10, '#1142', 10);
    appendFileSync(transcriptPath, message('eleven twelve'));
    const switchState = loadState(ctx.statePath);
    const switchOut = await ctx.flushActiveToGH(
      switchState,
      'switch-out:#99',
      'switching out',
      undefined,
      { suppressRowWords: true }
    );
    assert.equal(parseTimingRow(switchOut.row).wordMarker, '12');
    assert.equal(parseTimingRow(switchOut.row).fullWordMarker, '12');
    saveState(switchState, ctx.statePath);

    appendFileSync(transcriptPath, message('thirteen fourteen fifteen sixteen'));
    const switchAway = bankTranscriptTail(projectDir);
    assert.equal(switchAway.marker, 16);
    assert.equal(switchAway.fullMarker, 16);
    const switchResume = row('resumed', switchAway.marker, switchAway.fullMarker);
    appendFileSync(transcriptPath, message('seventeen eighteen nineteen'));
    const switchCloseBank = bankTranscriptTail(projectDir);
    assert.equal(switchCloseBank.marker, 19);
    assert.equal(switchCloseBank.fullMarker, 19);

    let switchBody = buildInitialComment();
    switchBody = appendRow(switchBody, row('develop:started', 10, 10));
    switchBody = appendRow(switchBody, switchOut.row);
    switchBody = appendRow(switchBody, switchResume);
    const switchClose = computePhaseCloseDelta(
      switchBody,
      'develop',
      new Date().toISOString(),
      switchCloseBank.marker
    );
    assert.equal(switchClose.deltaWords, 5, 'four peer-away words are excluded from switch span');
  } finally {
    for (const [key, value] of Object.entries({
      AI_TASK_MANAGER_PROJECT_DIR: savedEnv.projectDir,
      AI_TASK_MANAGER_TRANSCRIPT_DIR: savedEnv.transcriptDir,
      AI_TASK_MANAGER_APP_NAME: savedEnv.appName,
      CLAUDE_SESSION_ID: savedEnv.sid,
      AI_TASK_MANAGER_SESSION_ID: savedEnv.aitmSid,
      TT_SKIP_FIELD_SELF_CHECK: savedEnv.skipFields,
      TT_SKIP_NETWORK: savedEnv.skipNetwork,
    })) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    rmSync(projectDir, { recursive: true, force: true });
  }
});
