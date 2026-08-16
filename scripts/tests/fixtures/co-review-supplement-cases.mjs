// @story #1275

import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, symlinkSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';

import {
  commitArtifact,
  initializedProtocol,
  readEvents,
  reviewerTurn,
  rewriteProtocolState,
  runCliDirect,
  snapshotProtocol,
} from './co-review-fixture.mjs';

function digestFileForTest(root, file) {
  return `sha256:${createHash('sha256')
    .update(readFileSync(path.join(root, file)))
    .digest('hex')}`;
}

function interventionForReviewer(state) {
  return {
    ...state,
    lifecycle: 'intervention-required',
    currentRole: null,
    turnState: null,
    claim: null,
  };
}

function writeRuntimeFile(root, dir, name, contents = '# Supplemental context\n') {
  const file = `${dir}/${name}`;
  writeFileSync(path.join(root, file), contents);
  return file;
}

function register(api, root, dir, file, humanLogin = 'kendrick') {
  return api.registerSupplement({ cwd: root, dir, file, humanLogin });
}

test('supplement registration is append-only, stable, idempotent, and integrity-safe', async () => {
  const { api, root, options, state } = await initializedProtocol();
  rewriteProtocolState(root, options.dir, interventionForReviewer);
  const firstFile = writeRuntimeFile(root, options.dir, 'human-context');
  const first = register(api, root, options.dir, firstFile);

  assert.deepEqual(first.supplements, [
    {
      id: 'S-001',
      path: firstFile,
      sha256: digestFileForTest(root, firstFile),
      registeredBy: 'kendrick',
      registeredAt: first.updatedAt,
      targetRound: state.round + 1,
      status: 'pending',
    },
  ]);
  assert.equal(first.lifecycle, 'intervention-required');
  assert.equal(first.currentRole, null);
  assert.equal(first.round, state.round);
  assert.equal(first.reviewTurnsUsed, state.reviewTurnsUsed);
  assert.equal(readEvents(root, options.dir).at(-1).type, 'supplement');
  assert.equal(api.statusProtocol({ cwd: root, dir: options.dir }).integrity.ok, true);

  const secondFile = writeRuntimeFile(root, options.dir, 'another-context', 'second');
  const second = register(api, root, options.dir, secondFile);
  assert.deepEqual(
    second.supplements.map(({ id, path: entryPath, status }) => ({ id, path: entryPath, status })),
    [
      { id: 'S-001', path: firstFile, status: 'pending' },
      { id: 'S-002', path: secondFile, status: 'pending' },
    ]
  );

  const beforeRetry = snapshotProtocol(root, options.dir);
  assert.deepEqual(register(api, root, options.dir, secondFile), second);
  assert.deepEqual(snapshotProtocol(root, options.dir), beforeRetry);

  writeFileSync(path.join(root, secondFile), 'changed bytes');
  assert.throws(
    () => register(api, root, options.dir, secondFile),
    (error) => error.code === 'supplement-conflict'
  );
  assert.deepEqual(snapshotProtocol(root, options.dir), beforeRetry);
});

test('supplement registration refuses invalid files, wrong lifecycle, and lock contention without writes', async () => {
  const { api, root, options } = await initializedProtocol();
  const inside = writeRuntimeFile(root, options.dir, 'inside');
  const beforeActive = snapshotProtocol(root, options.dir);
  assert.throws(
    () => register(api, root, options.dir, inside),
    (error) => error.code === 'supplement-state'
  );
  assert.deepEqual(snapshotProtocol(root, options.dir), beforeActive);

  rewriteProtocolState(root, options.dir, interventionForReviewer);
  const outside = '.tmp/outside-context';
  writeFileSync(path.join(root, outside), 'outside');
  for (const file of [outside, `${options.dir}/state.json`, `${options.dir}/events.jsonl`]) {
    const before = snapshotProtocol(root, options.dir);
    assert.throws(
      () => register(api, root, options.dir, file),
      (error) => ['supplement-outside-runtime', 'supplement-path-conflict'].includes(error.code)
    );
    assert.deepEqual(snapshotProtocol(root, options.dir), before);
  }

  const link = `${options.dir}/context-link`;
  symlinkSync(path.join(root, outside), path.join(root, link));
  const beforeLink = snapshotProtocol(root, options.dir);
  assert.throws(
    () => register(api, root, options.dir, link),
    (error) => error.code === 'supplement-symlink'
  );
  assert.deepEqual(snapshotProtocol(root, options.dir), beforeLink);

  const lock = path.join(root, options.dir, '.co-review-lock');
  mkdirSync(lock);
  writeFileSync(path.join(lock, 'owner.json'), '{"actor":"other"}\n');
  const beforeLock = snapshotProtocol(root, options.dir);
  assert.throws(
    () => register(api, root, options.dir, writeRuntimeFile(root, options.dir, 'locked')),
    (error) => error.code === 'locked'
  );
  assert.deepEqual(snapshotProtocol(root, options.dir), beforeLock);
});

