// Claude provider adapter — values mirror current hard-coded behavior.
//
// All six capabilities are routed through the registry (#201 + #203).
// Every field encodes the byte-identical value that previously lived at
// the call site. Parity is asserted in `tests/registry.test.mjs`.

/** @type {import('./provider-adapter.mjs').ProviderAdapter} */
export const claudeAdapter = {
  name: 'claude',
  installTarget: '.claude/skills/task',
  stateDir: '.tmp/aitm/app/claude',
  transcriptLocator: '.claude/projects',
  transcriptHomeEnv: null,
  transcriptHomeDefault: null,
  transcriptLayout: 'flat',
  transcriptSchema: 'claude-message-v1',
  sessionIdEnvKeys: ['CLAUDE_CODE_SESSION_ID', 'CLAUDE_SESSION_ID'],
  detectionEnvKeys: ['CLAUDE_CODE_SESSION_ID', 'CLAUDE_SESSION_ID'],
  sessionIdFallback: 'legacy',
  hookCapability: true,
  skillAdapterPath: 'skill/adapters/claude/SKILL.md',
  installRecipe: {
    writer: 'claude-settings',
    hookTarget: '.claude/settings.json',
    commandTarget: '.claude/commands/task.md',
  },
  externalActions: {
    'github.merge-pull-request': {
      adapterContract: 'skill',
      expectedHeadSha: true,
    },
  },
};

export default claudeAdapter;
