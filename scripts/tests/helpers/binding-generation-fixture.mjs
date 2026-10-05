// @story #1889
// Native binding fixtures retain real Git, occupancy and session persistence.
import { mkdirSync, readFileSync, rmSync } from 'node:fs';
import path from 'node:path';
import { initializeFixtureActor } from './fixture-actor.mjs';
import { mkdtempProjectIsolated } from '../../task-tracker/lib/scratch-dir.mjs';
import { readOccupancy } from '../../task-tracker/lib/occupancy.mjs';
import { occupancyPath } from '../../task-tracker/paths.mjs';
import { getActiveTask } from '../../task-tracker/session-state.mjs';
import '../fixtures/offline-gh-auto.mjs';

export function createBindingFixture(testUrl) {
  const originalCwd = process.cwd();
  const savedEnvironment = Object.fromEntries(
    [
      'AI_TASK_MANAGER_PROJECT_DIR',
      'AI_TASK_MANAGER_TRANSCRIPT_DIR',
      'AI_TASK_MANAGER_SESSION_ID',
      'AI_TASK_MANAGER_APP_NAME',
    ].map((key) => [key, process.env[key]])
  );
  const actor = initializeFixtureActor(testUrl);
  const root = mkdtempProjectIsolated('binding-generation-');
  process.chdir(root);
  process.env.AI_TASK_MANAGER_PROJECT_DIR = root;
  process.env.AI_TASK_MANAGER_TRANSCRIPT_DIR = path.join(root, 'transcripts');
  mkdirSync(process.env.AI_TASK_MANAGER_TRANSCRIPT_DIR, { recursive: true });
  const statePath = path.join(root, '.tmp', 'aitm', 'state', 'state.json');
  const posts = [];
  const now = new Date().toISOString();
  const ctx = {
    cfg: { autoEndOnSwitch: true },
    statePath,
    projectDir: root,
    role: 'agent',
    rest: ['#107'],
    verb: 'start',
    nowIso: () => now,
    drainQueueIfAny: async () => {},
    safePostTiming: async (issue, row) => {
      posts.push({ issue, row });
    },
    readTimingCommentBody: async () => ({ status: 'ok', body: '' }),
    flushActiveToGH: async () => ({
      deltaMin: 0,
      deltaWallMin: 0,
      deltaWords: 0,
      ts: now,
      post: { status: 'posted' },
    }),
    runLogIssueTime: async () => {},
    reconcileDependencyDisposition: async () => ({ status: 'idempotent' }),
  };
  return {
    ...actor,
    root,
    statePath,
    ctx,
    posts,
    rows: () => readOccupancy(occupancyPath(root)),
    active: () => getActiveTask(actor.sid, root),
    shared: () => JSON.parse(readFileSync(statePath, 'utf8')),
    close() {
      process.chdir(originalCwd);
      for (const [key, value] of Object.entries(savedEnvironment)) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
      rmSync(root, { recursive: true, force: true });
    },
  };
}
