// Pure grammar for stage-entry markers. This module deliberately has no
// lifecycle, process, network, or persistence dependencies so fail-closed
// guards can import it safely.

import { parseMarker, serializeMarker } from './marker-grammar.mjs';

const STATE_TOKEN = '[a-z]+(?:-[a-z]+)*';

// Whole-comment matcher for both accepted forms. Consumers that scan or
// rewrite bodies must use this shared expression instead of constructing one.
export const ENTRY_MARKER_RE = new RegExp(
  `<!--\\s*aitm-entered-(?:${STATE_TOKEN})(?:-\\d+)?(?:\\s+[a-zA-Z0-9_-]+="(?:[^"]|&quot;)*")+\\s*-->|<!--\\s*aitm-entered-(?:${STATE_TOKEN})(?:-\\d+)?:\\s*[^>\\s]+\\s*-->`,
  'gi'
);

// Named legacy-only matcher for corpus migration code. Capture groups are
// state, optional visit, and timestamp.
export const LEGACY_COLON_ENTRY_MARKER_RE = new RegExp(
  `<!--\\s*aitm-entered-(${STATE_TOKEN})(?:-(\\d+))?:\\s*([^>\\s]+)\\s*-->`,
  'gi'
);

function splitStateAndVisit(name) {
  const match = /^entered-([a-z]+(?:-[a-z]+)*?)(?:-(\d+))?$/.exec(name);
  if (!match) return null;
  return { state: match[1], visit: match[2] ? Number(match[2]) : 1 };
}

export function parseEntryMarker(line) {
  const source = String(line || '').trim();

  const legacy = new RegExp(LEGACY_COLON_ENTRY_MARKER_RE.source, 'i').exec(source);
  if (legacy && legacy[0] === source) {
    return {
      state: legacy[1],
      visit: legacy[2] ? Number(legacy[2]) : 1,
      ts: legacy[3],
      move: null,
    };
  }

  const marker = parseMarker(source);
  if (!marker) return null;
  const identity = splitStateAndVisit(marker.name);
  if (!identity || typeof marker.props.ts !== 'string') return null;
  return {
    ...identity,
    ts: marker.props.ts,
    move: typeof marker.props.move === 'string' ? marker.props.move : null,
  };
}

export function parseEntryMarkers(body) {
  const out = [];
  let occurrence = 0;
  const matcher = new RegExp(ENTRY_MARKER_RE.source, ENTRY_MARKER_RE.flags);
  for (const match of String(body || '').matchAll(matcher)) {
    const parsed = parseEntryMarker(match[0]);
    if (!parsed) continue;
    occurrence += 1;
    out.push({ ...parsed, occurrence });
  }
  return out;
}

export function serializeEntryMarker({ state, visit = 1, ts, move = null } = {}) {
  if (!/^[a-z]+(?:-[a-z]+)*$/.test(String(state || ''))) {
    throw new Error(`serializeEntryMarker: invalid state ${JSON.stringify(state)}`);
  }
  const numericVisit = Number(visit);
  if (!Number.isInteger(numericVisit) || numericVisit < 1) {
    throw new Error('serializeEntryMarker: visit must be a positive integer');
  }
  if (!ts) throw new Error('serializeEntryMarker: ts is required');
  const suffix = numericVisit > 1 ? `-${numericVisit}` : '';
  const props = { ts };
  if (move !== null && move !== undefined) props.move = move;
  return serializeMarker(`entered-${state}${suffix}`, props);
}
