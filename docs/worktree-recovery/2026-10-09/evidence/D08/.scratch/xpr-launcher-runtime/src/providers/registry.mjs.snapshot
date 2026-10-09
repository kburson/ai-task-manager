import { AprError } from '../errors.mjs';

export const SELECTORS = Object.freeze({
  codex: Object.freeze({ provider: 'openai', host: 'codex' }),
  claude: Object.freeze({ provider: 'anthropic', host: 'claude-code' }),
  grok: Object.freeze({ provider: 'xai', host: 'grok' }),
});

export const PROVIDERS = Object.freeze(new Set(['openai', 'anthropic', 'xai']));

export function selectionUnsupported(message, details = {}) {
  throw new AprError('APR_REVIEWER_SELECTION_UNSUPPORTED', message, {
    recovery: 'Select codex, claude, or grok with an adapter-supported exact model and effort.',
    details,
  });
}

export function selectedAdapter(selector, adapters) {
  const selected = SELECTORS[selector];
  if (!selected) selectionUnsupported('Reviewer provider selector is unsupported.', { selector });
  const adapter = adapters instanceof Map ? adapters.get(selector) : adapters?.[selector];
  if (!adapter || typeof adapter.resolveModel !== 'function') {
    selectionUnsupported('Reviewer provider adapter is unavailable.', { selector });
  }
  return Object.freeze({ ...selected, adapter });
}
