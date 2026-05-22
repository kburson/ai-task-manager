// Provider registry — single lookup surface for vendor-specific decisions.
//
// Adapters are data modules (no internal imports). Keep this registry
// data-only too: detect/lookup logic lives here, but it must not import
// from outside `scripts/providers/` to avoid circular-import hazards.
//
// #201 routed `skillAdapterPath` through the registry; #203 routed the
// remaining five capabilities (installTarget, stateDir, transcriptLocator,
// sessionIdEnvKeys + detectionEnvKeys, hookCapability) and removed every
// hard-coded provider fork at call sites.

import { claudeAdapter } from './claude.mjs';
import { codexAdapter } from './codex.mjs';

// Registration order doubles as detection priority — more specific signals
// (codex) are checked before fallback signals (claude). Preserves the
// pre-#203 `aiAppName()` precedence where CODEX_SESSION_ID/CODEX_HOME
// wins when both providers' env vars are set simultaneously.
const REGISTRY = Object.freeze({
  codex: codexAdapter,
  claude: claudeAdapter,
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
 * Detect the active provider from environment signals.
 * Iterates each adapter's `detectionEnvKeys` (presence indicates provider).
 * Falls back to claude when no signal is present.
 * @param {{ env?: NodeJS.ProcessEnv }} [opts]
 * @returns {import('./provider-adapter.mjs').ProviderAdapter}
 */
export function detectProvider(opts = {}) {
  const env = opts.env ?? process.env;
  for (const name of listProviders()) {
    const adapter = REGISTRY[name];
    const keys = adapter.detectionEnvKeys ?? adapter.sessionIdEnvKeys;
    if (keys.some((key) => env[key])) return adapter;
  }
  return REGISTRY.claude;
}
