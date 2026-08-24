// @story #1266

import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';

import {
  commitArtifact,
  git,
  profiledEnv,
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
  const issueBody = path.join(root, '.tmp/issue-body.md');
  mkdirSync(path.dirname(issueBody), { recursive: true });
  writeFileSync(issueBody, '# Issue\n\nNo human semantic approval.\n');
  const issueBodyBefore = readFileSync(issueBody, 'utf8');
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
  const initialWait = runCli(
    ['wait', '--dir', '.tmp/review', '--actor', 'reviewer-agent', '--timeout', '0'],
    io
  );
  assert.equal(initialWait.status, 3, initialWait.stderr);
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
  const reviewerWake = runCli(
    ['wait', '--dir', '.tmp/review', '--actor', 'reviewer-agent', '--timeout', '0'],
    io
  );
  assert.equal(reviewerWake.status, 0, reviewerWake.stderr);
  assert.equal(
    runCli(['claim', '--dir', '.tmp/review', '--actor', 'reviewer-agent'], io).status,
    0
  );
  writeFileSync(
    path.join(root, '.tmp/review/r2-review.md'),
    '[finding:F-001] Add explicit recovery.\n'
  );
  const changesRequestedArgs = [
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
  ];
  const changesRequested = runCli(changesRequestedArgs, io);
  assert.equal(changesRequested.status, 0, changesRequested.stderr);
  const eventsAfterChanges = readEvents(root, '.tmp/review');
  const identicalRetry = runCli(changesRequestedArgs, io);
  assert.equal(identicalRetry.status, 0, identicalRetry.stderr);
  assert.equal(identicalRetry.stdout, changesRequested.stdout);
  assert.deepEqual(readEvents(root, '.tmp/review'), eventsAfterChanges);
  const conflictingReuse = runCli(changesRequestedArgs.with(-1, 'conflicting handoff reuse'), io);
  assert.equal(conflictingReuse.status, 1, conflictingReuse.stderr);
  assert.match(conflictingReuse.stderr, /co-review:/);
  assert.equal(runCli(['claim', '--dir', '.tmp/review', '--actor', 'owner-agent'], io).status, 0);
  const secondCommit = commitArtifact(root, '# Artifact\n\nExplicit recovery.\n');
  assert.deepEqual(
    git(root, 'diff', '--name-only', `${initialCommit}..${secondCommit}`)
      .split('\n')
      .filter(Boolean),
    ['docs/artifact.md']
  );
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
  writeFileSync(path.join(root, '.tmp/review/stale-review.md'), '# Review\n\nStale.\n');
  const stale = runCli(
    [
      'handoff',
      '--dir',
      '.tmp/review',
      '--actor',
      'reviewer-agent',
      '--review',
      '.tmp/review/stale-review.md',
      '--review-of',
      initialCommit,
      '--decision',
      'accepted',
      '--message',
      'stale acceptance',
    ],
    io
  );
  assert.equal(stale.status, 1, stale.stderr);
  assert.match(stale.stderr, /co-review:review-of/);
  writeFileSync(path.join(root, '.tmp/review/r4-review.md'), '# Review\n\nAccepted.\n');
  const acceptedArgs = [
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
  ];
  const wrongSession = runCli(acceptedArgs, { ...io, env: profiledEnv('owner') });
  assert.equal(wrongSession.status, 1, wrongSession.stderr);
  assert.match(wrongSession.stderr, /co-review:handoff-session-mismatch/);
  const pendingArchive = runCli(acceptedArgs, io);
  assert.equal(pendingArchive.status, 4, pendingArchive.stderr);
  assert.match(pendingArchive.stderr, /^ACCEPTED: protocol state is durable/);
  assert.match(
    pendingArchive.stderr,
    new RegExp(`finalize --dir ${path.resolve(root, '.tmp/review')} --archive-dir`)
  );
  const terminalEvents = readEvents(root, '.tmp/review');
  assert.deepEqual(
    terminalEvents.map(({ type }) => type),
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
  const claims = terminalEvents.filter(({ type }) => type === 'claim').map(({ claim }) => claim);
  assert.deepEqual(
    claims.map(({ role, provider, sid }) => ({ role, provider, sid })),
    [
      { role: 'owner', provider: 'codex', sid: 'fixture-owner-sid' },
      { role: 'reviewer', provider: 'claude', sid: 'fixture-reviewer-sid' },
      { role: 'owner', provider: 'codex', sid: 'fixture-owner-sid' },
      { role: 'reviewer', provider: 'claude', sid: 'fixture-reviewer-sid' },
    ]
  );
  assert.notEqual(claims[0].provider, claims[1].provider);
  assert.notEqual(claims[0].sid, claims[1].sid);
  assert.equal(readFileSync(issueBody, 'utf8'), issueBodyBefore);
  assert.ok(
    terminalEvents.every(
      (event) => event.type !== 'review:approved' && event.approval !== 'human-semantic'
    )
  );
  const status = runCli(['status', '--dir', '.tmp/review'], io);
  assert.equal(status.status, 0, status.stderr);
  assert.match(
    status.stdout,
    new RegExp(`Next: npx aitm co-review finalize --dir ${path.resolve(root, '.tmp/review')} `)
  );
  const json = JSON.parse(runCli(['status', '--dir', '.tmp/review', '--json'], io).stdout);
  assert.match(
    json.nextAction,
    new RegExp(`finalize --dir ${path.resolve(root, '.tmp/review')} --archive-dir`)
  );
  const finalized = runCli(
    ['finalize', '--dir', '.tmp/review', '--archive-dir', 'docs/reviews/provider-scoped-relay'],
    io
  );
  assert.equal(finalized.status, 0, finalized.stderr);
  const eventsAfterFinalize = readEvents(root, '.tmp/review');
  assert.equal(
    eventsAfterFinalize.filter(({ type }) => type === 'reviewer-handoff').length,
    terminalEvents.filter(({ type }) => type === 'reviewer-handoff').length
  );
  const archiveReadme = readFileSync(
    path.join(root, 'docs/reviews/provider-scoped-relay/README.md'),
    'utf8'
  );
  const manifestMatch = archiveReadme.match(
    /<!-- aitm-co-review-manifest:start -->\n```json\n([\s\S]*?)\n```\n<!-- aitm-co-review-manifest:end -->/
  );
  assert.ok(manifestMatch, 'archive manifest exists');
  const manifest = JSON.parse(manifestMatch[1]);
  const finalOwner = terminalEvents.findLast(({ type }) => type === 'owner-handoff');
  const finalReviewer = terminalEvents.findLast(({ type }) => type === 'reviewer-handoff');
  assert.deepEqual(manifest.evidence.ownerResponse.claim, finalOwner.handoff.claim);
  assert.deepEqual(manifest.evidence.reviewerReview.claim, finalReviewer.handoff.claim);
  assert.equal(manifest.artifact.acceptedCommit, secondCommit);
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
  const initialized = runCli(
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
  );
  assert.equal(initialized.status, 0);
  const protocolId = JSON.parse(initialized.stdout).protocolId;
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
  const previousOrchestratorSid = process.env.AI_TASK_MANAGER_SESSION_ID;
  process.env.AI_TASK_MANAGER_SESSION_ID = 'host-orchestrator-session';
  let reviewerClaim;
  try {
    reviewerClaim = runCli(['claim', '--dir', '.tmp/review', '--actor', 'reviewer-agent'], io);
  } finally {
    if (previousOrchestratorSid === undefined) delete process.env.AI_TASK_MANAGER_SESSION_ID;
    else process.env.AI_TASK_MANAGER_SESSION_ID = previousOrchestratorSid;
  }
  assert.equal(reviewerClaim.status, 0, reviewerClaim.stderr);
  const index = JSON.parse(
    readFileSync(path.join(root, '.tmp/aitm/fleet/co-review-index.json'), 'utf8')
  );
  assert.equal(index[protocolId].claimedProvider, 'claude');
  assert.equal(index[protocolId].claimedSid, 'fixture-reviewer-sid');
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
  assert.match(
    final.nextAction,
    new RegExp(`finalize --dir ${path.resolve(root, '.tmp/review')} --archive-dir`)
  );
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
