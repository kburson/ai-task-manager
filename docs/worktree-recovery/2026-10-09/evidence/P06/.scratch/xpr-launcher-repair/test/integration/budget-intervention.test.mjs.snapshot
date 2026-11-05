import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';

import * as api from '../helpers/internal-api.mjs';
import {
  budgetIntervention,
  fixture,
  identity,
  NOW,
  signedGrant,
} from '../helpers/intervention-fixture.mjs';

test('signed continuation adds turns and exact retry is idempotent', async (t) => {
  const fx = fixture();
  t.after(fx.cleanup);
  const review = await budgetIntervention(fx.root);
  assert.equal(review.closed.state, 'intervention-required');
  const parameters = {
    additional_turns: 2,
    resulting_effective_maximum: 3,
    resume_role: 'reviewer',
    focus_path: null,
    focus_digest: null,
  };
  const grant = await signedGrant(
    review.started.paths.workspace,
    'continue',
    parameters,
    review.fixtureId,
    review.author,
    '2026-09-09T02:03:00.000Z'
  );
  const before = readFileSync(review.started.paths.events);
  const continued = await api.continueReview({
    cwd: fx.root,
    workspace: review.started.paths.workspace,
    grant,
    additionalTurns: 2,
    now: '2026-09-09T02:04:00.000Z',
  });
  assert.equal(continued.state, 'reviewer-turn');
  assert.equal(continued.review.max_turns, 3);
  assert.equal(continued.review.authority_warning.includes('detection'), true);
  assert.equal(readFileSync(review.started.paths.events).length > before.length, true);
  const exact = readFileSync(review.started.paths.events);
  const retried = await api.continueReview({
    cwd: fx.root,
    workspace: review.started.paths.workspace,
    grant,
    additionalTurns: 2,
    now: '2026-09-09T02:04:00.000Z',
  });
  assert.equal(retried.state, 'reviewer-turn');
  assert.deepEqual(readFileSync(review.started.paths.events), exact);
});

test('abandonment is terminal, releases only the reservation, and cannot resume', async (t) => {
  const fx = fixture();
  t.after(fx.cleanup);
  const review = await budgetIntervention(fx.root, 'abandon-intervention');
  const reservation = `${review.started.paths.workspace}/collateral-reservation.json`;
  assert.equal(readFileSync(reservation).length > 0, true);
  const abandoned = await api.abandonReview({
    workspace: review.started.paths.workspace,
    identity: review.reviewer,
    reason: 'Operator ended the review.',
    now: '2026-09-09T02:03:00.000Z',
  });
  assert.equal(abandoned.state, 'abandoned');
  assert.equal(abandoned.review.actor, review.reviewer.session_fingerprint);
  assert.throws(() => readFileSync(reservation), /ENOENT/);
  assert.match(api.resumeReview(review.started.paths.workspace).instructions, /terminal/);
});

test('a registered participant can supersede a nonterminal attempt with exact retry semantics', async (t) => {
  const fx = fixture();
  t.after(fx.cleanup);
  const author = identity('author', 'supersede-author');
  const reviewer = identity('reviewer', 'supersede-reviewer');
  const started = await api.startReview({
    cwd: fx.root,
    artifact: 'docs/artifact.md',
    artifactKind: 'spec',
    identity: author,
    reviewId: 'review-superseded',
    recordId: 'record-chain',
    now: NOW,
  });
  await api.joinReview({
    cwd: fx.root,
    invitation: started.paths.reviewer_invitation,
    identity: reviewer,
    now: NOW,
  });

  const reservation = `${started.paths.workspace}/collateral-reservation.json`;
  const superseded = await api.supersedeReview({
    workspace: started.paths.workspace,
    identity: reviewer,
    reason: 'Replacement attempt started.',
    successorReviewId: 'review-successor',
    now: '2026-09-09T02:03:00.000Z',
  });
  assert.equal(superseded.state, 'superseded');
  assert.equal(superseded.review.successor_review_id, 'review-successor');
  assert.throws(() => readFileSync(reservation), /ENOENT/);
  assert.match(api.resumeReview(started.paths.workspace).instructions, /terminal/);

  const before = readFileSync(started.paths.events);
  const retried = await api.supersedeReview({
    workspace: started.paths.workspace,
    identity: reviewer,
    reason: 'Replacement attempt started.',
    successorReviewId: 'review-successor',
    now: '2026-09-09T02:04:00.000Z',
  });
  assert.equal(retried.state, 'superseded');
  assert.deepEqual(readFileSync(started.paths.events), before);
  await assert.rejects(
    api.supersedeReview({
      workspace: started.paths.workspace,
      identity: reviewer,
      reason: 'Different reason.',
      successorReviewId: 'review-successor',
      now: '2026-09-09T02:05:00.000Z',
    }),
    (error) => error.code === 'APR_IDEMPOTENCY_CONFLICT'
  );
});

