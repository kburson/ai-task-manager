#!/usr/bin/env node
// @story #259
import { strict as assert } from 'node:assert';
import { existsSync, mkdirSync, mkdtempSync, rmSync, statSync } from 'node:fs';
import path from 'node:path';
import {
  projectScratchDir,
  resolveScratchRoot,
} from '../../../../task-tracker/lib/scratch-dir.mjs';
import { BoundWorktreeMissingError } from '../../../../task-tracker/lib/project-dir.mjs';

const scratchRoot = path.join(process.cwd(), '.tmp', 'test');
mkdirSync(scratchRoot, { recursive: true });
const sandbox = mkdtempSync(path.join(scratchRoot, 'scratch-dir-'));
try {
  // 1. happy path — creates `<projectDir>/.tmp/test/` if missing
  const dir = projectScratchDir('test', sandbox);
  assert.equal(dir, path.join(sandbox, '.tmp', 'test'));
  assert.ok(existsSync(dir), '.tmp/test should exist');
  assert.ok(statSync(dir).isDirectory(), '.tmp/test should be a directory');

  // 2. idempotent — second call on existing dir is a no-op
  const dir2 = projectScratchDir('test', sandbox);
  assert.equal(dir2, dir);

  // 3. multiple purposes co-exist
  const gh = projectScratchDir('gh', sandbox);
  const heal = projectScratchDir('heal', sandbox);
  assert.equal(gh, path.join(sandbox, '.tmp', 'gh'));
  assert.equal(heal, path.join(sandbox, '.tmp', 'heal'));

  // 4. invalid purpose rejected (catches `/tmp/` / path-traversal abuse)
  assert.throws(() => projectScratchDir('../etc', sandbox), /purpose must match/);
  assert.throws(() => projectScratchDir('', sandbox), /purpose must match/);
  assert.throws(() => projectScratchDir('TEST', sandbox), /purpose must match/);

  // 5. respects AI_TASK_MANAGER_PROJECT_DIR when no explicit projectDir
  const prev = process.env.AI_TASK_MANAGER_PROJECT_DIR;
  process.env.AI_TASK_MANAGER_PROJECT_DIR = sandbox;
  try {
    const envDir = projectScratchDir('inspect');
    assert.equal(envDir, path.join(sandbox, '.tmp', 'inspect'));
  } finally {
    if (prev === undefined) delete process.env.AI_TASK_MANAGER_PROJECT_DIR;
    else process.env.AI_TASK_MANAGER_PROJECT_DIR = prev;
  }

  // 6. a valid bound-worktree result remains authoritative
  const boundRoot = path.join(sandbox, 'bound-worktree');
  assert.equal(
    resolveScratchRoot(undefined, {
      resolveProjectDir: () => boundRoot,
      env: {},
      cwd: () => path.join(sandbox, 'wrong-cwd'),
    }),
    boundRoot
  );

  // 7. only a missing binding degrades through env and cwd fallbacks
  const missingBinding = () => {
    throw new BoundWorktreeMissingError('the active issue');
  };
  assert.equal(
    resolveScratchRoot(undefined, {
      resolveProjectDir: missingBinding,
      env: { AI_TASK_MANAGER_PROJECT_DIR: sandbox },
      cwd: () => path.join(sandbox, 'wrong-cwd'),
    }),
    sandbox
  );
  assert.equal(
    resolveScratchRoot(undefined, {
      resolveProjectDir: missingBinding,
      env: {},
      cwd: () => sandbox,
    }),
    sandbox
  );

  // 8. a resolver failure other than BoundWorktreeMissingError stays fatal
  const corruptBinding = new Error('corrupt binding record');
  assert.throws(
    () =>
      resolveScratchRoot(undefined, {
        resolveProjectDir: () => {
          throw corruptBinding;
        },
        env: {},
        cwd: () => sandbox,
      }),
    (error) => error === corruptBinding
  );
} finally {
  rmSync(sandbox, { recursive: true, force: true });
}

console.log('ok scratch-dir');
