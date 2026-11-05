import { AprError } from '../errors.mjs';
import { digestChallenge, digestGrantParameters } from '../authority/canonicalize.mjs';
import { eventAdvancesRevision, validateEvent } from './events.mjs';

export const LIFECYCLE_EVENT_TYPES = Object.freeze([
  'review-created',
  'reviewer-joined',
  'reviewer-revisions-requested',
  'reviewer-accepted',
  'author-revision-committed',
  'author-revision-sealed-no-commit',
  'author-closing-round-committed',
  'author-closing-round-sealed-no-commit',
  'finalization-started',
  'acceptance-committed',
  'acceptance-sealed-no-commit',
  'phase-acceptance-committed',
  'phase-acceptance-sealed-no-commit',
  'phase-artifact-committed',
  'phase-artifact-sealed-no-commit',
  'intervention-entered',
  'continued-to-reviewer',
  'continued-to-author',
  'same-session-reclaim',
  'participant-replaced',
  'override-committed',
  'override-sealed-no-commit',
  'abandoned',
  'superseded',
]);

const TERMINAL_STATES = new Set([
  'accepted',
  'accepted-uncommitted',
  'accepted-over-objections',
  'accepted-over-objections-uncommitted',
  'abandoned',
  'superseded',
]);

const TRANSITIONS = new Map([
  ['null|review-created', 'awaiting-reviewer'],
  ['awaiting-reviewer|reviewer-joined', 'reviewer-turn'],
  ['reviewer-turn|reviewer-revisions-requested', 'author-revision'],
  ['reviewer-turn|reviewer-accepted', 'acceptance-pending'],
  ['author-revision|author-revision-committed', 'reviewer-turn'],
  ['author-revision|author-revision-sealed-no-commit', 'reviewer-turn'],
  ['author-revision|author-closing-round-committed', 'intervention-required'],
  ['author-revision|author-closing-round-sealed-no-commit', 'intervention-required'],
  ['acceptance-pending|finalization-started', 'author-finalization'],
  ['author-finalization|acceptance-committed', 'accepted'],
  ['author-finalization|acceptance-sealed-no-commit', 'accepted-uncommitted'],
  ['author-finalization|phase-acceptance-committed', 'awaiting-phase-artifact'],
  ['author-finalization|phase-acceptance-sealed-no-commit', 'awaiting-phase-artifact'],
  ['awaiting-phase-artifact|phase-artifact-committed', 'reviewer-turn'],
  ['awaiting-phase-artifact|phase-artifact-sealed-no-commit', 'reviewer-turn'],
  ['reviewer-turn|intervention-entered', 'intervention-required'],
  ['author-revision|intervention-entered', 'intervention-required'],
  ['intervention-required|continued-to-reviewer', 'reviewer-turn'],
  ['intervention-required|continued-to-author', 'author-revision'],
  ['intervention-required|same-session-reclaim', 'restore'],
  ['intervention-required|participant-replaced', 'restore'],
  ['intervention-required|override-committed', 'accepted-over-objections'],
  ['intervention-required|override-sealed-no-commit', 'accepted-over-objections-uncommitted'],
  ['intervention-required|abandoned', 'abandoned'],
]);

const STATE_PRESERVING = new Set([
  'turn-claimed',
  'identity-changed',
  'challenge-requested',
  'challenge-superseded',
  'supplement-registered',
  'delivery-written',
  'delivery-acknowledged',
]);

function copy(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, canonical(value[key])])
    );
  }
  return value;
}

function exactlyEqual(left, right) {
  return JSON.stringify(canonical(left)) === JSON.stringify(canonical(right));
}

function projectionError(detail) {
  return new AprError('APR_PROJECTION_DRIFT', `Event authority cannot be reduced: ${detail}.`, {
    recovery: 'Inspect events.jsonl and restore the exact contiguous authoritative event history.',
    details: { detail },
  });
}

