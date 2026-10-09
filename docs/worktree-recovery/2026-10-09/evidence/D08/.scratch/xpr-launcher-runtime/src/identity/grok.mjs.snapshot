function frozen(values) {
  return Object.freeze([...values]);
}

function resolveRuntime({ runtime = {}, env = {} } = {}) {
  const sessionId = runtime.sessionId ?? env.GROK_SESSION_ID;
  const modelId = runtime.modelId ?? env.GROK_MODEL_ID;
  const modelDisplay = runtime.modelDisplay ?? env.GROK_MODEL_DISPLAY ?? modelId;
  if (![sessionId, modelId, modelDisplay].every((value) => typeof value === 'string' && value)) {
    return null;
  }
  return { host: 'grok', provider: 'xai', sessionId, modelId, modelDisplay, source: 'runtime' };
}

export const grokAdapter = Object.freeze({
  name: 'grok',
  host: 'grok',
  provider: 'xai',
  sessionIdEnvKeys: frozen(['GROK_SESSION_ID']),
  capabilities: frozen(['manual', 'staleness-only']),
  resolveRuntime,
});

export default grokAdapter;
