#!/usr/bin/env node
// @story #833
// cspell:ignore heartbeated
// Self-bind no-op — behavioral test that drives `verbSwitch` with a stubbed ctx.
//
// #833 makes a re-bind to the already-active, never-paused issue a TRUE no-op:
// verbSwitch emits ZERO timing rows (no outgoing flush, no incoming bind row)
// and leaves the live active span untouched. This test exercises the real
// verbSwitch with an in-memory ctx and an isolated temp state file so the three
// row-count contracts are asserted end-to-end, not by source grep:
//
//   (a) self-bind (s.active === target, not paused) → 0 flush + 0 bind rows,
//       and the live span (entryStartTs / wordsAtEntryStart / lastWordMarker)
//       is byte-for-byte unchanged.
//   (b) resume-after-pause (s.active === null, paused: true) → the guard is
//       skipped and exactly ONE incoming bind row is posted (not zero, not two):
//       the reengagement is neither swallowed nor doubled.
//   (c) cross-issue switch (previous !== target) → ONE outgoing flush carrying
//       the `switch-out:<target>` slug PLUS one incoming bind row.
//
// Word-counter side effects (jsonlPath / markerPathFor / transcriptDir) are
// redirected into the temp tree via env so nothing touches the real project.
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { rmSync } from 'node:fs';
import path from 'node:path';
import { mkdtempProjectIsolated } from '../../../../task-tracker/lib/scratch-dir.mjs';

// Project-isolated scratch tree (under <repo>/.scratch/test/, gitignored) so the
// word-counter side effects redirected below never touch the real project and
// the lint:tmp guard stays green — no system temp dir.
const base = mkdtempProjectIsolated('switch-noop-');
process.env.AI_TASK_MANAGER_PROJECT_DIR = base;
process.env.AI_TASK_MANAGER_TRANSCRIPT_DIR = path.join(base, 'transcript');

// Import AFTER the env is set so word-counter path resolution honours the temp tree.
const { verbSwitch } = await import('../../../../task-tracker/verbs/switch.mjs');
const { saveState, loadState } = await import('../../../../task-tracker/state.mjs');

// Build a ctx whose flush/post hooks record their calls instead of hitting GH.
function makeCtx(caseDir) {
  const statePath = path.join(caseDir, '.ai-task-manager', 'task-tracker-state.json');
  const flushCalls = [];
  const postCalls = [];
  const ctx = {
    cfg: { autoEndOnSwitch: true }, // no `repo` → the network-bound branches are skipped
    statePath,
    projectDir: caseDir,
    role: 'solo',
    drainQueueIfAny: async () => {},
    safePostTiming: async (issue, row) => {
      postCalls.push({ issue, row });
    },
    flushActiveToGH: async (_s, event, desc) => {
      flushCalls.push({ event, desc });
      return { deltaMin: 1, deltaWords: 2 };
    },
    runLogIssueTime: async () => {},
    fetchParentIssue: async () => null,
    nowIso: () => new Date(Date.now()).toISOString(),
  };
  return { ctx, statePath, flushCalls, postCalls };
}

test('self-bind to an active, never-paused issue is a true no-op (zero rows, span intact)', async () => {
  const caseDir = path.join(base, 'a-self-bind');
  const { ctx, statePath, flushCalls, postCalls } = makeCtx(caseDir);
  const seed = {
    active: '#833',
    lastActive: '#833',
    entryStartTs: '2026-07-14T10:00:00.000Z',
    wordsAtEntryStart: 123,
    lastWordMarker: 456,
  };
  saveState(seed, statePath);

  await verbSwitch(ctx, '#833');

  assert.equal(flushCalls.length, 0, 'self-bind must not flush the outgoing span');
  assert.equal(postCalls.length, 0, 'self-bind must not post an incoming bind row');

  const after = loadState(statePath);
  assert.equal(after.active, '#833', 'binding preserved');
  assert.equal(after.entryStartTs, seed.entryStartTs, 'entryStartTs untouched');
  assert.equal(after.wordsAtEntryStart, seed.wordsAtEntryStart, 'wordsAtEntryStart untouched');
  assert.equal(after.lastWordMarker, seed.lastWordMarker, 'lastWordMarker untouched');
});

