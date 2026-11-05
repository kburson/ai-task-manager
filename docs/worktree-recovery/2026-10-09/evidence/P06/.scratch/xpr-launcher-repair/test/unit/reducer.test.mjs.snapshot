import test from 'node:test';
import assert from 'node:assert/strict';

import { digestChallenge, digestGrantParameters } from '../../src/authority/canonicalize.mjs';
import { LIFECYCLE_EVENT_TYPES, reduceEvents } from '../../src/protocol/reducer.mjs';
import {
  acceptancePendingEvents,
  authorRevisionEvents,
  claim,
  event,
  FINGERPRINTS,
  interventionEvents,
  reviewerTurnEvents,
  REVISION_NEUTRAL_TYPES,
  sequence,
} from '../helpers/review-fixture.mjs';

function noCommit(events) {
  return events.map((item, index) =>
    index === 0
      ? {
          ...item,
          payload: {
            ...item.payload,
            commit_mode: 'no-commit',
            startup: {
              ...item.payload.startup,
              no_commit_baseline: {
                head: item.payload.artifact.head,
                index_digest: `sha256:${'1'.repeat(64)}`,
                worktree_digest: `sha256:${'2'.repeat(64)}`,
                changed_paths: [],
              },
            },
          },
        }
      : item
  );
}

function authorFinalizationEvents() {
  const prefix = acceptancePendingEvents();
  return [
    ...prefix,
    event('finalization-started', {
      sequence: prefix.length + 1,
      revision: prefix.at(-1).revision + 1,
    }),
  ];
}

function claimedReviewerTurnEvents() {
  const prefix = reviewerTurnEvents();
  return [
    ...prefix,
    event('turn-claimed', {
      sequence: prefix.length + 1,
      revision: prefix.at(-1).revision,
      actor: FINGERPRINTS.reviewer,
      payload: { claim: claim('reviewer') },
    }),
  ];
}

const cases = [
  [[], 'review-created', 'awaiting-reviewer'],
  [sequence(['review-created']), 'reviewer-joined', 'reviewer-turn'],
  [claimedReviewerTurnEvents(), 'reviewer-revisions-requested', 'author-revision'],
  [claimedReviewerTurnEvents(), 'reviewer-accepted', 'acceptance-pending'],
  [authorRevisionEvents(), 'author-revision-committed', 'reviewer-turn'],
  [noCommit(authorRevisionEvents()), 'author-revision-sealed-no-commit', 'reviewer-turn'],
  [authorRevisionEvents(), 'author-closing-round-committed', 'intervention-required'],
  [
    noCommit(authorRevisionEvents()),
    'author-closing-round-sealed-no-commit',
    'intervention-required',
  ],
  [reviewerTurnEvents(), 'intervention-entered', 'intervention-required'],
  [authorRevisionEvents(), 'intervention-entered', 'intervention-required'],
  [acceptancePendingEvents(), 'finalization-started', 'author-finalization'],
  [authorFinalizationEvents(), 'acceptance-committed', 'accepted'],
  [noCommit(authorFinalizationEvents()), 'acceptance-sealed-no-commit', 'accepted-uncommitted'],
  [interventionEvents('turn-budget-exhausted'), 'continued-to-reviewer', 'reviewer-turn'],
  [
    interventionEvents('turn-budget-exhausted', 'author-revision'),
    'continued-to-author',
    'author-revision',
  ],
  [interventionEvents('stale-claim'), 'same-session-reclaim', 'reviewer-turn'],
  [interventionEvents('participant-loss'), 'participant-replaced', 'reviewer-turn'],
  [interventionEvents('turn-budget-exhausted'), 'override-committed', 'accepted-over-objections'],
  [
    noCommit(interventionEvents('turn-budget-exhausted')),
    'override-sealed-no-commit',
    'accepted-over-objections-uncommitted',
  ],
  [interventionEvents('turn-budget-exhausted'), 'abandoned', 'abandoned'],
  [sequence(['review-created']), 'superseded', 'superseded'],
  [reviewerTurnEvents(), 'superseded', 'superseded'],
  [authorRevisionEvents(), 'superseded', 'superseded'],
  [acceptancePendingEvents(), 'superseded', 'superseded'],
  [authorFinalizationEvents(), 'superseded', 'superseded'],
  [interventionEvents('turn-budget-exhausted'), 'superseded', 'superseded'],
];