test('continuation freezes an exact repository focus and rejects a conflicting retry', async (t) => {
  const fx = fixture();
  t.after(fx.cleanup);
  const review = await budgetIntervention(fx.root, 'focus-intervention');
  const focus = path.join(fx.root, 'docs/focus.md');
  const bytes = Buffer.from('# Focus\n');
  writeFileSync(focus, bytes);
  const parameters = {
    additional_turns: 1,
    resulting_effective_maximum: 2,
    resume_role: 'reviewer',
    focus_path: 'docs/focus.md',
    focus_digest: `sha256:${createHash('sha256').update(bytes).digest('hex')}`,
  };
  const grant = await signedGrant(
    review.started.paths.workspace,
    'continue',
    parameters,
    review.fixtureId,
    review.author,
    '2026-09-09T02:03:00.000Z'
  );
  const continued = await api.continueReview({
    cwd: fx.root,
    workspace: review.started.paths.workspace,
    focus,
    grant,
    now: '2026-09-09T02:04:00.000Z',
  });
  assert.equal(continued.review.focus_path, 'docs/focus.md');
  assert.deepEqual(
    readFileSync(
      path.join(
        review.started.paths.workspace,
        'focus',
        `${parameters.focus_digest.slice('sha256:'.length)}.md`
      )
    ),
    bytes
  );
  const eventBytes = readFileSync(review.started.paths.events);
  await assert.rejects(
    api.continueReview({
      cwd: fx.root,
      workspace: review.started.paths.workspace,
      additionalTurns: 2,
      focus,
      grant,
      now: '2026-09-09T02:04:00.000Z',
    }),
    (error) => error.code === 'APR_IDEMPOTENCY_CONFLICT'
  );
  assert.deepEqual(readFileSync(review.started.paths.events), eventBytes);
});

test('continuation output collision fails before protected authority is consumed', async (t) => {
  const fx = fixture();
  t.after(fx.cleanup);
  const review = await budgetIntervention(fx.root, 'focus-collision-intervention');
  const focus = path.join(fx.root, 'docs/focus-collision.md');
  const bytes = Buffer.from('# Authorized focus\n');
  writeFileSync(focus, bytes);
  const digest = `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
  const parameters = {
    additional_turns: 1,
    resulting_effective_maximum: 2,
    resume_role: 'reviewer',
    focus_path: 'docs/focus-collision.md',
    focus_digest: digest,
  };
  const grant = await signedGrant(
    review.started.paths.workspace,
    'continue',
    parameters,
    review.fixtureId,
    review.author,
    '2026-09-09T02:03:00.000Z'
  );
  const focusDirectory = path.join(review.started.paths.workspace, 'focus');
  mkdirSync(focusDirectory, { recursive: true });
  writeFileSync(
    path.join(focusDirectory, `${digest.slice('sha256:'.length)}.md`),
    'conflicting bytes\n'
  );
  const eventBytes = readFileSync(review.started.paths.events);
  await assert.rejects(
    api.continueReview({
      cwd: fx.root,
      workspace: review.started.paths.workspace,
      focus,
      grant,
      now: '2026-09-09T02:04:00.000Z',
    }),
    (error) => error.code === 'APR_OUTPUT_COLLISION'
  );
  assert.deepEqual(readFileSync(review.started.paths.events), eventBytes);
});
