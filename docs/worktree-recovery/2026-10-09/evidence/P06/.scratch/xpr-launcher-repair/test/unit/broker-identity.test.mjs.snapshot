import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';

// cspell:words aipr overlength

import { canonicalProjectIdentity, rootDigest } from '../../src/broker/identity.mjs';
import { brokerPaths } from '../../src/broker/paths.mjs';

function platform({
  kind = 'linux',
  locations = {},
  canonical = {},
  userId = '501',
  limit = 512,
  includeLimit = true,
} = {}) {
  return Object.freeze({
    kind,
    userId: () => userId,
    canonicalPath: (value) => canonical[value] ?? value,
    repository: Object.freeze({
      physicalLocation: (cwd) => locations[cwd] ?? null,
    }),
    ...(includeLimit ? { maxEndpointLength: limit } : {}),
  });
}

function identityFor(digest) {
  return Object.freeze({ digest });
}

test('rootDigest hashes the literal versioned physical-root tuple', () => {
  const tuple = [
    'ai-peer-review.broker-root/v1',
    '/physical/project',
    '/physical/project/.git',
    '501',
  ];

  assert.equal(
    rootDigest(tuple),
    createHash('sha256').update(JSON.stringify(tuple), 'utf8').digest('hex')
  );
  assert.notEqual(
    rootDigest(tuple),
    rootDigest([tuple[0], '/physical/linked', tuple[2], tuple[3]])
  );
});

test('canonicalProjectIdentity collapses symlink aliases to one physical Git worktree', () => {
  const identity = canonicalProjectIdentity({
    cwd: '/logical/project-alias',
    platform: platform({
      locations: {
        '/logical/project-alias': {
          physicalRoot: '/physical/project',
          commonDirectory: '/physical/project/.git',
        },
      },
      canonical: {
        '/physical/project': '/physical/project',
        '/physical/project/.git': '/physical/project/.git',
      },
    }),
  });

  assert.deepEqual(identity.tuple, [
    'ai-peer-review.broker-root/v1',
    '/physical/project',
    '/physical/project/.git',
    '501',
  ]);
  assert.equal(identity.physicalRoot, '/physical/project');
  assert.equal(identity.commonDirectory, '/physical/project/.git');
  assert.equal(identity.userId, '501');
});

test('canonicalProjectIdentity keeps linked worktrees separate while retaining shared Git storage', () => {
  const shared = '/physical/repository/.git';
  const first = canonicalProjectIdentity({
    cwd: '/worktrees/one',
    platform: platform({
      locations: {
        '/worktrees/one': { physicalRoot: '/worktrees/one', commonDirectory: shared },
      },
    }),
  });
  const second = canonicalProjectIdentity({
    cwd: '/worktrees/two',
    platform: platform({
      locations: {
        '/worktrees/two': { physicalRoot: '/worktrees/two', commonDirectory: shared },
      },
    }),
  });

  assert.equal(first.commonDirectory, second.commonDirectory);
  assert.notEqual(first.physicalRoot, second.physicalRoot);
  assert.notEqual(first.digest, second.digest);
});

test('canonicalProjectIdentity keeps a canonical non-Git root with null common storage', () => {
  const identity = canonicalProjectIdentity({
    cwd: '/logical/non-git',
    platform: platform({
      canonical: { '/logical/non-git': '/physical/non-git' },
      userId: 'S-1-5-21-42',
    }),
  });

  assert.deepEqual(identity.tuple, [
    'ai-peer-review.broker-root/v1',
    '/physical/non-git',
    null,
    'S-1-5-21-42',
  ]);
  assert.equal(identity.commonDirectory, null);
});

test('canonicalProjectIdentity preserves Unicode and filesystem-canonical Windows paths', () => {
  const identity = canonicalProjectIdentity({
    cwd: 'c:\\Users\\Kendrick\\Café',
    platform: platform({
      kind: 'win32',
      userId: 'S-1-5-21-9000',
      locations: {
        'c:\\Users\\Kendrick\\Café': {
          physicalRoot: 'C:\\Users\\Kendrick\\Café',
          commonDirectory: 'C:\\Users\\Kendrick\\Café\\.git',
        },
      },
      canonical: {
        'C:\\Users\\Kendrick\\Café': 'C:\\Users\\Kendrick\\Café',
        'C:\\Users\\Kendrick\\Café\\.git': 'C:\\Users\\Kendrick\\Café\\.git',
      },
    }),
  });

  assert.deepEqual(identity.tuple.slice(1), [
    'C:\\Users\\Kendrick\\Café',
    'C:\\Users\\Kendrick\\Café\\.git',
    'S-1-5-21-9000',
  ]);
});