const PROTECTED_ACTION = Object.freeze({
  'continued-to-reviewer': 'continue',
  'continued-to-author': 'continue',
  'participant-replaced': 'replace-participant',
  'override-committed': 'accept-over-objections',
  'override-sealed-no-commit': 'accept-over-objections',
  'supplement-registered': 'supplement',
});

test('legacy review-created authority reduces without adding runtime fields', () => {
  const legacy = sequence(['review-created']);
  const reduced = reduceEvents(legacy);
  assert.equal(Object.hasOwn(legacy[0].payload.startup, 'runtime'), false);
  assert.equal(Object.hasOwn(reduced.protocol.startup, 'runtime'), false);
  assert.deepEqual(reduced.protocol.startup, legacy[0].payload.startup);
});

function withConsumedChallenge(prefix, next) {
  const action = PROTECTED_ACTION[next.type];
  if (!action) return [...prefix, next];
  const authorizedPrefix = prefix.map((item, index) =>
    index === 0
      ? {
          ...item,
          payload: {
            ...item.payload,
            authority: {
              authority_policy: 'detection-allowed',
              challenge_ttl_ms: 15 * 60 * 1000,
              verifier: {
                kind: 'ed25519',
                verifier_id: 'human:key:test',
                verifier_fingerprint: `sha256:${'d'.repeat(64)}`,
                public_key: 'fixture-public-key',
                assurance_grade: 'mutable-local',
                signer_strength: 'cryptographic-local',
              },
            },
          },
        }
      : item
  );
  const state = reduceEvents(authorizedPrefix);
  const parameters = next.payload.supplement?.parameters ?? next.payload.parameters;
  const challenge = {
    schema: 'ai-peer-review.grant-challenge/v1',
    challenge_id: `challenge-${next.type}`,
    review_id: state.protocol.review_id,
    intervention_id: state.protocol.intervention.intervention_id,
    protocol_revision: state.protocol.revision,
    action,
    parameters_digest: digestGrantParameters(action, parameters),
    nonce: 'n'.repeat(43),
    expires_at: '2026-09-09T12:00:00.000Z',
  };
  const requested = event('challenge-requested', {
    sequence: prefix.length + 1,
    revision: state.protocol.revision,
    actor: FINGERPRINTS.author,
    payload: { challenge },
  });
  const attestation = {
    source: 'detached-signature',
    strength: 'cryptographic-local',
    signer_id: 'human:test',
    signer_fingerprint: `sha256:${'d'.repeat(64)}`,
    challenge_digest: digestChallenge(challenge),
    verified_at: next.at,
  };
  return [
    ...authorizedPrefix,
    requested,
    {
      ...next,
      sequence: next.sequence + 1,
      payload: next.payload.supplement
        ? {
            ...next.payload,
            supplement: { ...next.payload.supplement, attestation },
          }
        : { ...next.payload, attestation },
    },
  ];
}

test('protected events cannot substitute signed parameters for any action', () => {
  const cases = [
    ['continued-to-reviewer', 'turn-budget-exhausted'],
    ['participant-replaced', 'participant-loss'],
    ['override-committed', 'turn-budget-exhausted'],
    ['supplement-registered', 'turn-budget-exhausted'],
  ];
  for (const [type, reason] of cases) {
    const prefix = interventionEvents(reason);
    const state = reduceEvents(prefix);
    const next = event(type, {
      sequence: prefix.length + 1,
      revision: state.protocol.revision + 1,
      payload:
        type === 'supplement-registered'
          ? {}
          : { intervention_id: state.protocol.intervention.intervention_id },
    });
    const prepared = withConsumedChallenge(prefix, next);
    const authorized = prepared.at(-1);
    const current = authorized.payload.supplement?.parameters ?? authorized.payload.parameters;
    const altered =
      type === 'continued-to-reviewer'
        ? { ...current, additional_turns: current.additional_turns + 1 }
        : type === 'participant-replaced'
          ? { ...current, incoming_session_fingerprint: `sha256:${'f'.repeat(64)}` }
          : type === 'supplement-registered'
            ? { ...current, content_digest: `sha256:${'f'.repeat(64)}` }
            : { ...current, human_rationale_digest: `sha256:${'f'.repeat(64)}` };
    prepared[prepared.length - 1] = {
      ...authorized,
      payload: authorized.payload.supplement
        ? {
            ...authorized.payload,
            supplement: { ...authorized.payload.supplement, parameters: altered },
          }
        : { ...authorized.payload, parameters: altered },
    };
    assert.throws(
      () => reduceEvents(prepared),
      (error) => error.code === 'APR_INVALID_TRANSITION',
      type
    );
  }
});

