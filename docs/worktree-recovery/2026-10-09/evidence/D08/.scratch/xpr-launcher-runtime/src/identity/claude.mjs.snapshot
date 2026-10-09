function frozen(values) {
  return Object.freeze([...values]);
}

function resolveRuntime({ runtime = {}, env = {}, declaredModel = {} } = {}) {
  const sessionId = runtime.sessionId ?? env.CLAUDE_CODE_SESSION_ID ?? env.CLAUDE_SESSION_ID;
  const modelId = runtime.modelId ?? env.CLAUDE_MODEL_ID;
  const modelDisplay = runtime.modelDisplay ?? env.CLAUDE_MODEL_DISPLAY ?? modelId;
  if ([sessionId, modelId, modelDisplay].every((value) => typeof value === 'string' && value)) {
    return {
      host: 'claude-code',
      provider: 'anthropic',
      sessionId,
      modelId,
      modelDisplay,
      source: 'runtime',
    };
  }

  if (
    typeof sessionId === 'string' &&
    sessionId &&
    typeof declaredModel.modelId === 'string' &&
    declaredModel.modelId &&
    typeof declaredModel.modelDisplay === 'string' &&
    declaredModel.modelDisplay
  ) {
    return {
      host: 'claude-code',
      provider: 'anthropic',
      sessionId,
      modelId: declaredModel.modelId,
      modelDisplay: declaredModel.modelDisplay,
      source: 'declared',
    };
  }
  return null;
}

function identityRecovery({ runtime = {}, env = {} } = {}) {
  const sessionId = runtime.sessionId ?? env.CLAUDE_CODE_SESSION_ID ?? env.CLAUDE_SESSION_ID;
  if (typeof sessionId !== 'string' || !sessionId) {
    return 'Run from a supported Claude Code session that exposes CLAUDE_CODE_SESSION_ID, then retry.';
  }
  return 'Set hosts.claude.identity.model_id and hosts.claude.identity.model_display in .ai-peer-review.json, then retry.';
}

export const claudeAdapter = Object.freeze({
  name: 'claude',
  host: 'claude-code',
  provider: 'anthropic',
  sessionIdEnvKeys: frozen(['CLAUDE_CODE_SESSION_ID', 'CLAUDE_SESSION_ID']),
  capabilities: frozen(['manual', 'staleness-only']),
  resolveRuntime,
  identityRecovery,
});

export default claudeAdapter;
