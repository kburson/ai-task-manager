#!/usr/bin/env node
// @story #1165

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  ForeignWorktreeBindingError,
  enforceVerbWorktreeBinding,
  parseForeignWorktreeOverride,
} from '../../../../task-tracker/lib/worktree-binding-guard.mjs';
import { BoundWorktreeMissingError } from '../../../../task-tracker/lib/project-dir.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../..');

function fixture(overrides = {}) {
  const audit = [];
  const stateReads = [];
  return {
    verb: 'promote',
    rest: ['#1165'],
    cfg: { repo: 'owner/repo' },
    invokingDir: '/repo/worktrees/foreign/nested',
    deps: {
      resolveBinding: ({ projectDir }) => {
        if (projectDir === '/repo/worktrees/bound') {
          return {
            worktreePath: '/repo/worktrees/bound',
            worktreeBranch: 'feature/child/1165',
          };
        }
        return { worktreePath: '/repo/worktrees/foreign', worktreeBranch: 'trunk' };
      },
      resolveBoundDir: ({ issue }) => {
        stateReads.push(issue);
        return '/repo/worktrees/bound';
      },
      postAudit: async (record) => audit.push(record),
      ...overrides,
    },
    audit,
    stateReads,
  };
}

test('foreign invocation refuses with both identities and a literal corrective cd command', async () => {
  const input = fixture();
  await assert.rejects(
    () => enforceVerbWorktreeBinding(input),
    (error) => {
      assert.ok(error instanceof ForeignWorktreeBindingError);
      assert.match(error.message, /\/repo\/worktrees\/bound/);
      assert.match(error.message, /feature\/child\/1165/);
      assert.match(error.message, /\/repo\/worktrees\/foreign/);
      assert.match(error.message, /trunk/);
      assert.match(error.message, /cd '\/repo\/worktrees\/bound'/);
      return true;
    }
  );
  assert.deepEqual(input.audit, []);
});

test('entry wiring enforces the guard before verb preflight reads task state', () => {
  const source = readFileSync(path.join(ROOT, 'scripts/task-tracker/task-tracker.mjs'), 'utf8');
  const guard = source.indexOf('enforceVerbWorktreeBinding(');
  const preflight = source.indexOf('await runVerbPreflight(ctx)');
  assert.ok(guard >= 0, 'dispatcher calls the binding guard');
  assert.ok(preflight >= 0, 'dispatcher retains verb preflight');
  assert.ok(guard < preflight, 'binding guard runs before state-reading verb preflight');
});

test('Test commands bind their project-dir override to the detached sandbox worktree', () => {
  const source = readFileSync(path.join(ROOT, 'scripts/task-tracker/verbs/test.mjs'), 'utf8');
  assert.match(source, /AI_TASK_MANAGER_PROJECT_DIR:\s*wtPath/);
  assert.doesNotMatch(source, /AI_TASK_MANAGER_PROJECT_DIR:\s*projectDir/);
});

test('explicit override proceeds only after a durable audit is recorded', async () => {
  const input = fixture();
  const result = await enforceVerbWorktreeBinding({ ...input, allowForeignWorktree: true });
  assert.equal(result.status, 'override-audited');
  assert.equal(input.audit.length, 1);
  assert.equal(input.audit[0].issueNumber, 1165);
  assert.equal(input.audit[0].verb, 'promote');
  assert.equal(input.audit[0].bound.worktreePath, '/repo/worktrees/bound');
  assert.equal(input.audit[0].invoking.worktreePath, '/repo/worktrees/foreign');
});

test('override fails closed when its audit write fails', async () => {
  const input = fixture({
    postAudit: async () => {
      throw new Error('audit unavailable');
    },
  });
  await assert.rejects(
    () => enforceVerbWorktreeBinding({ ...input, allowForeignWorktree: true }),
    /audit unavailable/
  );
});

test('bound worktree and its subdirectories are unaffected', async () => {
  const input = fixture({
    resolveBinding: () => ({
      worktreePath: '/repo/worktrees/bound',
      worktreeBranch: 'feature/child/1165',
    }),
  });
  const result = await enforceVerbWorktreeBinding({
    ...input,
    invokingDir: '/repo/worktrees/bound/scripts/task-tracker',
  });
  assert.equal(result.status, 'matched');
  assert.deepEqual(input.audit, []);
});

test('an actually unbound command retains the existing startup path', async () => {
  const input = fixture({
    resolveBoundDir: () => {
      throw new BoundWorktreeMissingError('the active issue');
    },
  });
  const result = await enforceVerbWorktreeBinding(input);
  assert.equal(result.status, 'unbound');
});

test('the override is one explicit CLI flag with no ambient form', () => {
  assert.deepEqual(parseForeignWorktreeOverride(['promote', '1165']), {
    argv: ['promote', '1165'],
    allowForeignWorktree: false,
  });
  assert.deepEqual(parseForeignWorktreeOverride(['promote', '--allow-foreign-worktree', '1165']), {
    argv: ['promote', '1165'],
    allowForeignWorktree: true,
  });
  const sources = [
    'scripts/task-tracker/task-tracker.mjs',
    'scripts/task-tracker/lib/worktree-binding-guard.mjs',
  ].map((file) => readFileSync(path.join(ROOT, file), 'utf8'));
  assert.doesNotMatch(
    sources.join('\n'),
    /ALLOW_FOREIGN_WORKTREE|allowForeignWorktree\s*[:=].*process\.env/
  );
});
