// @story #1049
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  WorkLeaseError,
  createHttpErrorEnvelope,
  createHttpSuccessEnvelope,
  httpStatusForLeaseError,
  validateHttpLeaseRequest,
} from '@kburson/aitm-ledger';

import {
  assertLeaseStoreConformance,
  createMemoryLeaseStore,
} from '../../../../../packages/aitm-ledger/test/fixtures/lease-conformance.mjs';
import { HttpWorkLeaseStore } from '../../../lib/work-lease/http-store.mjs';
import { createWorkLeaseProvider } from '../../../lib/work-lease/provider.mjs';

const PROJECT_ID = '11111111-1111-4111-8111-111111111111';
const NOW = '2026-07-30T12:00:00.000Z';

function holder(overrides = {}) {
  return {
    principalKind: 'worker',
    provider: 'codex',
    agentRunId: 'run-1',
    sessionId: 'session-1',
    hostId: 'host-1',
    worktreeId: 'wt:v1:one',
    pathHash: 'path-one',
    branch: 'feature/child/1049',
    pid: 123,
    ...overrides,
  };
}

function acquire(overrides = {}) {
  return {
    projectId: PROJECT_ID,
    issueId: '1049',
    mode: 'write',
    idempotencyKey: 'acquire-1',
    requestedAt: NOW,
    ttlMs: 900_000,
    holder: holder(),
    ...overrides,
  };
}

function lease(overrides = {}) {
  return {
    projectId: PROJECT_ID,
    issueId: '1049',
    mode: 'write',
    leaseId: 'lease-1',
    fencingToken: '1',
    state: 'active',
    holder: holder(),
    acquiredAt: NOW,
    heartbeatAt: NOW,
    expiresAt: '2026-07-30T12:15:00.000Z',
    audit: {},
    ...overrides,
  };
}

function response(status, payload, { contentType = 'application/json' } = {}) {
  return {
    status,
    headers: { get: (name) => (name.toLowerCase() === 'content-type' ? contentType : null) },
    json: async () => payload,
  };
}

function conformanceFetch(authority) {
  return async (rawUrl, options) => {
    const url = new URL(rawUrl);
    const body = options.body === undefined ? undefined : JSON.parse(options.body);
    let validated;
    try {
      validated = validateHttpLeaseRequest({
        method: options.method,
        pathname: url.pathname,
        headers: options.headers,
        body,
        query: url.searchParams,
      });
      const result = await authority[validated.operation](validated.request);
      const httpResult = validated.operation === 'observe' ? { lease: result } : result;
      const status = ['acquire', 'takeover'].includes(validated.operation) ? 201 : 200;
      return response(status, createHttpSuccessEnvelope(httpResult));
    } catch (error) {
      const leaseError =
        error instanceof WorkLeaseError
          ? error
          : new WorkLeaseError('authority-unavailable', 'test authority failed');
      return response(
        httpStatusForLeaseError(leaseError.code),
        createHttpErrorEnvelope(leaseError)
      );
    }
  };
}

test('HTTP adapter satisfies the shared lease-store conformance suite', async () => {
  await assertLeaseStoreConformance({
    assert,
    createStore: () => {
      const authority = createMemoryLeaseStore();
      return new HttpWorkLeaseStore({
        endpoint: 'https://leases.example.test',
        projectId: 'conformance-project',
        env: { AITM_LEASE_AUTH_TOKEN: 'conformance-secret' },
        fetchImpl: conformanceFetch(authority),
      });
    },
  });
});

test('HTTP store sends authenticated JSON and matching idempotency at exact routes', async () => {
  const calls = [];
  const env = { AITM_LEASE_AUTH_TOKEN: 'first-token' };
  const store = new HttpWorkLeaseStore({
    endpoint: 'https://leases.example.test/base/',
    projectId: PROJECT_ID,
    env,
    fetchImpl: async (url, options) => {
      calls.push({ url: String(url), options });
      return response(201, { result: lease() });
    },
  });

  assert.equal(store.projectId, PROJECT_ID);
  assert.throws(() => {
    store.projectId = 'different';
  }, TypeError);
  assert.deepEqual(await store.acquire(acquire()), lease());
  assert.equal(calls[0].url, 'https://leases.example.test/base/v1/work-leases:acquire');
  assert.equal(calls[0].options.method, 'POST');
  assert.equal(calls[0].options.redirect, 'error');
  assert.equal(calls[0].options.headers.authorization, 'Bearer first-token');
  assert.equal(calls[0].options.headers['content-type'], 'application/json');
  assert.equal(calls[0].options.headers['idempotency-key'], 'acquire-1');
  assert.deepEqual(JSON.parse(calls[0].options.body), acquire());

  env.AITM_LEASE_AUTH_TOKEN = 'second-token';
  calls.length = 0;
  await store.acquire(acquire());
  assert.equal(calls[0].options.headers.authorization, 'Bearer second-token');
});

