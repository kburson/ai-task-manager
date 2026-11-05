import { createHash } from 'node:crypto';
import path from 'node:path';

import { renderCommand } from '../cli/help-data.mjs';
import { AprError } from '../errors.mjs';
import { canonicalProjection } from '../protocol/service.mjs';
import { validateAutomaticParticipant } from '../transport/registry.mjs';

const PARTICIPANT_ROLES = new Set(['author', 'reviewer']);
const TERMINAL_STATES = new Set([
  'accepted',
  'accepted-uncommitted',
  'accepted-over-objections',
  'accepted-over-objections-uncommitted',
  'abandoned',
  'superseded',
]);
const CAPSULE_LIMIT_BYTES = 2048;

function fail(code, message, recovery, details = {}) {
  throw new AprError(code, message, { recovery, details });
}

function record(value) {
  return value && typeof value === 'object' && !Array.isArray(value);
}

function fingerprint(value) {
  return typeof value === 'string' && /^sha256:[0-9a-f]{64}$/.test(value);
}

function authorityState(authority) {
  const state = authority?.state;
  const protocol = state?.protocol;
  if (
    !record(authority) ||
    !record(state) ||
    !record(protocol) ||
    typeof protocol.review_id !== 'string' ||
    !Number.isSafeInteger(protocol.revision) ||
    protocol.revision < 0 ||
    typeof protocol.state !== 'string' ||
    !record(state.participants)
  ) {
    fail(
      'APR_WAKE_AUTHORITY_INVALID',
      'Wake selection requires one validated protocol projection.',
      'Read the review through peer-review status and repair its event authority before waking.'
    );
  }
  return state;
}

function targetFor(protocol) {
  if (TERMINAL_STATES.has(protocol.state)) {
    return { kind: 'terminal', role: 'author', reason: 'protocol-terminal' };
  }
  if (protocol.state === 'intervention-required') {
    return {
      kind: 'intervention',
      role: 'author',
      reason: 'human-intervention-required',
    };
  }
  if (!PARTICIPANT_ROLES.has(protocol.current_actor)) {
    fail(
      'APR_WAKE_AUTHORITY_INVALID',
      'Protocol authority does not select a wakeable participant.',
      'Read peer-review status and follow its exact next action.',
      { state: protocol.state, current_actor: protocol.current_actor ?? null }
    );
  }
  return { kind: 'wake', role: protocol.current_actor, reason: 'role-actionable' };
}

function validateObservation(observation, participant, now) {
  if (!record(observation) || !fingerprint(observation.session_fingerprint)) {
    fail(
      'APR_WAKE_CAPABILITY_UNAVAILABLE',
      'Wake participant observation is incomplete.',
      'Use the bounded manual status command or restore a current resident wake adapter.'
    );
  }
  if (observation.session_fingerprint !== participant?.session_fingerprint) {
    fail(
      'APR_IDENTITY_CONFLICT',
      'Wake observation does not match the registered participant session.',
      'Restore the exact registered participant session or use governed participant replacement.'
    );
  }
  const { session_fingerprint: ignored, ...automatic } = observation;
  void ignored;
  return validateAutomaticParticipant(automatic, now);
}

function validateDelivery(delivery, protocol, role) {
  if (
    !record(delivery) ||
    delivery.receipt_verified !== true ||
    delivery.recipient !== role ||
    typeof delivery.delivery_id !== 'string' ||
    !/^sha256:[0-9a-f]{64}$/.test(delivery.digest) ||
    !Number.isSafeInteger(delivery.sequence) ||
    !Number.isSafeInteger(delivery.revision) ||
    delivery.revision !== protocol.revision ||
    delivery.sequence > protocol.sequence
  ) {
    fail(
      'APR_DELIVERY_CONFLICT',
      'Wake selection lacks one byte-verified delivery for the current role and revision.',
      'Preserve the review workspace and reconcile its event and delivery receipt authority.',
      { role, revision: protocol.revision }
    );
  }
  return delivery;
}

function capsuleFor(state, target, workspace, platform) {
  if (typeof workspace !== 'string' || !path.isAbsolute(workspace)) {
    fail(
      'APR_WAKE_CAPSULE_INVALID',
      'Wake capsule workspace must be an absolute path.',
      'Use the event-authorized absolute review workspace.'
    );
  }
  const capsule = Object.freeze({
    schema: 'ai-peer-review.wake-capsule/v1',
    review_id: state.protocol.review_id,
    expected_revision: state.protocol.revision,
    target_role: target.role,
    reason: target.reason,
    next_command: renderCommand(['peer-review', 'resume', workspace], { platform }),
  });
  const bytes = Buffer.from(`${canonicalProjection(capsule)}\n`, 'utf8');
  if (bytes.length > CAPSULE_LIMIT_BYTES) {
    fail(
      'APR_WAKE_CAPSULE_INVALID',
      'Wake capsule exceeds the bounded pointer-only limit.',
      'Use a shorter physical review workspace path and retry.',
      { bytes: bytes.length, maximum_bytes: CAPSULE_LIMIT_BYTES }
    );
  }
  return capsule;
}

export function decideWake({
  authority,
  delivery,
  observation,
  workspace,
  platform = process.platform,
  acknowledgedRevision = -1,
  now = Date.now(),
} = {}) {
  const state = authorityState(authority);
  if (!Number.isSafeInteger(acknowledgedRevision) || acknowledgedRevision < -1) {
    fail(
      'APR_WAKE_AUTHORITY_INVALID',
      'Acknowledged wake revision is invalid.',
      'Read the durable wake ledger and retry with its exact cursor.'
    );
  }
  if (acknowledgedRevision >= state.protocol.revision) {
    return Object.freeze({
      kind: 'idle',
      reason: 'unchanged-revision',
      revision: state.protocol.revision,
    });
  }
  const target = targetFor(state.protocol);
  const participant = state.participants[target.role];
  const transport = validateObservation(observation, participant, now);
  const verifiedDelivery =
    target.kind === 'wake' ? validateDelivery(delivery, state.protocol, target.role) : null;
  const capsule = capsuleFor(state, target, workspace, platform);
  return Object.freeze({
    kind: target.kind,
    authority_revision: state.protocol.revision,
    participant_fingerprint: participant.session_fingerprint,
    transport,
    delivery: verifiedDelivery,
    capsule,
  });
}

export function canonicalWakeCapsule(decision) {
  if (!record(decision?.capsule)) {
    fail(
      'APR_WAKE_CAPSULE_INVALID',
      'Wake decision does not contain a pointer capsule.',
      'Recompute the wake decision from validated protocol authority.'
    );
  }
  return Buffer.from(`${canonicalProjection(decision.capsule)}\n`, 'utf8');
}

export function wakeOperationKey(decision) {
  if (
    !record(decision) ||
    !['wake', 'terminal', 'intervention'].includes(decision.kind) ||
    !fingerprint(decision.participant_fingerprint)
  ) {
    fail(
      'APR_WAKE_CAPSULE_INVALID',
      'Wake decision cannot form an operation key.',
      'Recompute the wake decision from validated protocol authority.'
    );
  }
  const input = {
    review_id: decision.capsule.review_id,
    protocol_revision: decision.capsule.expected_revision,
    target_role: decision.capsule.target_role,
    session_fingerprint: decision.participant_fingerprint,
  };
  return `sha256:${createHash('sha256').update(canonicalProjection(input)).digest('hex')}`;
}