test('supplement registration refuses a symlinked ancestor that escapes runtime containment', async () => {
  const { api, root, options } = await initializedProtocol();
  rewriteProtocolState(root, options.dir, interventionForReviewer);
  const sibling = '.tmp/sibling-outside-runtime';
  mkdirSync(path.join(root, sibling));
  writeFileSync(path.join(root, sibling, 'context'), '# Escaped context\n');
  symlinkSync(path.join(root, sibling), path.join(root, options.dir, 'linked-dir'));
  const before = snapshotProtocol(root, options.dir);
  assert.throws(
    () => register(api, root, options.dir, `${options.dir}/linked-dir/context`),
    (error) => error.code === 'supplement-outside-runtime'
  );
  assert.deepEqual(snapshotProtocol(root, options.dir), before);
});

test('continuation freezes supplements and reviewer handoff requires and consumes exact acknowledgments', async () => {
  const { api, root, options, commit } = await reviewerTurn({ maxReviewTurns: 2 });
  rewriteProtocolState(root, options.dir, interventionForReviewer);
  const supplement = writeRuntimeFile(root, options.dir, 'reviewer-context');
  register(api, root, options.dir, supplement);

  const continued = api.continueProtocol({
    cwd: root,
    dir: options.dir,
    maxReviewTurns: 2,
    humanLogin: 'kendrick',
  });
  assert.deepEqual(
    continued.supplements.map((entry) => entry.status),
    ['frozen']
  );
  assert.equal(Object.hasOwn(continued, 'activeSupplements'), false);
  assert.equal(
    Object.hasOwn(
      JSON.parse(readFileSync(path.join(root, options.dir, 'state.json'), 'utf8')),
      'activeSupplements'
    ),
    false
  );
  api.claimTurn({ cwd: root, dir: options.dir, actor: 'reviewer-agent' });

  for (const reviewText of [
    '# Review\n',
    '# Review\n[supplement:S-999]\n',
    '# Review\n[supplement:S-001]\n[supplement:S-001]\n',
  ]) {
    const review = writeRuntimeFile(
      root,
      options.dir,
      `review-${reviewText.length}.md`,
      reviewText
    );
    const before = snapshotProtocol(root, options.dir);
    assert.throws(
      () =>
        api.handoffReviewer({
          cwd: root,
          dir: options.dir,
          actor: 'reviewer-agent',
          review,
          reviewOf: commit,
          decision: 'changes-requested',
          message: 'review handoff',
        }),
      (error) =>
        ['missing-supplement', 'unknown-supplement', 'duplicate-supplement'].includes(error.code)
    );
    assert.deepEqual(snapshotProtocol(root, options.dir), before);
  }

  const acknowledged = writeRuntimeFile(
    root,
    options.dir,
    'review-ok.md',
    '# Review\n[supplement:S-001]\n'
  );
  const handedOff = api.handoffReviewer({
    cwd: root,
    dir: options.dir,
    actor: 'reviewer-agent',
    review: acknowledged,
    reviewOf: commit,
    decision: 'changes-requested',
    message: 'review handoff',
  });
  assert.deepEqual(
    handedOff.supplements.map((entry) => entry.status),
    ['consumed']
  );
  assert.equal(api.statusProtocol({ cwd: root, dir: options.dir }).activeSupplements.length, 0);

  api.claimTurn({ cwd: root, dir: options.dir, actor: 'owner-agent' });
  const response = writeRuntimeFile(root, options.dir, 'later-response.md', '# Response\n');
  const laterCommit = commitArtifact(root, '# Artifact\n\nLater owner revision.\n');
  api.handoffOwner({
    cwd: root,
    dir: options.dir,
    actor: 'owner-agent',
    response,
    artifact: options.artifact,
    commit: laterCommit,
    answers: acknowledged,
    message: 'later owner handoff',
  });
  api.claimTurn({ cwd: root, dir: options.dir, actor: 'reviewer-agent' });
  const laterReview = writeRuntimeFile(root, options.dir, 'later-review.md', '# Review\n');
  assert.doesNotThrow(() =>
    api.handoffReviewer({
      cwd: root,
      dir: options.dir,
      actor: 'reviewer-agent',
      review: laterReview,
      reviewOf: laterCommit,
      decision: 'accepted',
      message: 'later review handoff',
    })
  );
});