test('participant replacement binds the exact outgoing claim and a distinct incoming session', () => {
  const prefix = interventionEvents('participant-loss');
  const state = reduceEvents(prefix);
  const replacement = event('participant-replaced', {
    sequence: prefix.length + 1,
    revision: state.protocol.revision + 1,
    payload: { intervention_id: state.protocol.intervention.intervention_id },
  });

  const changedClaim = withConsumedChallenge(prefix, replacement);
  changedClaim[changedClaim.length - 1] = {
    ...changedClaim.at(-1),
    payload: {
      ...changedClaim.at(-1).payload,
      outgoing_claim: {
        ...changedClaim.at(-1).payload.outgoing_claim,
        expires_at: '2026-09-09T13:00:00.000Z',
      },
    },
  };
  assert.throws(
    () => reduceEvents(changedClaim),
    (error) => error.code === 'APR_INVALID_TRANSITION'
  );

  const sameAsAuthor = {
    ...replacement,
    payload: {
      ...replacement.payload,
      incoming_participant: {
        ...replacement.payload.incoming_participant,
        session_fingerprint: FINGERPRINTS.author,
      },
      parameters: {
        ...replacement.payload.parameters,
        incoming_session_fingerprint: FINGERPRINTS.author,
      },
    },
  };
  assert.throws(
    () => reduceEvents(withConsumedChallenge(prefix, sameAsAuthor)),
    (error) => error.code === 'APR_INVALID_TRANSITION'
  );
});

test('allows the complete lifecycle matrix and derives exact states', () => {
  for (const [prefix, type, expectedState] of cases) {
    const priorRevision = prefix.at(-1)?.revision ?? 0;
    const interventionId = reduceEvents(prefix).protocol.intervention?.intervention_id;
    const next = event(type, {
      sequence: prefix.length + 1,
      revision: priorRevision + (REVISION_NEUTRAL_TYPES.has(type) ? 0 : 1),
      payload: interventionId && type !== 'superseded' ? { intervention_id: interventionId } : {},
    });
    assert.equal(
      reduceEvents(withConsumedChallenge(prefix, next)).protocol.state,
      expectedState,
      type
    );
  }
});

test('all other reachable state and lifecycle-event pairs fail closed', () => {
  const prefixes = new Map([
    [null, []],
    ['awaiting-reviewer', sequence(['review-created'])],
    ['reviewer-turn', reviewerTurnEvents()],
    ['author-revision', authorRevisionEvents()],
    ['acceptance-pending', acceptancePendingEvents()],
    ['author-finalization', authorFinalizationEvents()],
    ['intervention-required', interventionEvents('turn-budget-exhausted')],
  ]);
  const allowed = new Set(
    cases.map(([prefix, type]) => `${reduceEvents(prefix).protocol.state}|${type}`)
  );
  for (const [state, prefix] of prefixes) {
    for (const type of LIFECYCLE_EVENT_TYPES) {
      if (allowed.has(`${state}|${type}`)) continue;
      const priorRevision = prefix.at(-1)?.revision ?? 0;
      assert.throws(
        () =>
          reduceEvents([
            ...prefix,
            event(type, {
              sequence: prefix.length + 1,
              revision: priorRevision + (REVISION_NEUTRAL_TYPES.has(type) ? 0 : 1),
            }),
          ]),
        (error) => error.code === 'APR_INVALID_TRANSITION',
        `${state} -> ${type}`
      );
    }
  }
});

test('enforces contiguous sequence and independent revision advancement', () => {
  const valid = reviewerTurnEvents();
  assert.throws(
    () => reduceEvents([{ ...valid[0], sequence: 2 }]),
    (error) => error.code === 'APR_PROJECTION_DRIFT'
  );
  assert.throws(
    () => reduceEvents([valid[0], { ...valid[1], revision: valid[0].revision }]),
    (error) => error.code === 'APR_PROJECTION_DRIFT'
  );
  const refreshed = event('identity-changed', {
    sequence: valid.length + 1,
    revision: valid.at(-1).revision,
    actor: FINGERPRINTS.reviewer,
    payload: { role: 'reviewer', identity: valid[1].payload.reviewer },
  });
  assert.equal(reduceEvents([...valid, refreshed]).protocol.revision, valid.at(-1).revision);
});

