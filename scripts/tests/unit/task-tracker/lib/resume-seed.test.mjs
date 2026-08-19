#!/usr/bin/env node
// @story #251
import { strict as assert } from 'node:assert';
import { rmSync, mkdirSync, writeFileSync } from 'node:fs';
import { mkdtempProjectIsolated } from '../../../../task-tracker/lib/scratch-dir.mjs';
import path from 'node:path';
import {
  getActiveTask,
  setActiveTask,
  setSessionKanbanState,
} from '../../../../task-tracker/session-state.mjs';
import { loadState } from '../../../../task-tracker/state.mjs';

// #251 — verbResume's fresh-bind path must seed the per-session `kanbanState`
// derived cache (mirroring verbStart) so the activity-guard hook can read state
// synchronously. Before this fix, a freshly bound session had no kanbanState and
// the guard refused every WRITE activity class — dead-locking post-compact
// orchestrators and every parallel sub-agent in a fresh worktree.

// #442 — verbResume registers a fleet entry; the sandbox must be git-isolated
// (mkdtempProjectIsolated git-inits it) so registerTask cannot escape into the
// live .ai-task-manager/task-fleet.json.
const tmp = mkdtempProjectIsolated('tt-resume-seed-');

// Isolate every AITM path writer (markerDir, transcriptDir, fleet registry,
// session records) under the tmp project so the test never touches real state.
process.env.AI_TASK_MANAGER_PROJECT_DIR = tmp;
process.env.AI_TASK_MANAGER_TRANSCRIPT_DIR = path.join(tmp, 'transcripts');
mkdirSync(process.env.AI_TASK_MANAGER_TRANSCRIPT_DIR, { recursive: true });

// Import AFTER env is set so path resolution honors the tmp project.
const { verbResume } = await import('../../../../task-tracker/verbs/resume.mjs');

let stateSeq = 0;
function writeState(obj) {
  // Distinct file per test so global-ledger fields don't leak across cases.
  const p = path.join(tmp, `state-${stateSeq++}.json`);
  writeFileSync(p, JSON.stringify(obj), 'utf8');
  return p;
}

function makeCtx({ rest, cfg, statePath, seedKanban }) {
  const posts = [];
  return {
    ctx: {
      rest,
      cfg,
      statePath,
      projectDir: tmp,
      role: 'agent',
      drainQueueIfAny: async () => {},
      safePostTiming: async (issue, row) => posts.push({ issue, row }),
      // Must be within buildRow's retroactive-ts window of real now.
      nowIso: () => new Date().toISOString(),
      seedKanban,
      claimBindingOccupancy: () => ({ status: 'claimed' }),
    },
    posts,
  };
}

// Test 1: fresh bind from null-active seeds the session kanban cache via the seam.
{
  const SID = 'resume-seed-fresh';
  process.env.AI_TASK_MANAGER_SESSION_ID = SID;
  const statePath = writeState({ active: null, lastActive: null });

  const seedCalls = [];
  const { ctx, posts } = makeCtx({
    rest: ['#777'],
    cfg: { repo: 'owner/repo' },
    statePath,
    // verbResume's saveState creates the active-task record before the seed
    // runs; the stub mirrors the real seed by writing kanbanState onto it.
    seedKanban: async (args) => {
      seedCalls.push(args);
      return setSessionKanbanState(args.sid, 'develop', args.projDir);
    },
  });

  await verbResume(ctx);

  assert.equal(seedCalls.length, 1, 'seed seam invoked exactly once on fresh bind');
  assert.deepEqual(
    seedCalls[0],
    { sid: SID, issue: '#777', projDir: tmp, repo: 'owner/repo' },
    'seam called with resolved sid, bound issue, projDir, and cfg.repo'
  );
  assert.equal(
    getActiveTask(SID, tmp).kanbanState,
    'develop',
    'session record gains kanbanState after seed'
  );
  assert.equal(loadState(statePath).active, '#777', 'issue is bound after resume');
  assert.equal(posts.length, 1, 'one resumed timing row posted');
}

// Test 2: best-effort guard — no cfg.repo means the seam is never called, and the
// bind still succeeds (matches the `if (sid && cfg?.repo)` contract).
{
  const SID = 'resume-seed-norepo';
  process.env.AI_TASK_MANAGER_SESSION_ID = SID;
  const statePath = writeState({ active: null, lastActive: null });

  const seedCalls = [];
  const { ctx } = makeCtx({
    rest: ['#888'],
    cfg: {}, // no repo
    statePath,
    seedKanban: async (args) => {
      seedCalls.push(args);
    },
  });

  await verbResume(ctx);

  assert.equal(seedCalls.length, 0, 'seam skipped when cfg.repo is absent');
  assert.equal(loadState(statePath).active, '#888', 'bind still succeeds without seed');
}

// Test 3: already-active branch returns early and never seeds (unchanged behavior).
// #666 — the already-active check now keys on THIS session's own per-session
// record, not the global pointer, so the session must hold its own #999 binding
// for the early-return to fire (a global-only pointer is treated as a ghost and
// would fresh-bind instead).
{
  const SID = 'resume-seed-already';
  process.env.AI_TASK_MANAGER_SESSION_ID = SID;
  setActiveTask(SID, { issue: '#999' }, tmp);
  const statePath = writeState({ active: '#999', lastActive: '#999' });

  const seedCalls = [];
  const { ctx } = makeCtx({
    rest: ['#999'],
    cfg: { repo: 'owner/repo' },
    statePath,
    seedKanban: async (args) => {
      seedCalls.push(args);
    },
  });

  await verbResume(ctx);

  assert.equal(seedCalls.length, 0, 'already-active branch does not seed');
  assert.equal(loadState(statePath).active, '#999', 'active issue unchanged');
}

rmSync(tmp, { recursive: true });
console.log('resume-seed.test.mjs: all passed');
