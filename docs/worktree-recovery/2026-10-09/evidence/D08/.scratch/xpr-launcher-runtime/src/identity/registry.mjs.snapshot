import { createHash, randomUUID } from 'node:crypto';

import { AprError } from '../errors.mjs';
import { validateEvent } from '../protocol/events.mjs';
import { mutateReview } from '../protocol/service.mjs';
import { claudeAdapter } from './claude.mjs';
import { codexAdapter } from './codex.mjs';
import { genericAdapter } from './generic.mjs';
import { grokAdapter } from './grok.mjs';

const ADAPTERS = new Map([
  ['codex', codexAdapter],
  ['claude', claudeAdapter],
  ['grok', grokAdapter],
  ['generic', genericAdapter],
]);
const ROLES = new Set(['author', 'reviewer']);
const HOSTS = new Set(['codex', 'claude-code', 'grok', 'other']);
const PROVIDERS = new Set(['openai', 'anthropic', 'xai', 'other']);
const SOURCES = new Set(['runtime', 'declared']);
const DEFAULT_CLAIM_TTL_MS = 8 * 60 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;

function fail(code, message, recovery, details = {}) {
  throw new AprError(code, message, { recovery, details });
}

function text(value, label) {
  if (
    typeof value !== 'string' ||
    !value ||
    !value.isWellFormed() ||
    value !== value.normalize('NFC')
  ) {
    fail(
      'APR_IDENTITY_INVALID',
      `Identity ${label} is invalid.`,
      'Provide complete normalized identity metadata.'
    );
  }
  return value;
}

function instant(value, label = 'time', code = 'APR_CLAIM_INVALID') {
  const date = value instanceof Date ? new Date(value.valueOf()) : new Date(value);
  if (Number.isNaN(date.valueOf())) {
    fail(code, `${label} is invalid.`, 'Provide a valid clock instant and retry.');
  }
  if (typeof value === 'string') {
    const canonical = date.toISOString();
    if (value !== canonical && value !== canonical.replace('.000Z', 'Z')) {
      fail(code, `${label} is invalid.`, 'Provide a calendar-valid RFC-3339 UTC instant.');
    }
  }
  return date;
}

function protocolOf(review) {
  const protocol = review?.protocol ?? review;
  if (!protocol || typeof protocol !== 'object') {
    fail(
      'APR_CLAIM_INVALID',
      'Review authority is required.',
      'Read the current review and retry.'
    );
  }
  return protocol;
}

function claimTtl(review, fallbackClaim = null) {
  const inferred = fallbackClaim
    ? Date.parse(fallbackClaim.expires_at) - Date.parse(fallbackClaim.claimed_at)
    : null;
  const value = protocolOf(review).claim_ttl_ms ?? inferred ?? DEFAULT_CLAIM_TTL_MS;
  if (!Number.isSafeInteger(value) || value <= 0 || value % HOUR_MS !== 0) {
    fail(
      'APR_CLAIM_INVALID',
      'Claim TTL must be a safe positive whole-hour millisecond duration.',
      'Parse --claim-ttl once as whole hours and pass its exact millisecond value.'
    );
  }
  return value;
}

function eventEnvelope(review, type, actor, at, payload, revisionDelta) {
  const protocol = protocolOf(review);
  const value = {
    schema: 'ai-peer-review.event/v1',
    review_id: protocol.review_id,
    sequence: protocol.sequence + 1,
    revision: protocol.revision + revisionDelta,
    type,
    actor,
    at: instant(at).toISOString(),
    payload,
  };
  validateEvent(value);
  return Object.freeze(value);
}

function buildClaim(review, identity, now, ttl = claimTtl(review)) {
  const claimedAt = instant(now, 'claim time');
  const expiresAtValue = claimedAt.valueOf() + ttl;
  if (!Number.isSafeInteger(expiresAtValue) || expiresAtValue > 8.64e15) {
    fail(
      'APR_CLAIM_INVALID',
      'Claim expiry exceeds the supported clock range.',
      'Use a smaller whole-hour claim TTL.'
    );
  }
  return Object.freeze({
    claim_id: `claim-${randomUUID()}`,
    role: identity.role,
    session_fingerprint: identity.session_fingerprint,
    host: identity.host,
    claimed_at: claimedAt.toISOString(),
    last_activity_at: claimedAt.toISOString(),
    expires_at: new Date(expiresAtValue).toISOString(),
    pid: process.pid,
  });
}

function liveChallenge(protocol, at) {
  const timestamp = instant(at).valueOf();
  return protocol.challenges?.some(
    (challenge) =>
      !challenge.superseded_at &&
      !challenge.consumed_at &&
      Date.parse(challenge.expires_at) > timestamp
  );
}