test('every operation uses the specified endpoint, method, and body semantics', async () => {
  const calls = [];
  const results = {
    acquire: lease(),
    renew: lease(),
    verify: { allowed: true, lease: lease() },
    switchLease: {
      lease: lease({
        issueId: '1051',
        leaseId: 'lease-2',
        fencingToken: '3',
        holder: holder({ sessionId: 'session-2' }),
      }),
      transition: {
        transitionId: 'transition-1',
        fromIssueId: '1049',
        fromLeaseId: 'lease-1',
        fromToken: '1',
        toIssueId: '1051',
      },
    },
    handoff: lease({
      fencingToken: '2',
      holder: {
        ...holder(),
        principalKind: 'integration',
        agentRunId: 'integration-1',
        sessionId: 'orchestrator-1',
        pid: 456,
      },
    }),
    release: lease({ fencingToken: '2', state: 'released' }),
    takeover: lease({
      leaseId: 'lease-2',
      fencingToken: '3',
      holder: holder({ agentRunId: 'run-2', sessionId: 'session-2', pid: 456 }),
    }),
    observe: { lease: null },
  };
  const statuses = { acquire: 201, takeover: 201 };
  const store = new HttpWorkLeaseStore({
    endpoint: 'https://leases.example.test',
    projectId: PROJECT_ID,
    env: { LEASE_TOKEN: 'secret' },
    tokenEnv: 'LEASE_TOKEN',
    fetchImpl: async (url, options) => {
      const pathname = new URL(url).pathname;
      const operation =
        pathname === '/v1/work-leases'
          ? 'observe'
          : pathname.slice(pathname.lastIndexOf(':') + 1) === 'switch'
            ? 'switchLease'
            : pathname.slice(pathname.lastIndexOf(':') + 1);
      calls.push({ operation, url: String(url), options });
      return response(statuses[operation] ?? 200, { result: results[operation] });
    },
  });

  const current = {
    projectId: PROJECT_ID,
    leaseId: 'lease-1',
    fencingToken: '1',
  };
  const takeoverEvidence = {
    kind: 'local-process-dead',
    hostId: 'host-1',
    pid: 123,
    checkedAt: NOW,
    detailsHash: 'proof-hash',
  };
  const requests = [
    ['acquire', acquire()],
    [
      'renew',
      {
        ...current,
        idempotencyKey: 'renew-1',
        requestedAt: NOW,
        ttlMs: 900_000,
      },
    ],
    [
      'verify',
      {
        ...current,
        operation: 'source-write',
        verifiedAt: NOW,
      },
    ],
    [
      'switchLease',
      {
        ...current,
        issueId: '1049',
        idempotencyKey: 'switch-1',
        switchedAt: NOW,
        target: acquire({
          issueId: '1051',
          idempotencyKey: 'target-1',
          holder: holder({ sessionId: 'session-2' }),
        }),
      },
    ],
    [
      'handoff',
      {
        ...current,
        idempotencyKey: 'handoff-1',
        handedOffAt: NOW,
        reason: 'integrate',
        recipient: {
          principalKind: 'integration',
          provider: 'codex',
          agentRunId: 'integration-1',
          sessionId: 'orchestrator-1',
          hostId: 'host-1',
          pid: 456,
        },
      },
    ],
    [
      'release',
      {
        ...current,
        idempotencyKey: 'release-1',
        releasedAt: NOW,
        reason: 'done',
      },
    ],
    [
      'takeover',
      {
        projectId: PROJECT_ID,
        issueId: '1049',
        expectedLeaseId: 'lease-1',
        expectedToken: '1',
        requester: holder({ agentRunId: 'run-2', sessionId: 'session-2', pid: 456 }),
        observedAt: NOW,
        idempotencyKey: 'takeover-1',
        reason: 'dead holder',
        evidence: takeoverEvidence,
      },
    ],
  ];

  for (const [operation, request] of requests) {
    assert.deepEqual(await store[operation](request), results[operation]);
  }
  assert.equal(await store.observe({ projectId: PROJECT_ID, issueId: '999' }), null);
  assert.deepEqual(
    calls.map(({ operation, options }) => [operation, options.method]),
    [
      ['acquire', 'POST'],
      ['renew', 'POST'],
      ['verify', 'POST'],
      ['switchLease', 'POST'],
      ['handoff', 'POST'],
      ['release', 'POST'],
      ['takeover', 'POST'],
      ['observe', 'GET'],
    ]
  );
  assert.equal('idempotency-key' in calls[2].options.headers, false);
  assert.equal(calls[7].options.body, undefined);
  assert.match(calls[7].url, /projectId=.*&issueId=999$/);
  assert.deepEqual(JSON.parse(calls[6].options.body).evidence, takeoverEvidence);
});

