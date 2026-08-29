#!/usr/bin/env node
// @story #1412

import { strict as assert } from 'node:assert';
import path from 'node:path';
import test from 'node:test';

import {
  parseRegisteredWorktreePaths,
  reapStaleTestSandboxes,
  selectStaleTestSandboxPaths,
} from '../../../../task-tracker/lib/test-sandbox-reaper.mjs';

const projectDir = path.resolve('/repo');
const tmpDir = path.join(projectDir, '.tmp');
const staleA = path.join(tmpDir, '.task-test-1412-deadbeef-41001-a1b2c3d4');
const staleB = path.join(tmpDir, '.task-test-1408-cafebabe-41002-deadbeef');
const live = path.join(tmpDir, '.task-test-1411-0123abcd-41003-1234abcd');

test('parses only worktree records from NUL-delimited porcelain', () => {
  const porcelain = [
    `worktree ${projectDir}`,
    'HEAD abcdef',
    'branch refs/heads/trunk',
    '',
    `worktree ${staleA}`,
    'HEAD deadbeef',
    'detached',
    '',
  ].join('\0');
  assert.deepEqual(parseRegisteredWorktreePaths(porcelain), [projectDir, staleA]);
});

test('selects exact project-local tokenized sandboxes only when their PID is dead', () => {
  const candidates = [
    staleA,
    live,
    path.join(tmpDir, '.task-test-1412-deadbeef'),
    path.join(tmpDir, '.task-test-1412-DEADBEEF-41004-a1b2c3d4'),
    path.join(tmpDir, '.task-test-1412-deadbeef-0-a1b2c3d4'),
    path.join(tmpDir, '.task-test-1412-deadbeef-41004-A1B2C3D4'),
    path.join(tmpDir, 'nested', '.task-test-1412-deadbeef-41004-a1b2c3d4'),
    path.join(projectDir, '.tmp-sibling', '.task-test-1412-deadbeef-41004-a1b2c3d4'),
    path.resolve('/other/.tmp/.task-test-1412-deadbeef-41004-a1b2c3d4'),
    path.join(tmpDir, 'ordinary-worktree'),
  ];
  const selected = selectStaleTestSandboxPaths({
    projectDir,
    worktreePaths: candidates,
    isPidAlive: (pid) => pid === 41003,
  });
  assert.deepEqual(selected, [staleA]);
});

test('retains a candidate when the liveness probe cannot prove death', () => {
  const selected = selectStaleTestSandboxPaths({
    projectDir,
    worktreePaths: [staleA],
    isPidAlive: () => {
      throw new Error('permission denied');
    },
  });
  assert.deepEqual(selected, []);
});

test('attempts every proven stale registration even when one removal fails', async () => {
  const attempted = [];
  const result = await reapStaleTestSandboxes({
    projectDir,
    listWorktrees: async () => [staleA, staleB, live],
    isPidAlive: (pid) => pid === 41003,
    removeWorktree: async ({ path: worktreePath }) => {
      attempted.push(worktreePath);
      if (worktreePath === staleA) throw new Error('already changed');
    },
  });
  assert.deepEqual(result.candidates, [staleA, staleB]);
  assert.deepEqual(result.attempted, [staleA, staleB]);
  assert.deepEqual(attempted, [staleA, staleB]);
});

test('inventory failure is non-fatal and performs no removal', async () => {
  let removals = 0;
  const result = await reapStaleTestSandboxes({
    projectDir,
    listWorktrees: async () => {
      throw new Error('git unavailable');
    },
    removeWorktree: async () => {
      removals += 1;
    },
  });
  assert.deepEqual(result, { candidates: [], attempted: [] });
  assert.equal(removals, 0);
});
