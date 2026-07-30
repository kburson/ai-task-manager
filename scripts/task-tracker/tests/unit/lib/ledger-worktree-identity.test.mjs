// @story #1049
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { resolveWorktreeIdentity } from '../../../lib/work-lease/worktree-identity.mjs';

test('symlink aliases converge and linked Git dirs produce distinct worktree IDs', () => {
  const realpath = (value) => {
    if (value === '/alias' || value === '/real/worktree') return '/real/worktree';
    if (value.endsWith('/git-one')) return '/repo/.git/worktrees/one';
    if (value.endsWith('/git-two')) return '/repo/.git/worktrees/two';
    return value;
  };
  const one = resolveWorktreeIdentity('/alias', {
    hostId: 'host-1',
    realpath,
    exec: () => '/tmp/git-one\n',
  });
  const alias = resolveWorktreeIdentity('/real/worktree', {
    hostId: 'host-1',
    realpath,
    exec: () => '/tmp/git-one\n',
  });
  const two = resolveWorktreeIdentity('/real/worktree', {
    hostId: 'host-1',
    realpath,
    exec: () => '/tmp/git-two\n',
  });
  assert.deepEqual(one, alias);
  assert.match(one.worktreeId, /^wt:v1:[a-f0-9]{64}$/);
  assert.match(one.pathHash, /^[a-f0-9]{64}$/);
  assert.notEqual(one.worktreeId, two.worktreeId);
});

test('a moved display path preserves Git identity while changing path hash', () => {
  const gitDir = '/repo/.git/worktrees/stable';
  const before = resolveWorktreeIdentity('/old/path', {
    hostId: 'host-1',
    realpath: (value) => (value.includes('.git') ? gitDir : '/real/old'),
    exec: () => gitDir,
  });
  const after = resolveWorktreeIdentity('/new/path', {
    hostId: 'host-1',
    realpath: (value) => (value.includes('.git') ? gitDir : '/real/new'),
    exec: () => gitDir,
  });
  assert.equal(before.worktreeId, after.worktreeId);
  assert.notEqual(before.pathHash, after.pathHash);
});

test('worktree identity fails closed when Git identity is unavailable', () => {
  assert.throws(
    () =>
      resolveWorktreeIdentity('/repo', {
        hostId: 'host-1',
        realpath: (value) => value,
        exec: () => {
          throw new Error('git failed');
        },
      }),
    (error) => error.code === 'main-worktree-unresolved'
  );
});