test('store rejects redirects, malformed envelopes, non-JSON, and remote error/status mismatch', async () => {
  const scenarios = [
    response(302, { result: lease() }),
    response(200, { result: lease(), unknown: true }),
    response(200, { other: lease() }),
    response(200, { result: lease() }, { contentType: 'text/html' }),
    response(412, { error: { code: 'new-code', message: 'unknown', details: {} } }),
    response(409, { error: { code: 'fence-stale', message: 'stale', details: {} } }),
  ];
  for (const remoteResponse of scenarios) {
    const store = new HttpWorkLeaseStore({
      endpoint: 'https://leases.example.test',
      projectId: PROJECT_ID,
      env: { AITM_LEASE_AUTH_TOKEN: 'secret' },
      fetchImpl: async () => remoteResponse,
    });
    await assert.rejects(
      () => store.acquire(acquire()),
      (error) => error.code === 'authority-unavailable'
    );
  }
});

test('missing credentials and transport failures fail closed without leaking tokens', async () => {
  const absent = new HttpWorkLeaseStore({
    endpoint: 'https://leases.example.test',
    projectId: PROJECT_ID,
    env: {},
    fetchImpl: async () => {
      throw new Error('must not call');
    },
  });
  await assert.rejects(
    () => absent.acquire(acquire()),
    (error) => error.code === 'authority-unauthenticated'
  );

  for (const transport of ['TLS', 'DNS', 'timeout']) {
    const secret = `secret-${transport}`;
    const store = new HttpWorkLeaseStore({
      endpoint: 'https://leases.example.test',
      projectId: PROJECT_ID,
      env: { AITM_LEASE_AUTH_TOKEN: secret },
      fetchImpl: async () => {
        const error = new Error(`${transport} failed while sending ${secret}`);
        if (transport === 'timeout') error.name = 'AbortError';
        throw error;
      },
    });
    await assert.rejects(
      () =>
        store.verify({
          projectId: PROJECT_ID,
          leaseId: 'lease-1',
          fencingToken: '1',
          operation: 'source-write',
          verifiedAt: NOW,
        }),
      (error) =>
        error.code === 'authority-unavailable' &&
        !JSON.stringify(error).includes(secret) &&
        !error.message.includes(secret)
    );
  }
});

test('request timeout actively aborts transport and remote echoes cannot expose the token', async () => {
  let cleared = false;
  const timedOut = new HttpWorkLeaseStore({
    endpoint: 'https://leases.example.test',
    projectId: PROJECT_ID,
    env: { AITM_LEASE_AUTH_TOKEN: 'timeout-secret' },
    timeoutMs: 5,
    clearTimeoutImpl: (timer) => {
      cleared = true;
      clearTimeout(timer);
    },
    fetchImpl: async (_url, { signal }) =>
      new Promise((resolve, reject) => {
        signal.addEventListener(
          'abort',
          () => {
            const error = new Error('aborted');
            error.name = 'AbortError';
            reject(error);
          },
          { once: true }
        );
      }),
  });
  await assert.rejects(
    () =>
      timedOut.verify({
        projectId: PROJECT_ID,
        leaseId: 'lease-1',
        fencingToken: '1',
        operation: 'source-write',
        verifiedAt: NOW,
      }),
    (error) => error.code === 'authority-unavailable'
  );
  assert.equal(cleared, true);

  let bodyAborted = false;
  const bodyTimeout = new HttpWorkLeaseStore({
    endpoint: 'https://leases.example.test',
    projectId: PROJECT_ID,
    env: { AITM_LEASE_AUTH_TOKEN: 'body-timeout-secret' },
    timeoutMs: 5,
    fetchImpl: async (_url, { signal }) => ({
      status: 200,
      headers: { get: () => 'application/json' },
      json: async () =>
        new Promise((resolve, reject) => {
          signal.addEventListener(
            'abort',
            () => {
              bodyAborted = true;
              reject(Object.assign(new Error('aborted body'), { name: 'AbortError' }));
            },
            { once: true }
          );
          setTimeout(() => reject(new Error('body remained pending')), 50);
        }),
    }),
  });
  await assert.rejects(
    () =>
      bodyTimeout.verify({
        projectId: PROJECT_ID,
        leaseId: 'lease-1',
        fencingToken: '1',
        operation: 'source-write',
        verifiedAt: NOW,
      }),
    (error) => error.code === 'authority-unavailable'
  );
  assert.equal(bodyAborted, true, 'timeout must cover the response body, not only headers');

  const echoedToken = 'echoed-super-secret';
  const echoing = new HttpWorkLeaseStore({
    endpoint: 'https://leases.example.test',
    projectId: PROJECT_ID,
    env: { AITM_LEASE_AUTH_TOKEN: echoedToken },
    fetchImpl: async () =>
      response(401, {
        error: {
          code: 'authority-unauthenticated',
          message: `rejected Bearer ${echoedToken}`,
          details: { diagnostic: echoedToken },
        },
      }),
  });
  await assert.rejects(
    () => echoing.acquire(acquire()),
    (error) =>
      error.code === 'authority-unavailable' &&
      !error.message.includes(echoedToken) &&
      !JSON.stringify(error).includes(echoedToken)
  );
});

