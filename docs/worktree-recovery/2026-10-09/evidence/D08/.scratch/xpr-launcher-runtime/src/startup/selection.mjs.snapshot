import { PROVIDERS, selectedAdapter, selectionUnsupported } from '../providers/registry.mjs';

const IDENTITY_SOURCES = new Set(['runtime', 'declared']);

function text(value) {
  return typeof value === 'string' && value.trim() === value && value.length > 0;
}

function authorIdentity(author) {
  if (
    !author ||
    !PROVIDERS.has(author.provider) ||
    !text(author.host) ||
    !text(author.session_fingerprint) ||
    !IDENTITY_SOURCES.has(author.identity_source)
  ) {
    selectionUnsupported('Author identity cannot be resolved to a supported provider family.');
  }
  return author;
}

function resolvedModel(value, requestedEffort) {
  if (
    !value ||
    !text(value.model_id) ||
    !text(value.model_display) ||
    !text(value.effort) ||
    value.effort !== requestedEffort
  ) {
    selectionUnsupported(
      'Reviewer adapter did not resolve the requested model and effort exactly.'
    );
  }
  return value;
}

export async function resolveSelection(
  { author, selector, model, effort = 'medium' } = {},
  adapters
) {
  const resolvedAuthor = authorIdentity(author);
  if (!text(model) || !text(effort)) {
    selectionUnsupported('Reviewer model and effort must be explicit non-empty values.');
  }
  const selected = selectedAdapter(selector, adapters);
  let modelResult;
  try {
    modelResult = await selected.adapter.resolveModel({ model, effort });
  } catch (cause) {
    if (cause?.code === 'APR_REVIEWER_SELECTION_UNSUPPORTED') throw cause;
    selectionUnsupported('Reviewer adapter does not support the requested model or effort.', {
      selector,
      model,
      effort,
    });
  }
  const resolved = resolvedModel(modelResult, effort);
  return Object.freeze({
    selector,
    provider: selected.provider,
    host: selected.host,
    model_id: resolved.model_id,
    model_display: resolved.model_display,
    effort: resolved.effort,
    classification: resolvedAuthor.provider === selected.provider ? 'SPR' : 'XPR',
  });
}
