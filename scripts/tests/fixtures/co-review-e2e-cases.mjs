// @story #1266

import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';

import {
  commitArtifact,
  readEvents,
  repositoryFixture,
  runCli,
  runCliAsync,
} from './co-review-fixture.mjs';

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
  assert.equal(
    runCli(
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
    ).status,
    0
  );
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
  assert.match(status.stdout, /Next: stop; protocol accepted/);
  const json = JSON.parse(runCli(['status', '--dir', '.tmp/review', '--json'], io).stdout);
  assert.equal(json.nextAction, 'stop; protocol accepted');
});

test('imported CLI workflow intercepts, continues with refocus, and then accepts', () => {
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
  const intercepted = runCli(['status', '--dir', '.tmp/review'], io);
  assert.match(intercepted.stdout, /Next: npx aitm co-review continue/);
  writeFileSync(path.join(root, '.tmp/review/refocus.md'), '# Refocus\n\nHelp recovery.\n');
  assert.equal(
    runCli(
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
      io
    ).status,
    0
  );
  const resumed = JSON.parse(runCli(['status', '--dir', '.tmp/review', '--json'], io).stdout);
  assert.equal(resumed.reviewTurnsUsed, 2);
  assert.equal(resumed.maxReviewTurns, 4);
  assert.equal(resumed.remainingReviewTurns, 2);
  assert.match(resumed.nextAction, /claim.*owner-agent/);
  assert.equal(runCli(['claim', '--dir', '.tmp/review', '--actor', 'owner-agent'], io).status, 0);
  const thirdCommit = commitArtifact(root, '# Artifact\n\nRecovery-focused help.\n');
  writeFileSync(
    path.join(root, '.tmp/review/r4-response.md'),
    '[finding:F-002] [disposition:accepted]\nHelp now emphasizes recovery.\n'
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
        'refocused',
      ],
      io
    ).status,
    0
  );
  assert.equal(
    runCli(['claim', '--dir', '.tmp/review', '--actor', 'reviewer-agent'], io).status,
    0
  );
  writeFileSync(path.join(root, '.tmp/review/r5-review.md'), '# Review\n\nAccepted.\n');
  assert.equal(
    runCli(
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
    ).status,
    0
  );
  const final = JSON.parse(runCli(['status', '--dir', '.tmp/review', '--json'], io).stdout);
  assert.equal(final.lifecycle, 'accepted');
  assert.equal(final.reviewTurnsUsed, 3);
  assert.equal(final.maxReviewTurns, 4);
  assert.equal(final.remainingReviewTurns, 1);
  assert.equal(final.nextAction, 'stop; protocol accepted');
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
