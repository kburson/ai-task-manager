// ProviderAdapter shape — describes a vendor (AI provider or local agent).
//
// Adapters are pure data modules: no internal imports, no side effects.
// All six capabilities are populated to current hard-coded values; only
// `skillAdapterPath` is migrated through the registry in #201. The remaining
// five are routed in #203.
//
// @typedef {Object} ProviderAdapter
// @property {string}   name              Stable lookup key (e.g. 'claude', 'codex').
// @property {string}   installTarget     Filesystem target where the skill installs (relative to project root).
// @property {string}   stateDir          Directory where provider stores per-session state (relative to project root).
// @property {string}   transcriptLocator Glob/locator used to find the active transcript file.
// @property {string[]} sessionIdEnvKeys  Env var names that carry the active session id, in priority order.
// @property {boolean}  hookCapability    Whether the provider supports lifecycle hooks (SessionStart, PreCompact, etc.).
// @property {string}   skillAdapterPath  Path to the canonical adapter SKILL.md (relative to the installed package root).

export {};