export function fingerprintSession(provider, rawSessionId) {
  if (!PROVIDERS.has(provider)) {
    fail(
      'APR_IDENTITY_INVALID',
      'Identity provider is invalid.',
      'Use a documented provider name.'
    );
  }
  const normalizedProvider = text(provider, 'provider');
  const normalizedSession = text(rawSessionId, 'session');
  const digest = createHash('sha256')
    .update('ai-peer-review.session/v1\n', 'utf8')
    .update(normalizedProvider, 'utf8')
    .update('\n', 'utf8')
    .update(normalizedSession, 'utf8')
    .digest('hex');
  return `sha256:${digest}`;
}

export function participantIdentity({
  role,
  host,
  provider,
  modelId,
  modelDisplay,
  sessionId,
  source,
  joinedAt = new Date(),
}) {
  if (!ROLES.has(role) || !HOSTS.has(host) || !PROVIDERS.has(provider) || !SOURCES.has(source)) {
    fail(
      'APR_IDENTITY_INVALID',
      'Identity vocabulary is invalid.',
      'Use a documented role, host, provider, and identity source.'
    );
  }
  const joined = instant(joinedAt, 'identity join time', 'APR_IDENTITY_INVALID').toISOString();
  return Object.freeze({
    role,
    host,
    provider,
    model_id: text(modelId, 'model_id'),
    model_display: text(modelDisplay, 'model_display'),
    session_fingerprint: fingerprintSession(provider, sessionId),
    identity_source: source,
    joined_at: joined,
  });
}

function selectedAdapter(context) {
  if (context.adapter !== undefined) {
    const adapter = ADAPTERS.get(context.adapter);
    if (!adapter) {
      fail(
        'APR_IDENTITY_INVALID',
        'Identity adapter is unknown.',
        'Select codex, claude, grok, or generic.'
      );
    }
    return { adapter, runtime: context.runtime };
  }
  const candidates = new Map(
    Object.entries(context.providers ?? {}).filter(
      ([name, runtime]) => ADAPTERS.has(name) && name !== 'generic' && runtime?.sessionId
    )
  );
  for (const [name, adapter] of ADAPTERS) {
    if (
      name !== 'generic' &&
      adapter.sessionIdEnvKeys.some((key) => context.env?.[key]) &&
      !candidates.has(name)
    ) {
      candidates.set(name, context.runtime);
    }
  }
  if (candidates.size > 1) {
    fail(
      'APR_IDENTITY_AMBIGUOUS',
      'Multiple runtime provider sessions are active.',
      'Select one explicit adapter and retry.',
      { adapters: [...candidates.keys()].sort() }
    );
  }
  if (candidates.size === 1) {
    const [name, runtime] = candidates.entries().next().value;
    return { adapter: ADAPTERS.get(name), runtime };
  }
  return { adapter: genericAdapter, runtime: null };
}

export function resolveIdentity(context = {}) {
  const { adapter, runtime } = selectedAdapter(context);
  const adapterContext = { ...context, runtime: runtime ?? context.runtime };
  const candidate =
    adapter.resolveRuntime?.(adapterContext) ?? genericAdapter.resolveDeclared(context);
  if (!candidate) {
    fail(
      'APR_IDENTITY_REQUIRED',
      'Complete runtime or declared identity is required.',
      adapter.identityRecovery?.(adapterContext) ??
        'Provide official runtime session/model metadata or an explicit declared fallback.',
      { adapter: adapter.name }
    );
  }
  return participantIdentity({
    role: context.role,
    ...candidate,
    joinedAt: context.joinedAt ?? new Date(),
  });
}

export function assertDistinctParticipants(author, reviewer) {
  if (
    !author?.session_fingerprint ||
    !reviewer?.session_fingerprint ||
    author.session_fingerprint === reviewer.session_fingerprint
  ) {
    fail(
      'APR_IDENTITY_CONFLICT',
      'Author and reviewer must be distinct sessions.',
      'Join with a participant whose session fingerprint differs from the existing role.'
    );
  }
  return true;
}

export function identityChangeEvent(review, prior, current, now = new Date()) {
  if (
    prior?.role !== current?.role ||
    prior?.session_fingerprint !== current?.session_fingerprint
  ) {
    fail(
      'APR_IDENTITY_CONFLICT',
      'Identity refresh must remain in the same role and session.',
      'Use participant replacement for a different session fingerprint.'
    );
  }
  const fields = ['host', 'provider', 'model_id', 'model_display', 'identity_source'];
  if (fields.every((field) => prior[field] === current[field])) return null;
  return eventEnvelope(
    review,
    'identity-changed',
    current.session_fingerprint,
    now,
    { role: current.role, identity: { ...current, joined_at: prior.joined_at } },
    0
  );
}

