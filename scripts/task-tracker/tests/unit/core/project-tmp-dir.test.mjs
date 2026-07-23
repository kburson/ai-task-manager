#!/usr/bin/env node
// @story #256
// Regression tests for projectTmpDir (#256).
//
// The single scratch-directory chokepoint must resolve under the gitignored
// `.tmp/` tree, never the un-ignored project-root `tmp/`. `.gitignore` ignores
// `.tmp/` but NOT `tmp/`, so a regression here re-dirties the working tree on
// every sandbox/scratch write.

import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { readFileSync, readdirSync, statSync, mkdtempSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { projectTmpDir } from '../../../paths.mjs';
import { projectScratchDir } from '../../../lib/scratch-dir.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url)) + '/..';
const SCRIPTS_ROOT = path.resolve(HERE, '..', '..', '..'); // scripts/

// AC1 + AC5: the helper resolves under `.tmp/`, never bare `tmp/`.
test('projectTmpDir resolves under .tmp/, not bare tmp/', () => {
  const root = mkdtempSync(path.join(projectScratchDir('test'), 'aitm-ptd-'));
  try {
    const dir = projectTmpDir(root);
    assert.equal(dir, path.join(root, '.tmp'), 'must be <root>/.tmp');
    assert.equal(path.basename(dir), '.tmp');
    assert.notEqual(path.basename(dir), 'tmp');
    assert.ok(!/(^|\/)tmp$/.test(dir), `must not end with bare /tmp: ${dir}`);
    assert.ok(statSync(dir).isDirectory(), 'directory is created');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

// AC3: no source file under scripts/ constructs a project-root `tmp/` scratch
// path. All consumers must route through projectTmpDir. This guards against a
// new consumer hardcoding `join(projDir, 'tmp')` and re-introducing the bug.
test('no scripts/ source hardcodes a project-root tmp/ scratch path', () => {
  const offenders = [];
  // Matches join(<anything>, 'tmp') / join(<anything>, "tmp") — the exact
  // shape projectTmpDir used to have. The fixed helper uses '.tmp', so it
  // won't match. Any other hit is a regression.
  const BAD = /join\([^)]*['"]tmp['"]\s*\)/;
  const walk = (dir) => {
    for (const ent of readdirSync(dir, { withFileTypes: true })) {
      if (ent.name === 'node_modules' || ent.name === '.git') continue;
      const full = path.join(dir, ent.name);
      if (ent.isDirectory()) {
        walk(full);
        continue;
      }
      if (!ent.name.endsWith('.mjs') && !ent.name.endsWith('.js')) continue;
      if (ent.name.endsWith('.test.mjs') || ent.name.endsWith('.test.js')) continue;
      const text = readFileSync(full, 'utf8');
      for (const [i, line] of text.split('\n').entries()) {
        if (BAD.test(line))
          offenders.push(`${path.relative(SCRIPTS_ROOT, full)}:${i + 1}: ${line.trim()}`);
      }
    }
  };
  walk(SCRIPTS_ROOT);
  assert.equal(
    offenders.length,
    0,
    `found project-root tmp/ path construction (use projectTmpDir → .tmp/):\n${offenders.join('\n')}`
  );
});

const REPO_ROOT = path.resolve(SCRIPTS_ROOT, '..'); // project root

// AC2 (logic chain): scratch goes to a dir that .gitignore actually ignores, so
// scratch writes can never dirty the working tree. projectTmpDir chooses
// `.tmp/`; assert `.gitignore` ignores `.tmp/` and does NOT depend on `tmp/`.
test('.gitignore ignores the .tmp/ scratch dir projectTmpDir writes to', () => {
  const dirName = path.basename(
    projectTmpDir(mkdtempSync(path.join(projectScratchDir('test'), 'aitm-gi-')))
  );
  assert.equal(dirName, '.tmp', 'guard: helper must target .tmp');
  const gitignore = readFileSync(path.join(REPO_ROOT, '.gitignore'), 'utf8');
  const ignores = (entry) =>
    gitignore
      .split('\n')
      .map((l) => l.trim())
      .some((l) => l === entry || l === `/${entry}` || l === `${entry}/` || l === `/${entry}/`);
  assert.ok(ignores('.tmp'), '.gitignore must ignore .tmp/ — else scratch dirties the tree');
});

// AC4 (live evidence): the repo has no registered git worktree rooted under a
// project-root `tmp/` path (the stale `tmp/.task-test-255-*` sandbox was
// migrated out via `git worktree remove`). `/.tmp/` sandboxes are fine — the
// `/tmp/` substring does not match `/.tmp/`.
test('no registered git worktree lives under a project-root tmp/ path', () => {
  let out;
  try {
    out = execFileSync('git', ['worktree', 'list', '--porcelain'], {
      cwd: REPO_ROOT,
      encoding: 'utf8',
    });
  } catch {
    return; // not a git checkout (e.g. packaged tarball) — nothing to assert
  }
  const offenders = out
    .split('\n')
    .filter((l) => l.startsWith('worktree '))
    .map((l) => l.slice('worktree '.length))
    .filter((p) => p.includes('/tmp/') || p.endsWith('/tmp'));
  assert.deepEqual(
    offenders,
    [],
    `found worktree(s) under project-root tmp/ (migrate via git worktree remove):\n${offenders.join('\n')}`
  );
});