test('submission lifecycle events require an unexpired current-role claim', () => {
  const prefix = claimedReviewerTurnEvents();
  const stale = prefix.map((item, index) =>
    index === prefix.length - 1
      ? {
          ...item,
          payload: {
            claim: claim('reviewer', { expiresAt: '2026-09-08T12:00:03.500Z' }),
          },
        }
      : item
  );
  const decision = event('reviewer-accepted', {
    sequence: stale.length + 1,
    revision: stale.at(-1).revision + 1,
    actor: FINGERPRINTS.reviewer,
  });
  assert.throws(
    () => reduceEvents([...stale, decision]),
    (error) =>
      error.code === 'APR_INVALID_TRANSITION' &&
      error.details.detail === 'submission requires one active current claim'
  );
});

test('terminal states reject every later event', () => {
  const finalizing = authorFinalizationEvents();
  const accepted = [
    ...finalizing,
    event('acceptance-committed', {
      sequence: finalizing.length + 1,
      revision: finalizing.at(-1).revision + 1,
    }),
  ];
  for (const type of [...LIFECYCLE_EVENT_TYPES, 'turn-claimed']) {
    const revision = accepted.at(-1).revision + (REVISION_NEUTRAL_TYPES.has(type) ? 0 : 1);
    assert.throws(
      () => reduceEvents([...accepted, event(type, { sequence: accepted.length + 1, revision })]),
      (error) => error.code === 'APR_INVALID_TRANSITION'
    );
  }
});

test('recovery restores the immutable interrupted role and refuses a live challenge', () => {
  const staleAuthor = interventionEvents('stale-claim', 'author-revision');
  const reclaim = event('same-session-reclaim', {
    sequence: staleAuthor.length + 1,
    revision: staleAuthor.at(-1).revision,
    payload: {
      intervention_id: 'intervention-stale-claim',
      old_claim: claim('author'),
      new_claim: claim('author', {
        claimId: 'new',
        claimedAt: '2026-09-08T12:01:00.000Z',
        lastActivityAt: '2026-09-08T12:01:00.000Z',
        expiresAt: '2026-09-08T20:01:00.000Z',
      }),
    },
  });
  assert.equal(reduceEvents([...staleAuthor, reclaim]).protocol.state, 'author-revision');

  const challenged = [
    ...staleAuthor,
    event('challenge-requested', {
      sequence: staleAuthor.length + 1,
      revision: staleAuthor.at(-1).revision,
    }),
  ];
  assert.throws(
    () => reduceEvents([...challenged, { ...reclaim, sequence: reclaim.sequence + 1 }]),
    (error) => error.code === 'APR_INVALID_TRANSITION'
  );
});

test('outside intervention, reclaim is only an exact same-claim retry', () => {
  const prefix = claimedReviewerTurnEvents();
  const currentClaim = claim('reviewer');
  const exactRetry = event('same-session-reclaim', {
    sequence: prefix.length + 1,
    revision: prefix.at(-1).revision,
    payload: {
      intervention_id: 'idempotent-retry',
      old_claim: currentClaim,
      new_claim: currentClaim,
    },
  });
  assert.equal(reduceEvents([...prefix, exactRetry]).protocol.state, 'reviewer-turn');

  for (const payload of [
    { ...exactRetry.payload, old_claim: claim('reviewer', { claimId: 'other' }) },
    {
      ...exactRetry.payload,
      new_claim: claim('reviewer', { expiresAt: '2026-09-08T21:00:00.000Z' }),
    },
  ]) {
    assert.throws(
      () => reduceEvents([...prefix, { ...exactRetry, payload }]),
      (error) => error.code === 'APR_INVALID_TRANSITION'
    );
  }
});

test('delivery IDs are unique authority keys', () => {
  const prefix = reviewerTurnEvents();
  const first = event('delivery-written', {
    sequence: prefix.length + 1,
    revision: prefix.at(-1).revision,
  });
  const duplicate = event('delivery-written', {
    sequence: prefix.length + 2,
    revision: prefix.at(-1).revision,
  });
  assert.throws(
    () => reduceEvents([...prefix, first, duplicate]),
    (error) => error.code === 'APR_DELIVERY_CONFLICT'
  );
});