function transitionError(state, event, detail = null) {
  return new AprError(
    'APR_INVALID_TRANSITION',
    `Event ${event.type} is invalid from ${state ?? 'uninitialized'}.`,
    {
      recovery: 'Read the current review status and submit only its documented next action.',
      details: { state, type: event.type, ...(detail ? { detail } : {}) },
    }
  );
}

function deliveryConflict(event) {
  return new AprError(
    'APR_DELIVERY_CONFLICT',
    `Delivery ID ${event.payload.delivery.delivery_id} already exists in event authority.`,
    {
      recovery: 'Create a delivery with a new collision-resistant delivery ID.',
      details: { delivery_id: event.payload.delivery.delivery_id },
    }
  );
}

function initialProjection() {
  return {
    protocol: {
      schema: 'ai-peer-review.protocol/v1',
      review_id: null,
      sequence: 0,
      revision: 0,
      state: null,
      current_actor: null,
      commit_mode: null,
      max_turns: 0,
      claim_ttl_ms: 0,
      authority: null,
      startup: null,
      reviewer_boundary: null,
      transports: { author: null, reviewer: null },
      turns_used: 0,
      artifact: null,
      claims: {},
      challenges: [],
      supplements: [],
      deliveries: [],
      intervention: null,
      terminal_evidence: null,
      next_action: 'create-review',
    },
    participants: {
      schema: 'ai-peer-review.participants/v1',
      review_id: null,
      author: null,
      reviewer: null,
    },
    nextAction: 'create-review',
  };
}

function nextAction(state) {
  return (
    {
      'awaiting-reviewer': 'join-reviewer',
      'reviewer-turn': 'reviewer-submit',
      'author-revision': 'author-submit',
      'acceptance-pending': 'finalize-acceptance',
      'author-finalization': 'commit-acceptance',
      'awaiting-phase-artifact': 'advance-phase-artifact',
      'intervention-required': 'human-intervention',
    }[state] ?? null
  );
}

function currentActor(state) {
  return (
    {
      'awaiting-reviewer': 'reviewer',
      'reviewer-turn': 'reviewer',
      'author-revision': 'author',
      'acceptance-pending': 'author',
      'author-finalization': 'author',
      'awaiting-phase-artifact': 'author',
      'intervention-required': 'human',
    }[state] ?? null
  );
}

function hasLiveChallenge(protocol, at) {
  return protocol.challenges.some(
    (challenge) =>
      !challenge.superseded_at &&
      !challenge.consumed_at &&
      typeof challenge.expires_at === 'string' &&
      Date.parse(challenge.expires_at) > Date.parse(at)
  );
}

function challengeCore(challenge) {
  return {
    schema: challenge.schema,
    challenge_id: challenge.challenge_id,
    review_id: challenge.review_id,
    intervention_id: challenge.intervention_id,
    protocol_revision: challenge.protocol_revision,
    action: challenge.action,
    parameters_digest: challenge.parameters_digest,
    nonce: challenge.nonce,
    expires_at: challenge.expires_at,
  };
}

function registeredFingerprint(participants, fingerprint) {
  return ['author', 'reviewer'].some(
    (role) => participants[role]?.session_fingerprint === fingerprint
  );
}

function protectedAuthority(event) {
  if (event.type === 'continued-to-reviewer' || event.type === 'continued-to-author') {
    return {
      action: 'continue',
      parameters: event.payload.parameters,
      attestation: event.payload.attestation,
    };
  }
  if (event.type === 'participant-replaced') {
    return {
      action: 'replace-participant',
      parameters: event.payload.parameters,
      attestation: event.payload.attestation,
    };
  }
  if (event.type === 'override-committed' || event.type === 'override-sealed-no-commit') {
    return {
      action: 'accept-over-objections',
      parameters: event.payload.parameters,
      attestation: event.payload.attestation,
    };
  }
  if (event.type === 'supplement-registered') {
    return {
      action: 'supplement',
      parameters: event.payload.supplement.parameters,
      attestation: event.payload.supplement.attestation,
    };
  }
  return null;
}

