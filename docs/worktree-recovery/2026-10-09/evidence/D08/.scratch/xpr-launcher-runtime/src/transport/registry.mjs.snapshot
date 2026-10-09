import { AprError } from '../errors.mjs';
import { manualTransport } from './manual.mjs';
import { validateResidentLease } from './resident.mjs';

const AUTOMATIC_CAPABILITIES = new Set(['live-wait', 'native-push']);
const AUTOMATIC_FIELDS = new Set(['capability', 'adapter', 'adapter_version', 'lease']);
const RECOVERY =
  'Use manual transport, or restore current resident leases and a healthy official automatic adapter.';

function unavailable(capability) {
  throw new AprError(
    'APR_TRANSPORT_UNAVAILABLE',
    'The requested transport capability is unavailable.',
    {
      recovery: 'Use manual transport or configure a validated official resume-only adapter.',
      details: { capability },
    }
  );
}

function automaticUnavailable(message, reason, details = {}) {
  throw new AprError('APR_TRANSPORT_UNAVAILABLE', message, {
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

export function validateAutomaticParticipant(observation, now = Date.now()) {
  if (!record(observation) || !AUTOMATIC_CAPABILITIES.has(observation.capability)) {
    automaticUnavailable(
      'Automatic-required needs a non-manual participant capability.',
      'non-automatic-capability',
      { capability: observation?.capability ?? null }
    );
  }
  const unknown = Object.keys(observation).filter((key) => !AUTOMATIC_FIELDS.has(key));
  if (
    unknown.length ||
    !text(observation.adapter_version) ||
    (observation.capability === 'live-wait' && observation.adapter !== undefined) ||
    (observation.capability === 'native-push' && observation.adapter !== 'codex-app')
  ) {
    automaticUnavailable('Automatic participant observation is invalid.', 'invalid-observation', {
      unknown: unknown.sort(),
    });
  }
  let lease;
  try {
    lease = validateResidentLease(observation.lease, now);
  } catch (cause) {
    if (!(cause instanceof AprError) || cause.code !== 'APR_PARTICIPANT_LOSS') throw cause;
    automaticUnavailable('Automatic participant liveness is unavailable.', cause.details.reason, {
      cause: cause.message,
    });
  }
  if (lease.adapter_version !== observation.adapter_version) {
    automaticUnavailable(
      'Automatic participant adapter version does not match its lease.',
      'incompatible-adapter-version',
      { observation: observation.adapter_version, lease: lease.adapter_version }
    );
  }
  if (observation.capability === 'native-push' && lease.host !== 'codex') {
    automaticUnavailable(
      'Native-push adapter is not official for this host.',
      'invalid-observation',
      {
        adapter: observation.adapter,
        host: lease.host,
      }
    );
  }
  return Object.freeze({
    capability: observation.capability,
    ...(observation.adapter ? { adapter: observation.adapter } : {}),
    adapter_version: observation.adapter_version,
    lease,
  });
}

export async function negotiateAutomaticRequired({ author, reviewer, healthCheck, now } = {}) {
  const validatedAuthor = validateAutomaticParticipant(author, now);
  const validatedReviewer = validateAutomaticParticipant(reviewer, now);
  if (validatedAuthor.adapter_version !== validatedReviewer.adapter_version) {
    automaticUnavailable(
      'Automatic participants use incompatible adapter versions.',
      'incompatible-adapter-version',
      {
        author: validatedAuthor.adapter_version,
        reviewer: validatedReviewer.adapter_version,
      }
    );
  }
  if (typeof healthCheck !== 'function') {
    automaticUnavailable(
      'Automatic-required needs an end-to-end health check.',
      'health-check-unavailable'
    );
  }
  let health;
  try {
    health = await healthCheck(
      Object.freeze({ author: validatedAuthor, reviewer: validatedReviewer })
    );
  } catch (cause) {
    automaticUnavailable('Automatic transport health check failed.', 'health-check-failed', {
      cause: cause?.message ?? 'unknown',
    });
  }
  if (!record(health) || health.healthy !== true) {
    automaticUnavailable(
      'Automatic transport is not healthy end to end.',
      text(health?.reason) ? health.reason : 'unhealthy-transport'
    );
  }
  const reason = text(health.reason) ? health.reason : 'healthy';
  return Object.freeze({
    mode: 'automatic-required',
    author_capability: validatedAuthor.capability,
    reviewer_capability: validatedReviewer.capability,
    adapter_version: validatedAuthor.adapter_version,
    health: Object.freeze({ healthy: true, reason }),
  });
}

export function createTransportRegistry() {
  const adapters = new Map();
  return Object.freeze({
    register(adapter) {
      const delivers =
        ['manual', 'resume-only', 'native-push'].includes(adapter?.capability) &&
        typeof adapter?.deliver === 'function';
      const waits = adapter?.capability === 'live-wait' && typeof adapter?.wait === 'function';
      if (!adapter || typeof adapter.name !== 'string' || (!delivers && !waits))
        unavailable(adapter?.capability);
      adapters.set(adapter.name, adapter);
      return adapter;
    },
    resolve(capability = 'manual', { host } = {}) {
      const matches = [...adapters.values()].filter(
        (adapter) =>
          adapter.capability === capability &&
          (!host || adapter.host === host || adapter.host === 'any')
      );
      return matches.length === 1 ? matches[0] : unavailable(capability);
    },
    capabilities() {
      return Object.freeze(
        [...new Set([...adapters.values()].map((adapter) => adapter.capability))].sort()
      );
    },
  });
}

const defaultRegistry = createTransportRegistry();
defaultRegistry.register(manualTransport);

export function registerTransport(adapter) {
  return defaultRegistry.register(adapter);
}

export function resolveTransport(capability, options) {
  return defaultRegistry.resolve(capability, options);
}