test('frozen supplements survive a resumed closing owner turn and focus remains separate context', async () => {
  const closing = await reviewerTurn({ maxReviewTurns: 1 });
  const { api, root, options, commit } = closing;
  const review = writeRuntimeFile(root, options.dir, 'final-review.md', '# Review\n');
  api.handoffReviewer({
    cwd: root,
    dir: options.dir,
    actor: 'reviewer-agent',
    review,
    reviewOf: commit,
    decision: 'changes-requested',
    summary: undefined,
    message: 'final changes',
  });
  rewriteProtocolState(root, options.dir, interventionForReviewer);
  const supplement = writeRuntimeFile(root, options.dir, 'closing-context');
  register(api, root, options.dir, supplement);
  api.continueProtocol({ cwd: root, dir: options.dir, humanLogin: 'kendrick' });
  api.claimTurn({ cwd: root, dir: options.dir, actor: 'owner-agent' });
  const response = writeRuntimeFile(root, options.dir, 'closing-response.md', '# Response\n');
  const closingCommit = commitArtifact(root, '# Artifact\n\nClosing owner revision.\n');
  const afterOwner = api.handoffOwner({
    cwd: root,
    dir: options.dir,
    actor: 'owner-agent',
    response,
    artifact: options.artifact,
    commit: closingCommit,
    answers: review,
    message: 'closing owner handoff',
  });
  assert.deepEqual(
    afterOwner.supplements.map((entry) => entry.status),
    ['frozen']
  );

  const focusCase = await reviewerTurn({ maxReviewTurns: 2 });
  rewriteProtocolState(focusCase.root, focusCase.options.dir, interventionForReviewer);
  const focus = writeRuntimeFile(focusCase.root, focusCase.options.dir, 'focus.md', '# Focus\n');
  const focused = focusCase.api.continueProtocol({
    cwd: focusCase.root,
    dir: focusCase.options.dir,
    maxReviewTurns: 2,
    humanLogin: 'kendrick',
    focus,
  });
  assert.equal(focused.supplements, undefined);
  assert.equal(focused.continuation.focus.path, focus);
});

