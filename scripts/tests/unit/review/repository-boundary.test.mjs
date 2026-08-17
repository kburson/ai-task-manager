// @story #1292

import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { realpathSync } from 'node:fs';
import test from 'node:test';

import { cleanupTemporaryRoots, repositoryFixture } from '../../fixtures/co-review-fixture.mjs';
import {
  createRealRepositoryBoundary,
  REAL_REPOSITORY_BOUNDARY,
} from '../../../review/lib/repository-boundary.mjs';

test.afterEach(cleanupTemporaryRoots);

test('real repository boundary normalizes repository observations', () => {
  const { root, initialCommit } = repositoryFixture();

  assert.equal(REAL_REPOSITORY_BOUNDARY.repositoryRoot(root), realpathSync(root));
  assert.deepEqual(REAL_REPOSITORY_BOUNDARY.runtimeStatus(root, '.tmp/review'), {
    ignored: true,
    tracked: false,
  });
  assert.deepEqual(REAL_REPOSITORY_BOUNDARY.identity(root), {
    branch: 'trunk',
    head: initialCommit,
  });

  const artifact = REAL_REPOSITORY_BOUNDARY.trackedArtifact(root, 'docs/artifact.md');
  assert.equal(artifact.worktree.toString(), '# Artifact\n\nRevision one.\n');
  assert.equal(artifact.index.toString(), artifact.worktree.toString());
  assert.equal(artifact.head.toString(), artifact.worktree.toString());
  assert.equal(artifact.commit, initialCommit);
  assert.match(artifact.blob, /^[a-f0-9]{40}$/);

  assert.deepEqual(REAL_REPOSITORY_BOUNDARY.resolveReachableCommit(root, 'HEAD'), {
    commit: initialCommit,
    reachable: true,
  });
  assert.deepEqual(REAL_REPOSITORY_BOUNDARY.resolveReachableCommit(root, 'missing-revision'), {
    commit: null,
    reachable: false,
  });
  assert.deepEqual(
    REAL_REPOSITORY_BOUNDARY.committedArtifact(root, initialCommit, 'docs/artifact.md'),
    {
      bytes: artifact.worktree,
      blob: artifact.blob,
    }
  );
});

test('real repository boundary invokes Git without a shell', () => {
  const calls = [];
  const boundary = createRealRepositoryBoundary({
    execFileSyncImpl(command, args, options) {
      calls.push({ command, args, options });
      return execFileSync(command, args, options);
    },
  });
  const { root, initialCommit } = repositoryFixture();

  boundary.repositoryRoot(root);
  boundary.runtimeStatus(root, '.tmp/review');
  boundary.trackedArtifact(root, 'docs/artifact.md');
  boundary.resolveReachableCommit(root, initialCommit);
  boundary.committedArtifact(root, initialCommit, 'docs/artifact.md');
  boundary.identity(root);

  assert.ok(calls.some(({ args }) => args.join(' ') === 'rev-parse --show-toplevel'));
  assert.ok(calls.some(({ args }) => args.join(' ') === 'check-ignore --quiet -- .tmp/review'));
  assert.ok(calls.some(({ args }) => args.join(' ') === 'ls-files --error-unmatch -- .tmp/review'));
  assert.ok(calls.some(({ args }) => args.join(' ') === 'show :docs/artifact.md'));
  assert.ok(
    calls.some(({ args }) => args.join(' ') === `merge-base --is-ancestor ${initialCommit} HEAD`)
  );
  assert.ok(calls.every(({ command, options }) => command === 'git' && options.shell === false));
  assert.equal(
    calls.find(({ args }) => args.join(' ') === 'show :docs/artifact.md').options.encoding,
    null
  );
});
