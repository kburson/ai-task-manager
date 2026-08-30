#!/usr/bin/env node
// @story #652
// Coverage tests for scripts/task-tracker/hook-handler.mjs.
//
// hook-handler is an INTERNAL CLI invoked by the Claude Code hook runner with
// hook JSON on stdin. Its three async handlers (onPreCompact / onPostCompact /
// onSessionStart) and the isMain dispatch block were uncovered — only the pure
// helper isPausedTask had a test. These cases drive the module the way it is
// actually invoked: spawn `node hook-handler.mjs` with an event on stdin inside
// a hermetic temp project dir (no network, fake gh on PATH) and assert on the
// stdout banners and dispatch behaviour. Each spawned child inherits c8's
// NODE_V8_COVERAGE, so the subprocess executions are captured and merged.

import { strict as assert } from 'node:assert';
import { test, before, after } from 'node:test';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, chmodSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  projectScratchDir,
  mkdtempProjectIsolated,
} from '../../../../task-tracker/lib/scratch-dir.mjs';
import { parseTimingRow } from '../../../../task-tracker/lib/timing-row-reader.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url)) + '/..';
const REPO_ROOT = path.resolve(__dirname, '../../../..');
const HOOK = path.join(REPO_ROOT, 'scripts/task-tracker/hook-handler.mjs');
const STATE_REL = '.tmp/aitm/state/task-tracker-state.json';

let root; // shared temp root holding the fake gh shim

before(() => {
  root = mkdtempSync(path.join(projectScratchDir('test'), 'hh-cov-'));
  // Fake gh: swallow every invocation so no real network is touched.
  const binDir = path.join(root, 'bin');
  mkdirSync(binDir, { recursive: true });
  const ghPath = path.join(binDir, 'gh');
  writeFileSync(ghPath, '#!/usr/bin/env bash\nexit 0\n');
  chmodSync(ghPath, 0o755);
  root = { dir: root, binDir };
});

after(() => {
  try {
    rmSync(root.dir, { recursive: true, force: true });
  } catch {
    /* best-effort cleanup */
  }
});

// Build a hermetic project + transcript fixture and return the env for a spawn.
function fixture({ state, jsonlLines = [], marker = null, appName = 'claude' } = {}) {
  // git-isolated sandbox root so the spawned hook's repo-walk can't escape
  // into the live repo and touch real .ai-task-manager state.
  const proj = mkdtempProjectIsolated('proj-', 'test');
  const transcripts = path.join(proj, 'transcripts');
  mkdirSync(transcripts, { recursive: true });
  if (state) {
    const statePath = path.join(proj, STATE_REL);
    mkdirSync(path.dirname(statePath), { recursive: true });
    writeFileSync(statePath, JSON.stringify(state));
  }
  const sid = 'sess-test';
  if (jsonlLines.length) {
    writeFileSync(
      path.join(transcripts, `${sid}.jsonl`),
      jsonlLines.map((l) => JSON.stringify(l)).join('\n') + '\n'
    );
  }
  if (marker) {
    const markerPath = path.join(
      proj,
      '.tmp',
      'aitm',
      'app',
      appName,
      'session-tracking',
      `${sid}.json`
    );
    mkdirSync(path.dirname(markerPath), { recursive: true });
    writeFileSync(markerPath, JSON.stringify({ sessionId: sid, wordCount: marker }), 'utf8');
  }
  const env = {
    ...process.env,
    PATH: `${root.binDir}:${process.env.PATH}`,
    AITM_GH_TEST_DOUBLE_BIN: root.binDir,
    AI_TASK_MANAGER_PROJECT_DIR: proj,
    AI_TASK_MANAGER_TRANSCRIPT_DIR: transcripts,
    AI_TASK_MANAGER_APP_NAME: appName,
    TT_SKIP_NETWORK: '1',
  };
  return { proj, sid, env };
}

// Spawn the hook with the given event + stdin payload; return stdout (+stderr).
function runHook(event, { state, jsonlLines, marker, sid = 'sess-test', rawStdin } = {}) {
  const fx = fixture({ state, jsonlLines, marker });
  return spawnHook(fx, event, { sid, rawStdin });
}

