// @story #1292
// @slow-parallel-safe (uses process-local temporary repositories and injected boundaries)

import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, realpathSync, symlinkSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';

import '../../fixtures/co-review-e2e-cases.mjs';
import {
  cleanupTemporaryRoots,
  commitArtifact,
  git,
  realInitializedProtocol,
  repositoryFixture,
  temporaryRoot,
} from '../../fixtures/co-review-fixture.mjs';
import { prepareArchive, publishPreparedArchive } from '../../../review/lib/archive.mjs';
import {
  createRealRepositoryBoundary,
  REAL_REPOSITORY_BOUNDARY,
} from '../../../review/lib/repository-boundary.mjs';
import { initializeProtocol } from '../../../review/lib/protocol.mjs';

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

test('real protocol refuses symlink escape and ignored or untracked violations', () => {
  const escaped = repositoryFixture();
  const outside = temporaryRoot('aitm-co-review-boundary-outside-');
  mkdirSync(path.join(escaped.root, '.tmp'), { recursive: true });
  symlinkSync(outside, path.join(escaped.root, '.tmp/review'), 'dir');
  assert.throws(
    () =>
      initializeProtocol({
        cwd: escaped.root,
        dir: '.tmp/review',
        artifact: escaped.artifact,
        owner: 'owner-agent',
        reviewer: 'reviewer-agent',
        maxReviewTurns: 2,
      }),
    /co-review:path-outside-repository:dir/
  );

  const unignored = repositoryFixture();
  assert.throws(
    () =>
      initializeProtocol({
        cwd: unignored.root,
        dir: 'review-state',
        artifact: unignored.artifact,
        owner: 'owner-agent',
        reviewer: 'reviewer-agent',
        maxReviewTurns: 2,
      }),
    /co-review:runtime-not-ignored/
  );

  const untracked = repositoryFixture();
  writeFileSync(path.join(untracked.root, 'docs/untracked.md'), '# Untracked\n');
  assert.throws(
    () =>
      initializeProtocol({
        cwd: untracked.root,
        dir: '.tmp/review',
        artifact: 'docs/untracked.md',
        owner: 'owner-agent',
        reviewer: 'reviewer-agent',
        maxReviewTurns: 2,
      }),
    /co-review:artifact-untracked/
  );
});

test('real protocol refuses index or HEAD drift and unreachable publication commits', () => {
  const indexed = repositoryFixture();
  writeFileSync(path.join(indexed.root, indexed.artifact), '# Indexed drift\n');
  git(indexed.root, 'add', indexed.artifact);
  assert.throws(
    () =>
      initializeProtocol({
        cwd: indexed.root,
        dir: '.tmp/review',
        artifact: indexed.artifact,
        owner: 'owner-agent',
        reviewer: 'reviewer-agent',
        maxReviewTurns: 2,
      }),
    /co-review:artifact-drift/
  );

  const target = repositoryFixture();
  const foreign = repositoryFixture();
  const foreignCommit = commitArtifact(foreign.root, '# Foreign publication\n');
  git(target.root, 'fetch', foreign.root, foreignCommit);
  mkdirSync(path.join(target.root, '.tmp/review'), { recursive: true });
  writeFileSync(path.join(target.root, '.tmp/review/r1.md'), '# Review\n');
  assert.throws(
    () =>
      initializeProtocol({
        cwd: target.root,
        dir: '.tmp/review',
        artifact: target.artifact,
        owner: 'owner-agent',
        reviewer: 'reviewer-agent',
        maxReviewTurns: 2,
        importReview: '.tmp/review/r1.md',
        reviewOf: foreignCommit,
      }),
    /co-review:git-commit-unreachable/
  );
});

test('real repository boundary publishes one representative terminal archive', async () => {
  const fixture = await realInitializedProtocol({ maxReviewTurns: 2 });
  const { api, root, options, initialCommit } = fixture;
  api.claimTurn({ cwd: root, dir: options.dir, actor: options.owner });
  const response = `${options.dir}/owner-response.md`;
  writeFileSync(path.join(root, response), '# Owner response\n\nReady.\n');
  api.handoffOwner({
    cwd: root,
    dir: options.dir,
    actor: options.owner,
    response,
    artifact: options.artifact,
    commit: initialCommit,
    message: 'ready for review',
  });
  api.claimTurn({ cwd: root, dir: options.dir, actor: options.reviewer });
  const review = `${options.dir}/review.md`;
  writeFileSync(path.join(root, review), '# Review\n\nAccepted.\n');
  api.handoffReviewer({
    cwd: root,
    dir: options.dir,
    actor: options.reviewer,
    review,
    reviewOf: initialCommit,
    decision: 'accepted',
    message: 'accepted',
  });

  const snapshot = api.validatedArchiveSnapshot({ cwd: root, dir: options.dir });
  const prepared = prepareArchive({
    ...snapshot,
    archiveDir: 'docs/reviews/real-boundary',
  });
  const published = publishPreparedArchive(prepared);

  assert.equal(published.status, 'published');
  assert.deepEqual([...published.paths].sort(), [
    'README.md',
    'artifact-artifact.md',
    'artifact-r3-owner-owner-agent-response.md',
    'artifact-r3-reviewer-reviewer-agent-review.md',
  ]);
});