function protectedParametersMatchEvent(event, action, parameters) {
  if (action === 'continue') {
    return (
      parameters.additional_turns === event.payload.additional_turns &&
      parameters.resulting_effective_maximum === event.payload.effective_max_turns &&
      parameters.resume_role === (event.type === 'continued-to-reviewer' ? 'reviewer' : 'author')
    );
  }
  if (action === 'replace-participant') {
    return (
      parameters.role === event.payload.role &&
      parameters.outgoing_claim_id === event.payload.outgoing_claim.claim_id &&
      parameters.outgoing_session_fingerprint ===
        event.payload.outgoing_claim.session_fingerprint &&
      parameters.incoming_session_fingerprint ===
        event.payload.incoming_participant.session_fingerprint
    );
  }
  if (action === 'supplement') {
    return (
      parameters.content_digest === event.payload.supplement.digest &&
      parameters.target_role === event.payload.supplement.target_role &&
      parameters.target_turn === event.payload.supplement.target_turn
    );
  }
  return action === 'accept-over-objections';
}

function consumeChallenge(protocol, event) {
  const authority = protectedAuthority(event);
  if (!authority) return;
  let parametersDigest;
  try {
    parametersDigest = digestGrantParameters(authority.action, authority.parameters);
  } catch {
    throw transitionError(protocol.state, event, 'protected event parameters are invalid');
  }
  const challenge = protocol.challenges.find(
    (candidate) =>
      digestChallenge(challengeCore(candidate)) === authority.attestation.challenge_digest
  );
  if (
    !challenge ||
    challenge.action !== authority.action ||
    challenge.parameters_digest !== parametersDigest ||
    !protectedParametersMatchEvent(event, authority.action, authority.parameters) ||
    challenge.review_id !== protocol.review_id ||
    challenge.protocol_revision !== protocol.revision ||
    challenge.intervention_id !== protocol.intervention?.intervention_id ||
    challenge.consumed_at ||
    challenge.superseded_at ||
    Date.parse(challenge.expires_at) <= Date.parse(event.at)
  ) {
    throw transitionError(protocol.state, event, 'protected event lacks one live bound challenge');
  }
  challenge.consumed_at = event.at;
}

function ensureStatePreservingAllowed(protocol, event) {
  if (protocol.state === null || TERMINAL_STATES.has(protocol.state)) {
    throw transitionError(protocol.state, event);
  }
  if (
    ['challenge-requested', 'challenge-superseded', 'supplement-registered'].includes(event.type) &&
    protocol.state !== 'intervention-required'
  ) {
    throw transitionError(protocol.state, event);
  }
}

