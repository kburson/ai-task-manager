#!/usr/bin/env node
// @story #259
import { strict as assert } from 'node:assert';
import { existsSync, mkdirSync, mkdtempSync, rmSync, statSync } from 'node:fs';
import path from 'node:path';
import { projectScratchDir } from '../../lib/scratch-dir.mjs';

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
} finally {
  rmSync(sandbox, { recursive: true, force: true });
}

console.log('ok scratch-dir');
