// ProviderAdapter shape — describes a vendor (AI provider or local agent).
//
// Adapters are pure data modules: no internal imports, no side effects.
// All capabilities are populated to current hard-coded values; #201 routed
// `skillAdapterPath` through the registry, #203 routed the remaining five.
//
// @typedef {Object} ProviderAdapter
// @property {string}        name              Stable lookup key (e.g. 'claude', 'codex').
// @property {string}        installTarget     Filesystem target where the skill installs (relative to project root).
// @property {string}        stateDir          Directory where AITM stores per-provider session-tracking state (relative to project root).
// @property {string | null} transcriptLocator Homedir-relative directory holding the provider's native transcript JSONL files, or null when the provider has no homedir fallback.
// @property {('flat'|'date-bucketed'|null)} transcriptLayout How transcripts are arranged under `transcriptLocator`: 'flat' = `<projectKey>/<sid>.jsonl` (Claude), 'date-bucketed' = `YYYY/MM/DD/<prefix>-<sid>.jsonl` (Codex), null = no resolvable per-session transcript. Consumed by `transcript-resolver.mjs::resolveTranscriptPath`.
// @property {('claude-message-v1'|'codex-rollout-v1')} transcriptSchema Native transcript record schema consumed by the word counter.
// @property {string[]}      sessionIdEnvKeys  Env var names that carry the active session id, in priority order.
// @property {string[]}      detectionEnvKeys  Env var names whose mere presence indicates this provider is the active one (superset of sessionIdEnvKeys).
// @property {boolean}       hookCapability    Whether the provider supports lifecycle hooks (SessionStart, PreCompact, etc.).
// @property {string}        skillAdapterPath  Path to the canonical adapter SKILL.md (relative to the installed package root).

export {};
