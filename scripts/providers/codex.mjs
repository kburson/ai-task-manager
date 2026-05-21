// Codex provider adapter — values mirror current hard-coded behavior.
//
// Only `skillAdapterPath` is read through the registry in #201. The other
// fields are populated for forward compatibility (#203 will migrate them).

/** @type {import('./provider-adapter.mjs').ProviderAdapter} */
export const codexAdapter = {
  name: 'codex',
  installTarget: '.agents/skills/task',
  stateDir: '.codex/sessions',
  transcriptLocator: '.codex/sessions/<session-id>.jsonl',
  sessionIdEnvKeys: ['CODEX_SESSION_ID'],
  hookCapability: false,
  skillAdapterPath: 'skill/adapters/codex/SKILL.md',
};

export default codexAdapter;
