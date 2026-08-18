// @story #1266

import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';

import {
  commitArtifact,
  realInitializedProtocol,
  readEvents,
  repositoryFixture,
  rewriteProtocolState,
  runCli,
  runCliAsync,
  runCliDirect,
  snapshotProtocol,
} from './co-review-fixture.mjs';

async function exhaustedIntervention({ lastFrom = 'reviewer' } = {}) {
  const initialized = await realInitializedProtocol();
  const { root, options } = initialized;
  rewriteProtocolState(root, options.dir, (state) => ({
    ...state,
    lifecycle: 'intervention-required',
    currentRole: null,
    turnState: null,
    claim: null,
    reviewTurnsUsed: 1,
    maxReviewTurns: 1,
    remainingReviewTurns: 0,
    lastHandoff: { from: lastFrom, to: null, at: state.updatedAt },
  }));
  return initialized;
}

test('fresh CLI workflow reaches acceptance with ordered events and terminal next action', () => {
  const { root, artifact, initialCommit } = repositoryFixture();
  const io = { cwd: root };
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
        '2',
      ],
      io
    ).status,
    0
  );
  assert.equal(runCli(['claim', '--dir', '.tmp/review', '--actor', 'owner-agent'], io).status, 0);
  writeFileSync(path.join(root, '.tmp/review/r1-response.md'), '# Response\n');
  assert.equal(
    runCli(
      [
        'handoff',
        '--dir',
        '.tmp/review',
        '--actor',
        'owner-agent',
        '--response',
        '.tmp/review/r1-response.md',
        '--artifact',
        artifact,
        '--commit',
        initialCommit,
        '--message',
        'ready',
      ],
      io
    ).status,
    0
  );
  assert.equal(
    runCli(['claim', '--dir', '.tmp/review', '--actor', 'reviewer-agent'], io).status,
    0
  );
  writeFileSync(
    path.join(root, '.tmp/review/r2-review.md'),
    '[finding:F-001] Add explicit recovery.\n'
  );
  assert.equal(
    runCli(
      [
        'handoff',
        '--dir',
        '.tmp/review',
        '--actor',
        'reviewer-agent',
        '--review',
        '.tmp/review/r2-review.md',
        '--review-of',
        initialCommit,
        '--decision',
        'changes-requested',
        '--message',
        'one finding',
      ],
      io
    ).status,
    0
  );
  assert.equal(runCli(['claim', '--dir', '.tmp/review', '--actor', 'owner-agent'], io).status, 0);
  const secondCommit = commitArtifact(root, '# Artifact\n\nExplicit recovery.\n');
  writeFileSync(
    path.join(root, '.tmp/review/r3-response.md'),
    '[finding:F-001] [disposition:accepted]\nAdded recovery section.\n'
  );
  assert.equal(
    runCli(
      [
        'handoff',
        '--dir',
        '.tmp/review',
        '--actor',
        'owner-agent',
        '--response',
        '.tmp/review/r3-response.md',
        '--artifact',
        artifact,
        '--commit',
        secondCommit,
        '--answers',
        '.tmp/review/r2-review.md',
        '--message',
        'revised',
      ],
      io
    ).status,
    0
  );
  assert.equal(
    runCli(['claim', '--dir', '.tmp/review', '--actor', 'reviewer-agent'], io).status,
    0
  );
  writeFileSync(path.join(root, '.tmp/review/r4-review.md'), '# Review\n\nAccepted.\n');
  const pendingArchive = runCli(
    [
      'handoff',
      '--dir',
      '.tmp/review',
      '--actor',
      'reviewer-agent',
      '--review',
      '.tmp/review/r4-review.md',
      '--review-of',
      secondCommit,
      '--decision',
      'accepted',
      '--message',
      'accepted',
    ],
    io
  );
  assert.equal(pendingArchive.status, 4, pendingArchive.stderr);
  assert.match(pendingArchive.stderr, /^ACCEPTED: protocol state is durable/);
  assert.match(pendingArchive.stderr, /finalize --dir \.tmp\/review --archive-dir/);
  assert.deepEqual(
    readEvents(root, '.tmp/review').map(({ type }) => type),
    [
      'init',
      'claim',
      'owner-handoff',
      'claim',
      'reviewer-handoff',
      'claim',
      'owner-handoff',
      'claim',
      'reviewer-handoff',
    ]
  );
  const status = runCli(['status', '--dir', '.tmp/review'], io);
  assert.equal(status.status, 0, status.stderr);
  assert.match(
    status.stdout,
    /Next: npx aitm co-review finalize --dir \.tmp\/review --archive-dir/
  );
  const json = JSON.parse(runCli(['status', '--dir', '.tmp/review', '--json'], io).stdout);
  assert.match(json.nextAction, /finalize --dir \.tmp\/review --archive-dir/);
});

