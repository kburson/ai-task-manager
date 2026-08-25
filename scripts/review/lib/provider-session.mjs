import { getProvider, listProviders } from '../../providers/index.mjs';

export class ProfiledProviderSessionError extends Error {
  constructor(code) {
    super(`co-review:${code}; no state changed`);
    this.name = 'ProfiledProviderSessionError';
    this.code = code;
  }
}

export function resolveProfiledProviderSession({
  env = process.env,
  listProviders: registeredProviderNames = listProviders,
  getProvider: registeredProvider = getProvider,
} = {}) {
  const candidates = [];

  for (const name of registeredProviderNames()) {
    const adapter = registeredProvider(name);
    const values = new Set(
      adapter.sessionIdEnvKeys.map((key) => env[key]).filter((value) => value)
    );
    for (const sid of values) candidates.push({ provider: name, sid });
  }

  if (candidates.length === 0) {
    throw new ProfiledProviderSessionError('provider-session-id-required');
  }
  if (candidates.length !== 1) {
    throw new ProfiledProviderSessionError('provider-session-id-ambiguous');
  }
  return candidates[0];
}
