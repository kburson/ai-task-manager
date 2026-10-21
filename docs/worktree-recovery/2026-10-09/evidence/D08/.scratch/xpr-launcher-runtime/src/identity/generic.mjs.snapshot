function resolveDeclared({ declared } = {}) {
  if (!declared) return null;
  const { host = 'other', provider = 'other', sessionId, modelId, modelDisplay } = declared;
  if (![sessionId, modelId, modelDisplay].every((value) => typeof value === 'string' && value)) {
    return null;
  }
  return { host, provider, sessionId, modelId, modelDisplay, source: 'declared' };
}

export const genericAdapter = Object.freeze({
  name: 'generic',
  host: 'other',
  provider: 'other',
  sessionIdEnvKeys: Object.freeze([]),
  capabilities: Object.freeze(['manual', 'staleness-only']),
  resolveDeclared,
});

export default genericAdapter;
