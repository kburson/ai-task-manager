// Codex provider adapter — values mirror current hard-coded behavior.
//
// All six capabilities are routed through the registry (#201 + #203).
// Every field encodes the byte-identical value that previously lived at
// the call site. Parity is asserted in `tests/registry.test.mjs`.

/** @type {import('./provider-adapter.mjs').ProviderAdapter} */
export const codexAdapter = {
  name: 'codex',
  installTarget: '.agents/skills/task',
  stateDir: '.tmp/aitm/app/codex',
  transcriptLocator: '.codex/sessions',
  transcriptHomeEnv: null,
  transcriptHomeDefault: null,
  transcriptLayout: 'date-bucketed',
  transcriptSchema: 'codex-rollout-v1',
  sessionIdEnvKeys: ['CODEX_THREAD_ID', 'CODEX_SESSION_ID'],
  detectionEnvKeys: ['CODEX_THREAD_ID', 'CODEX_SESSION_ID', 'CODEX_HOME'],
  sessionIdFallback: 'legacy',
  hookCapability: true,
  skillAdapterPath: 'skill/adapters/codex/SKILL.md',
  installRecipe: {
    writer: 'codex-hooks',
    hookTarget: '.codex/hooks.json',
    commandTarget: null,
  },
  externalActions: {
    'github.merge-pull-request': {
      adapterContract: 'skill',
      expectedHeadSha: true,
    },
  },
};

export default codexAdapter;
