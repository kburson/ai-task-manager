import { randomBytes, randomUUID } from 'node:crypto';

import { AprError } from '../errors.mjs';
import { validateEvent } from '../protocol/events.mjs';
import { mutateReview, readReview } from '../protocol/service.mjs';
import { canonicalChallengeBytes, digestGrantParameters } from './canonicalize.mjs';

function authorityError(code, message, recovery, details = {}) {
  throw new AprError(code, message, { recovery, details });
}

function protocolOf(review) {
  const protocol = review?.protocol ?? review;
  if (!protocol || typeof protocol !== 'object') {
    authorityError(
      'APR_CHALLENGE_INVALID',
      'Review authority is required.',
      'Read the current review and retry.'
    );
  }
  return protocol;
}

function instant(value) {
  const date = value instanceof Date ? new Date(value.valueOf()) : new Date(value);
  if (Number.isNaN(date.valueOf())) {
    authorityError(
      'APR_CHALLENGE_INVALID',
      'Challenge time is invalid.',
      'Provide a valid clock instant.'
    );
  }
  return date;
}

function liveChallenges(protocol, now) {
  const timestamp = now.valueOf();
  return (protocol.challenges ?? []).filter(
    (challenge) =>
      !challenge.superseded_at &&
      !challenge.consumed_at &&
      Date.parse(challenge.expires_at) > timestamp
  );
}

function challengeCore(challenge) {
  return Object.freeze({
    schema: challenge.schema,
    challenge_id: challenge.challenge_id,
    review_id: challenge.review_id,
    intervention_id: challenge.intervention_id,
    protocol_revision: challenge.protocol_revision,
    action: challenge.action,
    parameters_digest: challenge.parameters_digest,
    nonce: challenge.nonce,
    expires_at: challenge.expires_at,
  });
}

function expectedIntervention(protocol, action) {
  if (action === 'pin-verifier') return null;
  if (protocol.state !== 'intervention-required' || !protocol.intervention?.intervention_id) {
    authorityError(
      'APR_CHALLENGE_STATE',
      `Protected action ${action} requires an active intervention.`,
      'Read status and request authority only for the current intervention.',
      { action, state: protocol.state }
    );
  }
  return protocol.intervention.intervention_id;
}

export function requestChallenge(review, action, parameters, now = new Date()) {
  const protocol = protocolOf(review);
  const at = instant(now);
  const configuration = protocol.authority;
  if (
    !configuration ||
    configuration.authority_policy === 'unavailable' ||
    !configuration.verifier
  ) {
    authorityError(
      'APR_AUTHORITY_UNAVAILABLE',
      'Human Authority is unavailable for this review.',
      'Continue ordinary consensus within the original budget or start a new review with a pinned verifier.'
    );
  }
  const parametersDigest = digestGrantParameters(action, parameters);
  const interventionId = expectedIntervention(protocol, action);
  const matching = {
    review_id: protocol.review_id,
    intervention_id: interventionId,
    protocol_revision: protocol.revision,
    action,
    parameters_digest: parametersDigest,
  };
  const live = liveChallenges(protocol, at);
  const same = live.find((challenge) =>
    Object.entries(matching).every(([key, value]) => challenge[key] === value)
  );
  if (same) return Object.freeze(challengeCore(same));
  if (live.length) {
    authorityError(
      'APR_CHALLENGE_ACTIVE',
      'A different unexpired Human Authority challenge is already active.',
      'Use the existing challenge or let its requesting participant supersede it explicitly.',
      { challenge_id: live[0].challenge_id }
    );
  }
  const ttl = configuration.challenge_ttl_ms;
  if (!Number.isSafeInteger(ttl) || ttl <= 0 || at.valueOf() + ttl > 8.64e15) {
    authorityError(
      'APR_CHALLENGE_INVALID',
      'Challenge TTL is invalid.',
      'Use the startup-pinned positive safe challenge TTL.'
    );
  }
  const challenge = Object.freeze({
    schema: 'ai-peer-review.grant-challenge/v1',
    challenge_id: `challenge-${randomUUID()}`,
    review_id: protocol.review_id,
    intervention_id: interventionId,
    protocol_revision: protocol.revision,
    action,
    parameters_digest: parametersDigest,
    nonce: randomBytes(32).toString('base64url'),
    expires_at: new Date(at.valueOf() + ttl).toISOString(),
  });
  canonicalChallengeBytes(challenge);
  return challenge;
}

function eventEnvelope(review, type, actor, at, payload) {
  const protocol = protocolOf(review);
  const value = Object.freeze({
    schema: 'ai-peer-review.event/v1',
    review_id: protocol.review_id,
    sequence: protocol.sequence + 1,
    revision: protocol.revision,
    type,
    actor,
    at: instant(at).toISOString(),
    payload,
  });
  validateEvent(value);
  return value;
}

export function challengeRequestedEvent(review, challenge, actor, now = new Date()) {
  canonicalChallengeBytes(challenge);
  return eventEnvelope(review, 'challenge-requested', actor, now, { challenge });
}

export function challengeSupersededEvent(review, challengeId, actor, now = new Date()) {
  return eventEnvelope(review, 'challenge-superseded', actor, now, {
    challenge_id: challengeId,
  });
}

export async function requestGrant(
  workspace,
  action,
  parameters,
  { requesterFingerprint, now = new Date() } = {}
) {
  if (typeof requesterFingerprint !== 'string') {
    authorityError(
      'APR_IDENTITY_REQUIRED',
      'The challenge requester session fingerprint is required.',
      'Resolve the current participant identity and retry.'
    );
  }
  const before = await readReview(workspace);
  const challenge = requestChallenge(before, action, parameters, now);
  if (
    before.protocol.challenges.some(
      (candidate) => candidate.challenge_id === challenge.challenge_id
    )
  ) {
    return challenge;
  }
  const expected = {
    reviewId: before.protocol.review_id,
    revision: before.protocol.revision,
    sequence: before.protocol.sequence,
    actor: before.protocol.current_actor,
  };
  const next = await mutateReview(workspace, expected, (current) => {
    const locked = requestChallenge(current, action, parameters, now);
    return challengeRequestedEvent(current, locked, requesterFingerprint, now);
  });
  return Object.freeze(challengeCore(next.protocol.challenges.at(-1)));
}
