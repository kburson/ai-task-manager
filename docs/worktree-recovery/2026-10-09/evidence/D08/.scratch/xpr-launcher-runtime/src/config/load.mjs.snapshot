import { readFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { AprError } from '../errors.mjs';

const TOP_LEVEL = new Set(['schema', 'authority', 'hosts', 'review', 'setup']);
const AUTHORITY = new Set(['authority_policy', 'challenge_ttl_ms', 'verifier']);
const VERIFIER = new Set([
  'kind',
  'verifier_id',
  'verifier_fingerprint',
  'public_key',
  'assurance_grade',
  'signer_strength',
]);
const HOST = new Set(['identity', 'resume', 'reviewer_guard', 'automatic']);
const IDENTITY = new Set(['provider', 'host', 'model_id', 'model_display']);
const RESUME = new Set(['command']);
const GUARD = new Set(['enabled', 'command']);
const AUTOMATIC = new Set([
  'adapter_version',
  'capability',
  'server_command',
  'tool_timeout_ms',
  'heartbeat_interval_ms',
  'lease_ttl_ms',
]);
const REVIEW = new Set([
  'reviews_root',
  'review_path_template',
  'max_turns',
  'claim_ttl_ms',
  'transport_mode',
  'startup_transport_preference',
]);
const SETUP = new Set([
  'owner',
  'version',
  'agents',
  'config_created',
  'scratch_exclude_added',
  'resume_commands_added',
  'automatic_adapters_added',
]);
const HOSTS = new Set(['codex', 'claude', 'grok', 'generic']);

function invalid(message, details = {}) {
  throw new AprError('APR_CONFIG_INVALID', message, {
    recovery: 'Use the closed ai-peer-review.config/v1 schema and store no credentials.',
    details,
  });
}

function record(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    invalid(`${label} must be an object.`);
}

function closed(value, keys, label) {
  record(value, label);
  const unknown = Object.keys(value).filter((key) => !keys.has(key));
  if (unknown.length) invalid(`${label} contains unknown keys.`, { unknown: unknown.sort() });
}

function strings(value, label) {
  if (
    !Array.isArray(value) ||
    !value.length ||
    value.some((item) => typeof item !== 'string' || !item)
  ) {
    invalid(`${label} must be a non-empty string array.`);
  }
}

function required(value, keys, label) {
  const missing = keys.filter((key) => !Object.hasOwn(value, key));
  if (missing.length) invalid(`${label} is missing required keys.`, { missing });
}

function optionalTextFields(value, keys, label) {
  for (const key of keys) {
    if (value[key] !== undefined && (typeof value[key] !== 'string' || !value[key])) {
      invalid(`${label}.${key} must be a non-empty string.`);
    }
  }
}

export function validateConfig(value) {
  closed(value, TOP_LEVEL, 'configuration');
  if (value.schema !== 'ai-peer-review.config/v1') invalid('Configuration schema is invalid.');
  if (value.authority !== undefined) {
    closed(value.authority, AUTHORITY, 'authority');
    required(value.authority, [...AUTHORITY], 'authority');
    if (
      !['unavailable', 'prevention-required', 'detection-allowed'].includes(
        value.authority.authority_policy
      )
    ) {
      invalid('authority.authority_policy is invalid.');
    }
    if (
      value.authority.challenge_ttl_ms !== undefined &&
      (!Number.isSafeInteger(value.authority.challenge_ttl_ms) ||
        value.authority.challenge_ttl_ms <= 0)
    ) {
      invalid('authority.challenge_ttl_ms must be a safe positive integer.');
    }
    if (value.authority.verifier !== undefined && value.authority.verifier !== null) {
      closed(value.authority.verifier, VERIFIER, 'authority.verifier');
      required(value.authority.verifier, [...VERIFIER], 'authority.verifier');
      optionalTextFields(
        value.authority.verifier,
        ['kind', 'verifier_id', 'verifier_fingerprint', 'assurance_grade', 'signer_strength'],
        'authority.verifier'
      );
      if (
        value.authority.verifier.public_key !== null &&
        (typeof value.authority.verifier.public_key !== 'string' ||
          !value.authority.verifier.public_key)
      ) {
        invalid('authority.verifier.public_key must be null or a non-empty string.');
      }
      if (!['ed25519', 'host'].includes(value.authority.verifier.kind))
        invalid('authority.verifier.kind is invalid.');
      if (!/^sha256:[0-9a-f]{64}$/.test(value.authority.verifier.verifier_fingerprint))
        invalid('authority.verifier.verifier_fingerprint is invalid.');
      if (
        !['hardened', 'mutable-local', 'test-fixture'].includes(
          value.authority.verifier.assurance_grade
        )
      )
        invalid('authority.verifier.assurance_grade is invalid.');
      if (
        ![
          'cryptographic-external',
          'hardware-presence',
          'host-verified',
          'cryptographic-local',
          'unverified-test',
        ].includes(value.authority.verifier.signer_strength)
      )
        invalid('authority.verifier.signer_strength is invalid.');
      if (
        (value.authority.verifier.kind === 'host') !==
        (value.authority.verifier.public_key === null)
      )
        invalid('Host verifiers require null public_key; Ed25519 verifiers require a public key.');
    }
    if (
      (value.authority.authority_policy === 'unavailable') !==
      (value.authority.verifier === null)
    ) {
      invalid(
        'Unavailable authority must have a null verifier, and configured authority must have one.'
      );
    }
  }
  if (value.hosts !== undefined) {
    record(value.hosts, 'hosts');
    const unknownHosts = Object.keys(value.hosts).filter((key) => !HOSTS.has(key));
    if (unknownHosts.length)
      invalid('hosts contains unknown providers.', { unknown: unknownHosts.sort() });
    for (const [name, host] of Object.entries(value.hosts)) {
      closed(host, HOST, `hosts.${name}`);
      if (host.identity !== undefined) {
        closed(host.identity, IDENTITY, `hosts.${name}.identity`);
        required(host.identity, [...IDENTITY], `hosts.${name}.identity`);
        optionalTextFields(host.identity, [...IDENTITY], `hosts.${name}.identity`);
        if (!['codex', 'claude-code', 'grok', 'other'].includes(host.identity.host))
          invalid(`hosts.${name}.identity.host is invalid.`);
        if (!['openai', 'anthropic', 'xai', 'other'].includes(host.identity.provider))
          invalid(`hosts.${name}.identity.provider is invalid.`);
      }
      if (host.resume !== undefined) {
        closed(host.resume, RESUME, `hosts.${name}.resume`);
        strings(host.resume.command, `hosts.${name}.resume.command`);
      }
      if (host.reviewer_guard !== undefined) {
        closed(host.reviewer_guard, GUARD, `hosts.${name}.reviewer_guard`);
        if (typeof host.reviewer_guard.enabled !== 'boolean') {
          invalid(`hosts.${name}.reviewer_guard.enabled must be boolean.`);
        }
        if (host.reviewer_guard.command !== undefined)
          strings(host.reviewer_guard.command, `hosts.${name}.reviewer_guard.command`);
      }
      if (host.automatic !== undefined) {
        closed(host.automatic, AUTOMATIC, `hosts.${name}.automatic`);
        required(host.automatic, [...AUTOMATIC], `hosts.${name}.automatic`);
        if (host.automatic.adapter_version !== '2.0.0')
          invalid(`hosts.${name}.automatic.adapter_version is invalid.`);
        if (host.automatic.capability !== 'live-wait')
          invalid(`hosts.${name}.automatic.capability is invalid.`);
        strings(host.automatic.server_command, `hosts.${name}.automatic.server_command`);
        for (const key of ['tool_timeout_ms', 'heartbeat_interval_ms', 'lease_ttl_ms']) {
          if (!Number.isSafeInteger(host.automatic[key]) || host.automatic[key] <= 0)
            invalid(`hosts.${name}.automatic.${key} must be a safe positive integer.`);
        }
        if (host.automatic.lease_ttl_ms <= host.automatic.heartbeat_interval_ms)
          invalid(`hosts.${name}.automatic lease must outlive its heartbeat interval.`);
      }
    }
  }
  if (value.review !== undefined) {
    closed(value.review, REVIEW, 'review');
    optionalTextFields(value.review, ['reviews_root', 'review_path_template'], 'review');
    for (const key of ['max_turns', 'claim_ttl_ms']) {
      if (
        value.review[key] !== undefined &&
        (!Number.isSafeInteger(value.review[key]) || value.review[key] <= 0)
      )
        invalid(`review.${key} must be a safe positive integer.`);
    }
    if (
      value.review.transport_mode !== undefined &&
      !['manual', 'resume-only', 'automatic-required'].includes(value.review.transport_mode)
    )
      invalid('review.transport_mode is invalid.');
    if (value.review.startup_transport_preference !== undefined) {
      const preference = value.review.startup_transport_preference;
      if (
        !Array.isArray(preference) ||
        preference.length === 0 ||
        preference.some(
          (mode) => !['manual', 'resume-only', 'automatic-required'].includes(mode)
        ) ||
        new Set(preference).size !== preference.length
      ) {
        invalid('review.startup_transport_preference must be a non-empty unique transport list.');
      }
    }
  }
  if (value.setup !== undefined) {
    closed(value.setup, SETUP, 'setup');
    if (
      value.setup.owner !== 'ai-peer-review' ||
      ![1, 2].includes(value.setup.version) ||
      (value.setup.version === 2 && !Object.hasOwn(value.setup, 'automatic_adapters_added'))
    )
      invalid('setup ownership metadata is invalid.');
    strings(value.setup.agents, 'setup.agents');
    if (value.setup.agents.some((agent) => !HOSTS.has(agent)))
      invalid('setup.agents contains an unknown host.');
    if (new Set(value.setup.agents).size !== value.setup.agents.length)
      invalid('setup.agents contains duplicates.');
    if (typeof value.setup.config_created !== 'boolean')
      invalid('setup.config_created must be boolean.');
    if (typeof value.setup.scratch_exclude_added !== 'boolean')
      invalid('setup.scratch_exclude_added must be boolean.');
    if (!Array.isArray(value.setup.resume_commands_added))
      invalid('setup.resume_commands_added must be an array.');
    if (value.setup.resume_commands_added.some((agent) => !HOSTS.has(agent)))
      invalid('setup.resume_commands_added contains an unknown host.');
    if (
      new Set(value.setup.resume_commands_added).size !== value.setup.resume_commands_added.length
    )
      invalid('setup.resume_commands_added contains duplicates.');
    const automatic = value.setup.automatic_adapters_added ?? [];
    if (!Array.isArray(automatic)) invalid('setup.automatic_adapters_added must be an array.');
    if (automatic.some((agent) => !['codex', 'claude'].includes(agent)))
      invalid('setup.automatic_adapters_added contains an unsupported host.');
    if (new Set(automatic).size !== automatic.length)
      invalid('setup.automatic_adapters_added contains duplicates.');
  }
  return value;
}

function readConfig(file) {
  try {
    const value = JSON.parse(readFileSync(file, 'utf8'));
    validateConfig(value);
    return value;
  } catch (cause) {
    if (cause?.code === 'ENOENT') return null;
    if (cause instanceof AprError) throw cause;
    invalid('Configuration cannot be read as JSON.', { file });
  }
}

function merge(left, right) {
  if (!left) return right ?? null;
  if (!right) return left;
  const output = { ...left };
  for (const [key, value] of Object.entries(right)) {
    output[key] =
      value &&
      typeof value === 'object' &&
      !Array.isArray(value) &&
      output[key] &&
      typeof output[key] === 'object' &&
      !Array.isArray(output[key])
        ? merge(output[key], value)
        : value;
  }
  return output;
}

export function configPaths({
  cwd = process.cwd(),
  env = process.env,
  platform = process.platform,
  home = os.homedir(),
} = {}) {
  const userRoot =
    platform === 'win32'
      ? (env.APPDATA ?? env.XDG_CONFIG_HOME ?? path.join(home, '.config'))
      : (env.XDG_CONFIG_HOME ?? path.join(home, '.config'));
  if (!userRoot) invalid('A platform configuration directory is unavailable.');
  return Object.freeze({
    user: path.join(userRoot, 'ai-peer-review', 'config.json'),
    project: path.join(path.resolve(cwd), '.ai-peer-review.json'),
  });
}

export function loadConfig(options = {}) {
  const paths = configPaths(options);
  const user = readConfig(paths.user);
  const project = readConfig(paths.project);
  const config = merge(user, project) ?? { schema: 'ai-peer-review.config/v1' };
  validateConfig(config);
  return Object.freeze({
    schema: 'ai-peer-review.loaded-config/v1',
    config,
    paths,
    sources: Object.freeze({ user: Boolean(user), project: Boolean(project) }),
  });
}
