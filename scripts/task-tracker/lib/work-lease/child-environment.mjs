// @story #1049
import { leaseContextEnvironment, normalizeLeaseContext } from './context.mjs';

const DEFAULT_TOKEN_ENV = 'AITM_LEASE_AUTH_TOKEN';

function cloneEnvironment(baseEnv) {
  if (!baseEnv || typeof baseEnv !== 'object' || Array.isArray(baseEnv)) {
    throw new TypeError('owned child base environment must be an object');
  }
  return { ...baseEnv };
}

export function buildOwnedChildEnvironment({
  baseEnv = process.env,
  leaseContext,
  tokenEnv = DEFAULT_TOKEN_ENV,
} = {}) {
  const env = cloneEnvironment(baseEnv);
  for (const key of Object.keys(env)) {
    if (key.startsWith('AITM_LEASE_') || key === 'AITM_FENCING_TOKEN') {
      delete env[key];
    }
  }
  if (typeof tokenEnv === 'string' && tokenEnv !== '') {
    delete env[tokenEnv];
  }
  if (leaseContext != null) {
    Object.assign(env, leaseContextEnvironment(normalizeLeaseContext(leaseContext)));
  }
  return env;
}
