#!/usr/bin/env node
// @story #1164

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { BoundWorktreeMissingError, resolveProjectDir } from '../../../lib/project-dir.mjs';
import { developExitCommitTrailHeadGuard } from '../../../lib/develop-exit-commit-trail-head-guard.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../..');

test('explicit dependency projectDir remains the highest-priority test seam', () => {
  const result = resolveProjectDir({
    issue: 1164,
    deps: {
      projectDir: '/fixtures/injected',
      env: {
        TASK_TRACKER_PROJECT_DIR: '/env/task',
        AI_TASK_MANAGER_PROJECT_DIR: '/env/aitm',
      },
      bindingForIssue: () => ({
        issue: '#1164',
        worktreePath: '/recorded',
      }),
    },
  });
  assert.equal(result, '/fixtures/injected');
});

test('both environment overrides work and emit durable override diagnostics', () => {
  for (const variable of ['TASK_TRACKER_PROJECT_DIR', 'AI_TASK_MANAGER_PROJECT_DIR']) {
    const logs = [];
    const result = resolveProjectDir({
      issue: '#1164',
      deps: {
        env: { [variable]: `/overrides/${variable.toLowerCase()}` },
        logOverride: (message) => logs.push(message),
      },
    });
    assert.equal(result, `/overrides/${variable.toLowerCase()}`);
    assert.equal(logs.length, 1);
    assert.match(logs[0], new RegExp(variable));
    assert.match(logs[0], /#1164/);
    assert.match(logs[0], /override/i);
  }
});

test('recorded active-task worktree is the default execution authority', () => {
  const result = resolveProjectDir({
    issue: 1164,
    deps: {
      env: {},
      invokingDir: '/repo/worktrees/foreign',
      bindingForIssue: ({ issueRef, invokingDir }) => {
        assert.equal(issueRef, '#1164');
        assert.equal(invokingDir, '/repo/worktrees/foreign');
        return {
          issue: '#1164',
          worktreePath: '/repo/worktrees/bound',
          worktreeBranch: 'feature/child/1164',
          worktreeResolvedAt: '2026-08-08T08:00:00.000Z',
        };
      },
      pathExists: (candidate) => candidate === '/repo/worktrees/bound',
    },
  });
  assert.equal(result, '/repo/worktrees/bound');
});

test('missing, mismatched, and deleted binding evidence fail closed and name the issue', () => {
  const cases = [
    { name: 'missing', binding: null, pathExists: () => false },
    {
      name: 'mismatched',
      binding: { issue: '#9999', worktreePath: '/repo/worktrees/bound' },
      pathExists: () => true,
    },
    {
      name: 'deleted',
      binding: { issue: '#1164', worktreePath: '/repo/worktrees/deleted' },
      pathExists: () => false,
    },
  ];
  for (const fixture of cases) {
    assert.throws(
      () =>
        resolveProjectDir({
          issue: 1164,
          deps: {
            env: {},
            invokingDir: '/repo/worktrees/foreign',
            bindingForIssue: () => fixture.binding,
            pathExists: fixture.pathExists,
          },
        }),
      (error) => {
        assert.ok(error instanceof BoundWorktreeMissingError, fixture.name);
        assert.match(error.message, /#1164/, fixture.name);
        assert.doesNotMatch(error.message, /falling back/i, fixture.name);
        return true;
      }
    );
  }
});

test('Develop guard invoked from a foreign directory executes against the bound worktree', async () => {
  let executedIn = null;
  const result = await developExitCommitTrailHeadGuard.run({
    fromState: 'develop',
    toState: 'test',
    cfg: { repo: 'owner/repo' },
    issueNumber: 1164,
    body: '<!-- aitm-issue-kind kind="code" -->',
    deps: {
      resolveProjectDir: ({ issue }) => {
        assert.equal(issue, 1164);
        return '/repo/worktrees/bound';
      },
      commitTrailHeadGate: async ({ projectDir }) => {
        executedIn = projectDir;
        return { ok: true };
      },
    },
  });
  assert.deepEqual(result, { ok: true });
  assert.equal(executedIn, '/repo/worktrees/bound');
});

test('all governed projectDir call sites delegate and retain no bare cwd fallback', () => {
  const files = [
    'scripts/task-tracker/verbs/promote.mjs',
    'scripts/task-tracker/verbs/reconcile.mjs',
    'scripts/task-tracker/verbs/split-plan.mjs',
    'scripts/task-tracker/lib/bind-context.mjs',
    'scripts/task-tracker/lib/develop-exit-commit-trail-head-guard.mjs',
    'scripts/task-tracker/lib/guard-entrypoint.mjs',
    'scripts/task-tracker/lib/scratch-dir.mjs',
  ];
  for (const file of files) {
    const source = readFileSync(path.join(ROOT, file), 'utf8');
    assert.match(source, /resolveProjectDir/, `${file} delegates to the resolver`);
    assert.doesNotMatch(
      source,
      /projectDir[^\n=]*=\s*[^\n;]*process\.cwd\(\)/,
      `${file} has no projectDir cwd fallback`
    );
  }
});
