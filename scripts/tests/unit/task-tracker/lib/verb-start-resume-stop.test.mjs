// @story #472
import { strict as assert } from 'node:assert';
import { rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { mkdtempProjectIsolated } from '../../../../task-tracker/lib/scratch-dir.mjs';
import path from 'node:path';

import { parseTimingRow } from '../../../../task-tracker/lib/timing-row-reader.mjs';

const tmp = mkdtempProjectIsolated('tt-verb-start-resume-stop-');
process.env.AI_TASK_MANAGER_PROJECT_DIR = tmp;
process.env.AI_TASK_MANAGER_TRANSCRIPT_DIR = path.join(tmp, 'transcripts');
mkdirSync(process.env.AI_TASK_MANAGER_TRANSCRIPT_DIR, { recursive: true });

const { verbStart } = await import('../../../../task-tracker/verbs/start.mjs');
const { verbResume } = await import('../../../../task-tracker/verbs/resume.mjs');
const { verbPause } = await import('../../../../task-tracker/verbs/pause.mjs');
const { verbStop } = await import('../../../../task-tracker/verbs/stop.mjs');
const { loadState, saveState, EMPTY_STATE } = await import('../../../../task-tracker/state.mjs');

let stateSeq = 0;
function writeState(obj) {
  const p = path.join(tmp, `state-${stateSeq++}.json`);
  writeFileSync(p, JSON.stringify(obj), 'utf8');
  return p;
}

// Clear per-session active-task.json between tests so loadState overlays don't bleed.
const _resetPath = path.join(tmp, '.ai-task-manager', 'task-tracker-state.json');
mkdirSync(path.dirname(_resetPath), { recursive: true });
function resetSession() {
  saveState({ ...EMPTY_STATE }, _resetPath);
}

const mockFlush = async () => ({ deltaMin: 5, deltaWallMin: 5, deltaWords: 100 });

function makeCtx({ rest, statePath }) {
  const posts = [];
  return {
    ctx: {
      rest: rest ?? [],
      cfg: { repo: 'owner/repo' },
      statePath,
      projectDir: tmp,
      role: 'agent',
      drainQueueIfAny: async () => {},
      safePostTiming: async (issue, row) => posts.push({ issue, row }),
      // #482 — keep the fresh-bind history probe offline; no real `gh` call.
      readTimingCommentBody: async () => '',
      flushActiveToGH: mockFlush,
      nowIso: () => new Date().toISOString(),
      seedKanban: async () => {},
    },
    posts,
  };
}

function captureLog(fn) {
  const lines = [];
  const orig = console.log;
  console.log = (...a) => lines.push(a.join(' '));
  return fn()
    .finally(() => {
      console.log = orig;
    })
    .then(() => lines);
}

// ─── start: no arg → error, no state change ───────────────────────────────────
{
  resetSession();
  const priorExitCode = process.exitCode;
  process.exitCode = 0;
  const statePath = writeState({ active: null, lastActive: null });
  const { ctx } = makeCtx({ rest: [], statePath });
  const lines = await captureLog(() => verbStart(ctx));
  assert.ok(
    lines.some((l) => l.includes('no task number provided')),
    'start no-arg logs error'
  );
  assert.equal(loadState(statePath).active, null, 'state unchanged on start no-arg');
  assert.equal(process.exitCode, 1, 'start no-arg exits non-zero');
  process.exitCode = priorExitCode;
}

// ─── start #N → bind ─────────────────────────────────────────────────────────
{
  resetSession();
  const statePath = writeState({ active: null, lastActive: null });
  const { ctx, posts } = makeCtx({ rest: ['#453'], statePath });
  await verbStart(ctx);
  assert.equal(loadState(statePath).active, '#453', 'start #N binds to issue');
  assert.equal(posts.length, 1, 'first-bind row posted');
  // #482 — a fresh first-ever bind (no timing history, not mid-pause) records a
  // `start` row, not `resumed` (you cannot resume without a prior start/pause).
  assert.match(posts[0].row, /\| start \|/, 'fresh-bind row event is start');
}

// ─── start bare digits → normalized bind ─────────────────────────────────────
{
  resetSession();
  const statePath = writeState({ active: null, lastActive: null });
  const { ctx } = makeCtx({ rest: ['453'], statePath });
  await verbStart(ctx);
  assert.equal(loadState(statePath).active, '#453', 'start bare digits binds as #N');
}

// ─── pause → sets paused=true, message says /task resume ─────────────────────
{
  resetSession();
  const statePath = writeState({
    active: '#453',
    lastActive: '#453',
    entryStartTs: new Date().toISOString(),
    wordsAtEntryStart: 0,
  });
  const { ctx } = makeCtx({ rest: [], statePath });
  const lines = await captureLog(() => verbPause(ctx));
  const s = loadState(statePath);
  assert.equal(s.active, null, 'pause sets active to null');
  assert.equal(s.lastActive, '#453', 'pause keeps lastActive');
  assert.equal(s.paused, true, 'pause sets paused flag');
  assert.ok(
    lines.some((l) => l.includes('/task resume')),
    'pause message references /task resume'
  );
  assert.ok(
    !lines.some((l) => l.includes('/task start')),
    'pause message does not reference /task start'
  );
}

// ─── resume no-arg after pause → rebinds lastActive, clears paused ───────────
{
  resetSession();
  const statePath = writeState({
    active: null,
    lastActive: '#453',
    paused: true,
    pauseReasonSlug: 'break',
    pauseReasonText: 'lunch break',
  });
  const { ctx, posts } = makeCtx({ rest: [], statePath });
  await verbResume(ctx);
  const s = loadState(statePath);
  assert.equal(s.active, '#453', 'resume no-arg rebinds lastActive');
  assert.ok(!s.paused, 'resume no-arg clears paused flag');
  assert.equal(posts.length, 1, 'resumed row posted');
  const resumed = parseTimingRow(posts[0].row);
  assert.equal(resumed.event, 'resumed', 'normal pause resume uses the canonical boundary');
  assert.equal(resumed.description, 'lunch break', 'pause reason remains human-readable');
}

// ─── resume no-arg when not paused → error ───────────────────────────────────
{
  resetSession();
  const statePath = writeState({ active: null, lastActive: '#453' });
  const { ctx } = makeCtx({ rest: [], statePath });
  const lines = await captureLog(() => verbResume(ctx));
  assert.ok(
    lines.some((l) => l.includes('nothing to resume')),
    'resume no-arg when not paused errors'
  );
  assert.equal(loadState(statePath).active, null, 'state unchanged when not paused');
}

// ─── resume #N unrestricted (no paused flag required) ────────────────────────
{
  resetSession();
  const statePath = writeState({ active: null, lastActive: '#453' });
  const { ctx, posts } = makeCtx({ rest: ['#400'], statePath });
  await verbResume(ctx);
  assert.equal(loadState(statePath).active, '#400', 'resume #N binds regardless of paused flag');
  assert.equal(posts.length, 1, 'resumed row posted for resume #N');
}

// ─── stop → unbinds, keeps lastActive, clears paused ────────────────────────
{
  resetSession();
  const statePath = writeState({
    active: '#453',
    lastActive: '#453',
    entryStartTs: new Date().toISOString(),
    wordsAtEntryStart: 0,
  });
  const { ctx } = makeCtx({ rest: [], statePath });
  const lines = await captureLog(() => verbStop(ctx));
  const s = loadState(statePath);
  assert.equal(s.active, null, 'stop sets active to null');
  assert.equal(s.lastActive, '#453', 'stop keeps lastActive');
  assert.ok(!s.paused, 'stop clears paused flag');
  assert.ok(
    lines.some((l) => l.includes('Stopped')),
    'stop logs Stopped message'
  );
  assert.ok(
    lines.some((l) => l.includes('/task resume')),
    'stop message references /task resume'
  );
}

// ─── resume no-arg after stop → error (paused was cleared) ───────────────────
{
  resetSession();
  const statePath = writeState({ active: null, lastActive: '#453' });
  const { ctx } = makeCtx({ rest: [], statePath });
  const lines = await captureLog(() => verbResume(ctx));
  assert.ok(
    lines.some((l) => l.includes('nothing to resume')),
    'resume no-arg after stop errors'
  );
}

// ─── resume #N after stop → succeeds ─────────────────────────────────────────
{
  resetSession();
  const statePath = writeState({ active: null, lastActive: '#453' });
  const { ctx, posts } = makeCtx({ rest: ['#453'], statePath });
  await verbResume(ctx);
  assert.equal(loadState(statePath).active, '#453', 'resume #N after stop succeeds');
  assert.equal(posts.length, 1, 'resumed row posted after stop');
}

rmSync(tmp, { recursive: true });
console.log('verb-start-resume-stop.test.mjs: all passed');
