// Body-version marker (epic #288) — pure parse/stamp/bump primitives for the
// `aitm-body-version` optimistic-concurrency marker.
//
// Marker contract (EPIC #367 grammar migration):
//   - New form: `<!-- aitm-body-version version="N" -->` (uniform property grammar).
//   - Legacy form: `<!-- aitm-body-version: N -->` (still READ for back-compat
//     until #369's corpus sweep clears it; no longer WRITTEN).
//   - N a non-negative integer. Absence is treated as version 0.
//   - Stamping is idempotent for the same N; replace-in-place preserves
//     surrounding whitespace and rewrites legacy markers to the new form.
//   - This module is pure: no I/O, no GitHub calls. The fetch/compare/rebase
//     helper lives in `versioned-issue-write.mjs` (sub-issue #290).

import { serializeMarker } from './marker-grammar.mjs';

// Combined regex: captures N from BOTH grammars. The two alternatives are
// mutually exclusive, so exactly one of group 1 (legacy colon) / group 2
// (new property) is populated per match.
export const BODY_VERSION_MARKER_RE =
  /<!--\s*aitm-body-version(?::\s*(\d+)|\s+version="(\d+)")\s*-->/i;

export function parseBodyVersion(body) {
  const src = String(body ?? '');
  const m = src.match(BODY_VERSION_MARKER_RE);
  if (!m) return 0;
  const n = Number.parseInt(m[1] ?? m[2], 10);
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

function buildMarker(version) {
  return serializeMarker('body-version', { version: String(version) });
}

export function stampBodyVersion(body, version) {
  if (!Number.isInteger(version) || version < 0) {
    throw new TypeError(`stampBodyVersion: version must be a non-negative integer, got ${version}`);
  }
  const src = String(body ?? '');
  if (BODY_VERSION_MARKER_RE.test(src)) {
    return src.replace(BODY_VERSION_MARKER_RE, buildMarker(version));
  }
  const trimmed = src.replace(/\s+$/, '');
  return `${trimmed}\n\n${buildMarker(version)}\n`;
}

export function bumpBodyVersion(body) {
  const current = parseBodyVersion(body);
  return stampBodyVersion(body, current + 1);
}
