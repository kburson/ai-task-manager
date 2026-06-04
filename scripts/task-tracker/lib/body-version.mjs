// Body-version marker (epic #288) — pure parse/stamp/bump primitives for the
// `<!-- aitm-body-version: N -->` optimistic-concurrency marker.
//
// Marker contract:
//   - Format: `<!-- aitm-body-version: N -->`, N a positive integer.
//   - Absence is treated as version 0 (backwards-compat for legacy bodies).
//   - Stamping is idempotent for the same N; replace-in-place preserves
//     surrounding whitespace.
//   - This module is pure: no I/O, no GitHub calls. The fetch/compare/rebase
//     helper lives in `versioned-issue-write.mjs` (sub-issue #290).

export const BODY_VERSION_MARKER_RE = /<!--\s*aitm-body-version:\s*(\d+)\s*-->/i;

export function parseBodyVersion(body) {
  const src = String(body ?? '');
  const m = src.match(BODY_VERSION_MARKER_RE);
  if (!m) return 0;
  const n = Number.parseInt(m[1], 10);
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

function buildMarker(version) {
  return `<!-- aitm-body-version: ${version} -->`;
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