test('Task 2 CLI continuation supports bare, absolute, legacy, focus, and authenticated recovery', async () => {
  const bare = await exhaustedIntervention();
  const bareResult = await runCliDirect(['continue', '--dir', bare.options.dir], {
    cwd: bare.root,
    resolveGitHubLoginImpl: () => 'kendrick',
  });
  assert.equal(bareResult.status, 0, bareResult.stderr);
  const bareState = JSON.parse(bareResult.stdout);
  assert.equal(bareState.currentRole, 'owner');
  assert.equal(bareState.maxReviewTurns, 1);
  assert.equal(bareState.remainingReviewTurns, 0);
  assert.equal(
    (
      await runCliDirect(['continue', '--dir', bare.options.dir], {
        cwd: bare.root,
        resolveGitHubLoginImpl: () => 'kendrick',
      })
    ).status,
    1
  );

  const absolute = await exhaustedIntervention({ lastFrom: 'owner' });
  const absoluteResult = await runCliDirect(
    ['continue', '--dir', absolute.options.dir, '--max-turns', '3'],
    { cwd: absolute.root, resolveGitHubLoginImpl: () => 'kendrick' }
  );
  assert.equal(absoluteResult.status, 0, absoluteResult.stderr);
  assert.equal(JSON.parse(absoluteResult.stdout).currentRole, 'reviewer');
  assert.equal(JSON.parse(absoluteResult.stdout).remainingReviewTurns, 2);

  const legacy = await exhaustedIntervention();
  const focus = `${legacy.options.dir}/focus.md`;
  writeFileSync(path.join(legacy.root, focus), '# Focus\n\nRetry the review.\n');
  const legacyResult = await runCliDirect(
    [
      'continue',
      '--dir',
      legacy.options.dir,
      '--additional-turns',
      '2',
      '--approved-by',
      'legacy-human',
      '--focus',
      focus,
    ],
    { cwd: legacy.root, resolveGitHubLoginImpl: () => 'kendrick' }
  );
  assert.equal(legacyResult.status, 0, legacyResult.stderr);
  assert.match(legacyResult.stderr, /--approved-by is deprecated/);
  const legacyState = JSON.parse(legacyResult.stdout);
  assert.equal(legacyState.maxReviewTurns, 3);
  assert.match(legacyState.continuation.focus.sha256, /^sha256:/);

  const invalid = await exhaustedIntervention();
  const before = snapshotProtocol(invalid.root, invalid.options.dir);
  const both = await runCliDirect(
    ['continue', '--dir', invalid.options.dir, '--max-turns', '3', '--additional-turns', '1'],
    { cwd: invalid.root, resolveGitHubLoginImpl: () => 'must not resolve' }
  );
  assert.equal(both.status, 2, both.stderr);
  assert.deepEqual(snapshotProtocol(invalid.root, invalid.options.dir), before);

  const identityFailure = await exhaustedIntervention();
  const identityBefore = snapshotProtocol(identityFailure.root, identityFailure.options.dir);
  const failed = await runCliDirect(['continue', '--dir', identityFailure.options.dir], {
    cwd: identityFailure.root,
    resolveGitHubLoginImpl() {
      const error = new Error('co-review:github-identity:offline; no state changed');
      error.exitCode = 1;
      throw error;
    },
  });
  assert.equal(failed.status, 1);
  assert.deepEqual(
    snapshotProtocol(identityFailure.root, identityFailure.options.dir),
    identityBefore
  );

  const status = runCli(['status', '--dir', invalid.options.dir], { cwd: invalid.root });
  assert.match(status.stdout, /continue --dir .* --max-turns <N>/);
});