test('supplement CLI authenticates before mutation and status projects active supplements', async () => {
  const { root, options } = await initializedProtocol();
  rewriteProtocolState(root, options.dir, interventionForReviewer);
  const file = writeRuntimeFile(root, options.dir, 'cli-context');
  const beforeIdentityFailure = snapshotProtocol(root, options.dir);
  const identityFailure = await runCliDirect(['supplement', '--dir', options.dir, '--file', file], {
    cwd: root,
    resolveGitHubLoginImpl() {
      throw new Error('identity unavailable');
    },
  });
  assert.equal(identityFailure.status, 1);
  assert.deepEqual(snapshotProtocol(root, options.dir), beforeIdentityFailure);

  const registered = await runCliDirect(['supplement', '--dir', options.dir, '--file', file], {
    cwd: root,
    resolveGitHubLoginImpl: () => 'kendrick',
  });
  assert.equal(registered.status, 0, registered.stderr);
  assert.match(registered.stdout, /"id": "S-001"/);
  const status = await runCliDirect(['status', '--dir', options.dir], { cwd: root });
  assert.match(status.stdout, /S-001/);
  assert.match(status.stdout, /cli-context/);
  assert.match(status.stdout, /sha256:/);
  assert.match(status.stdout, /Target round: 2/);
  const jsonStatus = await runCliDirect(['status', '--dir', options.dir, '--json'], { cwd: root });
  assert.equal(jsonStatus.status, 0, jsonStatus.stderr);
  assert.match(jsonStatus.stdout, /"activeSupplements"/);
  assert.match(jsonStatus.stdout, /"targetRound": 2/);
  const invalid = await runCliDirect(
    ['supplement', '--dir', options.dir, '--file', file, '--actor', 'agent'],
    { cwd: root }
  );
  assert.equal(invalid.status, 2);
});

test('pending and frozen supplement drift blocks continuation and reviewer mutation', async () => {
  const pending = await reviewerTurn({ maxReviewTurns: 2 });
  rewriteProtocolState(pending.root, pending.options.dir, interventionForReviewer);
  const pendingFile = writeRuntimeFile(pending.root, pending.options.dir, 'pending-context');
  register(pending.api, pending.root, pending.options.dir, pendingFile);
  writeFileSync(path.join(pending.root, pendingFile), 'drifted pending context');
  const pendingStatus = pending.api.statusProtocol({ cwd: pending.root, dir: pending.options.dir });
  assert.equal(pendingStatus.integrity.ok, false);
  assert.match(pendingStatus.integrity.errors.join('\n'), /supplement-drift/);
  const beforePendingContinue = snapshotProtocol(pending.root, pending.options.dir);
  assert.throws(
    () =>
      pending.api.continueProtocol({
        cwd: pending.root,
        dir: pending.options.dir,
        maxReviewTurns: 2,
        humanLogin: 'kendrick',
      }),
    (error) => error.code === 'integrity'
  );
  assert.deepEqual(snapshotProtocol(pending.root, pending.options.dir), beforePendingContinue);

  const frozen = await reviewerTurn({ maxReviewTurns: 2 });
  rewriteProtocolState(frozen.root, frozen.options.dir, interventionForReviewer);
  const frozenFile = writeRuntimeFile(frozen.root, frozen.options.dir, 'frozen-context');
  register(frozen.api, frozen.root, frozen.options.dir, frozenFile);
  frozen.api.continueProtocol({
    cwd: frozen.root,
    dir: frozen.options.dir,
    maxReviewTurns: 2,
    humanLogin: 'kendrick',
  });
  frozen.api.claimTurn({ cwd: frozen.root, dir: frozen.options.dir, actor: 'reviewer-agent' });
  writeFileSync(path.join(frozen.root, frozenFile), 'drifted frozen context');
  const frozenStatus = frozen.api.statusProtocol({ cwd: frozen.root, dir: frozen.options.dir });
  assert.equal(frozenStatus.integrity.ok, false);
  assert.match(frozenStatus.integrity.errors.join('\n'), /supplement-drift/);
  const review = writeRuntimeFile(
    frozen.root,
    frozen.options.dir,
    'frozen-review.md',
    '# Review\n[supplement:S-001]\n'
  );
  const beforeFrozenHandoff = snapshotProtocol(frozen.root, frozen.options.dir);
  assert.throws(
    () =>
      frozen.api.handoffReviewer({
        cwd: frozen.root,
        dir: frozen.options.dir,
        actor: 'reviewer-agent',
        review,
        reviewOf: frozen.commit,
        decision: 'accepted',
        message: 'review handoff',
      }),
    (error) => error.code === 'integrity'
  );
  assert.deepEqual(snapshotProtocol(frozen.root, frozen.options.dir), beforeFrozenHandoff);
});

