#!/usr/bin/env node
// @story #460 #833 #1140
// Self-bind no-op — issue #833 (supersedes the #460 self-bind-resume behavior).
//
// #460 originally made a re-bind to the already-active issue (/task #N while on
// #N) emit a `resumed` row instead of a self-referential `switch-out → #N` row.
// #833 goes further: a self-bind to an active, never-paused issue never actually
// stopped work, so it must be a TRUE no-op — verbSwitch emits ZERO timing rows
// and leaves the live active span intact. The doubled `resumed` (outgoing flush
// + incoming bind) is the defect this test now guards against.
//
// Asserts:
//   1. `buildRow` with event `resumed` grammar is intact — still used by the
//      legitimate resume-after-pause path (which is NOT a self-bind).
//   2. `buildRow` with event `switch-out` + a DIFFERENT target still references
//      the target ref (cross-issue switch is unaffected).
//   3. switch.mjs contains the #833 self-bind no-op guard (`s.active === target`
//      && not paused) with an early `return` before any timing emission.
//   4. switch.mjs no longer conditions emission on `isSelfBind` — the dead
//      self-bind branch was removed once the guard made it unreachable.
import { strict as assert } from 'node:assert';
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import test from 'node:test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildRow } from '../../../../task-tracker/gh-timing-comment.mjs';
import { mkdtempProjectIsolated } from '../../../../task-tracker/lib/scratch-dir.mjs';

const here = path.dirname(fileURLToPath(import.meta.url)) + '/..';
const repoRoot = path.resolve(here, '../../../..');
const switchSrc = readFileSync(
  path.join(repoRoot, 'scripts/task-tracker/verbs/switch.mjs'),
  'utf8'
);

const ts = new Date(Date.now() - 2000).toISOString();

// ---- 1. resume-after-pause row grammar is intact (`resumed`) ---------------
const resumeRow = buildRow({
  ts,
  event: 'resumed',
  activeMin: 5,
  idleMin: 0,
  deltaWords: 42,
  wordMarker: 500,
  description: 'resumed #430',
});
assert.match(resumeRow, /\| resumed \|/, 'resume-after-pause row must use resumed slug');
assert.ok(!resumeRow.includes('switch-out'), 'resume row must not contain switch-out');

// ---- 2. Cross-issue switch still emits `switch-out` with the target ref ----
const crossRow = buildRow({
  ts,
  event: 'switch-out:#999',
  activeMin: 10,
  idleMin: 0,
  deltaWords: 100,
  wordMarker: 1000,
  description: 'switch-out → task #999',
});
assert.match(
  crossRow,
  /\| switch-out:#999 \|/,
  'cross-issue switch must use the target-specific switch-out slug'
);
assert.match(crossRow, /switch-out → task #999/, 'cross-issue row must reference the target');

// ---- 3. switch.mjs carries the #833 self-bind no-op guard -------------------
// The guard short-circuits a re-bind to the already-active, never-paused issue
// with an early `return` before any flush/bind emission.
assert.match(
  switchSrc,
  /s\.active === target && !s\.paused/,
  'switch.mjs must guard self-bind with `s.active === target && !s.paused` (#833)'
);
// The guard body must return early (no-op) — locate a `return;` after the guard.
const guardIdx = switchSrc.indexOf('s.active === target && !s.paused');
assert.ok(guardIdx > 0, 'self-bind guard condition must be present');
const afterGuard = switchSrc.slice(guardIdx, guardIdx + 400);
assert.match(afterGuard, /\breturn;/, 'self-bind no-op guard must return early (#833)');

// ---- 4. The dead `isSelfBind` conditional was removed ----------------------
// Once the guard makes self-bind unreachable in the switch-out branch, the old
// `isSelfBind` event-slug conditional is gone. Grep must find no runtime use.
let selfBindHits = '';
try {
  selfBindHits = execFileSync(
    'grep',
    ['-n', 'isSelfBind', 'scripts/task-tracker/verbs/switch.mjs'],
    { cwd: repoRoot, encoding: 'utf8' }
  ).trim();
} catch (err) {
  if (err.status !== 1) throw err;
  selfBindHits = '';
}
assert.equal(
  selfBindHits,
  '',
  'switch.mjs must no longer branch on isSelfBind — the no-op guard replaces it (#833)'
);

// ---- 5. Same-issue resume repairs missing fleet evidence (#1140) -----------
test('same-issue resume restores fleet evidence without timing writes', async () => {
  const tmp = mkdtempProjectIsolated('tt-self-bind-fleet-repair-');
  const oldProjectDir = process.env.AI_TASK_MANAGER_PROJECT_DIR;
  const oldTranscriptDir = process.env.AI_TASK_MANAGER_TRANSCRIPT_DIR;
  const oldSessionId = process.env.AI_TASK_MANAGER_SESSION_ID;
  process.env.AI_TASK_MANAGER_PROJECT_DIR = tmp;
  process.env.AI_TASK_MANAGER_TRANSCRIPT_DIR = path.join(tmp, 'transcripts');
  process.env.AI_TASK_MANAGER_SESSION_ID = 'self-bind-fleet-repair-1140';
  mkdirSync(process.env.AI_TASK_MANAGER_TRANSCRIPT_DIR, { recursive: true });

  try {
    const { verbResume } = await import('../../../../task-tracker/verbs/resume.mjs');
    const { setActiveTask } = await import('../../../../task-tracker/session-state.mjs');
    setActiveTask(process.env.AI_TASK_MANAGER_SESSION_ID, { issue: '#1140' }, tmp);
    const statePath = path.join(tmp, 'state.json');
    writeFileSync(statePath, JSON.stringify({ active: '#1140', lastActive: '#1140' }), 'utf8');

    const registrations = [];
    let drained = 0;
    let timingPosts = 0;
    await verbResume({
      rest: ['1140'],
      cfg: {},
      statePath,
      projectDir: tmp,
      role: 'solo',
      drainQueueIfAny: async () => drained++,
      safePostTiming: async () => timingPosts++,
      nowIso: () => '2026-08-07T07:00:00Z',
      registerTask: (...args) => registrations.push(args),
      currentBranch: () => 'feature/1140-resume-fleet-repair',
    });

    assert.deepEqual(
      registrations,
      [[tmp, '#1140', tmp, 'feature/1140-resume-fleet-repair']],
      'same-issue resume must restore the invoking worktree fleet entry'
    );
    assert.equal(drained, 0, 'same-issue repair must return before queue/timing work');
    assert.equal(timingPosts, 0, 'same-issue repair must not post a re-engagement row');
  } finally {
    rmSync(tmp, { recursive: true, force: true });
    if (oldProjectDir === undefined) delete process.env.AI_TASK_MANAGER_PROJECT_DIR;
    else process.env.AI_TASK_MANAGER_PROJECT_DIR = oldProjectDir;
    if (oldTranscriptDir === undefined) delete process.env.AI_TASK_MANAGER_TRANSCRIPT_DIR;
    else process.env.AI_TASK_MANAGER_TRANSCRIPT_DIR = oldTranscriptDir;
    if (oldSessionId === undefined) delete process.env.AI_TASK_MANAGER_SESSION_ID;
    else process.env.AI_TASK_MANAGER_SESSION_ID = oldSessionId;
  }
});

console.log('self-bind-resume.test.mjs: ok');
