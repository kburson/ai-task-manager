// Provider registry — single lookup surface for vendor-specific decisions.
//
// Adapters are data modules (no internal imports). Keep this registry
// data-only too: detect/lookup logic lives here, but it must not import
// from outside `scripts/providers/` to avoid circular-import hazards.
//
// #201 wires only `skillAdapterPath` through the registry; the remaining
// capability fork points carry `// TODO(#203): route through provider registry`
// markers so the strangler migration in #203 can find them.

import { claudeAdapter } from './claude.mjs';
import { codexAdapter } from './codex.mjs';

const REGISTRY = Object.freeze({
  claude: claudeAdapter,
  codex: codexAdapter,
});

/**
 * Look up a registered adapter by name.
 * @param {string} name
 * @returns {import('./provider-adapter.mjs').ProviderAdapter}
 * @throws {Error} when the name is not registered.
 */
export function getProvider(name) {
  const adapter = REGISTRY[name];
  if (!adapter) {
    const known = Object.keys(REGISTRY).join(', ');
    throw new Error(`Unknown provider '${name}'. Known providers: ${known}`);
  }
  return adapter;
}

/**
 * Names of all registered providers, in registration order.
 * @returns {string[]}
 */
export function listProviders() {
  return Object.keys(REGISTRY);
}

/**
 * Detect the active provider from environment / filesystem signals.
 * Priority: CLAUDE_SESSION_ID -> CODEX_SESSION_ID -> default 'claude'.
 * @param {{ env?: NodeJS.ProcessEnv }} [opts]
 * @returns {import('./provider-adapter.mjs').ProviderAdapter}
 */
export function detectProvider(opts = {}) {
  const env = opts.env ?? process.env;
  for (const name of listProviders()) {
    const adapter = REGISTRY[name];
    if (adapter.sessionIdEnvKeys.some((key) => env[key])) return adapter;
  }
  return REGISTRY.claude;
}
