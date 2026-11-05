function frozen(values) {
  return Object.freeze([...values]);
}

function resolveRuntime({ runtime = {}, env = {} } = {}) {
  const sessionId = runtime.sessionId ?? env.CODEX_THREAD_ID ?? env.CODEX_SESSION_ID;
  const modelId = runtime.modelId ?? env.CODEX_MODEL_ID;
  const modelDisplay = runtime.modelDisplay ?? env.CODEX_MODEL_DISPLAY ?? modelId;
  if (![sessionId, modelId, modelDisplay].every((value) => typeof value === 'string' && value)) {
    return null;
  }
  return { host: 'codex', provider: 'openai', sessionId, modelId, modelDisplay, source: 'runtime' };
}

export const codexAdapter = Object.freeze({
  name: 'codex',
  host: 'codex',
  provider: 'openai',
  sessionIdEnvKeys: frozen(['CODEX_THREAD_ID', 'CODEX_SESSION_ID']),
  capabilities: frozen(['manual', 'staleness-only']),
  resolveRuntime,
});

export default codexAdapter;