test('configuration requires HTTPS, a safe token environment name, and matching project identity', async () => {
  for (const options of [
    { endpoint: 'http://leases.example.test', tokenEnv: 'TOKEN' },
    { endpoint: 'https://user:pass@leases.example.test', tokenEnv: 'TOKEN' },
    { endpoint: 'https://leases.example.test?query=1', tokenEnv: 'TOKEN' },
    { endpoint: 'https://leases.example.test#fragment', tokenEnv: 'TOKEN' },
    { endpoint: 'https://leases.example.test', tokenEnv: 'TOKEN-NAME' },
    { endpoint: 'https://leases.example.test', tokenEnv: '1TOKEN' },
  ]) {
    assert.throws(
      () =>
        new HttpWorkLeaseStore({
          ...options,
          projectId: PROJECT_ID,
          env: { TOKEN: 'secret' },
          fetchImpl: async () => response(200, {}),
        }),
      (error) => error.code === 'invalid-request'
    );
  }
  const store = new HttpWorkLeaseStore({
    endpoint: 'https://leases.example.test',
    projectId: PROJECT_ID,
    env: { AITM_LEASE_AUTH_TOKEN: 'secret' },
    fetchImpl: async () => response(200, { result: { lease: null } }),
  });
  await assert.rejects(
    () => store.observe({ projectId: 'different', issueId: '1049' }),
    (error) => error.code === 'invalid-request'
  );
});

test('provider selection opens local only in local mode and never falls back from remote', async () => {
  const localStore = { local: true };
  let localOpenCount = 0;
  const createLocalStore = ({ projectId }) => {
    localOpenCount += 1;
    assert.equal(projectId, PROJECT_ID);
    return localStore;
  };
  const local = createWorkLeaseProvider({
    config: {
      ledgerProjectId: PROJECT_ID,
      workLease: { authority: 'local' },
    },
    createLocalStore,
  });
  assert.equal(local, localStore);
  assert.equal(localOpenCount, 1);

  const remote = createWorkLeaseProvider({
    config: {
      ledgerProjectId: PROJECT_ID,
      workLease: {
        authority: 'remote',
        endpoint: 'https://leases.example.test',
        projectId: PROJECT_ID,
        tokenEnv: 'REMOTE_TOKEN',
      },
    },
    createLocalStore,
    env: { REMOTE_TOKEN: 'secret' },
    fetchImpl: async () => response(200, { result: { lease: null } }),
  });
  assert.ok(remote instanceof HttpWorkLeaseStore);
  assert.equal(localOpenCount, 1, 'remote selection must not open or inspect SQLite');
  assert.equal(await remote.observe({ projectId: PROJECT_ID, issueId: '1049' }), null);
  assert.equal(localOpenCount, 1);

  const unavailable = createWorkLeaseProvider({
    config: {
      ledgerProjectId: PROJECT_ID,
      workLease: {
        authority: 'remote',
        endpoint: 'https://leases.example.test',
        projectId: PROJECT_ID,
      },
    },
    createLocalStore,
    env: { AITM_LEASE_AUTH_TOKEN: 'secret' },
    fetchImpl: async () => {
      throw new Error('DNS unavailable');
    },
  });
  await assert.rejects(
    () => unavailable.observe({ projectId: PROJECT_ID, issueId: '1049' }),
    (error) => error.code === 'authority-unavailable'
  );
  assert.equal(localOpenCount, 1, 'remote failure must never fall back to SQLite');
});

