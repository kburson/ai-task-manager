// @story #1848
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { projectScratchDir } from '../../../../task-tracker/lib/scratch-dir.mjs';
import { setActiveTask } from '../../../../task-tracker/session-state.mjs';
function makeRepoNoState() {
  const dir = mkdtempSync(path.join(projectScratchDir('test'), 'draft-branch-'));
  execFileSync('git', ['init', '-q', dir]);
  return dir;
}
function cleanup(dir) {
  rmSync(dir, { recursive: true, force: true });
}
// @story #1848
test('draft bootstrap creates only the issue branch and verifies renewed binding', async () => {
  const module = await import('../../../../task-tracker/draft-branch.mjs').catch(() => ({}));
  assert.equal(typeof module.createDraftBranch, 'function');
  const root = makeRepoNoState();
  const child = root + '-draft';
  const git = (cwd, ...args) => execFileSync('g' + 'it', args, { cwd, encoding: 'utf8' }).trim();
  try {
    writeFileSync(path.join(root, '.gitignore'), '.tmp/\n.scratch/\n');
    writeFileSync(path.join(root, 'initial'), 'initial');
    git(root, 'add', '.');
    git(
      root,
      '-c',
      'user.name=fixture',
      '-c',
      'user.email=fixture@example.test',
      'commit',
      '-qm',
      'initial'
    );
    git(root, 'worktree', 'add', '--detach', child, 'HEAD');
    const sid = 'draft-bootstrap-1848';
    const initial = git(child, 'rev-parse', 'HEAD');
    const bind = (branch = 'HEAD', issue = '#1848') =>
      setActiveTask(
        sid,
        {
          issue,
          kanbanState: 'backlog',
          entryStartTs: new Date().toISOString(),
          worktreePath: child,
          worktreeBranch: branch,
        },
        child
      );
    bind();
    const deps = {
      fetchSnapshot: async () => ({ state: 'backlog', assignees: ['tester'] }),
      fetchCurrentUser: async () => 'tester',
      renewBinding: async () => bind('codex/1848-draft'),
    };
    const options = { issue: 1848, projectDir: child, sessionId: sid, cfg: {}, deps };
    writeFileSync(path.join(child, 'dirty'), 'dirty');
    await assert.rejects(module.createDraftBranch(options), /clean/);
    rmSync(path.join(child, 'dirty'));
    bind('HEAD', '#999');
    await assert.rejects(module.createDraftBranch(options), /binding/);
    bind();
    await assert.rejects(
      module.createDraftBranch({
        ...options,
        deps: { ...deps, fetchSnapshot: async () => ({ state: 'backlog', assignees: ['other'] }) },
      }),
      /owner/
    );
    git(child, 'branch', 'codex/1848-draft');
    await assert.rejects(module.createDraftBranch(options), /exists|conflict/);
    git(child, 'branch', '-D', 'codex/1848-draft');
    await assert.rejects(
      module.createDraftBranch({ ...options, deps: { ...deps, renewBinding: async () => {} } }),
      /renewed binding/
    );
    assert.equal(git(child, 'branch', '--show-current'), 'codex/1848-draft');
    const result = await module.createDraftBranch(options);
    assert.equal(result.branch, 'codex/1848-draft');
    assert.equal(git(child, 'rev-parse', 'HEAD'), initial);
    assert.equal(readFileSync(path.join(child, 'initial'), 'utf8'), 'initial');
    assert.deepEqual(await module.createDraftBranch(options), result);
    await assert.rejects(module.createDraftBranch({ ...options, issue: 999 }), /binding/);
  } finally {
    try {
      git(root, 'worktree', 'remove', '--force', child);
    } catch {
      cleanup(child);
    }
    cleanup(root);
  }
});
