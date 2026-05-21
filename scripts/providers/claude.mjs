// Claude provider adapter — values mirror current hard-coded behavior.
//
// Only `skillAdapterPath` is read through the registry in #201. The other
// fields are populated for forward compatibility (#203 will migrate them).

/** @type {import('./provider-adapter.mjs').ProviderAdapter} */
export const claudeAdapter = {
  name: 'claude',
  installTarget: '.claude/skills/task',
  stateDir: '.claude/projects',
  transcriptLocator: '.claude/projects/<encoded-pwd>/*.jsonl',
  sessionIdEnvKeys: ['CLAUDE_SESSION_ID'],
  hookCapability: true,
  skillAdapterPath: 'skill/adapters/claude/SKILL.md',
};

export default claudeAdapter;
