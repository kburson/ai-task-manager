import {
  HTTP_LEASE_ROUTES,
  WorkLeaseError,
  WorkLeaseStore,
  parseHttpLeaseResponse,
  validateHttpLeaseRequest,
} from '@kburson/aitm-ledger';

const TOKEN_ENV_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/;

function invalid(message) {
  throw new WorkLeaseError('invalid-request', message);
}

function validateEndpoint(value) {
  if (typeof value !== 'string' || value.trim() === '')
    invalid('remote lease endpoint is required');
  let endpoint;
  try {
    endpoint = new URL(value);
  } catch {
    invalid('remote lease endpoint must be an absolute HTTPS URL');
  }
  if (endpoint.protocol !== 'https:') invalid('remote lease endpoint must use HTTPS');
  if (endpoint.username || endpoint.password) {
    invalid('remote lease endpoint cannot contain credentials');
  }
  if (endpoint.search || endpoint.hash) {
    invalid('remote lease endpoint cannot contain a query or fragment');
  }
  endpoint.pathname = endpoint.pathname.replace(/\/+$/, '') + '/';
  return endpoint;
}

function validateTokenEnvironment(value) {
  if (typeof value !== 'string' || !TOKEN_ENV_PATTERN.test(value)) {
    invalid('remote lease token environment name is invalid');
  }
  return value;
}

function validateProjectId(value) {
  if (typeof value !== 'string' || value.trim() === '') {
    invalid('remote lease project identity is required');
  }
  return value;
}

function routeUrl(endpoint, route, request) {
  const url = new URL(route.path.replace(/^\//, ''), endpoint);
  if (route.method === 'GET') {
    url.searchParams.set('projectId', request.projectId);
    if (request.issueId != null) url.searchParams.set('issueId', request.issueId);
    if (request.worktreeId != null) url.searchParams.set('worktreeId', request.worktreeId);
  }
  return url;
}

function containsCredential(value, credential, seen = new WeakSet()) {
  if (typeof value === 'string') return value.includes(credential);
  if (!value || typeof value !== 'object') return false;
  if (seen.has(value)) return false;
  seen.add(value);
  if (Array.isArray(value)) {
    return value.some((item) => containsCredential(item, credential, seen));
  }
  return Object.entries(value).some(
    ([key, item]) => key.includes(credential) || containsCredential(item, credential, seen)
  );
}

export class HttpWorkLeaseStore extends WorkLeaseStore {
  #endpoint;
  #projectId;
  #tokenEnv;
  #readEnvironment;
  #fetch;
  #timeoutMs;
  #setTimeout;
  #clearTimeout;
  #AbortController;

  constructor({
    endpoint,
    projectId,
    tokenEnv = 'AITM_LEASE_AUTH_TOKEN',
    env = process.env,
    fetchImpl = globalThis.fetch,
    timeoutMs = 5_000,
    setTimeoutImpl = globalThis.setTimeout,
    clearTimeoutImpl = globalThis.clearTimeout,
    AbortControllerImpl = globalThis.AbortController,
  } = {}) {
    super();
    this.#endpoint = validateEndpoint(endpoint);
    this.#projectId = validateProjectId(projectId);
    this.#tokenEnv = validateTokenEnvironment(tokenEnv);
    if (!env || typeof env !== 'object') invalid('environment source is required');
    this.#readEnvironment = () => env[this.#tokenEnv];
    if (typeof fetchImpl !== 'function') invalid('remote lease fetch implementation is required');
    if (!Number.isSafeInteger(timeoutMs) || timeoutMs <= 0) {
      invalid('remote lease timeout must be a positive safe integer');
    }
    if (
      typeof setTimeoutImpl !== 'function' ||
      typeof clearTimeoutImpl !== 'function' ||
      typeof AbortControllerImpl !== 'function'
    ) {
      invalid('remote lease timeout support is unavailable');
    }
    this.#fetch = fetchImpl;
    this.#timeoutMs = timeoutMs;
    this.#setTimeout = setTimeoutImpl;
    this.#clearTimeout = clearTimeoutImpl;
    this.#AbortController = AbortControllerImpl;
  }

  get projectId() {
    return this.#projectId;
  }

  #assertProject(request) {
    if (request?.projectId !== this.#projectId) {
      invalid('lease request project identity differs from the configured authority');
    }
  }

  #token() {
    const token = this.#readEnvironment();
    if (typeof token !== 'string' || token.trim() === '' || /\s/.test(token)) {
      throw new WorkLeaseError(
        'authority-unauthenticated',
        'remote lease authority credential is unavailable'
      );
    }
    return token;
  }

  async #request(operation, request) {
    const route = HTTP_LEASE_ROUTES[operation];
    if (!route) invalid('unknown remote lease operation');
    this.#assertProject(request);
    const token = this.#token();
    const url = routeUrl(this.#endpoint, route, request);
    const headers = { authorization: `Bearer ${token}` };
    const options = {
      method: route.method,
      headers,
      redirect: 'error',
    };
    if (route.method === 'POST') {
      headers['content-type'] = 'application/json';
      if (route.mutating) headers['idempotency-key'] = request.idempotencyKey;
      options.body = JSON.stringify(request);
    }
    validateHttpLeaseRequest({
      method: route.method,
      pathname: route.path,
      headers,
      body: options.body === undefined ? undefined : request,
      query: url.searchParams,
    });

    const controller = new this.#AbortController();
    const timeout = this.#setTimeout(() => controller.abort(), this.#timeoutMs);
    try {
      let response;
      try {
        response = await this.#fetch(url, { ...options, signal: controller.signal });
      } catch {
        throw new WorkLeaseError(
          'authority-unavailable',
          'remote lease authority transport failed',
          { operation }
        );
      }

      if (
        !response ||
        !Number.isInteger(response.status) ||
        (response.status >= 300 && response.status < 400)
      ) {
        throw new WorkLeaseError(
          'authority-unavailable',
          'remote lease authority returned an invalid HTTP response',
          { operation }
        );
      }
      const contentType = response.headers?.get?.('content-type');
      if (typeof contentType !== 'string' || !/^application\/json(?:\s*;|$)/i.test(contentType)) {
        throw new WorkLeaseError(
          'authority-unavailable',
          'remote lease authority returned a non-JSON response',
          { operation }
        );
      }
      let payload;
      try {
        payload = await response.json();
      } catch {
        throw new WorkLeaseError(
          'authority-unavailable',
          'remote lease authority returned malformed JSON',
          { operation }
        );
      }
      if (containsCredential(payload, token)) {
        throw new WorkLeaseError(
          'authority-unavailable',
          'remote lease authority returned an unsafe response',
          { operation }
        );
      }
      return parseHttpLeaseResponse({ operation, status: response.status, payload });
    } finally {
      this.#clearTimeout(timeout);
    }
  }

  acquire(request) {
    return this.#request('acquire', request);
  }

  renew(request) {
    return this.#request('renew', request);
  }

  verify(request) {
    return this.#request('verify', request);
  }

  switchLease(request) {
    return this.#request('switchLease', request);
  }

  handoff(request) {
    return this.#request('handoff', request);
  }

  release(request) {
    return this.#request('release', request);
  }

  takeover(request) {
    return this.#request('takeover', request);
  }

  async observe(selector) {
    const observation = await this.#request('observe', selector);
    return observation.lease;
  }
}
