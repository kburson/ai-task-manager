#!/usr/bin/env node
// @story #1163

import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import {
  WorktreeResolutionError,
  resolveWorktreeBinding,
} from '../../../../task-tracker/lib/worktree-binding.mjs';
import {
  activeTaskPath,
  getActiveTask,
  setActiveTask,
} from '../../../../task-tracker/session-state.mjs';
import { verbResume } from '../../../../task-tracker/verbs/resume.mjs';
import {
  mkdtempOutsideRepo,
  mkdtempProjectIsolated,
} from '../../../../task-tracker/lib/scratch-dir.mjs';

test('resolves one atomic worktree identity from the invoking directory', () => {
  const calls = [];
  const result = resolveWorktreeBinding({
    projectDir: '/repo/worktrees/child/nested',
    now: () => '2026-08-08T07:00:00.000Z',
    execFileSync: (command, args, options) => {
      calls.push({ command, args, options });
      return args.includes('--show-toplevel') ? '/repo/worktrees/child\n' : 'feature/child/1163\n';
    },
  });

  assert.deepEqual(result, {
    worktreePath: '/repo/worktrees/child',
    worktreeBranch: 'feature/child/1163',
    worktreeResolvedAt: '2026-08-08T07:00:00.000Z',
  });
  assert.equal(calls.length, 2);
  assert.ok(calls.every((call) => call.command === 'git'));
  assert.ok(calls.every((call) => call.options.cwd === '/repo/worktrees/child/nested'));
});

test('active-task state overwrites all worktree identity fields together', () => {
  const root = mkdtempProjectIsolated('aitm-bound-state-');
  try {
    setActiveTask(
      'sid-1163',
      {
        issue: '#1163',
        worktreePath: '/repo/worktrees/first',
        worktreeBranch: 'feature/first',
        worktreeResolvedAt: '2026-08-08T07:00:00.000Z',
      },
      root
    );
    setActiveTask(
      'sid-1163',
      {
        issue: '#1163',
        worktreePath: '/repo/worktrees/second',
        worktreeBranch: 'feature/second',
        worktreeResolvedAt: '2026-08-08T08:00:00.000Z',
      },
      root
    );

    const record = getActiveTask('sid-1163', root);
    assert.equal(record.worktreePath, '/repo/worktrees/second');
    assert.equal(record.worktreeBranch, 'feature/second');
    assert.equal(record.worktreeResolvedAt, '2026-08-08T08:00:00.000Z');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('legacy active-task records without worktree identity remain readable', () => {
  const root = mkdtempProjectIsolated('aitm-bound-legacy-');
  try {
    const file = activeTaskPath('sid-legacy', root);
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, JSON.stringify({ issue: '#42', boundAt: '2026-01-01T00:00:00Z' }));
    assert.deepEqual(getActiveTask('sid-legacy', root), {
      issue: '#42',
      boundAt: '2026-01-01T00:00:00Z',
    });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('binding outside Git fails before a null identity can be persisted', () => {
  const root = mkdtempOutsideRepo('aitm-not-git-');
  try {
    assert.throws(
      () => resolveWorktreeBinding({ projectDir: root, execFileSync }),
      (error) => {
        assert.ok(error instanceof WorktreeResolutionError);
        assert.match(error.message, /unable to resolve a Git worktree/i);
        assert.match(error.message, new RegExp(root.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
        return true;
      }
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('explicit bind persists identity and a same-issue rebind replaces it', async () => {
  const root = mkdtempProjectIsolated('aitm-bind-verb-');
  const priorSid = process.env.AI_TASK_MANAGER_SESSION_ID;
  process.env.AI_TASK_MANAGER_SESSION_ID = 'sid-bind-verb-1163';
  const statePath = path.join(root, '.tmp', 'aitm', 'state', 'task-tracker-state.json');
  mkdirSync(path.dirname(statePath), { recursive: true });
  writeFileSync(statePath, JSON.stringify({ active: null, lastActive: null }));
  const identities = [
    {
      worktreePath: '/repo/worktrees/first',
      worktreeBranch: 'feature/first',
      worktreeResolvedAt: '2026-08-08T07:00:00.000Z',
    },
    {
      worktreePath: '/repo/worktrees/second',
      worktreeBranch: 'feature/second',
      worktreeResolvedAt: '2026-08-08T08:00:00.000Z',
    },
  ];
  let index = 0;
  const ctx = {
    rest: ['1163'],
    cfg: {},
    statePath,
    projectDir: root,
    role: 'agent',
    drainQueueIfAny: async () => {},
    safePostTiming: async () => {},
    nowIso: () => new Date().toISOString(),
    resolveWorktreeBinding: () => identities[index++],
  };

  try {
    await verbResume(ctx);
    assert.deepEqual(
      (({ worktreePath, worktreeBranch, worktreeResolvedAt }) => ({
        worktreePath,
        worktreeBranch,
        worktreeResolvedAt,
      }))(getActiveTask('sid-bind-verb-1163', root)),
      identities[0]
    );

    await verbResume(ctx);
    assert.deepEqual(
      (({ worktreePath, worktreeBranch, worktreeResolvedAt }) => ({
        worktreePath,
        worktreeBranch,
        worktreeResolvedAt,
      }))(getActiveTask('sid-bind-verb-1163', root)),
      identities[1]
    );
  } finally {
    if (priorSid == null) delete process.env.AI_TASK_MANAGER_SESSION_ID;
    else process.env.AI_TASK_MANAGER_SESSION_ID = priorSid;
    rmSync(root, { recursive: true, force: true });
  }
});

test('bind resolution failure happens before active-task state mutation', async () => {
  const root = mkdtempProjectIsolated('aitm-bind-fail-');
  const priorSid = process.env.AI_TASK_MANAGER_SESSION_ID;
  process.env.AI_TASK_MANAGER_SESSION_ID = 'sid-bind-fail-1163';
  const statePath = path.join(root, '.tmp', 'aitm', 'state', 'task-tracker-state.json');
  mkdirSync(path.dirname(statePath), { recursive: true });
  writeFileSync(statePath, JSON.stringify({ active: null, lastActive: null }));

  try {
    await assert.rejects(
      verbResume({
        rest: ['1163'],
        cfg: {},
        statePath,
        projectDir: root,
        drainQueueIfAny: async () => {},
        safePostTiming: async () => {},
        nowIso: () => '2026-08-08T07:00:00.000Z',
        resolveWorktreeBinding: () => {
          throw new WorktreeResolutionError(root, new Error('not a repository'));
        },
      }),
      WorktreeResolutionError
    );
    assert.equal(getActiveTask('sid-bind-fail-1163', root), null);
  } finally {
    if (priorSid == null) delete process.env.AI_TASK_MANAGER_SESSION_ID;
    else process.env.AI_TASK_MANAGER_SESSION_ID = priorSid;
    rmSync(root, { recursive: true, force: true });
  }
});