export function claimRole(review, identity, now = new Date()) {
  const protocol = protocolOf(review);
  const registered = review?.participants?.[identity?.role];
  if (
    !ROLES.has(identity?.role) ||
    protocol.current_actor !== identity.role ||
    registered?.session_fingerprint !== identity.session_fingerprint ||
    protocol.claims?.[identity.role]
  ) {
    fail(
      'APR_CLAIM_CONFLICT',
      'The requested role cannot be claimed.',
      'Read current claim authority and use the documented recovery flow.'
    );
  }
  const claim = buildClaim(review, identity, now);
  return eventEnvelope(review, 'turn-claimed', identity.session_fingerprint, now, { claim }, 0);
}

export function deriveClaimStatus(review, role, now = new Date()) {
  const claim = protocolOf(review).claims?.[role] ?? null;
  if (!claim) return Object.freeze({ status: 'unclaimed', claim: null });
  const status = instant(now).valueOf() >= Date.parse(claim.expires_at) ? 'stale' : 'active';
  return Object.freeze({ status, claim });
}

export function enterStaleClaimIntervention(review, role, now = new Date()) {
  const protocol = protocolOf(review);
  if (deriveClaimStatus(review, role, now).status !== 'stale') {
    fail(
      'APR_CLAIM_NOT_STALE',
      'The role claim is not stale.',
      'Wait for the recorded expiry or resume with the current claimant.'
    );
  }
  const interruptedState = role === 'reviewer' ? 'reviewer-turn' : 'author-revision';
  if (protocol.state !== interruptedState) {
    fail(
      'APR_CLAIM_INVALID',
      'Stale intervention does not match the claimed role turn.',
      'Read current lifecycle state and retry only for its active role.'
    );
  }
  return eventEnvelope(
    review,
    'intervention-entered',
    'system',
    now,
    {
      intervention_id: `intervention-${randomUUID()}`,
      reason: 'stale-claim',
      interrupted_state: interruptedState,
    },
    1
  );
}

export function enterParticipantLossIntervention(review, role, now = new Date()) {
  const protocol = protocolOf(review);
  const interruptedState = role === 'reviewer' ? 'reviewer-turn' : 'author-revision';
  if (
    !ROLES.has(role) ||
    protocol.startup?.transport_mode !== 'automatic-required' ||
    protocol.current_actor !== role ||
    protocol.state !== interruptedState ||
    protocol.claims?.[role]?.role !== role
  ) {
    fail(
      'APR_CLAIM_INVALID',
      'Participant-loss intervention does not match an active automatic turn.',
      'Read current event authority and retry only for its claimed automatic participant.'
    );
  }
  return eventEnvelope(
    review,
    'intervention-entered',
    'system',
    now,
    {
      intervention_id: `intervention-${randomUUID()}`,
      reason: 'participant-loss',
      interrupted_state: interruptedState,
    },
    1
  );
}

export async function recordStaleClaimIntervention(workspace, expected, role, now = new Date()) {
  return mutateReview(workspace, expected, (current) =>
    enterStaleClaimIntervention(current, role, now)
  );
}

export function reclaimRole(review, identity, now = new Date()) {
  const protocol = protocolOf(review);
  const oldClaim = protocol.claims?.[identity?.role];
  if (
    protocol.state !== 'intervention-required' ||
    protocol.intervention?.reason !== 'stale-claim' ||
    protocol.intervention?.interrupted_state !==
      (identity?.role === 'reviewer' ? 'reviewer-turn' : 'author-revision') ||
    !oldClaim ||
    oldClaim.session_fingerprint !== identity.session_fingerprint
  ) {
    fail(
      'APR_CLAIM_CONFLICT',
      'Only the same session may reclaim its stale role.',
      'Use signed participant replacement for a different session.'
    );
  }
  if (liveChallenge(protocol, now)) {
    fail(
      'APR_CLAIM_CHALLENGED',
      'An unexpired Human Authority challenge freezes claim recovery.',
      'Consume, supersede, or allow the current challenge to expire before reclaiming.'
    );
  }
  const newClaim = buildClaim(review, identity, now, claimTtl(review, oldClaim));
  return eventEnvelope(
    review,
    'same-session-reclaim',
    identity.session_fingerprint,
    now,
    {
      intervention_id: protocol.intervention.intervention_id,
      old_claim: oldClaim,
      new_claim: newClaim,
    },
    0
  );
}
