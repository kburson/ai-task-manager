#!/usr/bin/env node
// @story #1128

import { strict as assert } from 'node:assert';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';

import { mkdtempProjectIsolated } from '../../../lib/scratch-dir.mjs';

const projectDir = mkdtempProjectIsolated('tt-resume-fleet-refresh-');
const sessionId = 'resume-fleet-refresh-1128';
process.env.AI_TASK_MANAGER_PROJECT_DIR = projectDir;
process.env.AI_TASK_MANAGER_SESSION_ID = sessionId;
process.env.AI_TASK_MANAGER_TRANSCRIPT_DIR = path.join(projectDir, 'transcripts');
mkdirSync(process.env.AI_TASK_MANAGER_TRANSCRIPT_DIR, { recursive: true });

const { verbResume } = await import('../../../verbs/resume.mjs');
const { currentBranch, fleetRegistryPath, readFleet, registerTask } =
  await import('../../../fleet-registry.mjs');
const { setActiveTask } = await import('../../../session-state.mjs');

test('same-issue resume refreshes a stale fleet workspace without timing side effects', async () => {
  const issue = '#1128';
  const staleWorktree = path.join(projectDir, '.worktrees', 'removed-child');
  const statePath = path.join(projectDir, '.ai-task-manager', 'task-tracker-state.json');
  mkdirSync(path.dirname(statePath), { recursive: true });
  writeFileSync(
    statePath,
    JSON.stringify({
      active: issue,
      lastActive: issue,
      entryStartTs: '2026-08-06T12:00:00.000Z',
      wordsAtEntryStart: 17,
    }),
    'utf8'
  );
  setActiveTask(
    sessionId,
    {
      issue,
      entryStartTs: '2026-08-06T12:00:00.000Z',
      wordsAtStart: 17,
    },
    projectDir
  );
  registerTask(projectDir, issue, staleWorktree, 'feature/child/1128-old');
  const registryPath = fleetRegistryPath(projectDir);
  const startedAt = readFleet(registryPath)[issue].startedAt;

  let drains = 0;
  const posts = [];
  let switches = 0;
  await verbResume({
    rest: ['1128'],
    cfg: {},
    statePath,
    projectDir,
    role: 'agent',
    drainQueueIfAny: async () => {
      drains += 1;
    },
    safePostTiming: async (...args) => posts.push(args),
    nowIso: () => '2026-08-06T12:30:00.000Z',
    verbSwitch: async () => {
      switches += 1;
    },
  });

  const refreshed = readFleet(registryPath)[issue];
  assert.equal(refreshed.worktreePath, projectDir);
  assert.equal(refreshed.branch, currentBranch(projectDir));
  assert.equal(refreshed.status, 'active');
  assert.equal(refreshed.startedAt, startedAt, 'refresh preserves original fleet start time');
  assert.equal(drains, 0, 'same-issue refresh does not drain timing queues');
  assert.equal(posts.length, 0, 'same-issue refresh emits no timing rows');
  assert.equal(switches, 0, 'same-issue refresh never routes through verbSwitch');
});

test.after(() => rmSync(projectDir, { recursive: true, force: true }));
