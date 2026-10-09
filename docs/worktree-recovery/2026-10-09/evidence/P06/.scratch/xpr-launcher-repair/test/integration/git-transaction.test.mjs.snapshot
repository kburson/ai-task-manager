import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';

import * as api from '../helpers/internal-api.mjs';

// cspell:ignore filemode

function git(cwd, args, options = {}) {
  return execFileSync('git', args, {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    ...options,
  }).trim();
}

function fixture() {
  const root = mkdtempSync(path.join(tmpdir(), 'apr-transaction-'));
  git(root, ['init', '-b', 'trunk']);
  git(root, ['config', 'user.email', 'test@example.com']);
  git(root, ['config', 'user.name', 'Test']);
  mkdirSync(path.join(root, 'docs'));
  writeFileSync(path.join(root, 'docs/artifact.md'), '# Before\n');
  writeFileSync(path.join(root, 'outside-working.txt'), 'before\n');
  git(root, ['add', '.']);
  git(root, ['commit', '-m', 'fixture']);
  writeFileSync(path.join(root, 'outside-staged.txt'), 'staged\n');
  git(root, ['add', 'outside-staged.txt']);
  writeFileSync(path.join(root, 'outside-working.txt'), 'after\n');
  mkdirSync(path.join(root, 'reviews'));
  writeFileSync(path.join(root, 'reviews/reviewer-response-1.md'), 'reviewer\n');
  writeFileSync(path.join(root, 'docs/artifact.md'), '# After\n');
  writeFileSync(path.join(root, 'reviews/author-response-1.md'), 'author\n');
  return { root, cleanup: () => rmSync(root, { recursive: true, force: true }) };
}