test('imported CLI workflow intercepts, continues with refocus, and then accepts', async () => {
  const { root, artifact, initialCommit } = repositoryFixture();
  const io = { cwd: root };
  mkdirSync(path.join(root, '.tmp/review'), { recursive: true });
  writeFileSync(
    path.join(root, '.tmp/review/r1-review.md'),
    '[finding:F-001] Clarify acceptance.\n'
  );
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
        '2',
        '--import-review',
        '.tmp/review/r1-review.md',
        '--review-of',
        initialCommit,
      ],
      io
    ).status,
    0
  );
  assert.equal(runCli(['claim', '--dir', '.tmp/review', '--actor', 'owner-agent'], io).status, 0);
  const secondCommit = commitArtifact(root, '# Artifact\n\nExplicit acceptance.\n');
  writeFileSync(
    path.join(root, '.tmp/review/r2-response.md'),
    '[finding:F-001] [disposition:accepted]\nAcceptance is explicit.\n'
  );
  assert.equal(
    runCli(
      [
        'handoff',
        '--dir',
        '.tmp/review',
        '--actor',
        'owner-agent',
        '--response',
        '.tmp/review/r2-response.md',
        '--artifact',
        artifact,
        '--commit',
        secondCommit,
        '--answers',
        '.tmp/review/r1-review.md',
        '--message',
        'R2',
      ],
      io
    ).status,
    0
  );
  assert.equal(
    runCli(['claim', '--dir', '.tmp/review', '--actor', 'reviewer-agent'], io).status,
    0
  );
  writeFileSync(path.join(root, '.tmp/review/r3-review.md'), '[finding:F-002] Refocus help.\n');
  writeFileSync(path.join(root, '.tmp/review/summary.md'), '# Summary\n\nRefocus help recovery.\n');
  assert.equal(
    runCli(
      [
        'handoff',
        '--dir',
        '.tmp/review',
        '--actor',
        'reviewer-agent',
        '--review',
        '.tmp/review/r3-review.md',
        '--review-of',
        secondCommit,
        '--decision',
        'changes-requested',
        '--summary',
        '.tmp/review/summary.md',
        '--message',
        'intercept',
      ],
      io
    ).status,
    0
  );
  const closingOwner = runCli(['status', '--dir', '.tmp/review'], io);
  assert.match(closingOwner.stdout, /Next: npx aitm co-review claim.*owner-agent/);
  assert.equal(runCli(['claim', '--dir', '.tmp/review', '--actor', 'owner-agent'], io).status, 0);
  const thirdCommit = commitArtifact(root, '# Artifact\n\nClosing response before continuation.\n');
  writeFileSync(
    path.join(root, '.tmp/review/r4-response.md'),
    '[finding:F-002] [disposition:accepted]\nThe closing owner response is complete.\n'
  );
  assert.equal(
    runCli(
      [
        'handoff',
        '--dir',
        '.tmp/review',
        '--actor',
        'owner-agent',
        '--response',
        '.tmp/review/r4-response.md',
        '--artifact',
        artifact,
        '--commit',
        thirdCommit,
        '--answers',
        '.tmp/review/r3-review.md',
        '--message',
        'closing owner response',
      ],
      io
    ).status,
    0
  );
  const intercepted = runCli(['status', '--dir', '.tmp/review'], io);
  assert.match(intercepted.stdout, /Next: npx aitm co-review continue.*--max-turns/);
  writeFileSync(path.join(root, '.tmp/review/refocus.md'), '# Refocus\n\nHelp recovery.\n');
  const continued = await runCliDirect(
    [
      'continue',
      '--dir',
      '.tmp/review',
      '--additional-turns',
      '2',
      '--approved-by',
      'human',
      '--focus',
      '.tmp/review/refocus.md',
    ],
    { cwd: root, resolveGitHubLoginImpl: () => 'kendrick' }
  );
  assert.equal(continued.status, 0, continued.stderr);
  const resumed = JSON.parse(runCli(['status', '--dir', '.tmp/review', '--json'], io).stdout);
  assert.equal(resumed.reviewTurnsUsed, 2);
  assert.equal(resumed.maxReviewTurns, 4);
  assert.equal(resumed.remainingReviewTurns, 2);
  assert.match(resumed.nextAction, /claim.*reviewer-agent/);
  assert.equal(
    runCli(['claim', '--dir', '.tmp/review', '--actor', 'reviewer-agent'], io).status,
    0
  );
  writeFileSync(path.join(root, '.tmp/review/r5-review.md'), '# Review\n\nAccepted.\n');
  const pendingArchive = runCli(
    [
      'handoff',
      '--dir',
      '.tmp/review',
      '--actor',
      'reviewer-agent',
      '--review',
      '.tmp/review/r5-review.md',
      '--review-of',
      thirdCommit,
      '--decision',
      'accepted',
      '--message',
      'accepted',
    ],
    io
  );
  assert.equal(pendingArchive.status, 4, pendingArchive.stderr);
  assert.match(pendingArchive.stderr, /^ACCEPTED: protocol state is durable/);
  const final = JSON.parse(runCli(['status', '--dir', '.tmp/review', '--json'], io).stdout);
  assert.equal(final.lifecycle, 'accepted');
  assert.equal(final.reviewTurnsUsed, 3);
  assert.equal(final.maxReviewTurns, 4);
  assert.equal(final.remainingReviewTurns, 1);
  assert.match(final.nextAction, /finalize --dir \.tmp\/review --archive-dir/);
});

test('concurrent identical claims serialize to one claim event without corrupting state', async () => {
  const { root, artifact } = repositoryFixture();
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
        '2',
      ],
      { cwd: root }
    ).status,
    0
  );
  const args = ['claim', '--dir', '.tmp/review', '--actor', 'owner-agent'];
  const results = await Promise.all([
    runCliAsync(args, { cwd: root }),
    runCliAsync(args, { cwd: root }),
  ]);
  assert.ok(
    results.some(({ status }) => status === 0),
    JSON.stringify(results)
  );
  assert.ok(results.every(({ status }) => status === 0 || status === 1));
  assert.equal(readEvents(root, '.tmp/review').filter(({ type }) => type === 'claim').length, 1);
  assert.equal(
    JSON.parse(readFileSync(path.join(root, '.tmp/review/state.json'))).turnState,
    'claimed'
  );
});