function decodeBase32(token) {
  const alphabet = 'abcdefghijklmnopqrstuvwxyz234567';
  let bits = 0;
  let value = 0;
  const bytes = [];
  for (const character of token) {
    value = (value << 5) | alphabet.indexOf(character);
    bits += 5;
    while (bits >= 8) {
      bits -= 8;
      bytes.push((value >>> bits) & 0xff);
      value &= (1 << bits) - 1;
    }
  }
  return Buffer.from(bytes);
}

function rootOfLength(length, character = 'r') {
  return `/${character.repeat(length - 1)}`;
}

test('brokerPaths returns the exact frozen Darwin and Linux contracts', () => {
  const digest = '0'.repeat(64);
  const mac = brokerPaths({
    identity: identityFor(digest),
    platform: platform({ kind: 'darwin', limit: 103 }),
    env: {},
    home: '/Users/alex',
  });
  const linux = brokerPaths({
    identity: identityFor(digest),
    platform: platform({ kind: 'linux', limit: 107 }),
    env: { XDG_CACHE_HOME: '/var/cache/alex' },
    home: '/home/alex',
    versions: { package_version: '0.2.2', broker_protocol_version: '1', node_major: 24 },
  });
  const upgraded = brokerPaths({
    identity: identityFor(digest),
    platform: platform({ kind: 'linux', limit: 107 }),
    env: { XDG_CACHE_HOME: '/var/cache/alex' },
    home: '/home/alex',
    versions: { package_version: '0.3.0', broker_protocol_version: '2', node_major: 26 },
  });

  assert.deepEqual(mac, {
    cacheRoot: '/Users/alex/Library/Caches',
    cacheRootSource: 'platform-default',
    endpointRoot: '/Users/alex/Library/Caches',
    endpointRootSource: 'cache-root',
    endpointLayoutVersion: 1,
    maxEndpointRootBytes: 42,
    authorityDirectories: [
      '/Users/alex/Library/Caches/ai-peer-review',
      '/Users/alex/Library/Caches/ai-peer-review/brokers',
      `/Users/alex/Library/Caches/ai-peer-review/brokers/${digest}`,
    ],
    directory: `/Users/alex/Library/Caches/ai-peer-review/brokers/${digest}`,
    endpointDirectories: ['/Users/alex/Library/Caches/aipr', '/Users/alex/Library/Caches/aipr/v1'],
    endpoint: `/Users/alex/Library/Caches/aipr/v1/${'a'.repeat(52)}`,
    lock: `/Users/alex/Library/Caches/ai-peer-review/brokers/${digest}/broker.lock`,
    metadata: `/Users/alex/Library/Caches/ai-peer-review/brokers/${digest}/broker.json`,
  });
  assert.deepEqual(linux, {
    cacheRoot: '/var/cache/alex',
    cacheRootSource: 'xdg-configured',
    endpointRoot: '/var/cache/alex',
    endpointRootSource: 'cache-root',
    endpointLayoutVersion: 1,
    maxEndpointRootBytes: 46,
    authorityDirectories: [
      '/var/cache/alex/ai-peer-review',
      '/var/cache/alex/ai-peer-review/brokers',
      `/var/cache/alex/ai-peer-review/brokers/${digest}`,
    ],
    directory: `/var/cache/alex/ai-peer-review/brokers/${digest}`,
    endpointDirectories: ['/var/cache/alex/aipr', '/var/cache/alex/aipr/v1'],
    endpoint: `/var/cache/alex/aipr/v1/${'a'.repeat(52)}`,
    lock: `/var/cache/alex/ai-peer-review/brokers/${digest}/broker.lock`,
    metadata: `/var/cache/alex/ai-peer-review/brokers/${digest}/broker.json`,
  });
  assert.equal(
    brokerPaths({
      identity: identityFor(digest),
      platform: platform({ kind: 'linux', limit: 107 }),
      env: {},
      home: '/home/alex',
    }).cacheRootSource,
    'home-default'
  );
  assert.equal(linux.endpoint, upgraded.endpoint);
  assert.equal(Object.isFrozen(mac), true);
  assert.equal(Object.isFrozen(mac.authorityDirectories), true);
  assert.equal(Object.isFrozen(mac.endpointDirectories), true);
});

