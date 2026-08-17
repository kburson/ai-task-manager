// @story #1292

import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';

import {
  cleanupTemporaryRoots,
  memoryProtocol,
  memoryRepositoryFixture,
  readEvents,
  runCliDirect,
} from '../../fixtures/co-review-fixture.mjs';

test.afterEach(cleanupTemporaryRoots);

test('memory fixture completes a protocol without Git or Node subprocesses', async () => {
  const fixture = memoryRepositoryFixture();
  const api = await memoryProtocol(fixture.repository);
  const options = {
    cwd: fixture.root,
    dir: '.tmp/review',
    artifact: fixture.artifact,
    owner: 'owner-agent',
    reviewer: 'reviewer-agent',
    maxReviewTurns: 2,
  };

  api.initializeProtocol(options);
  api.claimTurn({ cwd: fixture.root, dir: options.dir, actor: options.owner });
  mkdirSync(path.join(fixture.root, options.dir), { recursive: true });
  writeFileSync(path.join(fixture.root, options.dir, 'owner-response.md'), '# Ready\n');
  api.handoffOwner({
    cwd: fixture.root,
    dir: options.dir,
    actor: options.owner,
    response: `${options.dir}/owner-response.md`,
    artifact: options.artifact,
    commit: fixture.initialCommit,
    message: 'ready for review',
  });
  api.claimTurn({ cwd: fixture.root, dir: options.dir, actor: options.reviewer });
  writeFileSync(path.join(fixture.root, options.dir, 'review.md'), '# Review\n\nAccepted.\n');
  const state = api.handoffReviewer({
    cwd: fixture.root,
    dir: options.dir,
    actor: options.reviewer,
    review: `${options.dir}/review.md`,
    reviewOf: fixture.initialCommit,
    decision: 'accepted',
    message: 'accepted',
  });

  assert.equal(state.lifecycle, 'accepted');
  assert.deepEqual(
    readEvents(fixture.root, options.dir).map(({ type }) => type),
    ['init', 'claim', 'owner-handoff', 'claim', 'reviewer-handoff']
  );
  assert.deepEqual(fixture.processCalls, { git: 0, nodeCli: 0 });

  const direct = await runCliDirect(['status', '--dir', options.dir, '--json'], {
    cwd: fixture.root,
    repository: fixture.repository,
  });
  assert.equal(direct.status, 0, direct.stderr);
  assert.equal(JSON.parse(direct.stdout).lifecycle, 'accepted');
});

test('memory repository models identity, publication, reachability, and drift', () => {
  const { repository, root, artifact, initialCommit } = memoryRepositoryFixture();
  const initial = repository.trackedArtifact(root, artifact);

  assert.deepEqual(repository.identity(root), { branch: 'trunk', head: initialCommit });
  assert.deepEqual(repository.runtimeStatus(root, '.tmp/review'), {
    ignored: true,
    tracked: false,
  });
  assert.deepEqual(repository.resolveReachableCommit(root, initialCommit), {
    commit: initialCommit,
    reachable: true,
  });
  assert.deepEqual(repository.committedArtifact(root, initialCommit, artifact), {
    bytes: initial.head,
    blob: initial.blob,
  });

  repository.setIndex(artifact, Buffer.from('# Index drift\n'));
  assert.notDeepEqual(repository.trackedArtifact(root, artifact).index, initial.index);
  repository.setWorktree(artifact, Buffer.from('# Worktree drift\n'));
  assert.equal(
    repository.trackedArtifact(root, artifact).worktree.toString(),
    '# Worktree drift\n'
  );

  const next = repository.commit(artifact, Buffer.from('# Published\n'), 'publish artifact');
  assert.notEqual(next, initialCommit);
  assert.deepEqual(repository.resolveReachableCommit(root, initialCommit), {
    commit: initialCommit,
    reachable: true,
  });
  assert.equal(
    repository.committedArtifact(root, next, artifact).bytes.toString(),
    '# Published\n'
  );
});
