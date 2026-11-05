import { AprError } from '../errors.mjs';
import { enterParticipantLossIntervention } from '../identity/registry.mjs';

const LEASE_SCHEMA = 'ai-peer-review.resident-lease/v1';
const LEASE_CAPABILITY = 'resident-liveness';
const HOSTS = new Set(['codex', 'claude-code', 'grok', 'other']);
const LEASE_FIELDS = new Set([
  'schema',
  'process_instance_id',
  'pid',
  'opaque_handle',
  'host',
  'adapter_version',
  'heartbeat_sequence',
  'observed_at',
  'expires_at',
  'capability',
]);
const RECOVERY = 'peer-review status <workspace> --next';

function participantLoss(message, reason, details = {}) {
  throw new AprError('APR_PARTICIPANT_LOSS', message, {
    recovery: RECOVERY,
    details: { reason, ...details },
  });
}

function record(value) {
  return value && typeof value === 'object' && !Array.isArray(value);
}

function text(value) {
  return typeof value === 'string' && value.trim() === value && value.length > 0;
}

function instant(value) {
  if (!text(value)) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function nowValue(now) {
  const value = now instanceof Date ? now.valueOf() : typeof now === 'string' ? instant(now) : now;
  if (!Number.isFinite(value))
    participantLoss('Resident observation time is invalid.', 'incomplete');
  return value;
}

export function validateResidentLease(lease, now = Date.now()) {
  if (!record(lease)) participantLoss('Resident lease is incomplete.', 'incomplete');
  const unknown = Object.keys(lease).filter((key) => !LEASE_FIELDS.has(key));
  if (unknown.length) {
    participantLoss('Resident lease contains unknown fields.', 'unknown-fields', {
      unknown: unknown.sort(),
    });
  }
  const observedAt = instant(lease.observed_at);
  const expiresAt = instant(lease.expires_at);
  if (
    lease.schema !== LEASE_SCHEMA ||
    !text(lease.process_instance_id) ||
    !HOSTS.has(lease.host) ||
    !text(lease.adapter_version) ||
    !Number.isSafeInteger(lease.heartbeat_sequence) ||
    lease.heartbeat_sequence <= 0 ||
    observedAt === null ||
    expiresAt === null ||
    (lease.capability !== undefined && lease.capability !== LEASE_CAPABILITY)
  ) {
    participantLoss('Resident lease is incomplete.', 'incomplete');
  }
  const hasPid = Number.isSafeInteger(lease.pid) && lease.pid > 0;
  const hasOpaqueHandle = text(lease.opaque_handle);
  if (
    hasPid === hasOpaqueHandle ||
    (!hasPid && lease.pid !== null) ||
    (!hasOpaqueHandle && lease.opaque_handle !== null)
  ) {
    participantLoss('Resident lease handle authority is ambiguous.', 'ambiguous-handle');
  }
  const current = nowValue(now);
  if (observedAt > current) {
    participantLoss('Resident lease observation is in the future.', 'participant-loss');
  }
  if (expiresAt <= observedAt || expiresAt <= current) {
    participantLoss('Resident lease expired.', 'expired');
  }
  return Object.freeze({
    schema: LEASE_SCHEMA,
    process_instance_id: lease.process_instance_id,
    pid: hasPid ? lease.pid : null,
    opaque_handle: hasOpaqueHandle ? lease.opaque_handle : null,
    host: lease.host,
    adapter_version: lease.adapter_version,
    heartbeat_sequence: lease.heartbeat_sequence,
    observed_at: lease.observed_at,
    expires_at: lease.expires_at,
    capability: LEASE_CAPABILITY,
  });
}

export function refreshResidentLease(previous, observation, now = Date.now()) {
  const prior = validateResidentLease(previous, now);
  const next = validateResidentLease(observation, now);
  if (prior.adapter_version !== next.adapter_version) {
    participantLoss('Resident adapter version changed during the claim.', 'adapter-downgrade', {
      expected: prior.adapter_version,
      actual: next.adapter_version,
    });
  }
  if (
    prior.process_instance_id !== next.process_instance_id ||
    prior.host !== next.host ||
    prior.pid !== next.pid ||
    prior.opaque_handle !== next.opaque_handle ||
    next.heartbeat_sequence <= prior.heartbeat_sequence ||
    Date.parse(next.observed_at) <= Date.parse(prior.observed_at) ||
    Date.parse(next.expires_at) <= Date.parse(prior.expires_at)
  ) {
    participantLoss(
      'Resident heartbeat does not continue the current process instance.',
      'participant-loss'
    );
  }
  return next;
}

export function residentHealth(lease, expected = {}, now = Date.now()) {
  let current;
  try {
    current = validateResidentLease(lease, now);
  } catch (error) {
    if (!(error instanceof AprError) || error.code !== 'APR_PARTICIPANT_LOSS') throw error;
    return Object.freeze({
      healthy: false,
      reason: error.details.reason ?? 'participant-loss',
      lease: null,
    });
  }
  if (current.host !== expected.host) {
    return Object.freeze({ healthy: false, reason: 'participant-loss', lease: null });
  }
  if (current.adapter_version !== expected.adapter_version) {
    return Object.freeze({ healthy: false, reason: 'adapter-downgrade', lease: null });
  }
  return Object.freeze({ healthy: true, reason: 'ok', lease: current });
}

export function residentLivenessEvent(review, role, lease, expected, now = Date.now()) {
  const health = residentHealth(lease, expected, now);
  return health.healthy ? null : enterParticipantLossIntervention(review, role, now);
}