test('brokerPaths base32-encodes every digest bit without collisions', () => {
  const options = {
    platform: platform({ kind: 'linux', limit: 107 }),
    env: { AI_PEER_REVIEW_ENDPOINT_ROOT: '/a' },
    home: '/home/alex',
  };
  const vectors = [
    '0'.repeat(64),
    'f'.repeat(64),
    `00${'ab'.repeat(31)}`,
    createHash('sha256').update('issue-56').digest('hex'),
  ];

  const tokens = vectors.map((digest) => {
    const token = path.posix.basename(
      brokerPaths({ identity: identityFor(digest), ...options }).endpoint
    );
    assert.match(token, /^[a-z2-7]{52}$/);
    assert.match(token.at(-1), /^[aq]$/);
    assert.equal(decodeBase32(token).toString('hex'), digest);
    return token;
  });

  assert.equal(tokens[0], 'a'.repeat(52));
  assert.equal(tokens[1], `${'7'.repeat(51)}q`);
  assert.equal(new Set(tokens).size, vectors.length);
});

test('brokerPaths retains the exact expanded Windows contract', () => {
  const digest = 'b'.repeat(64);
  const paths = brokerPaths({
    identity: identityFor(digest),
    platform: platform({ kind: 'win32', limit: 256 }),
    env: {
      LOCALAPPDATA: 'C:\\Users\\Alex\\AppData\\Local',
      AI_PEER_REVIEW_ENDPOINT_ROOT: 'ignored-relative-value',
    },
    home: 'C:\\Users\\Alex',
  });

  assert.deepEqual(paths, {
    cacheRoot: 'C:\\Users\\Alex\\AppData\\Local',
    cacheRootSource: 'platform-default',
    endpointRoot: null,
    endpointRootSource: 'named-pipe',
    endpointLayoutVersion: null,
    maxEndpointRootBytes: null,
    authorityDirectories: [
      'C:\\Users\\Alex\\AppData\\Local\\ai-peer-review',
      'C:\\Users\\Alex\\AppData\\Local\\ai-peer-review\\brokers',
      `C:\\Users\\Alex\\AppData\\Local\\ai-peer-review\\brokers\\${digest}`,
    ],
    directory: `C:\\Users\\Alex\\AppData\\Local\\ai-peer-review\\brokers\\${digest}`,
    endpointDirectories: [],
    endpoint: `\\\\.\\pipe\\ai-peer-review-brokers-${digest}-broker.sock`,
    lock: `C:\\Users\\Alex\\AppData\\Local\\ai-peer-review\\brokers\\${digest}\\broker.lock`,
    metadata: `C:\\Users\\Alex\\AppData\\Local\\ai-peer-review\\brokers\\${digest}\\broker.json`,
  });
  assert.equal(Object.isFrozen(paths), true);
  assert.equal(Object.isFrozen(paths.authorityDirectories), true);
  assert.equal(Object.isFrozen(paths.endpointDirectories), true);
});

test('brokerPaths rejects invalid limits before digest and root inputs', () => {
  for (const options of [
    { includeLimit: false },
    { limit: 0 },
    { limit: '107' },
    { limit: 107.5 },
    { limit: 62 },
  ]) {
    assert.throws(
      () =>
        brokerPaths({
          identity: identityFor('not-a-digest'),
          platform: platform({ kind: 'linux', ...options }),
          env: { XDG_CACHE_HOME: 'relative' },
          home: '/home/alex',
        }),
      (error) => error.code === 'APR_BROKER_ENDPOINT_LIMIT_INVALID'
    );
  }

  const exact = brokerPaths({
    identity: identityFor('d'.repeat(64)),
    platform: platform({ kind: 'linux', limit: 63 }),
    env: { AI_PEER_REVIEW_ENDPOINT_ROOT: '/a', XDG_CACHE_HOME: '/cache' },
    home: '/home/alex',
  });
  assert.equal(Buffer.byteLength(exact.endpoint), 63);
  assert.equal(exact.maxEndpointRootBytes, 2);
});

