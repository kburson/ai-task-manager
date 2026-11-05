import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';

import * as api from '../helpers/internal-api.mjs';

import {
  canonicalProjection,
  mutateReview,
  readReview,
  writeDeliveryReceiptExclusive,
} from '../../src/protocol/service.mjs';
import { withReviewLock } from '../../src/protocol/store.mjs';
import {
  FINGERPRINTS,
  claim,
  event,
  reviewerTurnEvents,
  createReviewWorkspace,
} from '../helpers/review-fixture.mjs';
import {
  fixture as interventionFixture,
  identity as interventionIdentity,
  signedGrant,
} from '../helpers/intervention-fixture.mjs';

test('rebuilds missing and corrupt projections byte-for-byte from events', async (t) => {
  const fixture = await createReviewWorkspace({ repository: null, events: reviewerTurnEvents() });
  t.after(fixture.cleanup);
  rmSync(fixture.protocol);
  writeFileSync(fixture.participants, '{corrupt\n');

  const recovered = await readReview(fixture.workspace);
  assert.equal(readFileSync(fixture.protocol, 'utf8'), canonicalProjection(recovered.protocol));
  assert.equal(
    readFileSync(fixture.participants, 'utf8'),
    canonicalProjection(recovered.participants)
  );
  assert.equal(fixture.readEvents(), readFileSync(fixture.events, 'utf8'));
});

test('mutateReview checks expected authority, appends first, and writes exact projections', async (t) => {
  const prefix = reviewerTurnEvents();
  const events = [
    ...prefix,
    event('turn-claimed', {
      sequence: prefix.length + 1,
      revision: prefix.at(-1).revision,
      actor: FINGERPRINTS.reviewer,
      payload: { claim: claim('reviewer') },
    }),
  ];
  const fixture = await createReviewWorkspace({ repository: null, events });
  t.after(fixture.cleanup);
  const before = fixture.readEvents();
  const result = await mutateReview(
    fixture.workspace,
    { reviewId: 'review-01', revision: 2, sequence: 3, actor: 'reviewer' },
    (state) =>
      event('reviewer-accepted', {
        sequence: state.protocol.sequence + 1,
        revision: state.protocol.revision + 1,
        actor: `sha256:${'b'.repeat(64)}`,
      })
  );

  assert.equal(result.protocol.state, 'acceptance-pending');
  assert.equal(fixture.readEvents().startsWith(before), true);
  assert.equal(readFileSync(fixture.protocol, 'utf8'), canonicalProjection(result.protocol));
  assert.equal(
    readFileSync(fixture.participants, 'utf8'),
    canonicalProjection(result.participants)
  );
  assert.equal(result.nextAction, 'finalize-acceptance');
});

test('stale expectations and torn event bytes fail without mutation', async (t) => {
  const fixture = await createReviewWorkspace({ repository: null, events: reviewerTurnEvents() });
  t.after(fixture.cleanup);
  const before = fixture.readEvents();
  await assert.rejects(
    mutateReview(
      fixture.workspace,
      { reviewId: 'review-01', revision: 1, sequence: 2, actor: 'reviewer' },
      () => {
        throw new Error('factory must not run');
      }
    ),
    (error) => error.code === 'APR_STALE_REVIEW'
  );
  assert.equal(fixture.readEvents(), before);

  writeFileSync(fixture.events, `${before}{"torn":true}`);
  await assert.rejects(
    readReview(fixture.workspace),
    (error) => error.code === 'APR_EVENT_LOG_CORRUPT'
  );
});

test('projection repair participates in the review lock', async (t) => {
  const fixture = await createReviewWorkspace({ repository: null, events: reviewerTurnEvents() });
  t.after(fixture.cleanup);
  await withReviewLock(fixture.workspace, async () => {
    await assert.rejects(
      readReview(fixture.workspace),
      (error) => error.code === 'APR_REVIEW_LOCKED'
    );
  });
});

test('delivery events create idempotent receipts and refuse conflicts', async (t) => {
  const fixture = await createReviewWorkspace({ repository: null, events: reviewerTurnEvents() });
  t.after(fixture.cleanup);
  const delivery = event('delivery-written', {
    sequence: 3,
    revision: 2,
    payload: {
      delivery: {
        delivery_id: 'delivery-1',
        recipient: 'reviewer',
        digest: `sha256:${'f'.repeat(64)}`,
      },
    },
  });
  const result = await mutateReview(
    fixture.workspace,
    { reviewId: 'review-01', revision: 2, sequence: 2, actor: 'reviewer' },
    () => delivery
  );
  const receipt = path.join(fixture.workspace, 'deliveries', 'delivery-1.json');
  assert.equal(readFileSync(receipt, 'utf8'), canonicalProjection(delivery.payload.delivery));
  assert.equal(result.protocol.sequence, 3);

  writeFileSync(receipt, '{"conflict":true}\n');
  await assert.rejects(
    readReview(fixture.workspace),
    (error) => error.code === 'APR_DELIVERY_CONFLICT'
  );
});

test('exclusive receipt creation refuses a race collision without overwriting it', async (t) => {
  const fixture = await createReviewWorkspace({ repository: null, events: reviewerTurnEvents() });
  t.after(fixture.cleanup);
  const file = path.join(fixture.workspace, 'deliveries', 'delivery-race.json');
  const collision = '{"winner":"other-writer"}\n';
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, collision, { flag: 'wx' });

  assert.throws(
    () =>
      writeDeliveryReceiptExclusive(file, {
        delivery_id: 'delivery-race',
        recipient: 'reviewer',
        digest: `sha256:${'f'.repeat(64)}`,
      }),
    (error) => error.code === 'APR_DELIVERY_CONFLICT'
  );
  assert.equal(readFileSync(file, 'utf8'), collision);
});

