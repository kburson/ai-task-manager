#!/usr/bin/env node
// @story #346
// verbs/test.mjs `defaultRemoveWorktree` — issue #346.
//
// Regression: when a sandboxed test creates a fixture directory carrying
// its own `.git/` inside the worktree (the slow-suite `tt-approval-gate-*`
// family does exactly this), `git worktree remove --force` partially succeeds —
// worktree registration is cleared, but the directory persists on disk because
// git refuses to descend through nested git repositories. The next
// `git worktree add` then aborts on "<path>' already exists" and
// `runSetupWithRetry` burns all 3 attempts on the same wall. This test
// asserts the two-stage cleanup (git remove → fs.rmSync) succeeds even when
// a nested .git/ fixture is present.
import { strict as assert } from 'node:assert';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdirSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import path from 'node:path';

import {
  defaultRemoveWorktree,
  defaultCreateWorktree,
} from '../../../../task-tracker/verbs/test.mjs';
import {
  mkdtempProjectIsolated,
  mkdtempOutsideRepo,
} from '../../../../task-tracker/lib/scratch-dir.mjs';

const pexec = promisify(execFile);

async function git(args, cwd) {
  return pexec('git', args, { cwd, timeout: 30_000 });
}

// mkdtempProjectIsolated returns a fresh sandbox under `.tmp/test/` with
// `git init -q -b trunk` + an initial commit on `trunk` already done — exactly
// the parent-repo shape `defaultCreateWorktree` needs. The companion wtPath
// must live outside the project dir (git refuses worktree add inside the same
// dir); use mkdtempOutsideRepo for that.
const projectDir = mkdtempProjectIsolated('aitm-346-proj-');
const wtPath = mkdtempOutsideRepo('aitm-346-wt-');
// `defaultCreateWorktree` calls `git worktree add` which requires the target
// not to exist; drop the bare directory mkdtemp created.
rmSync(wtPath, { recursive: true, force: true });
try {
  // 2. Stage a real worktree.
  await defaultCreateWorktree({ projectDir, path: wtPath });
  assert.equal(existsSync(wtPath), true, 'worktree path must exist after createWorktree');

  // 3. Drop a nested .git/ fixture inside the worktree — this is the shape
  //    that confuses `git worktree remove --force`.
  const nestedGit = path.join(wtPath, 'inner-fixture', '.git');
  mkdirSync(nestedGit, { recursive: true });
  writeFileSync(path.join(nestedGit, 'HEAD'), 'ref: refs/heads/main\n');
  writeFileSync(path.join(nestedGit, 'config'), '[core]\n\tbare = false\n');

  // 4. Sanity: worktree is registered.
  const beforeList = (await git(['worktree', 'list', '--porcelain'], projectDir)).stdout;
  assert.ok(beforeList.includes(wtPath), 'worktree must be listed before removal');

  // 5. Two-stage cleanup.
  await defaultRemoveWorktree({ projectDir, path: wtPath });

  // 6. Worktree gone from both git metadata AND disk.
  const afterList = (await git(['worktree', 'list', '--porcelain'], projectDir)).stdout;
  assert.ok(
    !afterList.includes(wtPath),
    `worktree must not be listed after removal\n--- after ---\n${afterList}`
  );
  assert.equal(
    existsSync(wtPath),
    false,
    'worktree path must be removed from disk even with nested .git/ fixture inside'
  );

  // 7. Idempotency — a second call must not throw.
  await defaultRemoveWorktree({ projectDir, path: wtPath });

  console.log('verb-test-remove-worktree.test.mjs: ok');
} finally {
  try {
    rmSync(projectDir, { recursive: true, force: true });
  } catch {
    /* best-effort */
  }
}
