// @story #2031
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { rmSync } from 'node:fs';
import path from 'node:path';
import {
  freshUnitDir,
  fixture,
  subject,
} from '../../../unit/task-tracker/lib/decomposition-authority-fixtures.mjs';
import {
  withIssueLock,
  currentIssueLockOwner,
} from '../../../../task-tracker/issue-mutator-lock.mjs';
import { refreshDecompositionProjection } from '../../../../task-tracker/lib/decomposition-projection.mjs';

test('a linked-worktree issue lock permits owned publication refresh and excludes main-checkout contenders', async () => {
  const dir = freshUnitDir('publication-worktree-');
  const main = path.join(dir, 'main');
  const linked = path.join(dir, 'linked');
  const git = (args, cwd = dir) => execFileSync('git', args, { cwd, stdio: 'pipe' });
  git(['init', main]);
  git(
    [
      '-c',
      'user.name=Test',
      '-c',
      'user.email=test@example.com',
      'commit',
      '--allow-empty',
      '-m',
      'fixture',
    ],
    main
  );
  git(['worktree', 'add', '--detach', linked], main);
  const f = fixture();
  f.deps.findMainWorktreePath = () => main;
  let release, entered;
  const ready = new Promise((resolve) => {
    entered = resolve;
  });
  const held = withIssueLock({ issue: subject.issue, projDir: linked }, async () => {
    try {
      assert.equal(currentIssueLockOwner(subject.issue).projDir, main);
      const result = await refreshDecompositionProjection({
        subject,
        cfg: { repo: 'o/r', projectId: 'PVT_a' },
        projectDir: linked,
        deps: f.deps,
      });
      assert.equal(result.status, 'confirmed');
      entered();
      await new Promise((resolve) => {
        release = resolve;
      });
    } catch (error) {
      entered(error);
      throw error;
    }
  });
  try {
    const error = await ready;
    if (error) await held;
    await assert.rejects(
      () => withIssueLock({ issue: subject.issue, projDir: main, retries: 0 }, async () => {}),
      /locked/
    );
  } finally {
    release?.();
    await held.catch(() => {});
    rmSync(dir, { recursive: true, force: true });
  }
});

test('unavailable Git discovery refuses before entering an issue mutation', async () => {
  const dir = freshUnitDir('publication-worktree-unavailable-');
  const main = path.join(dir, 'main');
  execFileSync('git', ['init', main], { cwd: dir, stdio: 'pipe' });
  const priorPath = process.env.PATH;
  let entered = false;
  try {
    process.env.PATH = path.join(dir, 'unavailable-bin');
    await assert.rejects(
      () =>
        withIssueLock({ issue: subject.issue, projDir: main }, async () => {
          entered = true;
        }),
      /lock-root-unavailable/
    );
    assert.equal(entered, false);
  } finally {
    process.env.PATH = priorPath;
    rmSync(dir, { recursive: true, force: true });
  }
});
