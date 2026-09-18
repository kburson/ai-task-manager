// @story #1693
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { after, test } from 'node:test';

import { observeInstallation } from '../../../package/install-observer.mjs';
import { projectScratchDir } from '../../../task-tracker/lib/scratch-dir.mjs';

const scratch = mkdtempSync(join(projectScratchDir('test'), 'install-health-'));
after(() => rmSync(scratch, { recursive: true, force: true }));

const git = (cwd, args) =>
  execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });

test('observer is read-only and distinguishes modified, untracked, and unsafe artifacts', () => {
  const projectRoot = join(scratch, 'repo');
  const packageRoot = join(projectRoot, 'node_modules', '@kburson', 'ai-task-manager');
  mkdirSync(join(projectRoot, 'tracked'), { recursive: true });
  mkdirSync(join(packageRoot, 'skill', 'adapters', 'codex'), { recursive: true });
  writeFileSync(join(projectRoot, 'tracked', 'owned.txt'), 'changed\n');
  writeFileSync(join(projectRoot, 'untracked.txt'), 'content\n');
  symlinkSync('/tmp', join(projectRoot, 'unsafe-link'));
  const external = join(scratch, 'external');
  mkdirSync(external, { recursive: true });
  writeFileSync(join(external, 'outside.txt'), 'outside\n');
  symlinkSync(external, join(projectRoot, 'escaped-parent'));
  git(projectRoot, ['init']);
  git(projectRoot, ['config', 'user.email', 'doctor@example.test']);
  git(projectRoot, ['config', 'user.name', 'Doctor Test']);
  git(projectRoot, ['add', 'tracked/owned.txt']);
  git(projectRoot, ['commit', '-m', 'fixture']);
  const beforeStatus = git(projectRoot, ['status', '--porcelain=v1', '--untracked-files=all']);
  const beforeFile = readFileSync(join(projectRoot, 'tracked', 'owned.txt'), 'utf8');
  const artifacts = [
    {
      id: 'a.modified',
      path: 'tracked/owned.txt',
      kind: 'file',
      ownership: 'generated',
      required: true,
      contract: 'exact',
      digest: '0'.repeat(64),
    },
    {
      id: 'b.untracked',
      path: 'untracked.txt',
      kind: 'file',
      ownership: 'reference',
      required: true,
      contract: 'reference',
    },
    {
      id: 'provider.codex.skill',
      path: 'unsafe-link',
      kind: 'symlink',
      ownership: 'generated',
      required: true,
      contract: 'codex-skill',
    },
    {
      id: 'c.escaped-parent',
      path: 'escaped-parent/outside.txt',
      kind: 'file',
      ownership: 'reference',
      required: true,
      contract: 'reference',
    },
  ];
  const observed = observeInstallation({
    projectRoot,
    packageRoot,
    manifest: { intent: { features: {} } },
    contract: { artifacts },
  });
  assert.equal(observed.byId['a.modified'].contentMatches, false);
  assert.equal(observed.byId['b.untracked'].tracked, false);
  assert.equal(observed.byId['provider.codex.skill'].symlinkSafety, 'unsafe');
  assert.equal(observed.byId['c.escaped-parent'].pathSafety, 'unsafe');
  assert.equal(readFileSync(join(projectRoot, 'tracked', 'owned.txt'), 'utf8'), beforeFile);
  assert.equal(
    git(projectRoot, ['status', '--porcelain=v1', '--untracked-files=all']),
    beforeStatus
  );
  assert.equal(relative(projectRoot, packageRoot).startsWith('..'), false);
});