test('brokerPaths pins POSIX endpoint byte boundaries and recovery', () => {
  const digest = 'c'.repeat(64);
  for (const [kind, limit, acceptedRootLength] of [
    ['darwin', 103, 42],
    ['linux', 107, 46],
  ]) {
    const accepted = brokerPaths({
      identity: identityFor(digest),
      platform: platform({ kind, limit }),
      env: {
        XDG_CACHE_HOME: '/cache',
        AI_PEER_REVIEW_ENDPOINT_ROOT: rootOfLength(acceptedRootLength),
      },
      home: '/home/alex',
    });
    assert.equal(Buffer.byteLength(accepted.endpoint), limit);
    assert.equal(accepted.maxEndpointRootBytes, acceptedRootLength);
    assert.equal(
      accepted.endpointDirectories.every((entry) =>
        Buffer.from(accepted.endpoint)
          .subarray(0, Buffer.byteLength(entry))
          .equals(Buffer.from(entry))
      ),
      true
    );

    assert.throws(
      () =>
        brokerPaths({
          identity: identityFor(digest),
          platform: platform({ kind, limit }),
          env: {
            XDG_CACHE_HOME: '/cache',
            AI_PEER_REVIEW_ENDPOINT_ROOT: rootOfLength(acceptedRootLength + 1),
          },
          home: '/home/alex',
        }),
      (error) => {
        assert.equal(error.code, 'APR_BROKER_ENDPOINT_TOO_LONG');
        assert.equal(error.details.length, limit + 1);
        assert.equal(error.details.limit, limit);
        assert.equal(error.details.maxEndpointRootBytes, acceptedRootLength);
        assert.match(error.recovery, /AI_PEER_REVIEW_ENDPOINT_ROOT/);
        assert.match(error.recovery, new RegExp(`${acceptedRootLength} UTF-8 bytes`));
        assert.doesNotMatch(error.recovery, /never truncated or redirected/i);
        assert.doesNotMatch(error.recovery, /use a shorter supported user cache/i);
        assert.match(error.recovery, /Do not move the authority cache/);
        return true;
      }
    );
  }

  const unicodeRoot = `/${'é'.repeat(23)}`;
  assert.equal(unicodeRoot.length, 24);
  assert.equal(Buffer.byteLength(unicodeRoot), 47);
  assert.throws(
    () =>
      brokerPaths({
        identity: identityFor(digest),
        platform: platform({ kind: 'linux', limit: 107 }),
        env: { XDG_CACHE_HOME: '/cache', AI_PEER_REVIEW_ENDPOINT_ROOT: unicodeRoot },
        home: '/home/alex',
      }),
    (error) => error.code === 'APR_BROKER_ENDPOINT_TOO_LONG' && error.details.length === 108
  );
});

test('brokerPaths accepts the Darwin boundary and recovers a long home through endpoint configuration', () => {
  const digest = 'd'.repeat(64);
  const acceptedHome = rootOfLength(27);
  const rejectedHome = rootOfLength(28);
  assert.equal(
    Buffer.byteLength(
      brokerPaths({
        identity: identityFor(digest),
        platform: platform({ kind: 'darwin', limit: 103 }),
        env: {},
        home: acceptedHome,
      }).endpoint
    ),
    103
  );

  assert.throws(
    () =>
      brokerPaths({
        identity: identityFor(digest),
        platform: platform({ kind: 'darwin', limit: 103 }),
        env: {},
        home: rejectedHome,
      }),
    (error) => error.code === 'APR_BROKER_ENDPOINT_TOO_LONG'
  );

  const twenty = '/Users/'.length + 20;
  assert.equal(twenty, 27);
  const longHome = `/Users/${'x'.repeat(21)}`;
  const recovered = brokerPaths({
    identity: identityFor(digest),
    platform: platform({ kind: 'darwin', limit: 103 }),
    env: { AI_PEER_REVIEW_ENDPOINT_ROOT: '/short' },
    home: longHome,
  });
  assert.equal(recovered.cacheRoot, `${longHome}/Library/Caches`);
  assert.equal(recovered.endpointRoot, '/short');
  assert.equal(recovered.directory.startsWith(recovered.cacheRoot), true);
  assert.equal(recovered.endpoint.startsWith('/short/aipr/v1/'), true);
});

