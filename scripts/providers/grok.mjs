// Grok provider adapter — project-local skills, hooks, and native transcripts.

/** @type {import('./provider-adapter.mjs').ProviderAdapter} */
export const grokAdapter = {
  name: 'grok',
  installTarget: '.grok/skills/task',
  stateDir: '.tmp/aitm/app/grok',
  transcriptLocator: 'sessions',
  transcriptHomeEnv: 'GROK_HOME',
  transcriptHomeDefault: '.grok',
  transcriptLayout: 'cwd-session-dir',
  transcriptSchema: 'grok-chat-v1',
  sessionIdEnvKeys: ['GROK_SESSION_ID'],
  detectionEnvKeys: ['GROK_SESSION_ID', 'GROK_AGENT'],
  sessionIdFallback: 'required',
  hookCapability: true,
  skillAdapterPath: 'skill/adapters/grok/SKILL.md',
  installRecipe: {
    writer: 'grok-hooks',
    hookTarget: '.grok/hooks/aitm.json',
    commandTarget: null,
  },
};

export default grokAdapter;