test('resume-after-pause (active:null, paused:true) posts exactly one bind row', async () => {
  const caseDir = path.join(base, 'b-resume');
  const { ctx, statePath, flushCalls, postCalls } = makeCtx(caseDir);
  // pause.mjs clears active and sets paused — the self-bind guard never fires.
  saveState({ active: null, lastActive: '#833', paused: true, lastWordMarker: 500 }, statePath);

  await verbSwitch(ctx, '#833');

  assert.equal(flushCalls.length, 0, 'no outgoing span to flush when active is null');
  assert.equal(postCalls.length, 1, 'the reengagement posts exactly one closing bind row');
  assert.equal(postCalls[0].issue, '#833');
});

test('cross-issue switch flushes switch-out on the outgoing issue plus one incoming bind row', async () => {
  const caseDir = path.join(base, 'c-cross');
  const { ctx, statePath, flushCalls, postCalls } = makeCtx(caseDir);
  saveState(
    {
      active: '#700',
      lastActive: '#700',
      entryStartTs: '2026-07-14T09:00:00.000Z',
      wordsAtEntryStart: 10,
      lastWordMarker: 700,
    },
    statePath
  );

  await verbSwitch(ctx, '#833');

  assert.equal(flushCalls.length, 1, 'cross-issue switch flushes the outgoing span once');
  assert.equal(
    flushCalls[0].event,
    'switch-out:#833',
    'the outgoing flush names the incoming peer via switch-out:<target>'
  );
  assert.equal(postCalls.length, 1, 'exactly one incoming bind row on the new issue');
  assert.equal(postCalls[0].issue, '#833');
});

test('a post-save switch failure restores both prior state and occupancy', async () => {
  const caseDir = path.join(base, 'd-rollback');
  const { ctx, statePath } = makeCtx(caseDir);
  const seed = {
    active: '#700',
    lastActive: '#700',
    entryStartTs: '2026-07-14T09:00:00.000Z',
    wordsAtEntryStart: 10,
    lastWordMarker: 700,
  };
  saveState(seed, statePath);
  const claim = { status: 'moved', before: { 700: {} }, claimed: { 833: {} } };
  let rolledBack = null;
  ctx.claimBindingOccupancy = () => claim;
  ctx.rollbackBindingOccupancy = (received) => {
    rolledBack = received;
    return { status: 'rolled-back' };
  };
  ctx.safePostTiming = async () => {
    throw new Error('timing unavailable');
  };

  await assert.rejects(() => verbSwitch(ctx, '#833'), /timing unavailable/);
  assert.equal(loadState(statePath).active, '#700', 'prior binding restored');
  assert.equal(loadState(statePath).entryStartTs, seed.entryStartTs, 'prior span restored');
  assert.equal(rolledBack, claim, 'occupancy claim rolled back');
});

test('a superseded occupancy rollback preserves the target state to avoid split authority', async () => {
  const caseDir = path.join(base, 'e-superseded');
  const { ctx, statePath } = makeCtx(caseDir);
  saveState({ active: '#700', lastActive: '#700', lastWordMarker: 700 }, statePath);
  ctx.claimBindingOccupancy = () => ({ status: 'moved' });
  ctx.rollbackBindingOccupancy = () => ({ status: 'superseded' });
  ctx.safePostTiming = async () => {
    throw new Error('timing unavailable');
  };

  await assert.rejects(() => verbSwitch(ctx, '#833'), /timing unavailable/);
  assert.equal(
    loadState(statePath).active,
    '#833',
    'state remains aligned to the concurrently heartbeated target occupancy'
  );
});

test.after(() => {
  try {
    rmSync(base, { recursive: true, force: true });
  } catch {
    /* best-effort temp cleanup */
  }
});
