// @story #1097
import { strict as assert } from 'node:assert';
import { mkdirSync, readFileSync, rmSync } from 'node:fs';
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
const { verbStart } = await import('../../../verbs/start.mjs');
const { verbStop } = await import('../../../verbs/stop.mjs');
const { buildRow } = await import('../../../gh-timing-comment.mjs');
const { appendRow, buildInitialComment } = await import('../../../gh-timing-comment.internals.mjs');
const { parseTimingRow } = await import('../../../lib/timing-row-reader.mjs');

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

  const startPosts = [];
  const startCtx = {
    cfg: { repo: 'owner/repo' },
    statePath,
    projectDir: sandbox,
    rest: ['#1077'],
    role: 'orchestrator',
    drainQueueIfAny: async () => {},
    safePostTiming: async (...args) => startPosts.push(args),
    nowIso: () => new Date().toISOString(),
  };
  const beforeStop = await captureLog(() => verbStart(startCtx));

  const flushCalls = [];
  const stopLines = await captureLog(() =>
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
  const afterStop = await captureLog(() => verbStart(startCtx));

  const state = loadState(statePath);
  assert.ok(beforeStop.some((line) => line.includes('already active: #1077')));
  assert.equal(flushCalls.length, 0, 'terminal handoff must not flush the stale span');
  assert.equal(startPosts.length, 0, 'terminal start attempts must not post reengagement rows');
  assert.equal(state.active, '#1077', 'terminal handoff keeps the issue bound');
  assert.equal(
    state.entryStartTs,
    '2026-08-04T12:25:20.000Z',
    'terminal handoff does not rewrite the local entry clock'
  );
  assert.ok(stopLines.some((line) => line.includes('review handoff')));
  assert.ok(stopLines.some((line) => line.includes('/task close 1077')));
  assert.ok(afterStop.some((line) => line.includes('already active: #1077')));
});

test('locked append reduces the #1077 handoff to canonical terminal rows', () => {
  const entries = [
    { event: 'review:passed', marker: 101167, deltaWords: 0 },
    { event: 'stop', marker: 103145, deltaWords: 17631 },
    { event: 'resumed', marker: 103183, deltaWords: 0 },
    { event: 'stop', marker: 103145, deltaWords: 17631 },
    { event: 'review:approved', marker: 103183, deltaWords: 0 },
    { event: 'issue:wrap', marker: 103183, deltaWords: 0 },
  ];
  const baseTs = Date.now();
  let body = buildInitialComment();
  for (const [index, entry] of entries.entries()) {
    body = appendRow(
      body,
      buildRow({
        ts: new Date(baseTs + index).toISOString(),
        event: entry.event,
        activeSec: 0,
        idleSec: 0,
        deltaWords: entry.deltaWords,
        wordMarker: entry.marker,
        description: entry.event,
      })
    );
  }

  const rows = body
    .split('\n')
    .map(parseTimingRow)
    .filter((row) => row?.event && row.event !== 'event');

  assert.deepEqual(
    rows.map((row) => row.event),
    ['review:passed', 'review:approved', 'issue:wrap']
  );
  assert.deepEqual(
    rows.map((row) => Number(row.wordMarker.replaceAll(',', ''))),
    [101167, 103183, 103183]
  );
  assert.equal(
    rows.reduce((sum, row) => sum + Number(row.cells[5].replaceAll(',', '') || 0), 0),
    0,
    'suppressed stale stop rows cannot duplicate their word delta'
  );
});

test('locked append carries the durable Word Marker without changing other cells', () => {
  const ts = Date.now();
  const start = buildRow({
    ts: new Date(ts).toISOString(),
    event: 'start',
    activeSec: 0,
    idleSec: 0,
    deltaWords: 0,
    wordMarker: 200,
    description: 'task started',
  });
  const incoming = buildRow({
    ts: new Date(ts + 1).toISOString(),
    event: 'pause:question',
    activeSec: 11,
    idleSec: 2,
    deltaWords: 7,
    wordMarker: 150,
    description: 'operator question',
  });
  const body = appendRow(appendRow(buildInitialComment(), start), incoming);
  const actual = body
    .split('\n')
    .map(parseTimingRow)
    .filter((row) => row?.event === 'pause:question')[0];
  const expected = parseTimingRow(incoming);

  assert.equal(actual.wordMarker, '200');
  assert.deepEqual(
    actual.cells.filter((_, index) => index !== 6),
    expected.cells.filter((_, index) => index !== 6),
    'only the Word Marker cell may change'
  );
  assert.equal(actual.marker, expected.marker, 'row-sec evidence remains byte-identical');
});

test('explicit non-terminal stop retains its existing flush and unbind behavior', async () => {
  const statePath = path.join(sandbox, '.tmp', 'aitm', 'state', 'non-terminal-state.json');
  saveState(
    {
      ...EMPTY_STATE,
      active: '#1077',
      lastActive: '#1077',
      entryStartTs: new Date().toISOString(),
      lastWordMarker: 250,
    },
    statePath
  );
  const flushCalls = [];
  await captureLog(() =>
    verbStop({
      cfg: { repo: 'owner/repo' },
      statePath,
      projectDir: sandbox,
      rest: ['explicit operator stop'],
      drainQueueIfAny: async () => {},
      readTimingCommentBody: async () => ({
        status: 'found',
        body: terminalTimingBody.replace('review:passed', 'review:started'),
        error: null,
      }),
      flushActiveToGH: async (...args) => {
        flushCalls.push(args);
        return { deltaMin: 1, deltaWallMin: 1, deltaWords: 5 };
      },
    })
  );

  assert.equal(flushCalls.length, 1);
  assert.equal(loadState(statePath).active, null);
  assert.equal(loadState(statePath).lastActive, '#1077');
});

test('Stop hook remains a non-writer', () => {
  const source = readFileSync(new URL('../../../hooks/on-stop.mjs', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /postTimingEvent|appendRow|safePostTiming|flushActiveToGH/);
});

after(() => {
  rmSync(sandbox, { recursive: true, force: true });
});
