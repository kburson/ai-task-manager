// @story #1049
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { projectScratchDir } from '../../../lib/scratch-dir.mjs';
import { resolveMainWorktreePath } from '../../../lib/main-worktree-path.mjs';
import { resolveProjectDatabasePath } from '../../../lib/ledger/project-database-path.mjs';

test('strict resolver canonicalizes the first/main worktree and DB path', () => {
  const exec = () =>
    'worktree /repo/main\nHEAD a\nbranch refs/heads/trunk\n\nworktree /repo/main/.worktrees/child\nHEAD b\n';
  const realpath = (value) => value.replace('/repo/main', '/real/main');
  assert.equal(
    resolveMainWorktreePath('/repo/main/.worktrees/child', { exec, realpath }),
    '/real/main'
  );
  assert.equal(
    resolveProjectDatabasePath('/repo/main/.worktrees/child', { exec, realpath }),
    path.join('/real/main', '.db', 'aitm', 'project.sqlite')
  );
});

test('authority resolution fails closed while fleet may explicitly request fallback', () => {
  const exec = () => {
    throw new Error('not a repository');
  };
  assert.throws(
    () => resolveMainWorktreePath('/repo/child', { exec, realpath: (value) => value }),
    (error) => error.code === 'main-worktree-unresolved'
  );
  assert.equal(
    resolveMainWorktreePath('/repo/child', {
      exec,
      realpath: (value) => `/real${value}`,
      allowFallback: true,
    }),
    '/real/repo/child'
  );
});

test('main and linked worktrees converge on one authoritative database', () => {
  const root = mkdtempSync(path.join(projectScratchDir('test'), 'aitm-linked-ledger-'));
  const main = path.join(root, 'main');
  const childOne = path.join(root, 'child-one');
  const childTwo = path.join(root, 'child-two');
  try {
    execFileSync('git', ['init', '-b', 'trunk', main], { stdio: 'ignore' });
    writeFileSync(path.join(main, 'README.md'), 'ledger fixture\n');
    execFileSync('git', ['add', 'README.md'], { cwd: main, stdio: 'ignore' });
    execFileSync(
      'git',
      [
        '-c',
        'user.name=AITM Test',
        '-c',
        'user.email=aitm@example.invalid',
        'commit',
        '-m',
        'fixture',
      ],
      { cwd: main, stdio: 'ignore' }
    );
    execFileSync('git', ['worktree', 'add', '-b', 'child-one', childOne], {
      cwd: main,
      stdio: 'ignore',
    });
    execFileSync('git', ['worktree', 'add', '-b', 'child-two', childTwo], {
      cwd: main,
      stdio: 'ignore',
    });

    const paths = [main, childOne, childTwo].map((projectDir) =>
      resolveProjectDatabasePath(projectDir)
    );
    const expected = path.join(realpathSync(main), '.db', 'aitm', 'project.sqlite');
    assert.deepEqual(paths, [expected, expected, expected]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