test('supplement lifecycle projection detects tampering and validates ID suffix safety', async () => {
  const { api, root, options } = await initializedProtocol();
  rewriteProtocolState(root, options.dir, interventionForReviewer);
  const file = writeRuntimeFile(root, options.dir, 'projected-context');
  const registered = register(api, root, options.dir, file);
  assert.deepEqual(readEvents(root, options.dir).at(-1).supplements, [
    {
      id: 'S-001',
      path: file,
      sha256: registered.supplements[0].sha256,
      registeredBy: 'kendrick',
      registeredAt: registered.updatedAt,
      targetRound: registered.supplements[0].targetRound,
      status: 'pending',
    },
  ]);

  rewriteProtocolState(root, options.dir, (state) => ({
    ...state,
    supplements: state.supplements.map((supplement) => ({ ...supplement, status: 'consumed' })),
  }));
  const tampered = api.statusProtocol({ cwd: root, dir: options.dir });
  assert.equal(tampered.integrity.ok, false);
  assert.match(tampered.integrity.errors.join('\n'), /event-projection supplements/);
  const beforeTamperedContinue = snapshotProtocol(root, options.dir);
  assert.throws(
    () =>
      api.continueProtocol({
        cwd: root,
        dir: options.dir,
        maxReviewTurns: 1,
        humanLogin: 'kendrick',
      }),
    (error) => error.code === 'integrity'
  );
  assert.deepEqual(snapshotProtocol(root, options.dir), beforeTamperedContinue);

  const timestamp = await initializedProtocol();
  rewriteProtocolState(timestamp.root, timestamp.options.dir, interventionForReviewer);
  const timestampFile = writeRuntimeFile(
    timestamp.root,
    timestamp.options.dir,
    'timestamp-context'
  );
  const timestampRegistered = register(
    timestamp.api,
    timestamp.root,
    timestamp.options.dir,
    timestampFile
  );
  for (const field of ['registeredBy', 'registeredAt']) {
    rewriteProtocolState(timestamp.root, timestamp.options.dir, (state) => ({
      ...state,
      supplements: state.supplements.map((supplement) => ({
        ...supplement,
        registeredBy: field === 'registeredBy' ? 'mallory' : 'kendrick',
        registeredAt:
          field === 'registeredAt' ? '2000-01-01T00:00:00.000Z' : timestampRegistered.updatedAt,
      })),
    }));
    const status = timestamp.api.statusProtocol({
      cwd: timestamp.root,
      dir: timestamp.options.dir,
    });
    assert.equal(status.integrity.ok, false);
    assert.match(status.integrity.errors.join('\n'), /event-projection supplements/);
  }

  const huge = await initializedProtocol();
  rewriteProtocolState(huge.root, huge.options.dir, (state) => ({
    ...interventionForReviewer(state),
    supplements: [
      {
        id: 'S-999999999999999999999999999999999999999999999999999999999999',
        path: `${huge.options.dir}/legacy-context`,
        sha256: `sha256:${'0'.repeat(64)}`,
        registeredBy: 'kendrick',
        registeredAt: state.updatedAt,
        targetRound: state.round + 1,
        status: 'pending',
      },
    ],
  }));
  const next = writeRuntimeFile(huge.root, huge.options.dir, 'next-context');
  const beforeHuge = snapshotProtocol(huge.root, huge.options.dir);
  assert.throws(
    () => register(huge.api, huge.root, huge.options.dir, next),
    (error) => error.code === 'invalid-state'
  );
  assert.deepEqual(snapshotProtocol(huge.root, huge.options.dir), beforeHuge);
});

test('an exact supplement retry validates integrity before returning the existing registration', async () => {
  const { api, root, options } = await initializedProtocol();
  rewriteProtocolState(root, options.dir, interventionForReviewer);
  const file = writeRuntimeFile(root, options.dir, 'retry-context');
  register(api, root, options.dir, file);
  rewriteProtocolState(root, options.dir, (state) => ({
    ...state,
    supplements: state.supplements.map((supplement) => ({ ...supplement, status: 'consumed' })),
  }));
  const beforeRetry = snapshotProtocol(root, options.dir);
  assert.throws(
    () => register(api, root, options.dir, file),
    (error) => error.code === 'integrity'
  );
  assert.deepEqual(snapshotProtocol(root, options.dir), beforeRetry);
});
