// @story #1266

import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';

import {
  commitArtifact,
  initializedProtocol,
  repositoryFixture,
  reviewerTurn,
  runCli,
  snapshotProtocol,
} from './co-review-fixture.mjs';

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

test('CLI routes the owner handoff and rejects reviewer-only flags', () => {
  const { root, artifact, initialCommit } = repositoryFixture();
  assert.equal(
    runCli(
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
    ).status,
    0
  );
  assert.equal(
    runCli(['claim', '--dir', '.tmp/review', '--actor', 'owner-agent'], { cwd: root }).status,
    0
  );
  writeFileSync(path.join(root, '.tmp/review/response.md'), '# Response\n');
  const handoff = runCli(
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

  const invalid = runCli(
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
        approvedBy: 'human',
      }),
    /co-review:continue-state:accepted/
  );
});

test('final changes-requested requires summary and human interception', async () => {
  const { api, root, options, commit } = await reviewerTurn({
    imported: true,
    maxReviewTurns: 2,
  });
  const review = `${options.dir}/final-review.md`;
  writeFileSync(path.join(root, review), '[finding:F-002] Remaining risk.\n');
  const call = {
    cwd: root,
    dir: options.dir,
    actor: 'reviewer-agent',
    review,
    reviewOf: commit,
    decision: 'changes-requested',
    message: 'human decision required',
  };
  const before = snapshotProtocol(root, options.dir);
  assert.throws(() => api.handoffReviewer(call), /co-review:summary-required/);
  assert.deepEqual(snapshotProtocol(root, options.dir), before);
  const summary = `${options.dir}/human-summary.md`;
  writeFileSync(
    path.join(root, summary),
    '# Human summary\n\nUnresolved F-002; risk is ambiguity; recommend focusing recovery.\n'
  );
  const state = api.handoffReviewer({ ...call, summary });
  assert.equal(state.lifecycle, 'intervention-required');
  assert.equal(state.reviewTurnsUsed, 2);
  assert.equal(state.remainingReviewTurns, 0);
  assert.equal(state.lastHandoff.artifacts.summary.path, summary);
  assert.throws(
    () => api.claimTurn({ cwd: root, dir: options.dir, actor: 'owner-agent' }),
    /co-review:terminal:intervention-required/
  );
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
  const focus = `${options.dir}/refocus.md`;
  writeFileSync(path.join(root, focus), '# Refocus\n\nPrioritize recovery instructions.\n');
  const state = api.continueProtocol({
    cwd: root,
    dir: options.dir,
    additionalTurns: 3,
    approvedBy: 'human@example',
    focus,
  });
  assert.equal(state.lifecycle, 'active');
  assert.equal(state.currentRole, 'owner');
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
        approvedBy: 'human@example',
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
    const call = {
      cwd: root,
      dir: options.dir,
      additionalTurns: 2,
      approvedBy: 'human',
    };
    if (mutation === 'turns') call.additionalTurns = 0;
    if (mutation === 'approval') call.approvedBy = '';
    if (mutation === 'focus') call.focus = summary;
    const before = snapshotProtocol(root, options.dir);
    assert.throws(() => api.continueProtocol(call), /co-review:/);
    assert.deepEqual(snapshotProtocol(root, options.dir), before);
  }
});

test('CLI routes reviewer acceptance and human continuation flags', () => {
  const { root, artifact, initialCommit } = repositoryFixture();
  const common = { cwd: root };
  assert.equal(
    runCli(
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
    ).status,
    0
  );
  assert.equal(
    runCli(['claim', '--dir', '.tmp/review', '--actor', 'owner-agent'], common).status,
    0
  );
  writeFileSync(path.join(root, '.tmp/review/response.md'), '# Response\n');
  assert.equal(
    runCli(
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
    ).status,
    0
  );
  assert.equal(
    runCli(['claim', '--dir', '.tmp/review', '--actor', 'reviewer-agent'], common).status,
    0
  );
  writeFileSync(path.join(root, '.tmp/review/review.md'), '# Review\n\nAccepted.\n');
  const accepted = runCli(
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
  assert.equal(accepted.status, 0, accepted.stderr);
  assert.equal(JSON.parse(accepted.stdout).lifecycle, 'accepted');
  const refused = runCli(
    ['continue', '--dir', '.tmp/review', '--additional-turns', '2', '--approved-by', 'human'],
    common
  );
  assert.equal(refused.status, 1, refused.stderr);
});
