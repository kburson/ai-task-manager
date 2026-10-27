import path from 'node:path';

// cspell:words aipr

import { AprError } from '../errors.mjs';

const DIGEST_RE = /^[a-f0-9]{64}$/;
const BASE32_ALPHABET = 'abcdefghijklmnopqrstuvwxyz234567';
const POSIX_LAYOUT_VERSION = 1;
const POSIX_TOKEN_LENGTH = 52;
const POSIX_SUFFIX_BYTES = 61;
const MIN_POSIX_ENDPOINT_LENGTH = POSIX_SUFFIX_BYTES + 2;

function failure(code, message, recovery, details = {}) {
  return new AprError(code, message, { recovery, details });
}

function pathApi(platform) {
  return platform?.kind === 'win32' ? path.win32 : path.posix;
}

function assertSupportedPlatform(platform) {
  const kind = platform?.kind;
  if (kind === 'darwin' || kind === 'linux' || kind === 'win32') return kind;
  throw failure(
    'APR_BROKER_ENDPOINT_UNSUPPORTED',
    'This platform has no supported local broker endpoint.',
    'Use macOS, Linux, or Windows for broker-backed cross-provider review.',
    { platform: kind ?? null }
  );
}

function layoutFor(platform) {
  const kind = assertSupportedPlatform(platform);
  const limit = platform?.maxEndpointLength;
  if (!Number.isInteger(limit) || limit <= 0 || (kind !== 'win32' && limit < 63)) {
    throw failure(
      'APR_BROKER_ENDPOINT_LIMIT_INVALID',
      'Broker platform did not provide a usable endpoint length limit.',
      'Use a supported platform security implementation with an observed endpoint limit.',
      {
        limit: limit ?? null,
        minimum: kind === 'win32' ? 1 : MIN_POSIX_ENDPOINT_LENGTH,
      }
    );
  }
  return Object.freeze({
    kind,
    limit,
    endpointLayoutVersion: kind === 'win32' ? null : POSIX_LAYOUT_VERSION,
    maxEndpointRootBytes: kind === 'win32' ? null : limit - POSIX_SUFFIX_BYTES,
  });
}

function canonicalAbsolute(value, platform, label) {
  const paths = pathApi(platform);
  const components =
    typeof value === 'string' ? value.split(platform.kind === 'win32' ? /[\\/]/ : '/') : [];
  if (
    typeof value !== 'string' ||
    !value ||
    !paths.isAbsolute(value) ||
    value.endsWith('/') ||
    (platform.kind === 'win32' && value.endsWith('\\')) ||
    components.includes('.') ||
    components.includes('..') ||
    paths.normalize(value) !== value ||
    (platform.kind !== 'win32' && value === '/')
  ) {
    throw failure(
      'APR_BROKER_PATH_INVALID',
      `Broker ${label} must be a canonical absolute path.`,
      `Set ${label} to a canonical absolute path without a trailing separator or dot component and retry.`,
      { label, value }
    );
  }
  return value;
}

function selectCacheRoot({ platform, env, home }) {
  if (platform.kind === 'darwin') {
    return Object.freeze({
      path: path.posix.join(canonicalAbsolute(home, platform, 'home'), 'Library', 'Caches'),
      source: 'platform-default',
    });
  }
  if (platform.kind === 'linux') {
    if (env?.XDG_CACHE_HOME !== undefined) {
      return Object.freeze({
        path: canonicalAbsolute(env.XDG_CACHE_HOME, platform, 'XDG_CACHE_HOME'),
        source: 'xdg-configured',
      });
    }
    return Object.freeze({
      path: path.posix.join(canonicalAbsolute(home, platform, 'home'), '.cache'),
      source: 'home-default',
    });
  }
  return Object.freeze({
    path: canonicalAbsolute(env?.LOCALAPPDATA, platform, 'LOCALAPPDATA'),
    source: 'platform-default',
  });
}

function selectEndpointRoot({ platform, env, cacheRoot }) {
  if (platform.kind === 'win32') {
    return Object.freeze({ path: null, source: 'named-pipe' });
  }
  if (env?.AI_PEER_REVIEW_ENDPOINT_ROOT !== undefined) {
    return Object.freeze({
      path: canonicalAbsolute(
        env.AI_PEER_REVIEW_ENDPOINT_ROOT,
        platform,
        'AI_PEER_REVIEW_ENDPOINT_ROOT'
      ),
      source: 'configured',
    });
  }
  return Object.freeze({ path: cacheRoot, source: 'cache-root' });
}

