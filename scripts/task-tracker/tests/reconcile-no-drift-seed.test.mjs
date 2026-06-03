// #273 — when board and body agree but the per-session derived cache is
// absent, reconcile must seed the cache and return `cache-seeded` instead
// of refusing with `no-drift-refused`. Refusing forces users to fabricate
// drift to recover, which was the exact wedge #273 reports.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { tmpdir } from 'node:os';

import { runReconcile } from '../verbs/reconcile.mjs';
import { setActiveTask, getActiveTask } from '../session-state.mjs';

function makeProjDir() {
  const root = mkdtempSync(path.join(tmpdir(), 'reconcile-no-seed-'));
  mkdirSync(path.join(root, '.ai-task-manager', 'sessions'), { recursive: true });
  return root;
}

test('no-drift + cache absent → seeds cache and returns cache-seeded', async () => {
  const projDir = makeProjDir();
  process.env.AI_TASK_MANAGER_PROJECT_DIR = projDir;
  // Force a deterministic sid so the cache write lands where the test reads.
  process.env.AI_TASK_MANAGER_SESSION_ID = 'test-sid-1';

  // Bind the issue without a kanbanState — the wedge condition.
  setActiveTask(
    'test-sid-1',
    {
      issue: '#273',
      entryStartTs: '2026-06-03T00:00:00.000Z',
      wordsAtStart: 0,
      boundAt: '2026-06-03T00:00:00.000Z',
    },
    projDir
  );

  const result = await runReconcile({
    issueNumber: 273,
    mode: 'accept-live',
    cfg: { repo: 'fake/fake', projectId: 'PVT_x' },
    deps: {
      fetchIssueBody: async () => ({
        body: '<!-- aitm-last-known-state: develop -->\n<!-- aitm-last-known-state-ts: 2026-06-03T00:00:00.000Z -->\nbody',
      }),
      getLiveState: async () => 'develop',
    },
  });

  assert.equal(result.status, 'cache-seeded', `expected cache-seeded, got ${result.status}`);
  const active = getActiveTask('test-sid-1', projDir);
  assert.equal(active.kanbanState, 'develop');

  delete process.env.AI_TASK_MANAGER_PROJECT_DIR;
  delete process.env.AI_TASK_MANAGER_SESSION_ID;
});

test('no-drift + cache present → returns no-drift-refused (existing behavior preserved)', async () => {
  const projDir = makeProjDir();
  process.env.AI_TASK_MANAGER_PROJECT_DIR = projDir;
  process.env.AI_TASK_MANAGER_SESSION_ID = 'test-sid-2';

  setActiveTask(
    'test-sid-2',
    {
      issue: '#273',
      entryStartTs: '2026-06-03T00:00:00.000Z',
      wordsAtStart: 0,
      boundAt: '2026-06-03T00:00:00.000Z',
      kanbanState: 'develop',
    },
    projDir
  );

  const result = await runReconcile({
    issueNumber: 273,
    mode: 'accept-live',
    cfg: { repo: 'fake/fake', projectId: 'PVT_x' },
    deps: {
      fetchIssueBody: async () => ({
        body: '<!-- aitm-last-known-state: develop -->\n<!-- aitm-last-known-state-ts: 2026-06-03T00:00:00.000Z -->\nbody',
      }),
      getLiveState: async () => 'develop',
    },
  });

  assert.equal(result.status, 'no-drift-refused');

  delete process.env.AI_TASK_MANAGER_PROJECT_DIR;
  delete process.env.AI_TASK_MANAGER_SESSION_ID;
});