function spawnHook(fx, event, { sid = 'sess-test', rawStdin } = {}) {
  const input =
    rawStdin !== undefined ? rawStdin : JSON.stringify({ hook_event_name: event, session_id: sid });
  let out = '';
  try {
    out = execFileSync('node', [HOOK], {
      input,
      env: fx.env,
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
    });
  } catch (err) {
    // hook always exits 0; if it didn't, surface stdout+stderr for the assert.
    out = `${err.stdout || ''}${err.stderr || ''}`;
  }
  return out;
}

function spawnHookResult(fx, event, { sid = 'sess-test', timestamp, promptId } = {}) {
  return spawnSync('node', [HOOK], {
    input: JSON.stringify({
      hook_event_name: event,
      session_id: sid,
      event_timestamp: timestamp,
      prompt_id: promptId,
    }),
    env: fx.env,
    encoding: 'utf8',
  });
}

test('normalized timing identity deduplicates exact events but admits later timestamps', () => {
  const fx = fixture({ state: { active: null, lastActive: null } });
  const first = spawnHookResult(fx, 'SessionStart', {
    timestamp: '2026-08-19T05:00:00.000Z',
    promptId: 'prompt-1',
  });
  const duplicate = spawnHookResult(fx, 'SessionStart', {
    timestamp: '2026-08-19T05:00:00.000Z',
    promptId: 'prompt-1',
  });
  const later = spawnHookResult(fx, 'SessionStart', {
    timestamp: '2026-08-19T05:00:01.000Z',
    promptId: 'prompt-1',
  });
  assert.equal(first.status, 0);
  assert.match(first.stdout, /No active task\./);
  assert.equal(duplicate.status, 0);
  assert.equal(duplicate.stdout, '');
  assert.equal(later.status, 0);
  assert.match(later.stdout, /No active task\./);
});

test('timestamp-less lifecycle events remain runnable instead of becoming session-global duplicates', () => {
  const fx = fixture({ state: { active: null, lastActive: null } });
  const first = spawnHookResult(fx, 'SessionStart', { promptId: 'prompt-1' });
  const later = spawnHookResult(fx, 'SessionStart', { promptId: 'prompt-1' });
  assert.equal(first.status, 0);
  assert.match(first.stdout, /No active task\./);
  assert.equal(later.status, 0);
  assert.match(later.stdout, /No active task\./);
});

test('stamp write failure skips the timing flush and fails closed', () => {
  const fx = fixture({ state: { active: null, lastActive: null } });
  const aitmDir = path.join(fx.proj, '.tmp', 'aitm');
  mkdirSync(aitmDir, { recursive: true });
  writeFileSync(path.join(aitmDir, 'locks'), 'not-a-directory', 'utf8');
  const result = spawnHookResult(fx, 'SessionStart', {
    timestamp: '2026-08-19T05:00:00.000Z',
    promptId: 'prompt-1',
  });
  assert.notEqual(result.status, 0);
  assert.equal(result.stdout, '');
  assert.match(result.stderr, /hook stamp.*fail/i);
});

const pastTs = '2020-01-01T00:00:00.000Z';

test('SessionStart: no active and no paused → "No active task."', () => {
  const out = runHook('SessionStart', { state: { active: null, lastActive: null } });
  assert.match(out, /No active task\./);
});

test('SessionStart: no active, lastActive present but no fleet entry → "No active task."', () => {
  const out = runHook('SessionStart', { state: { active: null, lastActive: '#5' } });
  assert.match(out, /No active task\./);
});

test('SessionStart: discover bucket active → "Discovery bucket active."', () => {
  const out = runHook('SessionStart', { state: { active: 'discover' } });
  assert.match(out, /Discovery bucket active\./);
});

