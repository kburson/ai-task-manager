import { AprError } from '../errors.mjs';
import { PROVIDERS } from '../providers/registry.mjs';

const TRANSPORTS = new Set(['manual', 'resume-only', 'automatic-required']);
const IDENTITY_SOURCES = new Set(['runtime', 'declared']);
const CLASSIFICATIONS = new Set(['SPR', 'XPR']);
const OWNERSHIPS = new Set(['native', 'broker']);
const SELECTOR_IDENTITY = Object.freeze({
  codex: Object.freeze({ provider: 'openai', host: 'codex' }),
  claude: Object.freeze({ provider: 'anthropic', host: 'claude-code' }),
  grok: Object.freeze({ provider: 'xai', host: 'grok' }),
});

function unavailable(reason, details = {}) {
  throw new AprError(
    'APR_TRANSPORT_UNAVAILABLE',
    'No observed transport satisfies reviewer startup policy.',
    {
      recovery:
        'Use a declared available transport or restore a conformant exact-session native or broker adapter.',
      details: { reason, ...details },
    }
  );
}

function text(value) {
  return typeof value === 'string' && value.trim() === value && value.length > 0;
}

function usage(message, details = {}) {
  throw new AprError('APR_USAGE', message, {
    recovery: 'Provide the complete closed runtime descriptor for the requested reviewer.',
    details,
  });
}

function identityConflict(message, details = {}) {
  throw new AprError('APR_IDENTITY_CONFLICT', message, {
    recovery: 'Join from the exact requested reviewer session and adapter observation.',
    details,
  });
}

function exactKeys(value, keys, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) usage(`${label} is invalid.`);
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) {
    usage(`${label} must use the closed descriptor fields.`, { fields: actual });
  }
}

export function validateRuntimeDescriptor(value) {
  exactKeys(
    value,
    [
      'schema',
      'classification',
      'ownership',
      'transport_mode',
      'reviewer',
      'adapter_version',
      'project_root_digest',
    ],
    'Runtime descriptor'
  );
  if (value.schema !== 'ai-peer-review.runtime/v1') usage('Runtime descriptor schema is invalid.');
  if (!CLASSIFICATIONS.has(value.classification))
    usage('Runtime descriptor classification is invalid.');
  if (!OWNERSHIPS.has(value.ownership)) usage('Runtime descriptor ownership is invalid.');
  if (!TRANSPORTS.has(value.transport_mode)) usage('Runtime descriptor transport mode is invalid.');
  exactKeys(
    value.reviewer,
    ['selector', 'provider', 'host', 'model_id', 'model_display', 'effort'],
    'Runtime descriptor reviewer'
  );
  const selected = SELECTOR_IDENTITY[value.reviewer.selector];
  if (
    !selected ||
    selected.provider !== value.reviewer.provider ||
    selected.host !== value.reviewer.host
  ) {
    usage('Runtime descriptor reviewer selector, provider, and host disagree.');
  }
  if (!text(value.reviewer.model_id) || !text(value.reviewer.model_display))
    usage('Runtime descriptor reviewer model is invalid.');
  if (!text(value.reviewer.effort)) usage('Runtime descriptor reviewer effort is invalid.');
  if (!text(value.adapter_version)) usage('Runtime descriptor adapter version is invalid.');
  if (
    typeof value.project_root_digest !== 'string' ||
    !/^[0-9a-f]{64}$/.test(value.project_root_digest)
  )
    usage('Runtime descriptor project root digest is invalid.');
  return value;
}

export function assertRequestedReviewer(runtime, identity, observation) {
  validateRuntimeDescriptor(runtime);
  exactKeys(
    observation,
    ['provider', 'host', 'model_id', 'effort', 'adapter_version', 'assurance'],
    'Reviewer runtime observation'
  );
  const requested = runtime.reviewer;
  const actual = identity ?? {};
  const observed = observation ?? {};
  const exact =
    actual.provider === requested.provider &&
    actual.host === requested.host &&
    actual.model_id === requested.model_id &&
    observed.provider === requested.provider &&
    observed.host === requested.host &&
    observed.model_id === requested.model_id &&
    observed.effort === requested.effort &&
    observed.adapter_version === runtime.adapter_version;
  if (!exact) identityConflict('Joining reviewer does not match sealed startup intent.');
  if (actual.identity_source === 'declared') {
    if (runtime.transport_mode !== 'manual' || observed.assurance !== 'declared')
      identityConflict(
        'Declared reviewer registration is restricted to an explicitly labeled manual declaration.'
      );
  } else if (actual.identity_source !== 'runtime' || observed.assurance !== 'runtime') {
    identityConflict('Reviewer runtime observation does not provide the requested assurance.');
  }
  return true;
}

function requestedModes(requestedTransport, policy = {}) {
  if (requestedTransport !== null && requestedTransport !== undefined) {
    if (!TRANSPORTS.has(requestedTransport)) unavailable('invalid-requested-transport');
    return [requestedTransport];
  }
  const modes = [policy.transport_mode, ...(policy.startup_transport_preference ?? [])].filter(
    (mode) => mode !== undefined
  );
  if (!modes.length || modes.some((mode) => !TRANSPORTS.has(mode))) unavailable('invalid-policy');
  return [...new Set(modes)];
}

function assuredAuthor(author) {
  return (
    author &&
    PROVIDERS.has(author.provider) &&
    text(author.host) &&
    text(author.session_fingerprint) &&
    IDENTITY_SOURCES.has(author.identity_source)
  );
}

function compatibleNative(capabilities, selection, author, mode) {
  if (
    selection.classification !== 'SPR' ||
    author.identity_source !== 'runtime' ||
    author.provider !== selection.provider
  ) {
    return null;
  }
  return (capabilities?.native ?? []).find(
    (candidate) =>
      candidate?.exact_session === true &&
      candidate.provider === selection.provider &&
      candidate.host === selection.host &&
      candidate.transport_mode === mode &&
      text(candidate.adapter_version)
  );
}

function compatibleBroker(capabilities, mode) {
  return (capabilities?.broker ?? []).find(
    (candidate) => candidate?.transport_mode === mode && text(candidate.adapter_version)
  );
}

export function selectRuntime({
  selection,
  author,
  requestedTransport = null,
  policy = {},
  capabilities,
} = {}) {
  if (
    !selection ||
    !text(selection.provider) ||
    !text(selection.host) ||
    !['SPR', 'XPR'].includes(selection.classification)
  ) {
    unavailable('unresolved-selection');
  }
  if (!assuredAuthor(author)) unavailable('unresolved-author-assurance');
  const modes = requestedModes(requestedTransport, policy);
  for (const mode of modes) {
    const native = compatibleNative(capabilities, selection, author, mode);
    if (native) {
      return Object.freeze({
        ownership: 'native',
        transport_mode: mode,
        adapter_version: native.adapter_version,
      });
    }
    if (author?.identity_source === 'declared' && mode !== 'manual') continue;
    const broker = compatibleBroker(capabilities, mode);
    if (broker) {
      return Object.freeze({
        ownership: 'broker',
        transport_mode: mode,
        adapter_version: broker.adapter_version,
      });
    }
  }
  unavailable('no-policy-capability-intersection', { modes });
}