test('default local provider resolves the strict main database and initializes matching identity', () => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'aitm-provider-local-'));
  const configPath = path.join(root, '.ai-task-manager', 'task-tracker.json');
  try {
    execFileSync('git', ['init', '-b', 'trunk', root], { stdio: 'ignore' });
    mkdirSync(path.dirname(configPath), { recursive: true });
    const config = {
      projectId: 'PVT_GITHUB_PROJECT',
      ledgerProjectId: PROJECT_ID,
      workLease: { authority: 'local' },
    };
    writeFileSync(configPath, JSON.stringify(config));

    const store = createWorkLeaseProvider({ config, projectDir: root });
    assert.equal(store.projectId, PROJECT_ID);
    assert.throws(() => {
      store.projectId = 'different';
    }, TypeError);
    const granted = store.acquire(acquire());
    assert.equal(granted.projectId, PROJECT_ID);
    assert.equal(
      existsSync(path.join(root, '.db', 'aitm', 'project.sqlite')),
      true,
      'local provider must use the strict main-worktree database'
    );
    store.close();
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('default local provider bootstraps an empty ledger identity and exposes the winner', () => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'aitm-provider-bootstrap-'));
  const configPath = path.join(root, '.ai-task-manager', 'task-tracker.json');
  try {
    execFileSync('git', ['init', '-b', 'trunk', root], { stdio: 'ignore' });
    mkdirSync(path.dirname(configPath), { recursive: true });
    const config = {
      projectId: 'PVT_GITHUB_PROJECT',
      ledgerProjectId: '',
      workLease: { authority: 'local' },
    };
    writeFileSync(configPath, JSON.stringify(config));

    const store = createWorkLeaseProvider({ config, projectDir: root });
    assert.match(
      store.projectId,
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
    );
    assert.equal(JSON.parse(readFileSync(configPath, 'utf8')).ledgerProjectId, store.projectId);
    assert.equal(
      store.db.prepare("SELECT value FROM ledger_metadata WHERE key = 'ledgerProjectId'").get()
        .value,
      store.projectId
    );
    store.close();
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('remote provider does not invoke any local path, database, identity, or store dependency', () => {
  const forbidden = () => {
    throw new Error('local authority dependency must remain untouched');
  };
  assert.doesNotThrow(() =>
    createWorkLeaseProvider({
      config: {
        projectId: 'PVT_GITHUB_PROJECT',
        ledgerProjectId: PROJECT_ID,
        workLease: {
          authority: 'remote',
          endpoint: 'https://leases.example.test',
          projectId: PROJECT_ID,
        },
      },
      env: { AITM_LEASE_AUTH_TOKEN: 'secret' },
      fetchImpl: async () => response(200, { result: { lease: null } }),
      resolveDatabasePath: forbidden,
      openDatabase: forbidden,
      ensureProjectIdentity: forbidden,
      createLocalStore: forbidden,
    })
  );
});

test('remote provider fails closed on incomplete or divergent project identity', () => {
  const base = {
    workLease: {
      authority: 'remote',
      endpoint: 'https://leases.example.test',
      projectId: PROJECT_ID,
    },
  };
  for (const config of [
    base,
    { ...base, ledgerProjectId: '22222222-2222-4222-8222-222222222222' },
    {
      ledgerProjectId: 'not-a-uuid',
      workLease: { ...base.workLease, projectId: 'not-a-uuid' },
    },
    {
      projectId: PROJECT_ID,
      ledgerProjectId: PROJECT_ID,
      workLease: { ...base.workLease },
    },
    { ...base, ledgerProjectId: PROJECT_ID, workLease: { ...base.workLease, projectId: '' } },
    { ...base, ledgerProjectId: PROJECT_ID, workLease: { ...base.workLease, authority: 'other' } },
    { ledgerProjectId: PROJECT_ID, workLease: [] },
    {
      ledgerProjectId: PROJECT_ID,
      workLease: { ...base.workLease, tokenEnv: '' },
    },
  ]) {
    assert.throws(
      () =>
        createWorkLeaseProvider({
          config,
          createLocalStore: () => {
            throw new Error('SQLite must remain untouched');
          },
          env: { AITM_LEASE_AUTH_TOKEN: 'secret' },
          fetchImpl: async () => response(200, {}),
        }),
      (error) => error.code === 'invalid-request'
    );
  }
});