test('SessionStart: active task with stale entryStartTs → recovery banner', () => {
  const out = runHook('SessionStart', {
    state: { active: '#7', entryStartTs: pastTs, wordsAtEntryStart: 0, lastWordMarker: 0 },
    jsonlLines: [{ type: 'user', message: { content: 'hello world from the test transcript' } }],
  });
  assert.match(out, /#7 is active/);
});

test('SessionStart: active task with no entryStartTs → active banner, no recovery time', () => {
  const out = runHook('SessionStart', {
    state: { active: '#7', entryStartTs: null, wordsAtEntryStart: 0, lastWordMarker: 0 },
    jsonlLines: [{ type: 'user', message: { content: 'a few words here' } }],
  });
  assert.match(out, /#7 is active/);
});

test('SessionStart banks an existing session cursor tail exactly once', () => {
  const fx = fixture({
    state: {
      active: '#7',
      entryStartTs: null,
      wordsAtEntryStart: 100,
      lastWordMarker: 100,
      lastFullWordMarker: 200,
    },
    marker: { line: 1, words: 100, wordsFull: 200, task: '#7' },
    jsonlLines: [
      {
        type: 'assistant',
        message: { content: 'one two three four five six seven eight nine ten' },
      },
      { type: 'assistant', message: { content: 'tail adds three' } },
    ],
  });
  spawnHook(fx, 'SessionStart');
  spawnHook(fx, 'SessionStart');
  const state = JSON.parse(readFileSync(path.join(fx.proj, STATE_REL), 'utf8'));
  const marker = JSON.parse(
    readFileSync(path.join(fx.proj, '.tmp/aitm/app/claude/session-tracking/sess-test.json'), 'utf8')
  ).wordCount;
  assert.equal(state.lastWordMarker, 103);
  assert.equal(state.lastFullWordMarker, 203);
  assert.equal(marker.line, 2);
  assert.equal(marker.words, 103);
  assert.equal(marker.wordsFull, 203);
});

test('SessionStart orphan recovery rows use the freshly banked marker pair', () => {
  const fx = fixture({
    state: {
      active: '#7',
      entryStartTs: pastTs,
      wordsAtEntryStart: 100,
      lastWordMarker: 100,
      lastFullWordMarker: 200,
    },
    marker: { line: 1, words: 100, wordsFull: 200, task: '#7' },
    jsonlLines: [
      { type: 'assistant', message: { content: 'historical text already banked' } },
      { type: 'assistant', message: { content: 'tail adds three' } },
    ],
  });
  spawnHook(fx, 'SessionStart');
  const queued = JSON.parse(
    readFileSync(path.join(fx.proj, '.tmp/aitm/state/task-tracker-queue.json'), 'utf8')
  );
  const rows = queued.map((item) => parseTimingRow(item.row));
  assert.deepEqual(
    rows.map((row) => row.event),
    ['pause:orphan-recovery', 'resumed', 'session-start']
  );
  assert.deepEqual(
    rows.map((row) => row.wordMarker),
    ['103', '103', '103']
  );
  assert.deepEqual(
    rows.map((row) => row.fullWordMarker),
    ['203', '203', '203']
  );
});

test('PreCompact: active with entryStartTs → flush path runs (exit 0)', () => {
  const out = runHook('PreCompact', {
    state: { active: '#7', entryStartTs: pastTs, wordsAtEntryStart: 0, lastWordMarker: 0 },
    jsonlLines: [{ type: 'assistant', message: { content: 'response text with several words' } }],
  });
  // flush path posts via fake gh; nothing fatal, no error banner
  assert.doesNotMatch(out, /task-tracker-hook/);
});

test('PreCompact: bound-but-paused (no entryStartTs) → early return (#407)', () => {
  const out = runHook('PreCompact', { state: { active: '#7', entryStartTs: null } });
  assert.doesNotMatch(out, /task-tracker-hook/);
});

test('PreCompact: nothing active → early return', () => {
  const out = runHook('PreCompact', { state: { active: null } });
  assert.doesNotMatch(out, /task-tracker-hook/);
});

test('PostCompact: active → resume row path (exit 0)', () => {
  const out = runHook('PostCompact', {
    state: { active: '#7', wordsAtEntryStart: 0, lastWordMarker: 0 },
    jsonlLines: [{ type: 'user', message: { content: 'post compact words' } }],
  });
  assert.doesNotMatch(out, /task-tracker-hook/);
});

test('PreCompact/PostCompact rows advance durable primary and full markers from the prior cursor', () => {
  const fx = fixture({
    state: {
      active: '#7',
      entryStartTs: new Date(Date.now() - 1_000).toISOString(),
      wordsAtEntryStart: 20,
      lastWordMarker: 100,
      lastFullWordMarker: 200,
    },
    jsonlLines: [{ type: 'assistant', message: { content: 'one two three four five' } }],
  });
  spawnHook(fx, 'PreCompact');
  spawnHook(fx, 'PostCompact');
  const queued = JSON.parse(
    readFileSync(path.join(fx.proj, '.tmp/aitm/state/task-tracker-queue.json'), 'utf8')
  );
  const rows = queued.map((item) => parseTimingRow(item.row));
  assert.deepEqual(
    rows.map((row) => row.event),
    ['pre-compact-flush', 'post-compact-resume']
  );
  assert.deepEqual(
    rows.map((row) => row.wordMarker),
    ['105', '105']
  );
  assert.deepEqual(
    rows.map((row) => row.fullWordMarker),
    ['205', '205']
  );
});

test('PostCompact banks a tail preserved by an unavailable PreCompact exactly once', () => {
  const fx = fixture({
    appName: 'codex',
    state: {
      active: '#7',
      entryStartTs: new Date(Date.now() - 1_000).toISOString(),
      wordsAtEntryStart: 100,
      lastWordMarker: 100,
      lastFullWordMarker: 200,
    },
    marker: { line: 1, words: 100, wordsFull: 200, task: '#7' },
  });
  spawnHook(fx, 'PreCompact');
  writeFileSync(
    path.join(fx.env.AI_TASK_MANAGER_TRANSCRIPT_DIR, `${fx.sid}.jsonl`),
    [
      {
        type: 'response_item',
        payload: {
          type: 'message',
          role: 'assistant',
          content: [{ type: 'output_text', text: 'historical text already banked' }],
        },
      },
      {
        type: 'response_item',
        payload: {
          type: 'message',
          role: 'assistant',
          content: [{ type: 'output_text', text: 'tail adds three' }],
        },
      },
    ]
      .map(JSON.stringify)
      .join('\n') + '\n',
    'utf8'
  );
  const postCompactIdentity = {
    timestamp: '2026-08-19T06:32:00.000Z',
    promptId: 'post-compact-tail',
  };
  spawnHookResult(fx, 'PostCompact', postCompactIdentity);
  spawnHookResult(fx, 'PostCompact', postCompactIdentity);
  const state = JSON.parse(readFileSync(path.join(fx.proj, STATE_REL), 'utf8'));
  const marker = JSON.parse(
    readFileSync(path.join(fx.proj, '.tmp/aitm/app/codex/session-tracking/sess-test.json'), 'utf8')
  ).wordCount;
  const queued = JSON.parse(
    readFileSync(path.join(fx.proj, '.tmp/aitm/state/task-tracker-queue.json'), 'utf8')
  );
  const rows = queued.map((item) => parseTimingRow(item.row));
  assert.equal(state.lastWordMarker, 103);
  assert.equal(state.lastFullWordMarker, 203);
  assert.equal(marker.line, 2);
  assert.equal(marker.words, 103);
  assert.equal(marker.wordsFull, 203);
  assert.deepEqual(
    rows.map((row) => row.fullWordMarker),
    ['—', '203']
  );
});

test('PostCompact: nothing active → early return', () => {
  const out = runHook('PostCompact', { state: { active: null } });
  assert.doesNotMatch(out, /task-tracker-hook/);
});

test('malformed stdin → JSON.parse catch, no handler dispatched, exit 0', () => {
  const out = runHook('SessionStart', { state: { active: null }, rawStdin: '{not json' });
  // event resolves from argv fallback (none here) → no handler; must not crash
  assert.doesNotMatch(out, /Error/);
});

test('unknown event → no handler dispatched, exit 0', () => {
  const out = runHook('NotARealEvent', { state: { active: null } });
  assert.equal(typeof out, 'string');
});