function base32Digest(digest) {
  const bytes = Buffer.from(digest, 'hex');
  let bits = 0;
  let value = 0;
  let token = '';
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      bits -= 5;
      token += BASE32_ALPHABET[(value >>> bits) & 31];
      value &= (1 << bits) - 1;
    }
  }
  if (bits > 0) token += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  if (token.length !== POSIX_TOKEN_LENGTH) {
    throw failure(
      'APR_BROKER_PATH_INVALID',
      'Broker identity digest did not produce a canonical endpoint token.',
      'Compute canonical project identity before deriving broker paths.',
      { label: 'identity.digest' }
    );
  }
  return token;
}

function endpointRecovery(layout) {
  if (layout.kind === 'win32') {
    return 'The observed Windows endpoint limit is invalid or this runtime is unsupported because the fixed named-pipe label fits the supported 256-unit limit; use a supported Windows runtime and retry.';
  }
  const platformName = layout.kind === 'darwin' ? 'Darwin' : 'Linux';
  return `Configure AI_PEER_REVIEW_ENDPOINT_ROOT for every participant to an administrator-provisioned, validated absolute root of at most ${layout.maxEndpointRootBytes} UTF-8 bytes on ${platformName} and retry; if no safe conforming root exists, project-local brokering is unsupported on this account. Do not move the authority cache.`;
}

function verifyEndpointLength(endpoint, layout) {
  const length = layout.kind === 'win32' ? endpoint.length : Buffer.byteLength(endpoint, 'utf8');
  if (length > layout.limit) {
    throw failure(
      'APR_BROKER_ENDPOINT_TOO_LONG',
      'The project-local broker endpoint exceeds the supported platform limit.',
      endpointRecovery(layout),
      {
        endpoint,
        length,
        limit: layout.limit,
        maxEndpointRootBytes: layout.maxEndpointRootBytes,
      }
    );
  }
}

function frozen(values) {
  return Object.freeze([...values]);
}

export function brokerPaths({ identity, platform, env = {}, home } = {}) {
  const layout = layoutFor(platform);
  const digest = identity?.digest;
  if (typeof digest !== 'string' || !DIGEST_RE.test(digest)) {
    throw failure(
      'APR_BROKER_PATH_INVALID',
      'Broker identity has no canonical root digest.',
      'Compute canonical project identity before deriving broker paths.',
      { label: 'identity.digest', value: digest ?? null }
    );
  }

  const cache = selectCacheRoot({ platform, env, home });
  const endpointRoot = selectEndpointRoot({ platform, env, cacheRoot: cache.path });
  const paths = pathApi(platform);
  const authorityDirectories = frozen([
    paths.join(cache.path, 'ai-peer-review'),
    paths.join(cache.path, 'ai-peer-review', 'brokers'),
    paths.join(cache.path, 'ai-peer-review', 'brokers', digest),
  ]);
  const directory = authorityDirectories.at(-1);
  const endpointDirectories =
    platform.kind === 'win32'
      ? frozen([])
      : frozen([
          path.posix.join(endpointRoot.path, 'aipr'),
          path.posix.join(endpointRoot.path, 'aipr', 'v1'),
        ]);
  const endpoint =
    platform.kind === 'win32'
      ? `\\\\.\\pipe\\ai-peer-review-brokers-${digest}-broker.sock`
      : path.posix.join(endpointDirectories.at(-1), base32Digest(digest));
  verifyEndpointLength(endpoint, layout);

  return Object.freeze({
    cacheRoot: cache.path,
    cacheRootSource: cache.source,
    endpointRoot: endpointRoot.path,
    endpointRootSource: endpointRoot.source,
    endpointLayoutVersion: layout.endpointLayoutVersion,
    maxEndpointRootBytes: layout.maxEndpointRootBytes,
    authorityDirectories,
    directory,
    endpointDirectories,
    endpoint,
    lock: paths.join(directory, 'broker.lock'),
    metadata: paths.join(directory, 'broker.json'),
  });
}
