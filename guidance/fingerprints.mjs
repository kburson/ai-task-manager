// @story #1671

import { createHash } from 'node:crypto';

import { decodeGuidanceSource } from './positions.mjs';

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, canonical(value[key])])
    );
  }
  return value;
}

function digest(value) {
  return `sha256:${createHash('sha256').update(value).digest('hex')}`;
}

function semanticDigest(value) {
  return digest(JSON.stringify(canonical(value)));
}

export function fingerprintEntry(entry) {
  return {
    agentDigest: semanticDigest({
      id: entry.id,
      revision: entry.revision,
      binds: entry.binds,
      agent: entry.agent,
    }),
    humanDigest: semanticDigest({ id: entry.id, revision: entry.revision, human: entry.human }),
    entryDigest: semanticDigest(entry),
  };
}

export function fingerprintCatalog({ entries, metadata, source }) {
  if (!Array.isArray(entries) || !metadata || typeof source !== 'string') {
    throw new TypeError('fingerprintCatalog requires entries, metadata and source');
  }
  return {
    entryDigests: entries.map((entry) => ({ id: entry.id, ...fingerprintEntry(entry) })),
    catalogSemanticDigest: semanticDigest({ ...metadata, entries }),
    catalogFileDigest: digest(decodeGuidanceSource(source)),
  };
}