function applyLifecycle(protocol, participants, event) {
  if (!LIFECYCLE_EVENT_TYPES.includes(event.type)) return protocol.state;
  if (TERMINAL_STATES.has(protocol.state)) throw transitionError(protocol.state, event);
  if (event.type === 'superseded') {
    if (protocol.state === null || !registeredFingerprint(participants, event.actor)) {
      throw transitionError(
        protocol.state,
        event,
        'supersession requires one registered participant'
      );
    }
    if (event.payload.successor_review_id === protocol.review_id) {
      throw transitionError(protocol.state, event, 'successor must be a distinct review attempt');
    }
    return 'superseded';
  }
  const uncommitted = new Set([
    'author-revision-sealed-no-commit',
    'author-closing-round-sealed-no-commit',
    'acceptance-sealed-no-commit',
    'phase-acceptance-sealed-no-commit',
    'phase-artifact-sealed-no-commit',
    'override-sealed-no-commit',
  ]);
  const committed = new Set([
    'author-revision-committed',
    'author-closing-round-committed',
    'acceptance-committed',
    'phase-acceptance-committed',
    'phase-artifact-committed',
    'override-committed',
  ]);
  if (
    (uncommitted.has(event.type) && protocol.commit_mode !== 'no-commit') ||
    (committed.has(event.type) && protocol.commit_mode !== 'normal')
  ) {
    throw transitionError(protocol.state, event, 'event differs from startup commit mode');
  }
  const phaseAcceptance = [
    'phase-acceptance-committed',
    'phase-acceptance-sealed-no-commit',
  ].includes(event.type);
  const phaseArtifact = ['phase-artifact-committed', 'phase-artifact-sealed-no-commit'].includes(
    event.type
  );
  if (phaseAcceptance) {
    const phases = protocol.phases;
    if (
      !phases ||
      phases.cursor >= phases.kinds.length - 1 ||
      event.payload.cursor !== phases.cursor ||
      event.payload.kind !== phases.current_kind ||
      !exactlyEqual(event.payload.artifact, {
        path: protocol.artifact.path,
        blob: protocol.artifact.blob,
        digest: protocol.artifact.digest,
      })
    ) {
      throw transitionError(protocol.state, event, 'phase acceptance authority mismatch');
    }
  }
  if (phaseArtifact) {
    const phases = protocol.phases;
    const nextCursor = (phases?.cursor ?? -1) + 1;
    if (
      !phases ||
      event.payload.cursor !== nextCursor ||
      event.payload.kind !== phases.kinds[nextCursor] ||
      phases.completed.length !== nextCursor
    ) {
      throw transitionError(protocol.state, event, 'phase artifact authority mismatch');
    }
  }
  if (
    ['acceptance-committed', 'acceptance-sealed-no-commit'].includes(event.type) &&
    protocol.phases &&
    protocol.phases.cursor < protocol.phases.kinds.length - 1
  ) {
    throw transitionError(protocol.state, event, 'non-final phase cannot terminate the review');
  }
  const target = TRANSITIONS.get(`${String(protocol.state)}|${event.type}`);
  if (!target) {
    if (event.type === 'same-session-reclaim' && protocol.state !== 'intervention-required') {
      const oldClaim = event.payload.old_claim;
      const newClaim = event.payload.new_claim;
      const current = protocol.claims[newClaim.role];
      if (current && exactlyEqual(current, oldClaim) && exactlyEqual(current, newClaim)) {
        return protocol.state;
      }
    }
    throw transitionError(protocol.state, event);
  }

  if (protocol.state === 'intervention-required') {
    if (event.payload.intervention_id !== protocol.intervention?.intervention_id) {
      throw transitionError(protocol.state, event, 'intervention ID mismatch');
    }
    if (
      ['same-session-reclaim', 'participant-replaced', 'abandoned'].includes(event.type) &&
      hasLiveChallenge(protocol, event.at)
    ) {
      throw transitionError(protocol.state, event, 'unexpired Human Authority challenge');
    }
    if (event.type === 'same-session-reclaim') {
      if (protocol.intervention?.reason !== 'stale-claim') {
        throw transitionError(protocol.state, event, 'reclaim requires stale-claim intervention');
      }
      const { old_claim: oldClaim, new_claim: newClaim } = event.payload;
      const currentClaim = protocol.claims[newClaim.role];
      if (
        !currentClaim ||
        !exactlyEqual(currentClaim, oldClaim) ||
        oldClaim.role !== newClaim.role ||
        oldClaim.session_fingerprint !== newClaim.session_fingerprint ||
        newClaim.role !== protocol.intervention.interrupted_state.replace(/-.+$/, '')
      ) {
        throw transitionError(protocol.state, event, 'conflicting reclaim');
      }
    }
    if (event.type === 'continued-to-reviewer' || event.type === 'continued-to-author') {
      const resumeRole = event.type === 'continued-to-reviewer' ? 'reviewer' : 'author';
      const interruptedRole = protocol.intervention?.interrupted_state?.replace(/-.+$/, '');
      if (
        protocol.intervention?.reason !== 'turn-budget-exhausted' ||
        resumeRole !== interruptedRole ||
        event.payload.effective_max_turns !== protocol.max_turns + event.payload.additional_turns
      ) {
        throw transitionError(
          protocol.state,
          event,
          'continuation must add to the frozen budget and restore the interrupted role'
        );
      }
    }
    if (
      event.type === 'participant-replaced' &&
      protocol.intervention?.reason !== 'participant-loss'
    ) {
      throw transitionError(protocol.state, event, 'replacement requires participant-loss');
    }
    if (event.type === 'participant-replaced') {
      const role = event.payload.role;
      const otherRole = role === 'author' ? 'reviewer' : 'author';
      const currentClaim = protocol.claims[role];
      const currentParticipant = participants[role];
      if (
        !currentClaim ||
        !currentParticipant ||
        !exactlyEqual(currentClaim, event.payload.outgoing_claim) ||
        currentClaim.session_fingerprint !== currentParticipant.session_fingerprint ||
        event.payload.incoming_participant.session_fingerprint ===
          participants[otherRole]?.session_fingerprint
      ) {
        throw transitionError(
          protocol.state,
          event,
          'replacement must bind the current claim and preserve distinct participants'
        );
      }
    }
  }

  if (event.type === 'participant-replaced') {
    participants[event.payload.role] = copy(event.payload.incoming_participant);
  }
  return target === 'restore' ? protocol.intervention.interrupted_state : target;
}

