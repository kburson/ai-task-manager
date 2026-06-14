// `aitm-superseded-by` marker (#401).
//
// Records that a story was abandoned because another issue took over its work.
// Canonical form (marker-grammar):
//
//   <!-- aitm-superseded-by refs="#399" ts="2026-06-14T14:00:00.000Z" -->
//
// `refs` carries the superseding issue number (AC1); `ts` the timestamp the
// supersede was recorded (AC2). The marker is written into the dead story's
// body by the `supersede` verb and read by tooling that needs to explain why a
// closed-not-planned issue carries trunk commits. Pure: no I/O.

import { serializeMarker, parseMarker } from './marker-grammar.mjs';

const MARKER_LINE_RE = /^<!--\s*aitm-superseded-by(\s|-->).*$/m;

function normalizeRef(ref) {
  const m = String(ref).trim().match(/^#?(\d+)$/);
  if (!m) throw new Error(`superseded-marker: invalid issue ref ${JSON.stringify(ref)}`);
  return `#${m[1]}`;
}

// Build the marker comment for a superseding issue + ISO timestamp.
export function serializeSupersededBy({ ref, ts }) {
  return serializeMarker('superseded-by', { refs: normalizeRef(ref), ts: String(ts) });
}

// Read the marker from a body. Returns { ref, ts } (ref as `#N` string) or null.
export function parseSupersededBy(body = '') {
  for (const line of String(body).split('\n')) {
    const parsed = parseMarker(line);
    if (parsed && parsed.name === 'superseded-by') {
      const refRaw = (parsed.props.refs || '').split(',')[0].trim();
      if (!refRaw) return null;
      return { ref: normalizeRef(refRaw), ts: parsed.props.ts || '' };
    }
  }
  return null;
}

// Insert (or replace) the marker in a body. Appends on first write; replaces the
// existing line in place on a re-write so the marker stays unique.
export function addSupersededBy(body = '', { ref, ts }) {
  const marker = serializeSupersededBy({ ref, ts });
  const src = String(body);
  if (MARKER_LINE_RE.test(src)) {
    return src.replace(MARKER_LINE_RE, marker);
  }
  const trimmed = src.replace(/\s+$/, '');
  return `${trimmed}\n\n${marker}\n`;
}
