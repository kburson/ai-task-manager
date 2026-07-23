// @story #869
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, realpathSync, lstatSync, rmSync, existsSync } from 'node:fs';
import path from 'node:path';
import { projectScratchDir } from '../../../lib/scratch-dir.mjs';
import { runSeedCheck } from '../../../ensure-worktree-seeded.mjs';

test('fresh worktree → seed check yields worktree-resolving link', async () => {
  const base = mkdtempSync(path.join(projectScratchDir('test'), 'wt-int-'));
  const wt = path.join(base, 'wt');
  const repoRoot = realpathSync(path.resolve(process.cwd()));
  try {
    execFileSync('git', ['worktree', 'add', '--detach', wt, 'HEAD'], {
      cwd: repoRoot,
      stdio: 'pipe',
    });
    assert.ok(!existsSync(path.join(wt, 'node_modules', 'ai-task-manager')), 'starts unseeded');

    await runSeedCheck({
      cwd: wt,
      stdin: JSON.stringify({ hook_event_name: 'SessionStart' }),
      stdout: () => {},
      stderr: () => {},
    });

    const link = path.join(wt, 'node_modules', 'ai-task-manager');
    assert.ok(lstatSync(link).isSymbolicLink(), 'link created');
    assert.equal(realpathSync(link), realpathSync(wt), 'resolves to the worktree, not trunk');
    // skill adapter reachable through the link
    assert.ok(
      existsSync(path.join(link, 'skill', 'adapters', 'claude', 'SKILL.md')),
      'skill reachable'
    );
  } finally {
    try {
      execFileSync('git', ['worktree', 'remove', '--force', wt], { cwd: repoRoot, stdio: 'pipe' });
    } catch {
      /* best effort */
    }
    rmSync(base, { recursive: true, force: true });
  }
});

test('second seed check is idempotent (pre-existing link left converged)', async () => {
  const base = mkdtempSync(path.join(projectScratchDir('test'), 'wt-idem-'));
  const wt = path.join(base, 'wt');
  const repoRoot = realpathSync(path.resolve(process.cwd()));
  try {
    execFileSync('git', ['worktree', 'add', '--detach', wt, 'HEAD'], {
      cwd: repoRoot,
      stdio: 'pipe',
    });
    const payload = JSON.stringify({ hook_event_name: 'SessionStart' });
    await runSeedCheck({ cwd: wt, stdin: payload, stdout: () => {}, stderr: () => {} });
    let out = '';
    await runSeedCheck({ cwd: wt, stdin: payload, stdout: (s) => (out += s), stderr: () => {} });
    assert.equal(out, '', 'already-seeded second run is silent');
  } finally {
    try {
      execFileSync('git', ['worktree', 'remove', '--force', wt], { cwd: repoRoot, stdio: 'pipe' });
    } catch {
      /* best effort */
    }
    rmSync(base, { recursive: true, force: true });
  }
});