function applyProjection(state, event) {
  const protocol = state.protocol;
  const participants = state.participants;
  if (STATE_PRESERVING.has(event.type)) ensureStatePreservingAllowed(protocol, event);

  if (
    event.type === 'reviewer-joined' &&
    participants.author?.session_fingerprint === event.payload.reviewer.session_fingerprint
  ) {
    throw transitionError(protocol.state, event, 'participants must use distinct sessions');
  }
  if (event.type === 'identity-changed') {
    const current = participants[event.payload.role];
    if (
      !current ||
      current.session_fingerprint !== event.payload.identity.session_fingerprint ||
      current.joined_at !== event.payload.identity.joined_at ||
      event.actor !== current.session_fingerprint
    ) {
      throw transitionError(protocol.state, event, 'identity change must retain session authority');
    }
  }
  if (event.type === 'turn-claimed') {
    const claim = event.payload.claim;
    const participant = participants[claim.role];
    if (
      claim.role !== protocol.current_actor ||
      !participant ||
      claim.session_fingerprint !== participant.session_fingerprint ||
      event.actor !== claim.session_fingerprint ||
      protocol.claims[claim.role]
    ) {
      throw transitionError(
        protocol.state,
        event,
        'claim does not match unoccupied turn authority'
      );
    }
  }
  if (event.type === 'challenge-requested') {
    const challenge = event.payload.challenge;
    const authorityAvailable =
      protocol.authority?.authority_policy !== 'unavailable' && protocol.authority?.verifier;
    const active = protocol.challenges.some(
      (candidate) =>
        !candidate.consumed_at &&
        !candidate.superseded_at &&
        Date.parse(candidate.expires_at) > Date.parse(event.at)
    );
    if (
      !authorityAvailable ||
      !registeredFingerprint(participants, event.actor) ||
      challenge.review_id !== protocol.review_id ||
      challenge.protocol_revision !== protocol.revision ||
      challenge.intervention_id !== (protocol.intervention?.intervention_id ?? null) ||
      active
    ) {
      throw transitionError(protocol.state, event, 'challenge does not match frozen authority');
    }
  }
  if (event.type === 'challenge-superseded') {
    const challenge = protocol.challenges.find(
      (candidate) => candidate.challenge_id === event.payload.challenge_id
    );
    if (
      !challenge ||
      challenge.requested_by !== event.actor ||
      challenge.consumed_at ||
      challenge.superseded_at ||
      Date.parse(challenge.expires_at) <= Date.parse(event.at)
    ) {
      throw transitionError(protocol.state, event, 'only requester may supersede a live challenge');
    }
  }
  consumeChallenge(protocol, event);
  const submissionRole = ['reviewer-revisions-requested', 'reviewer-accepted'].includes(event.type)
    ? 'reviewer'
    : [
          'author-revision-committed',
          'author-closing-round-committed',
          'author-revision-sealed-no-commit',
          'author-closing-round-sealed-no-commit',
          'phase-artifact-committed',
          'phase-artifact-sealed-no-commit',
        ].includes(event.type)
      ? 'author'
      : null;
  if (submissionRole !== null) {
    const participant = participants[submissionRole];
    const claim = protocol.claims[submissionRole];
    if (
      protocol.current_actor !== submissionRole ||
      !participant ||
      !claim ||
      event.actor !== participant.session_fingerprint ||
      claim.session_fingerprint !== participant.session_fingerprint ||
      Date.parse(claim.expires_at) <= Date.parse(event.at)
    ) {
      throw transitionError(protocol.state, event, 'submission requires one active current claim');
    }
  }
  const lifecycle = applyLifecycle(protocol, participants, event);

  if (event.type === 'review-created') {
    protocol.review_id = event.review_id;
    participants.review_id = event.review_id;
    protocol.commit_mode = event.payload.commit_mode;
    protocol.max_turns = event.payload.max_turns;
    protocol.claim_ttl_ms = event.payload.claim_ttl_ms;
    protocol.authority = copy(event.payload.authority);
    // The closed event validator admits optional runtime authority here; copying
    // the whole startup object preserves byte-compatible legacy authority when absent.
    protocol.startup = copy(event.payload.startup);
    protocol.transports.author = event.payload.startup.author_transport_capability;
    protocol.artifact = copy(event.payload.artifact);
    participants.author = copy(event.payload.author);
    if (event.payload.phases) {
      protocol.phases = {
        kinds: copy(event.payload.phases.kinds),
        cursor: 0,
        current_kind: event.payload.phases.kinds[0],
        phase_turns_used: 0,
        completed: [],
      };
    }
  } else if (event.type === 'reviewer-joined') {
    participants.reviewer = copy(event.payload.reviewer);
    protocol.transports.reviewer = event.payload.transport_capability;
    protocol.reviewer_boundary = copy(event.payload.repository_boundary);
  }
  if (event.type === 'reviewer-revisions-requested' || event.type === 'reviewer-accepted') {
    protocol.turns_used += 1;
    if (protocol.phases) protocol.phases.phase_turns_used += 1;
  }
  if (
    event.type === 'phase-acceptance-committed' ||
    event.type === 'phase-acceptance-sealed-no-commit'
  ) {
    protocol.phases.completed.push(copy(event.payload));
  }
  if (
    event.type === 'phase-artifact-committed' ||
    event.type === 'phase-artifact-sealed-no-commit'
  ) {
    protocol.phases.cursor = event.payload.cursor;
    protocol.phases.current_kind = event.payload.kind;
    protocol.phases.phase_turns_used = 0;
  }
  if (
    event.type === 'author-revision-committed' ||
    event.type === 'author-revision-sealed-no-commit' ||
    event.type === 'author-closing-round-committed' ||
    event.type === 'author-closing-round-sealed-no-commit' ||
    event.type === 'phase-artifact-committed' ||
    event.type === 'phase-artifact-sealed-no-commit'
  ) {
    protocol.reviewer_boundary = copy(event.payload.repository_boundary);
  }
  if (event.payload.artifact) {
    protocol.artifact = {
      ...copy(event.payload.artifact),
      head: event.payload.commit ?? protocol.artifact?.head,
    };
  }
  if (
    event.type === 'author-closing-round-committed' ||
    event.type === 'author-closing-round-sealed-no-commit' ||
    event.type === 'intervention-entered'
  ) {
    protocol.intervention = {
      intervention_id: event.payload.intervention_id,
      reason: event.payload.reason,
      interrupted_state: event.payload.interrupted_state,
      entered_at: event.at,
    };
  }
  if (event.type === 'continued-to-reviewer' || event.type === 'continued-to-author') {
    protocol.max_turns = event.payload.effective_max_turns;
    delete protocol.claims[event.type === 'continued-to-reviewer' ? 'reviewer' : 'author'];
    protocol.intervention = null;
  }
  if (event.type === 'same-session-reclaim') {
    protocol.claims[event.payload.new_claim.role] = copy(event.payload.new_claim);
    protocol.intervention = null;
  }
  if (event.type === 'participant-replaced') {
    delete protocol.claims[event.payload.role];
    protocol.intervention = null;
  }
  if (event.type === 'turn-claimed') {
    protocol.claims[event.payload.claim.role] = copy(event.payload.claim);
  }
  if (event.type === 'identity-changed') {
    participants[event.payload.role] = copy(event.payload.identity);
  }
  if (event.type === 'challenge-requested') {
    protocol.challenges.push({
      ...copy(event.payload.challenge),
      requested_at: event.at,
      requested_by: event.actor,
      consumed_at: null,
      superseded_at: null,
    });
  }
  if (event.type === 'challenge-superseded') {
    const challenge = protocol.challenges.find(
      (candidate) => candidate.challenge_id === event.payload.challenge_id
    );
    if (!challenge) throw transitionError(protocol.state, event, 'unknown challenge');
    challenge.superseded_at = event.at;
  }
  if (event.type === 'supplement-registered') {
    protocol.supplements.push(copy(event.payload.supplement));
  }
  const acknowledgedRole = ['reviewer-revisions-requested', 'reviewer-accepted'].includes(
    event.type
  )
    ? 'reviewer'
    : [
          'author-revision-committed',
          'author-revision-sealed-no-commit',
          'author-closing-round-committed',
          'author-closing-round-sealed-no-commit',
        ].includes(event.type)
      ? 'author'
      : null;
  if (acknowledgedRole) {
    for (const supplement of protocol.supplements) {
      if (
        supplement.target_role === acknowledgedRole &&
        supplement.target_turn === event.payload.turn &&
        supplement.acknowledged_at === null
      ) {
        supplement.acknowledged_at = event.at;
      }
    }
  }
  if (event.type === 'delivery-written') {
    if (
      protocol.deliveries.some(
        (delivery) => delivery.delivery_id === event.payload.delivery.delivery_id
      )
    ) {
      throw deliveryConflict(event);
    }
    protocol.deliveries.push(copy(event.payload.delivery));
  }
  if (event.type === 'delivery-acknowledged') {
    const delivery = protocol.deliveries.find(
      (candidate) => candidate.delivery_id === event.payload.delivery_id
    );
    if (!delivery) throw transitionError(protocol.state, event, 'unknown delivery');
    delivery.acknowledged_at = event.at;
  }
  if (
    [
      'acceptance-committed',
      'acceptance-sealed-no-commit',
      'override-committed',
      'override-sealed-no-commit',
    ].includes(event.type)
  ) {
    protocol.terminal_evidence = copy(event.payload.terminal);
  }

  protocol.state = lifecycle;
  protocol.sequence = event.sequence;
  protocol.revision = event.revision;
  protocol.current_actor = currentActor(lifecycle);
  protocol.next_action = nextAction(lifecycle);
  state.nextAction = protocol.next_action;
}

function deepFreeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    Object.values(value).forEach(deepFreeze);
  }
  return value;
}

export function reduceEvents(events) {
  if (!Array.isArray(events)) throw projectionError('events must be an array');
  const state = initialProjection();
  events.forEach((event, index) => {
    validateEvent(event);
    if (event.sequence !== index + 1) throw projectionError('event sequence');
    if (state.protocol.review_id !== null && event.review_id !== state.protocol.review_id) {
      throw projectionError('review ID');
    }
    const expectedRevision = state.protocol.revision + (eventAdvancesRevision(event.type) ? 1 : 0);
    if (event.revision !== expectedRevision) throw projectionError('event revision');
    applyProjection(state, event);
  });
  return deepFreeze(state);
}
