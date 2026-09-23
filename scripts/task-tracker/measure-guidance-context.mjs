// @story #1769
import { GUIDANCE_CONTEXT_BUDGETS } from './lib/context-budgets.mjs';

const CATEGORIES = new Set([
  'command-input',
  'receipt-input',
  'operational-stdout',
  'operational-stderr',
  'receipt-output',
  'explicit-diagnostics',
  'repeat-metadata',
]);

function measure(text) {
  return { characters: text.length, bytes: Buffer.byteLength(text, 'utf8') };
}

export function measureAgentVisible({ staticFiles = [], events = [] } = {}) {
  if (!Array.isArray(staticFiles) || !Array.isArray(events)) {
    throw new TypeError('context: staticFiles and events must be arrays');
  }
  const seen = new Set();
  const measuredFiles = staticFiles.map(({ path, text }) => {
    if (typeof path !== 'string' || !path || seen.has(path) || typeof text !== 'string') {
      throw new TypeError('context: invalid or duplicate static file');
    }
    seen.add(path);
    const counts = measure(text);
    return { path, ...counts, proxyTokens: Math.ceil(counts.characters / 4) };
  });
  const categoryText = new Map();
  let trafficCharacters = 0;
  let trafficBytes = 0;
  for (const event of events) {
    if (!event || typeof event.name !== 'string' || typeof event.raw !== 'string') {
      throw new TypeError('context: invalid event');
    }
    if (!Array.isArray(event.parts))
      throw new TypeError(`context: missing parts for ${event.name}`);
    let accounted = '';
    for (const part of event.parts) {
      if (!CATEGORIES.has(part?.category) || typeof part.text !== 'string') {
        throw new TypeError(`context: invalid category for ${event.name}`);
      }
      accounted += part.text;
      categoryText.set(part.category, (categoryText.get(part.category) || '') + part.text);
    }
    if (accounted !== event.raw)
      throw new Error(`context: unreconciled raw traffic for ${event.name}`);
    const counts = measure(event.raw);
    trafficCharacters += counts.characters;
    trafficBytes += counts.bytes;
  }
  const categories = Object.fromEntries(
    [...categoryText].map(([category, text]) => [category, measure(text)])
  );
  const staticCharacters = measuredFiles.reduce((sum, file) => sum + file.characters, 0);
  const staticBytes = measuredFiles.reduce((sum, file) => sum + file.bytes, 0);
  return {
    staticFiles: measuredFiles,
    categories,
    staticCharacters,
    trafficCharacters,
    characters: staticCharacters + trafficCharacters,
    bytes: staticBytes + trafficBytes,
    proxyTokens:
      measuredFiles.reduce((sum, file) => sum + file.proxyTokens, 0) +
      Math.ceil(trafficCharacters / 4),
    uncountedAgentVisibleBytes: 0,
    fixedBudgets: GUIDANCE_CONTEXT_BUDGETS,
  };
}