test('receipt directory setup failures use the stable delivery write error', async (t) => {
  const fixture = await createReviewWorkspace({ repository: null, events: reviewerTurnEvents() });
  t.after(fixture.cleanup);
  const directory = path.join(fixture.workspace, 'blocked-deliveries');
  writeFileSync(directory, 'not a directory\n', { flag: 'wx' });

  assert.throws(
    () =>
      writeDeliveryReceiptExclusive(path.join(directory, 'delivery.json'), {
        delivery_id: 'delivery-setup-failure',
        recipient: 'reviewer',
        digest: `sha256:${'f'.repeat(64)}`,
      }),
    (error) => error.code === 'APR_DELIVERY_WRITE_FAILED'
  );
});

test('different-fingerprint recovery consumes exact replacement authority and preserves provenance', async (t) => {
  const fx = interventionFixture();
  t.after(fx.cleanup);
  const fixtureId = 'replacement-authority';
  const author = interventionIdentity('author', 'replacement-author');
  const reviewer = interventionIdentity('reviewer', 'replacement-reviewer');
  const replacement = interventionIdentity(
    'reviewer',
    'replacement-new-reviewer',
    '2026-09-09T03:01:00.000Z'
  );
  const started = await api.startReview({
    cwd: fx.root,
    artifact: 'docs/artifact.md',
    artifactKind: 'spec',
    identity: author,
    reviewId: 'replacement-review',
    noCommit: true,
    testHumanAuthority: fixtureId,
    claimTtlMs: 60 * 60 * 1000,
    now: '2026-09-09T02:00:00.000Z',
  });
  await api.joinReview({
    cwd: fx.root,
    invitation: started.paths.reviewer_invitation,
    identity: reviewer,
    now: '2026-09-09T02:00:00.000Z',
  });
  const state = await readReview(started.paths.workspace);
  const outgoing = state.protocol.claims.reviewer;
  const intervention = await mutateReview(
    started.paths.workspace,
    {
      reviewId: state.protocol.review_id,
      revision: state.protocol.revision,
      sequence: state.protocol.sequence,
      actor: state.protocol.current_actor,
    },
    (current) => ({
      schema: 'ai-peer-review.event/v1',
      review_id: current.protocol.review_id,
      sequence: current.protocol.sequence + 1,
      revision: current.protocol.revision + 1,
      type: 'intervention-entered',
      actor: 'system',
      at: '2026-09-09T03:00:00.000Z',
      payload: {
        intervention_id: 'intervention-participant-loss',
        reason: 'participant-loss',
        interrupted_state: 'reviewer-turn',
      },
    })
  );
  const parameters = {
    role: 'reviewer',
    outgoing_claim_id: outgoing.claim_id,
    outgoing_session_fingerprint: outgoing.session_fingerprint,
    incoming_session_fingerprint: replacement.session_fingerprint,
  };
  const grant = await signedGrant(
    started.paths.workspace,
    'replace-participant',
    parameters,
    fixtureId,
    author,
    '2026-09-09T03:00:10.000Z'
  );
  assert.equal(intervention.protocol.intervention.reason, 'participant-loss');
  await assert.rejects(
    api.recoverReview(
      {
        cwd: fx.root,
        workspace: started.paths.workspace,
        identity: replacement,
        replaceParticipant: 'reviewer',
        grant,
        now: '2026-09-09T03:01:00.000Z',
      },
      {
        checkpoint(name) {
          if (name === 'participant-replaced') throw new Error('simulated interruption');
        },
      }
    ),
    /simulated interruption/
  );
  const interrupted = await readReview(started.paths.workspace);
  assert.equal(
    interrupted.participants.reviewer.session_fingerprint,
    replacement.session_fingerprint
  );
  assert.equal(interrupted.protocol.claims.reviewer, undefined);
  const grantFile = path.join(started.paths.workspace, 'replacement-grant.json');
  writeFileSync(grantFile, `${JSON.stringify(grant)}\n`);
  let stdout = '';
  let stderr = '';
  const exitCode = await api.run(
    ['recover', started.paths.workspace, '--replace-participant', 'reviewer', '--grant', grantFile],
    {
      cwd: fx.root,
      env: {
        CODEX_SESSION_ID: 'replacement-new-reviewer',
        CODEX_MODEL_ID: 'gpt-test',
        CODEX_MODEL_DISPLAY: 'GPT Test',
      },
      now: '2026-09-09T03:01:00.000Z',
      stdout: { write: (value) => (stdout += value) },
      stderr: { write: (value) => (stderr += value) },
    }
  );
  assert.equal(exitCode, 0, stderr);
  assert.match(stdout, /^Review replacement-review: reviewer-turn$/m);
  const recovered = await readReview(started.paths.workspace);
  assert.equal(recovered.protocol.state, 'reviewer-turn');
  assert.equal(
    recovered.protocol.claims.reviewer.session_fingerprint,
    replacement.session_fingerprint
  );
  assert.equal(
    recovered.participants.reviewer.session_fingerprint,
    replacement.session_fingerprint
  );
  assert.equal(recovered.participants.reviewer.joined_at, '2026-09-09T03:01:00.000Z');
  const exact = readFileSync(started.paths.events);
  await api.recoverReview({
    cwd: fx.root,
    workspace: started.paths.workspace,
    identity: replacement,
    replaceParticipant: 'reviewer',
    grant,
    now: '2026-09-09T03:01:00.000Z',
  });
  assert.deepEqual(readFileSync(started.paths.events), exact);
});