function sha256(bytes) {
  return `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
}

function transactionInput(root) {
  const paths = [
    'reviews/reviewer-response-1.md',
    'docs/artifact.md',
    'reviews/author-response-1.md',
  ];
  const sealed = {
    expected_head: git(root, ['rev-parse', 'HEAD']),
    paths: paths.map((relative) => {
      const bytes = readFileSync(path.join(root, relative));
      const tracked = git(root, ['ls-files', '--stage', '--', relative]);
      const mode = tracked ? tracked.slice(0, 6) : '100644';
      return { path: relative, bytes, digest: sha256(bytes), mode };
    }),
  };
  const trailers = {
    'Peer-Review-ID': 'review-transaction',
    'Peer-Review-Turn': '1',
    'Peer-Review-Artifact-Blob': git(root, ['hash-object', 'docs/artifact.md']),
    'Peer-Review-Reviewer-Response': sealed.paths[0].digest,
    'Peer-Review-Author-Response': sealed.paths[2].digest,
  };
  return { paths, sealed, trailers };
}

test('commitExactPaths commits only sealed paths and preserves unrelated index objects', (t) => {
  const fx = fixture();
  t.after(fx.cleanup);
  assert.equal(typeof api.createGitTransactionRepository, 'function');
  assert.equal(typeof api.commitExactPaths, 'function');
  const beforeHead = git(fx.root, ['rev-parse', 'HEAD']);
  const beforeOutside = git(fx.root, ['ls-files', '--stage', '--', 'outside-staged.txt']);
  const workingBytes = readFileSync(path.join(fx.root, 'outside-working.txt'));
  const { paths, sealed, trailers } = transactionInput(fx.root);

  const receipt = api.commitExactPaths(
    api.createGitTransactionRepository(fx.root),
    sealed,
    'Peer review revision 1',
    trailers
  );

  assert.notEqual(receipt.commit, beforeHead);
  assert.deepEqual(receipt.paths, paths);
  assert.deepEqual(receipt.trailers, trailers);
  assert.deepEqual(
    git(fx.root, ['diff-tree', '--no-commit-id', '--name-only', '-r', receipt.commit])
      .split('\n')
      .sort(),
    [...paths].sort()
  );
  assert.equal(git(fx.root, ['ls-files', '--stage', '--', 'outside-staged.txt']), beforeOutside);
  assert.equal(git(fx.root, ['diff', '--cached', '--name-only']), 'outside-staged.txt');
  assert.deepEqual(readFileSync(path.join(fx.root, 'outside-working.txt')), workingBytes);
  assert.match(
    git(fx.root, ['show', '-s', '--format=%B', receipt.commit]),
    /Peer-Review-ID: review-transaction/
  );
});

test('every transaction checkpoint can retry without consuming unrelated staged state', (t) => {
  const checkpoints = [
    'index-snapshotted',
    'owned-overlap-checked',
    'owned-paths-staged',
    'sealed-bytes-checked',
    'outside-index-checked',
    'commit-created',
    'commit-paths-checked',
    'outside-index-rechecked',
  ];
  for (const checkpoint of checkpoints) {
    const fx = fixture();
    t.after(fx.cleanup);
    const { sealed, trailers } = transactionInput(fx.root);
    const beforeOutside = git(fx.root, ['ls-files', '--stage', '--', 'outside-staged.txt']);
    const base = api.createGitTransactionRepository(fx.root);
    let injected = false;
    const repository = {
      ...base,
      checkpoint(name) {
        if (!injected && name === checkpoint) {
          injected = true;
          throw new Error(`injected after ${name}`);
        }
      },
    };
    assert.throws(
      () => api.commitExactPaths(repository, sealed, 'Peer review revision 1', trailers),
      new RegExp(`injected after ${checkpoint}`)
    );
    const recovered = api.commitExactPaths(
      api.createGitTransactionRepository(fx.root),
      sealed,
      'Peer review revision 1',
      trailers
    );
    assert.equal(recovered.recovered, checkpoints.indexOf(checkpoint) >= 5);
    assert.equal(
      git(fx.root, ['ls-files', '--stage', '--', 'outside-staged.txt']),
      beforeOutside,
      checkpoint
    );
  }
});

test('transaction refuses changed HEAD, owned overlap, and altered sealed bytes before commit', (t) => {
  const cases = [
    {
      name: 'changed HEAD',
      code: 'APR_GIT_HEAD_CHANGED',
      mutate(root) {
        git(root, ['commit', '--allow-empty', '-m', 'concurrent']);
      },
    },
    {
      name: 'owned index overlap',
      code: 'APR_GIT_OWNED_PATH_OVERLAP',
      mutate(root) {
        git(root, ['add', 'docs/artifact.md']);
      },
    },
    {
      name: 'altered seal digest',
      code: 'APR_GIT_SEAL_MISMATCH',
      mutate(_root, sealed) {
        sealed.paths[0] = { ...sealed.paths[0], digest: 'sha256:invalid' };
      },
    },
  ];
  for (const item of cases) {
    const fx = fixture();
    t.after(fx.cleanup);
    const { sealed, trailers } = transactionInput(fx.root);
    item.mutate(fx.root, sealed);
    const headBefore = git(fx.root, ['rev-parse', 'HEAD']);
    const indexBefore = execFileSync('git', ['ls-files', '--stage', '-z'], { cwd: fx.root });
    assert.throws(
      () =>
        api.commitExactPaths(
          api.createGitTransactionRepository(fx.root),
          sealed,
          'Peer review revision 1',
          trailers
        ),
      (error) => error.code === item.code,
      item.name
    );
    assert.equal(git(fx.root, ['rev-parse', 'HEAD']), headBefore, item.name);
    assert.deepEqual(
      execFileSync('git', ['ls-files', '--stage', '-z'], { cwd: fx.root }),
      indexBefore,
      item.name
    );
  }
});

test('transaction recovery rejects a changed request and a tampered commit', (t) => {
  const interrupted = fixture();
  t.after(interrupted.cleanup);
  const first = transactionInput(interrupted.root);
  const base = api.createGitTransactionRepository(interrupted.root);
  assert.throws(
    () =>
      api.commitExactPaths(
        {
          ...base,
          checkpoint(name) {
            if (name === 'owned-paths-staged') throw new Error('injected');
          },
        },
        first.sealed,
        'Peer review revision 1',
        first.trailers
      ),
    /injected/
  );
  assert.throws(
    () =>
      api.commitExactPaths(
        api.createGitTransactionRepository(interrupted.root),
        first.sealed,
        'Different message',
        first.trailers
      ),
    (error) => error.code === 'APR_GIT_RECOVERY_INVALID'
  );

  const tampered = fixture();
  t.after(tampered.cleanup);
  const second = transactionInput(tampered.root);
  api.commitExactPaths(
    api.createGitTransactionRepository(tampered.root),
    second.sealed,
    'Peer review revision 1',
    second.trailers
  );
  git(tampered.root, ['reset', '--', 'outside-staged.txt']);
  git(tampered.root, ['commit', '--amend', '-m', 'Tampered transaction']);
  assert.throws(
    () =>
      api.commitExactPaths(
        api.createGitTransactionRepository(tampered.root),
        second.sealed,
        'Peer review revision 1',
        second.trailers
      ),
    (error) => error.code === 'APR_GIT_COMMIT_INVALID'
  );
});

test('transaction seals working, index, and committed Git modes', (t) => {
  const fx = fixture();
  t.after(fx.cleanup);
  if (git(fx.root, ['config', '--bool', 'core.filemode']) !== 'true') {
    t.skip('Git reports that file-mode tracking is disabled on this filesystem');
    return;
  }
  const { sealed, trailers } = transactionInput(fx.root);
  chmodSync(path.join(fx.root, 'docs/artifact.md'), 0o755);
  const headBefore = git(fx.root, ['rev-parse', 'HEAD']);
  assert.throws(
    () =>
      api.commitExactPaths(
        api.createGitTransactionRepository(fx.root),
        sealed,
        'Peer review revision 1',
        trailers
      ),
    (error) => error.code === 'APR_GIT_SEAL_MISMATCH'
  );
  assert.equal(git(fx.root, ['rev-parse', 'HEAD']), headBefore);
});