test('brokerPaths rejects noncanonical root inputs and preserves exact POSIX spelling', () => {
  const digest = 'e'.repeat(64);
  const cases = [
    ['darwin', {}, '', 'home'],
    ['darwin', {}, 'relative', 'home'],
    ['darwin', {}, '/Users/alex/', 'home'],
    ['darwin', {}, '/Users/./alex', 'home'],
    ['darwin', {}, '/Users/other/../alex', 'home'],
    ['darwin', {}, '/', 'home'],
    ['linux', { XDG_CACHE_HOME: 'relative' }, '/home/alex', 'XDG_CACHE_HOME'],
    [
      'linux',
      { AI_PEER_REVIEW_ENDPOINT_ROOT: '/socket/' },
      '/home/alex',
      'AI_PEER_REVIEW_ENDPOINT_ROOT',
    ],
    ['win32', { LOCALAPPDATA: 'relative' }, 'C:\\Users\\Alex', 'LOCALAPPDATA'],
    ['win32', { LOCALAPPDATA: 'C:\\Cache\\' }, 'C:\\Users\\Alex', 'LOCALAPPDATA'],
    ['win32', { LOCALAPPDATA: 'C:\\Cache/' }, 'C:\\Users\\Alex', 'LOCALAPPDATA'],
  ];
  for (const [kind, env, home, label] of cases) {
    assert.throws(
      () =>
        brokerPaths({
          identity: identityFor(digest),
          platform: platform({ kind, limit: kind === 'win32' ? 256 : 107 }),
          env,
          home,
        }),
      (error) => error.code === 'APR_BROKER_PATH_INVALID' && error.details.label === label
    );
  }

  for (const endpointRoot of ['/Cache', '/cache', '/Café', '/Café']) {
    const result = brokerPaths({
      identity: identityFor(digest),
      platform: platform({ kind: 'linux', limit: 107 }),
      env: { XDG_CACHE_HOME: '/authority', AI_PEER_REVIEW_ENDPOINT_ROOT: endpointRoot },
      home: '/home/alex',
    });
    assert.equal(result.endpointRoot, endpointRoot);
  }

  const literalBackslashHome = brokerPaths({
    identity: identityFor(digest),
    platform: platform({ kind: 'darwin', limit: 103 }),
    env: { AI_PEER_REVIEW_ENDPOINT_ROOT: '/socket' },
    home: '/Users/alex\\',
  });
  assert.equal(literalBackslashHome.cacheRoot, '/Users/alex\\/Library/Caches');

  const literalBackslashEndpoint = brokerPaths({
    identity: identityFor(digest),
    platform: platform({ kind: 'linux', limit: 107 }),
    env: {
      XDG_CACHE_HOME: '/authority',
      AI_PEER_REVIEW_ENDPOINT_ROOT: '/socket\\',
    },
    home: '/home/alex',
  });
  assert.equal(literalBackslashEndpoint.endpointRoot, '/socket\\');
});

test('configured endpoint roots change routing but never authority', () => {
  const common = {
    identity: identityFor('f'.repeat(64)),
    platform: platform({ kind: 'linux', limit: 107 }),
    home: '/home/alex',
  };
  const baseline = brokerPaths({ ...common, env: { XDG_CACHE_HOME: '/authority' } });
  const configured = brokerPaths({
    ...common,
    env: { XDG_CACHE_HOME: '/authority', AI_PEER_REVIEW_ENDPOINT_ROOT: '/socket' },
  });

  for (const key of [
    'cacheRoot',
    'cacheRootSource',
    'authorityDirectories',
    'directory',
    'lock',
    'metadata',
  ]) {
    assert.deepEqual(configured[key], baseline[key]);
  }
  assert.equal(configured.endpointRoot, '/socket');
  assert.equal(configured.endpointRootSource, 'configured');
  assert.notEqual(configured.endpoint, baseline.endpoint);
});

test('Windows overlength reports an invalid platform observation', () => {
  assert.throws(
    () =>
      brokerPaths({
        identity: identityFor('f'.repeat(64)),
        platform: platform({ kind: 'win32', limit: 107 }),
        env: { LOCALAPPDATA: 'C:\\Users\\Alex\\AppData\\Local' },
        home: 'C:\\Users\\Alex',
      }),
    (error) => {
      assert.equal(error.code, 'APR_BROKER_ENDPOINT_TOO_LONG');
      assert.equal(error.details.maxEndpointRootBytes, null);
      assert.match(error.recovery, /limit is invalid|runtime is unsupported/i);
      return true;
    }
  );
});

test('brokerPaths refuses unsupported platforms', () => {
  assert.throws(
    () =>
      brokerPaths({
        identity: identityFor('f'.repeat(64)),
        platform: platform({ kind: 'freebsd' }),
        env: {},
        home: '/home/alex',
      }),
    (error) => error.code === 'APR_BROKER_ENDPOINT_UNSUPPORTED'
  );
});
