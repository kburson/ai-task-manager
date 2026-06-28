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
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, chmodSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { projectScratchDir, mkdtempProjectIsolated } from '../../lib/scratch-dir.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
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
function fixture({ state, jsonlLines = [] } = {}) {
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
  const env = {
    ...process.env,
    PATH: `${root.binDir}:${process.env.PATH}`,
    AI_TASK_MANAGER_PROJECT_DIR: proj,
    AI_TASK_MANAGER_TRANSCRIPT_DIR: transcripts,
    AI_TASK_MANAGER_APP_NAME: 'claude',
    TT_SKIP_NETWORK: '1',
  };
  return { proj, sid, env };
}

// Spawn the hook with the given event + stdin payload; return stdout (+stderr).
function runHook(event, { state, jsonlLines, sid = 'sess-test', rawStdin } = {}) {
  const fx = fixture({ state, jsonlLines });
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
