// @story #1292
// @slow-parallel-safe (uses process-local temporary repositories and injected boundaries)

import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';
import test from 'node:test';

import '../../fixtures/co-review-e2e-cases.mjs';
import { mkdtempOutsideRepo } from '../../../task-tracker/lib/scratch-dir.mjs';
import {
  cleanupTemporaryRoots,
  commitArtifact,
  git,
  profiledSession,
  realInitializedProtocol,
  repositoryFixture,
  runCliDirect,
} from '../../fixtures/co-review-fixture.mjs';
import { prepareArchive, publishPreparedArchive } from '../../../review/lib/archive.mjs';
import {
  createRealRepositoryBoundary,
  REAL_REPOSITORY_BOUNDARY,
} from '../../../review/lib/repository-boundary.mjs';
import { startProtocol } from '../../../review/lib/start.mjs';
import {
  claimTurn,
  continueProtocol,
  handoffOwner,
  handoffReviewer,
  initializeProtocol,
  registerSupplement,
  setMaxReviewTurns,
  statusProtocol,
  validatedArchiveSnapshot,
  waitForTurn,
} from '../../../review/lib/protocol.mjs';

test.afterEach(cleanupTemporaryRoots);

test('real repository boundary normalizes repository observations', () => {
  const { root, initialCommit } = repositoryFixture();

  assert.equal(REAL_REPOSITORY_BOUNDARY.repositoryRoot(root), realpathSync(root));
  assert.deepEqual(REAL_REPOSITORY_BOUNDARY.runtimeStatus(root, '.scratch/review'), {
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

  assert.deepEqual(REAL_REPOSITORY_BOUNDARY.trackedChanges(root), []);
  writeFileSync(path.join(root, 'docs/artifact.md'), '# Dirty tracked artifact\n');
  assert.deepEqual(REAL_REPOSITORY_BOUNDARY.trackedChanges(root), ['docs/artifact.md']);

  const secondCommit = commitArtifact(root, '# Artifact\n\nRevision two.\n');
  assert.deepEqual(
    REAL_REPOSITORY_BOUNDARY.changedPathsBetween(root, initialCommit, secondCommit),
    ['docs/artifact.md']
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
  boundary.runtimeStatus(root, '.scratch/review');
  boundary.trackedArtifact(root, 'docs/artifact.md');
  boundary.resolveReachableCommit(root, initialCommit);
  boundary.committedArtifact(root, initialCommit, 'docs/artifact.md');
  boundary.identity(root);

  assert.ok(calls.some(({ args }) => args.join(' ') === 'rev-parse --show-toplevel'));
  assert.ok(calls.some(({ args }) => args.join(' ') === 'check-ignore --quiet -- .scratch/review'));
  assert.ok(
    calls.some(({ args }) => args.join(' ') === 'ls-files --error-unmatch -- .scratch/review')
  );
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

test('every command refuses a sibling linked-worktree runtime', () => {
  const main = repositoryFixture();
  const linked = path.join(main.root, '.worktrees', 'reviewer');
  mkdirSync(path.dirname(linked), { recursive: true });
  git(main.root, 'worktree', 'add', '-b', 'reviewer-branch', linked);
  initializeProtocol({
    cwd: linked,
    dir: '.scratch/review',
    artifact: main.artifact,
    owner: 'owner-agent',
    reviewer: 'reviewer-agent',
    maxReviewTurns: 2,
  });
  assert.throws(
    () => statusProtocol({ cwd: main.root, dir: path.join(linked, '.scratch/review') }),
    /co-review:repository-identity/
  );
  assert.throws(
    () =>
      claimTurn({
        cwd: main.root,
        dir: path.join(linked, '.scratch/review'),
        actor: 'owner-agent',
      }),
    /co-review:repository-identity/
  );
});

test('initialization refuses a nested worktree runtime before the folder exists', () => {
  const main = repositoryFixture();
  const linked = path.join(main.root, '.worktrees', 'nested-reviewer');
  mkdirSync(path.dirname(linked), { recursive: true });
  git(main.root, 'worktree', 'add', '-b', 'nested-reviewer-branch', linked);
  const runtime = path.join(linked, '.tmp', 'not-created');

  assert.throws(
    () =>
      initializeProtocol({
        cwd: main.root,
        dir: runtime,
        artifact: main.artifact,
        owner: 'owner-agent',
        reviewer: 'reviewer-agent',
        maxReviewTurns: 2,
      }),
    /co-review:repository-identity/
  );
  assert.equal(existsSync(runtime), false);
});

function protocolBytes(root, dir) {
  return {
    state: readFileSync(path.join(root, dir, 'state.json')),
    events: readFileSync(path.join(root, dir, 'events.jsonl')),
  };
}

test('every protocol command refuses absolute and relative foreign runtimes before writing', async () => {
  const main = repositoryFixture();
  const linked = path.join(main.root, '.worktrees', 'command-reviewer');
  mkdirSync(path.dirname(linked), { recursive: true });
  git(main.root, 'worktree', 'add', '-b', 'command-reviewer-branch', linked);
  const sibling = repositoryFixture();
  const dir = '.scratch/review';
  for (const root of [linked, sibling.root]) {
    initializeProtocol({
      cwd: root,
      dir,
      artifact: main.artifact,
      owner: 'owner-agent',
      reviewer: 'reviewer-agent',
      maxReviewTurns: 2,
    });
  }
  const relativeSibling = path.relative(main.root, path.join(sibling.root, dir));
  assert.equal(path.resolve(main.root, relativeSibling), path.join(sibling.root, dir));

  for (const target of [
    { label: 'absolute linked worktree', root: linked, runtime: path.join(linked, dir) },
    { label: 'relative sibling repository', root: sibling.root, runtime: relativeSibling },
  ]) {
    const runtimeFile = (name) => path.join(target.runtime, name);
    const archiveDir = 'docs/reviews/foreign-runtime';
    const cliFailure = async (args) => {
      const result = await runCliDirect(args, {
        cwd: main.root,
        resolveGitHubLoginImpl: () => 'human-agent',
      });
      if (result.status !== 0) throw new Error(result.stderr);
      return result;
    };
    const commands = [
      {
        name: 'init',
        invoke: () =>
          initializeProtocol({
            cwd: main.root,
            dir: target.runtime,
            artifact: main.artifact,
            owner: 'owner-agent',
            reviewer: 'reviewer-agent',
            maxReviewTurns: 2,
          }),
      },
      {
        name: 'start',
        invoke: () =>
          startProtocol({
            cwd: main.root,
            dir: target.runtime,
            artifact: main.artifact,
            owner: 'owner-agent',
            reviewer: 'reviewer-agent',
            maxReviewTurns: 2,
          }),
      },
      { name: 'status', invoke: () => statusProtocol({ cwd: main.root, dir: target.runtime }) },
      {
        name: 'claim',
        invoke: () => claimTurn({ cwd: main.root, dir: target.runtime, actor: 'owner-agent' }),
      },
      {
        name: 'wait',
        invoke: () =>
          waitForTurn({
            cwd: main.root,
            dir: target.runtime,
            actor: 'owner-agent',
            timeoutSeconds: 0,
          }),
      },
      {
        name: 'owner handoff',
        invoke: () =>
          handoffOwner({
            cwd: main.root,
            dir: target.runtime,
            actor: 'owner-agent',
            response: runtimeFile('owner-response.md'),
            artifact: main.artifact,
            commit: main.initialCommit,
            message: 'foreign owner handoff',
          }),
      },
      {
        name: 'reviewer handoff',
        invoke: () =>
          handoffReviewer({
            cwd: main.root,
            dir: target.runtime,
            actor: 'reviewer-agent',
            review: runtimeFile('review.md'),
            reviewOf: main.initialCommit,
            decision: 'accepted',
            message: 'foreign reviewer handoff',
          }),
      },
      {
        name: 'set-max-turns',
        invoke: () =>
          setMaxReviewTurns({
            cwd: main.root,
            dir: target.runtime,
            requestedMax: 3,
            humanLogin: 'human-agent',
          }),
      },
      {
        name: 'supplement',
        invoke: () =>
          registerSupplement({
            cwd: main.root,
            dir: target.runtime,
            file: runtimeFile('supplement.md'),
            humanLogin: 'human-agent',
          }),
      },
      {
        name: 'continue',
        invoke: () =>
          continueProtocol({
            cwd: main.root,
            dir: target.runtime,
            additionalTurns: 1,
            humanLogin: 'human-agent',
          }),
      },
      {
        name: 'human-good-enough finalization',
        invoke: () =>
          cliFailure([
            'finalize',
            '--dir',
            target.runtime,
            '--good-enough',
            '--archive-dir',
            archiveDir,
          ]),
      },
      {
        name: 'archive finalization',
        invoke: () =>
          cliFailure(['finalize', '--dir', target.runtime, '--archive-dir', archiveDir]),
      },
      {
        name: 'validated archive snapshot',
        invoke: () => validatedArchiveSnapshot({ cwd: main.root, dir: target.runtime }),
      },
    ];

    for (const command of commands) {
      const before = protocolBytes(target.root, dir);
      await assert.rejects(
        async () => command.invoke(),
        /co-review:repository-identity/,
        `${target.label}: ${command.name}`
      );
      assert.deepEqual(protocolBytes(target.root, dir), before, command.name);
      for (const generated of ['author-handoff.md', 'reviewer-handoff.md', 'start-manifest.json']) {
        assert.equal(existsSync(path.join(target.root, dir, generated)), false, command.name);
      }
      assert.equal(existsSync(path.join(target.root, archiveDir)), false, command.name);
    }
  }
});

test('absolute runtime refuses another repository and recorded-root substitution', () => {
  const caller = repositoryFixture();
  const foreign = repositoryFixture();
  const dir = '.scratch/review';
  initializeProtocol({
    cwd: foreign.root,
    dir,
    artifact: foreign.artifact,
    owner: 'owner-agent',
    reviewer: 'reviewer-agent',
    maxReviewTurns: 2,
  });
  assert.throws(
    () => statusProtocol({ cwd: caller.root, dir: path.join(foreign.root, dir) }),
    /co-review:repository-identity/
  );

  const linked = path.join(caller.root, '.tmp', 'substitution-worktree');
  mkdirSync(path.dirname(linked), { recursive: true });
  git(caller.root, 'worktree', 'add', '-b', 'substitution-branch', linked);
  initializeProtocol({
    cwd: linked,
    dir,
    artifact: caller.artifact,
    owner: 'owner-agent',
    reviewer: 'reviewer-agent',
    maxReviewTurns: 2,
  });
  const statePath = path.join(linked, dir, 'state.json');
  const state = JSON.parse(readFileSync(statePath, 'utf8'));
  writeFileSync(
    statePath,
    `${JSON.stringify({ ...state, repositoryRoot: caller.root, worktree: caller.root }, null, 2)}\n`
  );
  assert.throws(
    () => statusProtocol({ cwd: caller.root, dir: path.join(linked, dir) }),
    /co-review:repository-identity/
  );
});

test('real protocol refuses symlink escape and ignored or untracked violations', (t) => {
  const escaped = repositoryFixture();
  const outside = mkdtempOutsideRepo('aitm-co-review-boundary-outside-');
  t.after(() => rmSync(outside, { recursive: true, force: true }));
  mkdirSync(path.join(escaped.root, '.tmp'), { recursive: true });
  symlinkSync(outside, path.join(escaped.root, '.scratch/review'), 'dir');
  assert.throws(
    () =>
      initializeProtocol({
        cwd: escaped.root,
        dir: '.scratch/review',
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
        dir: '.scratch/review',
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
        dir: '.scratch/review',
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
  mkdirSync(path.join(target.root, '.scratch/review'), { recursive: true });
  writeFileSync(path.join(target.root, '.scratch/review/r1.md'), '# Review\n');
  assert.throws(
    () =>
      initializeProtocol({
        cwd: target.root,
        dir: '.scratch/review',
        artifact: target.artifact,
        owner: 'owner-agent',
        reviewer: 'reviewer-agent',
        maxReviewTurns: 2,
        importReview: '.scratch/review/r1.md',
        reviewOf: foreignCommit,
      }),
    /co-review:git-commit-unreachable/
  );
});

test('real repository boundary publishes one representative terminal archive', async () => {
  const fixture = await realInitializedProtocol({ maxReviewTurns: 2 });
  const { api, root, options, initialCommit } = fixture;
  api.claimTurn({
    cwd: root,
    dir: options.dir,
    actor: options.owner,
    ...profiledSession('owner'),
  });
  const response = `${options.dir}/owner-response.md`;
  writeFileSync(path.join(root, response), '# Owner response\n\nReady.\n');
  api.handoffOwner({
    cwd: root,
    dir: options.dir,
    actor: options.owner,
    ...profiledSession('owner'),
    response,
    artifact: options.artifact,
    commit: initialCommit,
    message: 'ready for review',
  });
  api.claimTurn({
    cwd: root,
    dir: options.dir,
    actor: options.reviewer,
    ...profiledSession('reviewer'),
  });
  const review = `${options.dir}/review.md`;
  writeFileSync(path.join(root, review), '# Review\n\nAccepted.\n');
  api.handoffReviewer({
    cwd: root,
    dir: options.dir,
    actor: options.reviewer,
    ...profiledSession('reviewer'),
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
  assert.equal(prepared.manifest.artifact.mode, 'reference');
  assert.equal(prepared.manifest.artifact.sourcePath, options.artifact);
  assert.equal(prepared.manifest.artifact.acceptedCommit, initialCommit);
  assert.equal(
    prepared.manifest.artifact.gitBlob,
    REAL_REPOSITORY_BOUNDARY.committedArtifact(root, initialCommit, options.artifact).blob
  );
  assert.match(prepared.manifest.artifact.sha256, /^sha256:[a-f0-9]{64}$/);
  assert.equal('archivePath' in prepared.manifest.artifact, false);
  assert.deepEqual([...published.paths].sort(), [
    'README.md',
    'artifact-r3-owner-owner-agent-response.md',
    'artifact-r3-reviewer-reviewer-agent-review.md',
  ]);
});
