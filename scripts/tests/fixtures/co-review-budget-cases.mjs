// @story #1268

import assert from 'node:assert/strict';
import { existsSync, mkdirSync, readFileSync, symlinkSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';

import {
  planAbsoluteBudget,
  planContinuationBudget,
  reviewBudgetFloor,
} from '../../review/lib/budget.mjs';
import { resolveGitHubLogin } from '../../review/lib/github-identity.mjs';
import { resolveArchiveDestination } from '../../review/lib/archive.mjs';
import {
  initializedProtocol,
  memoryProtocol,
  memoryRepositoryFixture,
  readEvents,
  rewriteProtocolState,
  runCliDirect,
  snapshotProtocol,
  temporaryRoot,
} from './co-review-fixture.mjs';

test('absolute budget planning applies owner and reviewer turn floors', () => {
  const state = { reviewTurnsUsed: 2, maxReviewTurns: 6 };
  assert.equal(reviewBudgetFloor(state, 'owner'), 2);
  assert.equal(reviewBudgetFloor(state, 'reviewer'), 3);
  assert.deepEqual(planAbsoluteBudget(state, 0, 'reviewer'), {
    priorMax: 6,
    requestedMax: 0,
    effectiveMax: 3,
    reviewTurnsUsed: 2,
    remainingReviewTurns: 1,
  });
  assert.deepEqual(planAbsoluteBudget(state, 8, 'owner'), {
    priorMax: 6,
    requestedMax: 8,
    effectiveMax: 8,
    reviewTurnsUsed: 2,
    remainingReviewTurns: 6,
  });
  assert.deepEqual(planAbsoluteBudget(state, 2, 'owner'), {
    priorMax: 6,
    requestedMax: 2,
    effectiveMax: 2,
    reviewTurnsUsed: 2,
    remainingReviewTurns: 0,
  });
  for (const [candidate, role] of [
    [-1, 'owner'],
    [1.5, 'owner'],
    [1, 'agent'],
  ]) {
    assert.throws(() => planAbsoluteBudget(state, candidate, role), RangeError);
  }
});

test('continuation planning derives role floors and adapts legacy additional turns', () => {
  const state = { reviewTurnsUsed: 2, maxReviewTurns: 5 };
  assert.deepEqual(planContinuationBudget(state, { resumeRole: 'owner' }), {
    priorMax: 5,
    requestedMax: 2,
    effectiveMax: 2,
    reviewTurnsUsed: 2,
    remainingReviewTurns: 0,
  });
  assert.deepEqual(planContinuationBudget(state, { resumeRole: 'reviewer' }), {
    priorMax: 5,
    requestedMax: 3,
    effectiveMax: 3,
    reviewTurnsUsed: 2,
    remainingReviewTurns: 1,
  });
  assert.equal(
    planContinuationBudget(state, { resumeRole: 'reviewer', maxReviewTurns: 1 }).effectiveMax,
    3
  );
  assert.equal(
    planContinuationBudget(state, { resumeRole: 'owner', additionalTurns: 4 }).requestedMax,
    9
  );
  assert.throws(
    () =>
      planContinuationBudget(state, {
        resumeRole: 'owner',
        maxReviewTurns: 4,
        additionalTurns: 1,
      }),
    /mutually exclusive/
  );
});

test('GitHub identity resolution uses only the authenticated-login command', () => {
  const root = temporaryRoot();
  const login = resolveGitHubLogin({
    cwd: root,
    recoveryCommand: 'npx aitm co-review set-max-turns --dir .scratch/review --max-turns 3',
    execFileSyncImpl(command, args) {
      assert.equal(command, 'gh');
      assert.deepEqual(args, ['api', 'user', '--jq', '.login']);
      return 'kendrick\n';
    },
  });
  assert.equal(login, 'kendrick');
});

test('GitHub identity failures preserve cause and print authenticate-then-rerun recovery', () => {
  const recoveryCommand = 'npx aitm co-review set-max-turns --dir .scratch/review --max-turns 3';
  for (const execute of [
    () => ' \n',
    () => {
      throw new Error('offline');
    },
  ]) {
    let failure;
    try {
      resolveGitHubLogin({ recoveryCommand, execFileSyncImpl: execute });
    } catch (error) {
      failure = error;
    }
    assert.equal(failure?.code, 'github-identity');
    assert.equal(failure?.exitCode, 1);
    assert.match(failure?.message, /authenticate the configured gh CLI/);
    assert.match(
      failure?.message,
      new RegExp(recoveryCommand.replaceAll(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    );
    if (failure?.cause) assert.match(failure.cause.message, /offline/);
  }
});

test('archive destination normalization accepts an uncreated tracked path without writing', async () => {
  const { root, options, repository } = await initializedProtocol();
  const before = snapshotProtocol(root, options.dir);
  const destination = resolveArchiveDestination({
    cwd: root,
    archiveDir: 'docs/superpowers/reviews/1268/session-1',
    runtimeDir: options.dir,
    repository,
  });
  assert.equal(destination.relative, 'docs/superpowers/reviews/1268/session-1');
  assert.equal(destination.absolute, path.join(root, 'docs/superpowers/reviews/1268/session-1'));
  assert.equal(existsSync(destination.absolute), false);
  assert.deepEqual(snapshotProtocol(root, options.dir), before);
});

test('archive destination refusals cannot escape, use ignored/runtime paths, or write', async () => {
  const cases = [
    { archiveDir: '../archive', expected: /path-outside-repository/ },
    { archiveDir: '.scratch/review', expected: /archive-runtime-conflict/ },
    { archiveDir: '.scratch/archive', expected: /archive-ignored/ },
  ];
  for (const { archiveDir, expected } of cases) {
    const { root, options, repository } = await initializedProtocol();
    const before = snapshotProtocol(root, options.dir);
    assert.throws(
      () =>
        resolveArchiveDestination({
          cwd: root,
          archiveDir,
          runtimeDir: options.dir,
          repository,
        }),
      expected
    );
    assert.deepEqual(snapshotProtocol(root, options.dir), before);
  }

  const { root, options, repository } = await initializedProtocol();
  const outside = temporaryRoot('aitm-co-review-archive-outside-');
  symlinkSync(outside, path.join(root, 'docs/outside'), 'dir');
  const before = snapshotProtocol(root, options.dir);
  assert.throws(
    () =>
      resolveArchiveDestination({
        cwd: root,
        archiveDir: 'docs/outside/archive',
        runtimeDir: options.dir,
        repository,
      }),
    /path-outside-repository/
  );
  assert.equal(existsSync(path.join(outside, 'archive')), false);
  assert.deepEqual(snapshotProtocol(root, options.dir), before);
});

test('initialization records a normalized archive destination but still rejects zero', async () => {
  const configured = memoryRepositoryFixture();
  const configuredApi = await memoryProtocol(configured.repository);
  const state = configuredApi.initializeProtocol({
    cwd: configured.root,
    dir: '.scratch/review',
    artifact: configured.artifact,
    owner: 'owner-agent',
    reviewer: 'reviewer-agent',
    maxReviewTurns: 6,
    archiveDir: 'docs/reviews/session',
  });
  assert.equal(state.initialization.archiveDir, 'docs/reviews/session');

  const zero = memoryRepositoryFixture();
  const zeroApi = await memoryProtocol(zero.repository);
  assert.throws(
    () =>
      zeroApi.initializeProtocol({
        cwd: zero.root,
        dir: '.scratch/review',
        artifact: zero.artifact,
        owner: 'owner-agent',
        reviewer: 'reviewer-agent',
        maxReviewTurns: 0,
        archiveDir: 'docs/reviews/session',
      }),
    /co-review:max-turns/
  );
});

test('active owner budget adjustment records provenance and preserves the turn', async () => {
  const { api, root, options } = await initializedProtocol();
  const beforeState = api.readProtocol({ cwd: root, dir: options.dir });
  const adjusted = api.setMaxReviewTurns({
    cwd: root,
    dir: options.dir,
    requestedMax: 0,
    humanLogin: 'kendrick',
  });
  for (const field of [
    'currentRole',
    'turnState',
    'claim',
    'round',
    'artifact',
    'immutableArtifacts',
  ]) {
    assert.deepEqual(adjusted[field], beforeState[field], field);
  }
  assert.equal(adjusted.maxReviewTurns, 0);
  assert.equal(adjusted.remainingReviewTurns, 0);
  assert.deepEqual(readEvents(root, options.dir).at(-1).adjustment, {
    priorMax: 6,
    requestedMax: 0,
    effectiveMax: 0,
    reviewTurnsUsed: 0,
    remainingReviewTurns: 0,
    approvedBy: 'kendrick',
  });
});

test('reviewer available and claimed adjustments clamp below the in-progress turn', async () => {
  for (const claimed of [false, true]) {
    const { api, root, options, initialCommit } = await initializedProtocol();
    api.profiledClaimTurn({ cwd: root, dir: options.dir, actor: 'owner-agent' });
    const response = `${options.dir}/owner-response.md`;
    writeFileSync(path.join(root, response), '# Owner response\n\nReady.\n');
    api.profiledHandoffOwner({
      cwd: root,
      dir: options.dir,
      actor: 'owner-agent',
      response,
      artifact: options.artifact,
      commit: initialCommit,
      message: 'ready',
    });
    if (claimed) api.profiledClaimTurn({ cwd: root, dir: options.dir, actor: 'reviewer-agent' });
    const before = api.readProtocol({ cwd: root, dir: options.dir });
    const adjusted = api.setMaxReviewTurns({
      cwd: root,
      dir: options.dir,
      requestedMax: 0,
      humanLogin: 'kendrick',
    });
    assert.equal(adjusted.maxReviewTurns, 1);
    assert.equal(adjusted.remainingReviewTurns, 1);
    assert.equal(adjusted.turnState, claimed ? 'claimed' : 'available');
    assert.deepEqual(adjusted.claim, before.claim);
  }
});

test('effective no-op retry preserves protocol bytes exactly', async () => {
  const { api, root, options } = await initializedProtocol();
  const before = snapshotProtocol(root, options.dir);
  const state = api.setMaxReviewTurns({
    cwd: root,
    dir: options.dir,
    requestedMax: 6,
    humanLogin: 'kendrick',
  });
  assert.equal(state.revision, 1);
  assert.deepEqual(snapshotProtocol(root, options.dir), before);
});

test('accepted, intervention, invalid identity, and mutex refusals do not mutate protocol', async () => {
  for (const lifecycle of ['accepted', 'intervention-required']) {
    const { api, root, options } = await initializedProtocol();
    rewriteProtocolState(root, options.dir, (state) => ({
      ...state,
      lifecycle,
      currentRole: null,
      turnState: null,
      claim: null,
    }));
    const before = snapshotProtocol(root, options.dir);
    assert.throws(
      () =>
        api.setMaxReviewTurns({
          cwd: root,
          dir: options.dir,
          requestedMax: 3,
          humanLogin: 'kendrick',
        }),
      /co-review:set-max-turns-state/
    );
    assert.deepEqual(snapshotProtocol(root, options.dir), before);
  }

  for (const input of [
    { requestedMax: -1, humanLogin: 'kendrick' },
    { requestedMax: 3, humanLogin: '' },
  ]) {
    const invalid = await initializedProtocol();
    const invalidBefore = snapshotProtocol(invalid.root, invalid.options.dir);
    assert.throws(
      () =>
        invalid.api.setMaxReviewTurns({
          cwd: invalid.root,
          dir: invalid.options.dir,
          ...input,
        }),
      /co-review:/
    );
    assert.deepEqual(snapshotProtocol(invalid.root, invalid.options.dir), invalidBefore);
  }

  const locked = await initializedProtocol();
  const lock = path.join(locked.root, locked.options.dir, '.co-review-lock');
  mkdirSync(lock);
  writeFileSync(path.join(lock, 'owner.json'), '{"actor":"other"}\n');
  const lockedBefore = snapshotProtocol(locked.root, locked.options.dir);
  assert.throws(
    () =>
      locked.api.setMaxReviewTurns({
        cwd: locked.root,
        dir: locked.options.dir,
        requestedMax: 3,
        humanLogin: 'kendrick',
      }),
    /co-review:locked/
  );
  assert.deepEqual(snapshotProtocol(locked.root, locked.options.dir), lockedBefore);
});

test('CLI parses nonnegative absolute max and resolves identity before mutation', async () => {
  const { root, options } = await initializedProtocol();
  let identityCalls = 0;
  const result = await runCliDirect(['set-max-turns', '--dir', options.dir, '--max-turns', '0'], {
    cwd: root,
    resolveGitHubLoginImpl(identityOptions) {
      identityCalls += 1;
      assert.match(identityOptions.recoveryCommand, /set-max-turns.*--max-turns 0/);
      return 'kendrick';
    },
  });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(identityCalls, 1);
  assert.equal(JSON.parse(result.stdout).maxReviewTurns, 0);

  const before = snapshotProtocol(root, options.dir);
  const invalid = await runCliDirect(['set-max-turns', '--dir', options.dir, '--max-turns', '-1'], {
    cwd: root,
    resolveGitHubLoginImpl() {
      throw new Error('identity must not be reached');
    },
  });
  assert.equal(invalid.status, 2, invalid.stderr);
  assert.deepEqual(snapshotProtocol(root, options.dir), before);

  const identityFailure = await runCliDirect(
    ['set-max-turns', '--dir', options.dir, '--max-turns', '1'],
    {
      cwd: root,
      resolveGitHubLoginImpl() {
        const error = new Error('co-review:github-identity:offline; no state changed');
        error.exitCode = 1;
        throw error;
      },
    }
  );
  assert.equal(identityFailure.status, 1);
  assert.match(identityFailure.stderr, /github-identity/);
  assert.deepEqual(snapshotProtocol(root, options.dir), before);
});
