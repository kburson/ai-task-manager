// @story #1266

import assert from 'node:assert/strict';
import { existsSync, mkdirSync, readFileSync, symlinkSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';

import {
  commitArtifact,
  initializedProtocol,
  memoryProtocol,
  memoryRepositoryFixture,
  reviewerTurn,
  rewriteProtocolState,
  runCliDirect,
  snapshotProtocol,
} from './co-review-fixture.mjs';

const TRACKED_HANDOFF_DRIFT_CASES = [
  ['staged tracked drift', stageTrackedFile],
  ['unstaged tracked drift', editTrackedFile],
  ['runtime force-added to index', forceAddRuntime],
];

function stageTrackedFile({ repository }) {
  repository.setIndex('README.md', Buffer.from('# Staged tracked drift\n'));
}

function editTrackedFile({ repository }) {
  repository.setWorktree('README.md', Buffer.from('# Unstaged tracked drift\n'));
}

function forceAddRuntime({ repository, root, options }) {
  const relative = `${options.dir}/force-added.txt`;
  const bytes = Buffer.from('force-added runtime evidence\n');
  writeFileSync(path.join(root, relative), bytes);
  repository.setIndex(relative, bytes);
}

async function initializedTrackedProtocol() {
  const fixture = memoryRepositoryFixture();
  const baselineCommit = fixture.repository.commit(
    'README.md',
    Buffer.from('# Co-review fixture\n'),
    'track README'
  );
  const api = await memoryProtocol(fixture.repository);
  const options = {
    cwd: fixture.root,
    dir: '.tmp/review',
    artifact: fixture.artifact,
    owner: 'owner-agent',
    reviewer: 'reviewer-agent',
    maxReviewTurns: 2,
  };
  const state = api.initializeProtocol(options);
  return { ...fixture, api, options, state, baselineCommit };
}

async function pendingOwnerHandoff() {
  const fixture = await initializedTrackedProtocol();
  const { api, root, options, baselineCommit } = fixture;
  api.claimTurn({ cwd: root, dir: options.dir, actor: options.owner });
  const response = `${options.dir}/owner-response.md`;
  writeFileSync(path.join(root, response), '# Owner response\n\nReady.\n');
  return {
    ...fixture,
    call: {
      cwd: root,
      dir: options.dir,
      actor: options.owner,
      response,
      artifact: options.artifact,
      commit: baselineCommit,
      message: 'ready for review',
    },
  };
}

async function pendingReviewerHandoff() {
  const fixture = await pendingOwnerHandoff();
  const { api, root, options, baselineCommit } = fixture;
  api.handoffOwner(fixture.call);
  api.claimTurn({ cwd: root, dir: options.dir, actor: options.reviewer });
  const review = `${options.dir}/review.md`;
  writeFileSync(path.join(root, review), '# Review\n\nAccepted.\n');
  return {
    ...fixture,
    call: {
      cwd: root,
      dir: options.dir,
      actor: options.reviewer,
      review,
      reviewOf: baselineCommit,
      decision: 'accepted',
      message: 'accepted',
    },
  };
}

async function completedOwnerHandoff() {
  const fixture = await initializedProtocol({ imported: true });
  const { api, root, options } = fixture;
  api.claimTurn({ cwd: root, dir: options.dir, actor: options.owner });
  const commit = commitArtifact(root, '# Artifact\n\nOwner revision.\n');
  const response = `${options.dir}/owner-replay-response.md`;
  writeFileSync(
    path.join(root, response),
    '[finding:F-001] [disposition:accepted]\nRevised terminal acceptance.\n'
  );
  const call = {
    cwd: root,
    dir: options.dir,
    actor: options.owner,
    response,
    artifact: options.artifact,
    commit,
    answers: options.importReview,
    message: 'owner revision ready',
  };
  const first = api.handoffOwner(call);
  return { ...fixture, call, first, commit };
}

async function completedAcceptedReviewerHandoff() {
  const fixture = await reviewerTurn({ imported: true, maxReviewTurns: 2 });
  const { api, root, options, commit } = fixture;
  const review = `${options.dir}/accepted-replay-review.md`;
  writeFileSync(path.join(root, review), '# Review\n\nAccepted.\n');
  const call = {
    cwd: root,
    dir: options.dir,
    actor: options.reviewer,
    review,
    reviewOf: commit,
    decision: 'accepted',
    message: 'accepted',
  };
  const first = api.handoffReviewer(call);
  return { ...fixture, call, first, review };
}

async function completedChangesRequestedReviewerHandoff() {
  const fixture = await reviewerTurn({ maxReviewTurns: 2 });
  const { api, root, options, commit } = fixture;
  const review = `${options.dir}/changes-requested-replay-review.md`;
  writeFileSync(path.join(root, review), '[finding:F-002] Clarify recovery.\n');
  const call = {
    cwd: root,
    dir: options.dir,
    actor: options.reviewer,
    review,
    reviewOf: commit,
    decision: 'changes-requested',
    message: 'changes requested',
  };
  const first = api.handoffReviewer(call);
  return { ...fixture, call, first, review };
}

test('imported review requires exact HEAD even when an ancestor has identical artifact bytes', async () => {
  const fixture = memoryRepositoryFixture();
  const api = await memoryProtocol(fixture.repository);
  const commitA = fixture.initialCommit;
  const commitB = fixture.repository.commit(
    fixture.artifact,
    readFileSync(path.join(fixture.root, fixture.artifact)),
    'advance HEAD without changing artifact bytes'
  );
  assert.notEqual(commitB, commitA);
  const options = {
    cwd: fixture.root,
    dir: '.tmp/imported-head',
    artifact: fixture.artifact,
    owner: 'owner-agent',
    reviewer: 'reviewer-agent',
    maxReviewTurns: 2,
    importReview: '.tmp/imported-head/r1-review.md',
  };
  mkdirSync(path.join(fixture.root, options.dir), { recursive: true });
  writeFileSync(path.join(fixture.root, options.importReview), '# Review\n\nAccepted evidence.\n');

  assert.throws(
    () =>
      api.initializeProtocol({
        ...options,
        importReview: options.importReview,
        reviewOf: commitA,
      }),
    /co-review:import-review-head-mismatch/
  );
  assert.equal(existsSync(path.join(fixture.root, options.dir, 'state.json')), false);

  const exact = api.initializeProtocol({
    ...options,
    importReview: options.importReview,
    reviewOf: commitB,
  });
  assert.equal(exact.initialization.reviewOf, commitB);
  assert.equal(exact.lastHandoff.commit, commitB);
});

test('first owner handoff transfers a committed artifact plus immutable response', async () => {
  const { api, root, options, initialCommit } = await initializedProtocol();
  api.claimTurn({ cwd: root, dir: options.dir, actor: 'owner-agent' });
  const response = `${options.dir}/r1-owner-response.md`;
  writeFileSync(path.join(root, response), '# Owner response\n\nInitial artifact ready.\n');
  const state = api.handoffOwner({
    cwd: root,
    dir: options.dir,
    actor: 'owner-agent',
    response,
    artifact: options.artifact,
    commit: initialCommit,
    message: 'initial artifact ready',
  });
  assert.deepEqual(
    {
      currentRole: state.currentRole,
      turnState: state.turnState,
      round: state.round,
    },
    { currentRole: 'reviewer', turnState: 'available', round: 2 }
  );
  assert.equal(state.lastHandoff.commit, initialCommit);
  assert.match(state.lastHandoff.artifacts.response.sha256, /^sha256:[a-f0-9]{64}$/);
  assert.equal(state.reviewTurnsUsed, 0);
});

test('an immediate exact owner handoff retry returns persisted state without mutation', async () => {
  const fixture = await completedOwnerHandoff();
  const before = snapshotProtocol(fixture.root, fixture.options.dir);

  const replayed = fixture.api.handoffOwner({
    ...fixture.call,
    response: `./${fixture.call.response}`,
    artifact: `./${fixture.call.artifact}`,
    commit: 'HEAD',
    answers: `./${fixture.call.answers}`,
    message: '  owner revision ready  ',
  });

  assert.deepEqual(replayed, fixture.first);
  assert.deepEqual(snapshotProtocol(fixture.root, fixture.options.dir), before);
});

test('an immediate conflicting owner handoff reuse refuses without mutation', async () => {
  const fixture = await completedOwnerHandoff();
  const alternateResponse = `${fixture.options.dir}/conflicting-owner-response.md`;
  const alternateAnswers = `${fixture.options.dir}/conflicting-answers.md`;
  writeFileSync(
    path.join(fixture.root, alternateResponse),
    '[finding:F-001] [disposition:accepted]\nDifferent response evidence.\n'
  );
  writeFileSync(
    path.join(fixture.root, alternateAnswers),
    '# Review\n\n[finding:F-001] Different review evidence.\n'
  );
  const conflicts = [
    ['actor', { actor: 'different-owner' }],
    ['response artifact', { response: alternateResponse }],
    ['answered review', { answers: alternateAnswers }],
    ['message', { message: 'different owner message' }],
  ];
  const before = snapshotProtocol(fixture.root, fixture.options.dir);

  for (const [name, mutation] of conflicts) {
    assert.throws(
      () => fixture.api.handoffOwner({ ...fixture.call, ...mutation }),
      /co-review:handoff-conflict:owner/,
      name
    );
    assert.deepEqual(snapshotProtocol(fixture.root, fixture.options.dir), before, name);
  }
});

test('an invalid immediate owner replay preserves its established evidence diagnostic', async () => {
  const fixture = await completedOwnerHandoff();
  const before = snapshotProtocol(fixture.root, fixture.options.dir);

  assert.throws(
    () =>
      fixture.api.handoffOwner({
        ...fixture.call,
        response: '../outside-owner-response.md',
      }),
    /co-review:path-outside-repository:response=\.\.\/outside-owner-response\.md/
  );
  assert.deepEqual(snapshotProtocol(fixture.root, fixture.options.dir), before);
});

test('an owner replay after the reviewer claims is stale and follows ordinary role refusal', async () => {
  const fixture = await completedOwnerHandoff();
  fixture.api.claimTurn({
    cwd: fixture.root,
    dir: fixture.options.dir,
    actor: fixture.options.reviewer,
  });
  const before = snapshotProtocol(fixture.root, fixture.options.dir);

  assert.throws(() => fixture.api.handoffOwner(fixture.call), /co-review:wrong-role/);
  assert.deepEqual(snapshotProtocol(fixture.root, fixture.options.dir), before);
});

test('owner handoff requires clean staged and unstaged tracked state', async () => {
  for (const [name, mutate] of TRACKED_HANDOFF_DRIFT_CASES) {
    const fixture = await pendingOwnerHandoff();
    mutate(fixture);
    const before = snapshotProtocol(fixture.root, fixture.options.dir);
    const expected =
      name === 'runtime force-added to index'
        ? /co-review:runtime-tracked/
        : /co-review:tracked-worktree-dirty/;
    assert.throws(() => fixture.api.handoffOwner(fixture.call), expected, name);
    assert.deepEqual(snapshotProtocol(fixture.root, fixture.options.dir), before, name);
  }
});

test('reviewer handoff requires clean staged and unstaged tracked state', async () => {
  for (const [name, mutate] of TRACKED_HANDOFF_DRIFT_CASES) {
    const fixture = await pendingReviewerHandoff();
    mutate(fixture);
    const before = snapshotProtocol(fixture.root, fixture.options.dir);
    const expected =
      name === 'runtime force-added to index'
        ? /co-review:runtime-tracked/
        : /co-review:tracked-worktree-dirty/;
    assert.throws(() => fixture.api.handoffReviewer(fixture.call), expected, name);
    assert.deepEqual(snapshotProtocol(fixture.root, fixture.options.dir), before, name);
  }
});

test('owner handoff rejects a proposed commit that changes paths outside the artifact', async () => {
  const fixture = await pendingOwnerHandoff();
  const commit = fixture.repository.commitFiles(
    [
      [fixture.options.artifact, Buffer.from('# Artifact\n\nRevision two.\n')],
      ['README.md', Buffer.from('# Co-review fixture changed\n')],
    ],
    'revise artifact and README'
  );
  const before = snapshotProtocol(fixture.root, fixture.options.dir);

  assert.throws(
    () => fixture.api.handoffOwner({ ...fixture.call, commit }),
    /co-review:artifact-change-scope:README\.md/
  );
  assert.deepEqual(snapshotProtocol(fixture.root, fixture.options.dir), before);
});

test('owner handoff accepts an artifact-only commit with ignored runtime evidence', async () => {
  const fixture = await pendingOwnerHandoff();
  writeFileSync(
    path.join(fixture.root, fixture.options.dir, 'ignored-evidence.md'),
    '# Ignored runtime evidence\n'
  );
  const commit = fixture.repository.commit(
    fixture.options.artifact,
    Buffer.from('# Artifact\n\nRevision two.\n'),
    'revise artifact only'
  );

  const state = fixture.api.handoffOwner({ ...fixture.call, commit });

  assert.equal(state.artifact.commit, commit);
  assert.equal(state.currentRole, 'reviewer');
});

test('owner answers every imported finding with one supported disposition', async () => {
  const { api, root, options } = await initializedProtocol({ imported: true });
  api.claimTurn({ cwd: root, dir: options.dir, actor: 'owner-agent' });
  const commit = commitArtifact(root, '# Artifact\n\nTerminal acceptance is explicit.\n');
  const response = `${options.dir}/r2-owner-response.md`;
  writeFileSync(
    path.join(root, response),
    [
      '# Owner response',
      '',
      '[finding:F-001] [disposition:accepted-with-modification]',
      'Revised section: Terminal acceptance.',
      '',
    ].join('\n')
  );
  const state = api.handoffOwner({
    cwd: root,
    dir: options.dir,
    actor: 'owner-agent',
    response,
    artifact: options.artifact,
    commit,
    answers: options.importReview,
    message: 'R2 response and revision ready',
  });
  assert.equal(state.currentRole, 'reviewer');
  assert.equal(state.round, 3);
  assert.equal(state.artifact.commit, commit);
  assert.equal(state.lastHandoff.artifacts.answeredReview.path, options.importReview);
});

test('owner handoff rejects incomplete, invented, rejected, or deferred dispositions', async () => {
  const cases = [
    {
      body: '# Response\n',
      expected: /co-review:missing-disposition:F-001/,
    },
    {
      body: '[finding:F-001] [disposition:accepted]\n[finding:F-999] [disposition:accepted]\n',
      expected: /co-review:unknown-finding:F-999/,
    },
    {
      body: '[finding:F-001] [disposition:accepted]\n[finding:F-001] Repeated marker.\n',
      expected: /co-review:duplicate-finding:response:F-001/,
    },
    {
      body: '[finding:F-001] [disposition:accepted]\n[finding:F-999] Invented marker.\n',
      expected: /co-review:unknown-finding:F-999/,
    },
    {
      body: '[finding:F-001] [disposition:rejected]\nNo citation.\n',
      expected: /co-review:rejected-without-evidence:F-001/,
    },
    {
      body: '[finding:F-001] [disposition:deferred]\n[follow-up:#1300]\n',
      expected: /co-review:deferred-without-boundary:F-001/,
    },
  ];
  for (const { body, expected } of cases) {
    const { api, root, options } = await initializedProtocol({ imported: true });
    api.claimTurn({ cwd: root, dir: options.dir, actor: 'owner-agent' });
    const commit = commitArtifact(root, '# Artifact\n\nRevision.\n');
    const response = `${options.dir}/response.md`;
    writeFileSync(path.join(root, response), body);
    const before = snapshotProtocol(root, options.dir);
    assert.throws(
      () =>
        api.handoffOwner({
          cwd: root,
          dir: options.dir,
          actor: 'owner-agent',
          response,
          artifact: options.artifact,
          commit,
          answers: options.importReview,
          message: 'attempt',
        }),
      expected
    );
    assert.deepEqual(snapshotProtocol(root, options.dir), before);
  }
});

test('owner handoff refuses wrong path, stale commit, and artifact/index drift', async () => {
  for (const mutate of [
    ({ call }) => ({ ...call, artifact: '.gitignore' }),
    ({ call, initialCommit }) => ({ ...call, commit: initialCommit }),
    ({ call, root }) => {
      writeFileSync(path.join(root, 'docs/artifact.md'), '# Artifact\n\nDirty after commit.\n');
      return call;
    },
  ]) {
    const initialized = await initializedProtocol({ imported: true });
    const { api, root, options, initialCommit } = initialized;
    api.claimTurn({ cwd: root, dir: options.dir, actor: 'owner-agent' });
    const commit = commitArtifact(root, '# Artifact\n\nRevision.\n');
    const response = `${options.dir}/response.md`;
    writeFileSync(path.join(root, response), '[finding:F-001] [disposition:accepted]\nRevised.\n');
    const call = {
      cwd: root,
      dir: options.dir,
      actor: 'owner-agent',
      response,
      artifact: options.artifact,
      commit,
      answers: options.importReview,
      message: 'attempt',
    };
    const before = snapshotProtocol(root, options.dir);
    assert.throws(() => api.handoffOwner(mutate({ call, root, initialCommit })), /co-review:/);
    assert.deepEqual(snapshotProtocol(root, options.dir), before);
  }
});

test('owner handoff refuses a symlinked response artifact', async () => {
  const { api, root, options, initialCommit } = await initializedProtocol();
  api.claimTurn({ cwd: root, dir: options.dir, actor: 'owner-agent' });
  const external = '.tmp/external-response.md';
  writeFileSync(path.join(root, external), '# Response\n');
  const response = `${options.dir}/response.md`;
  symlinkSync(path.join(root, external), path.join(root, response));
  const before = snapshotProtocol(root, options.dir);
  assert.throws(
    () =>
      api.handoffOwner({
        cwd: root,
        dir: options.dir,
        actor: 'owner-agent',
        response,
        artifact: options.artifact,
        commit: initialCommit,
        message: 'attempt',
      }),
    /co-review:response-not-regular/
  );
  assert.deepEqual(snapshotProtocol(root, options.dir), before);
});

test('CLI routes the owner handoff and rejects reviewer-only flags', async () => {
  const { root, artifact, initialCommit } = memoryRepositoryFixture();
  assert.equal(
    (
      await runCliDirect(
        [
          'init',
          '--dir',
          '.tmp/review',
          '--artifact',
          artifact,
          '--owner',
          'owner-agent',
          '--reviewer',
          'reviewer-agent',
          '--max-turns',
          '6',
        ],
        { cwd: root }
      )
    ).status,
    0
  );
  assert.equal(
    (await runCliDirect(['claim', '--dir', '.tmp/review', '--actor', 'owner-agent'], { cwd: root }))
      .status,
    0
  );
  writeFileSync(path.join(root, '.tmp/review/response.md'), '# Response\n');
  const handoff = await runCliDirect(
    [
      'handoff',
      '--dir',
      '.tmp/review',
      '--actor',
      'owner-agent',
      '--response',
      '.tmp/review/response.md',
      '--artifact',
      artifact,
      '--commit',
      initialCommit,
      '--message',
      'ready',
    ],
    { cwd: root }
  );
  assert.equal(handoff.status, 0, handoff.stderr);
  assert.equal(JSON.parse(handoff.stdout).currentRole, 'reviewer');

  const invalid = await runCliDirect(
    ['handoff', '--dir', '.tmp/review', '--actor', 'owner-agent', '--review', 'review.md'],
    { cwd: root }
  );
  assert.equal(invalid.status, 2, invalid.stderr);
});

test('reviewer changes-requested consumes one turn and returns to owner', async () => {
  const { api, root, options, commit } = await reviewerTurn({ maxReviewTurns: 6 });
  const review = `${options.dir}/r2-review.md`;
  writeFileSync(path.join(root, review), '[finding:F-002] Clarify recovery.\n');
  const state = api.handoffReviewer({
    cwd: root,
    dir: options.dir,
    actor: 'reviewer-agent',
    review,
    reviewOf: commit,
    decision: 'changes-requested',
    message: 'one finding remains',
  });
  assert.equal(state.lifecycle, 'active');
  assert.equal(state.currentRole, 'owner');
  assert.equal(state.turnState, 'available');
  assert.equal(state.reviewTurnsUsed, 1);
  assert.equal(state.remainingReviewTurns, 5);
  assert.equal(state.round, 3);
});

test('accepted on the final allowed reviewer turn is terminal without summary', async () => {
  const { api, root, options, commit } = await reviewerTurn({ maxReviewTurns: 1 });
  const review = `${options.dir}/accepted-review.md`;
  writeFileSync(path.join(root, review), '# Review\n\nNo findings.\n');
  const state = api.handoffReviewer({
    cwd: root,
    dir: options.dir,
    actor: 'reviewer-agent',
    review,
    reviewOf: commit,
    decision: 'accepted',
    message: 'accepted',
  });
  assert.equal(state.lifecycle, 'accepted');
  assert.equal(state.currentRole, null);
  assert.equal(state.turnState, null);
  assert.equal(state.reviewTurnsUsed, 1);
  assert.equal(state.remainingReviewTurns, 0);
  assert.throws(
    () => api.claimTurn({ cwd: root, dir: options.dir, actor: 'owner-agent' }),
    /co-review:terminal:accepted/
  );
  assert.throws(
    () =>
      api.continueProtocol({
        cwd: root,
        dir: options.dir,
        additionalTurns: 1,
        humanLogin: 'human',
      }),
    /co-review:continue-state:accepted/
  );
});

test('an immediate exact reviewer handoff retry returns accepted state without mutation', async () => {
  const fixture = await completedAcceptedReviewerHandoff();
  const before = snapshotProtocol(fixture.root, fixture.options.dir);

  const replayed = fixture.api.handoffReviewer({
    ...fixture.call,
    review: `./${fixture.call.review}`,
    reviewOf: 'HEAD',
    message: '  accepted  ',
  });

  assert.deepEqual(replayed, fixture.first);
  assert.deepEqual(snapshotProtocol(fixture.root, fixture.options.dir), before);
});

test('an immediate conflicting reviewer handoff reuse refuses without mutation', async () => {
  const fixture = await completedAcceptedReviewerHandoff();
  const alternateReview = `${fixture.options.dir}/conflicting-review.md`;
  const alternateSummary = `${fixture.options.dir}/conflicting-summary.md`;
  writeFileSync(path.join(fixture.root, alternateReview), '# Review\n\nDifferent evidence.\n');
  writeFileSync(path.join(fixture.root, alternateSummary), '# Summary\n\nUnexpected summary.\n');
  const conflicts = [
    ['actor', { actor: 'different-reviewer' }],
    ['review artifact', { review: alternateReview }],
    ['review-of commit', { reviewOf: fixture.initialCommit }],
    ['decision', { decision: 'changes-requested' }],
    ['summary', { summary: alternateSummary }],
    ['message', { message: 'different reviewer message' }],
  ];
  const before = snapshotProtocol(fixture.root, fixture.options.dir);

  for (const [name, mutation] of conflicts) {
    assert.throws(
      () => fixture.api.handoffReviewer({ ...fixture.call, ...mutation }),
      /co-review:handoff-conflict:reviewer/,
      name
    );
    assert.deepEqual(snapshotProtocol(fixture.root, fixture.options.dir), before, name);
  }
});

test('an invalid immediate reviewer replay preserves its established evidence diagnostic', async () => {
  const fixture = await completedAcceptedReviewerHandoff();
  const before = snapshotProtocol(fixture.root, fixture.options.dir);

  assert.throws(
    () =>
      fixture.api.handoffReviewer({
        ...fixture.call,
        review: '../outside-review.md',
      }),
    /co-review:path-outside-repository:review=\.\.\/outside-review\.md/
  );
  assert.deepEqual(snapshotProtocol(fixture.root, fixture.options.dir), before);
});

test('a reviewer replay after the owner claims is stale and follows ordinary role refusal', async () => {
  const fixture = await completedChangesRequestedReviewerHandoff();
  fixture.api.claimTurn({
    cwd: fixture.root,
    dir: fixture.options.dir,
    actor: fixture.options.owner,
  });
  const before = snapshotProtocol(fixture.root, fixture.options.dir);

  assert.throws(() => fixture.api.handoffReviewer(fixture.call), /co-review:wrong-role/);
  assert.deepEqual(snapshotProtocol(fixture.root, fixture.options.dir), before);
});

test('final changes-requested preserves the closing owner turn, then enters intervention', async () => {
  const { api, root, options, commit } = await reviewerTurn({ maxReviewTurns: 1 });
  const review = `${options.dir}/final-review.md`;
  writeFileSync(path.join(root, review), '[finding:F-002] Remaining risk.\n');
  const exhaustedReview = api.handoffReviewer({
    cwd: root,
    dir: options.dir,
    actor: 'reviewer-agent',
    review,
    reviewOf: commit,
    decision: 'changes-requested',
    message: 'final findings',
  });
  assert.equal(exhaustedReview.lifecycle, 'active');
  assert.equal(exhaustedReview.currentRole, 'owner');
  assert.equal(exhaustedReview.turnState, 'available');
  assert.equal(exhaustedReview.remainingReviewTurns, 0);
  assert.equal(exhaustedReview.lastHandoff.artifacts.summary, undefined);

  api.claimTurn({ cwd: root, dir: options.dir, actor: 'owner-agent' });
  const closingCommit = commitArtifact(root, '# Artifact\n\nClosing response.\n');
  const response = `${options.dir}/closing-owner-response.md`;
  writeFileSync(
    path.join(root, response),
    '[finding:F-002] [disposition:accepted]\nClosing response records the change.\n'
  );
  const closedCycle = api.handoffOwner({
    cwd: root,
    dir: options.dir,
    actor: 'owner-agent',
    response,
    artifact: options.artifact,
    commit: closingCommit,
    answers: review,
    message: 'closing owner response',
  });
  assert.equal(closedCycle.lifecycle, 'intervention-required');
  assert.equal(closedCycle.currentRole, null);
  assert.equal(closedCycle.turnState, null);
  assert.equal(closedCycle.lastHandoff.from, 'owner');
  assert.throws(
    () => api.claimTurn({ cwd: root, dir: options.dir, actor: 'owner-agent' }),
    /co-review:terminal:intervention-required/
  );
  const waited = await api.waitForTurn({
    cwd: root,
    dir: options.dir,
    actor: 'owner-agent',
    timeoutSeconds: 0,
  });
  assert.equal(waited.status, 'intervention-required');
});

test('an opening owner handoff after a zero-turn short circuit enters intervention', async () => {
  const { api, root, options, initialCommit } = await initializedProtocol();
  api.setMaxReviewTurns({ cwd: root, dir: options.dir, requestedMax: 0, humanLogin: 'kendrick' });
  api.claimTurn({ cwd: root, dir: options.dir, actor: 'owner-agent' });
  const response = `${options.dir}/zero-turn-response.md`;
  writeFileSync(path.join(root, response), '# Owner response\n\nNo reviewer turn is authorized.\n');
  const result = api.handoffOwner({
    cwd: root,
    dir: options.dir,
    actor: 'owner-agent',
    response,
    artifact: options.artifact,
    commit: initialCommit,
    message: 'zero-turn short circuit',
  });
  assert.equal(result.lifecycle, 'intervention-required');
  assert.equal(result.currentRole, null);
  assert.equal(result.turnState, null);
});

test('reviewer handoff rejects implicit decision, wrong commit, duplicate findings, and drift', async () => {
  for (const mutation of ['decision', 'commit', 'duplicate', 'artifact-drift']) {
    const { api, root, options, commit } = await reviewerTurn();
    const review = `${options.dir}/review.md`;
    writeFileSync(path.join(root, review), '[finding:F-002] Remaining risk.\n');
    const call = {
      cwd: root,
      dir: options.dir,
      actor: 'reviewer-agent',
      review,
      reviewOf: commit,
      decision: 'changes-requested',
      message: 'review complete',
    };
    if (mutation === 'decision') delete call.decision;
    if (mutation === 'commit') call.reviewOf = options.reviewOf ?? 'HEAD~1';
    if (mutation === 'duplicate') {
      writeFileSync(path.join(root, review), '[finding:F-002] One.\n[finding:F-002] Duplicate.\n');
    }
    if (mutation === 'artifact-drift') {
      writeFileSync(path.join(root, options.artifact), '# Artifact\n\nUnauthorized.\n');
    }
    const before = snapshotProtocol(root, options.dir);
    assert.throws(() => api.handoffReviewer(call), /co-review:/);
    assert.deepEqual(snapshotProtocol(root, options.dir), before);
  }
});

test('human continuation adds turns, preserves used count, and hashes refocus', async () => {
  const { api, root, options, commit } = await reviewerTurn({ maxReviewTurns: 1 });
  const review = `${options.dir}/review.md`;
  const summary = `${options.dir}/summary.md`;
  writeFileSync(path.join(root, review), '[finding:F-002] Remaining risk.\n');
  writeFileSync(path.join(root, summary), '# Summary\n\nFocus recovery behavior.\n');
  api.handoffReviewer({
    cwd: root,
    dir: options.dir,
    actor: 'reviewer-agent',
    review,
    reviewOf: commit,
    decision: 'changes-requested',
    summary,
    message: 'intercept',
  });
  api.claimTurn({ cwd: root, dir: options.dir, actor: 'owner-agent' });
  const closingCommit = commitArtifact(root, '# Artifact\n\nClosing response.\n');
  const closingResponse = `${options.dir}/closing-response.md`;
  writeFileSync(
    path.join(root, closingResponse),
    '[finding:F-002] [disposition:accepted]\nClosing response.\n'
  );
  api.handoffOwner({
    cwd: root,
    dir: options.dir,
    actor: 'owner-agent',
    response: closingResponse,
    artifact: options.artifact,
    commit: closingCommit,
    answers: review,
    message: 'closing response',
  });
  const focus = `${options.dir}/refocus.md`;
  writeFileSync(path.join(root, focus), '# Refocus\n\nPrioritize recovery instructions.\n');
  const state = api.continueProtocol({
    cwd: root,
    dir: options.dir,
    additionalTurns: 3,
    humanLogin: 'human@example',
    focus,
  });
  assert.equal(state.lifecycle, 'active');
  assert.equal(state.currentRole, 'reviewer');
  assert.equal(state.turnState, 'available');
  assert.equal(state.reviewTurnsUsed, 1);
  assert.equal(state.maxReviewTurns, 4);
  assert.equal(state.remainingReviewTurns, 3);
  assert.equal(state.continuation.approvedBy, 'human@example');
  assert.match(state.continuation.focus.sha256, /^sha256:/);
  assert.throws(
    () =>
      api.continueProtocol({
        cwd: root,
        dir: options.dir,
        additionalTurns: 1,
        humanLogin: 'human@example',
      }),
    /co-review:continue-state:active/
  );
});

test('continuation rejects invalid approval, turns, and focus without mutation', async () => {
  for (const mutation of ['turns', 'approval', 'focus']) {
    const { api, root, options, commit } = await reviewerTurn({ maxReviewTurns: 1 });
    const review = `${options.dir}/review.md`;
    const summary = `${options.dir}/summary.md`;
    writeFileSync(path.join(root, review), '[finding:F-002] Remaining.\n');
    writeFileSync(path.join(root, summary), '# Summary\n');
    api.handoffReviewer({
      cwd: root,
      dir: options.dir,
      actor: 'reviewer-agent',
      review,
      reviewOf: commit,
      decision: 'changes-requested',
      summary,
      message: 'intercept',
    });
    rewriteProtocolState(root, options.dir, (state) => ({
      ...state,
      lifecycle: 'intervention-required',
      currentRole: null,
      turnState: null,
      claim: null,
      lastHandoff: { ...state.lastHandoff, from: 'owner' },
    }));
    const call = {
      cwd: root,
      dir: options.dir,
      additionalTurns: 2,
      humanLogin: 'human',
    };
    if (mutation === 'turns') call.additionalTurns = 0;
    if (mutation === 'approval') call.humanLogin = '';
    if (mutation === 'focus') call.focus = summary;
    const before = snapshotProtocol(root, options.dir);
    assert.throws(() => api.continueProtocol(call), /co-review:/);
    assert.deepEqual(snapshotProtocol(root, options.dir), before);
  }
});

test('CLI routes reviewer acceptance and human continuation flags', async () => {
  const { root, artifact, initialCommit } = memoryRepositoryFixture();
  const common = {
    cwd: root,
    env: { CLAUDE_SESSION_ID: 'co-review-cli-reviewer-session' },
    resolveGitHubLoginImpl: () => 'human',
  };
  assert.equal(
    (
      await runCliDirect(
        [
          'init',
          '--dir',
          '.tmp/review',
          '--artifact',
          artifact,
          '--owner',
          'owner-agent',
          '--reviewer',
          'reviewer-agent',
          '--max-turns',
          '1',
        ],
        common
      )
    ).status,
    0
  );
  assert.equal(
    (await runCliDirect(['claim', '--dir', '.tmp/review', '--actor', 'owner-agent'], common))
      .status,
    0
  );
  writeFileSync(path.join(root, '.tmp/review/response.md'), '# Response\n');
  assert.equal(
    (
      await runCliDirect(
        [
          'handoff',
          '--dir',
          '.tmp/review',
          '--actor',
          'owner-agent',
          '--response',
          '.tmp/review/response.md',
          '--artifact',
          artifact,
          '--commit',
          initialCommit,
          '--message',
          'ready',
        ],
        common
      )
    ).status,
    0
  );
  assert.equal(
    (await runCliDirect(['claim', '--dir', '.tmp/review', '--actor', 'reviewer-agent'], common))
      .status,
    0
  );
  writeFileSync(path.join(root, '.tmp/review/review.md'), '# Review\n\nAccepted.\n');
  const accepted = await runCliDirect(
    [
      'handoff',
      '--dir',
      '.tmp/review',
      '--actor',
      'reviewer-agent',
      '--review',
      '.tmp/review/review.md',
      '--review-of',
      initialCommit,
      '--decision',
      'accepted',
      '--message',
      'accepted',
    ],
    common
  );
  assert.equal(accepted.status, 4, accepted.stderr);
  assert.match(accepted.stderr, /^ACCEPTED: protocol state is durable/);
  assert.equal(JSON.parse(accepted.stdout).lifecycle, 'accepted');
  const refused = await runCliDirect(
    ['continue', '--dir', '.tmp/review', '--additional-turns', '2', '--approved-by', 'human'],
    common
  );
  assert.equal(refused.status, 1, refused.stderr);
});
