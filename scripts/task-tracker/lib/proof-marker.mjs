// Consolidated PROOF marker (#368, parent epic #367).
//
// Canonical form:  <!-- aitm-verified key="value" ... -->
// Every value is double-quoted; an embedded double-quote is escaped as &quot;
// so the grammar stays unambiguous. One comment carries all properties.
//
// Back-compat READ path (kept until #369 rewrites the corpus): parseProofMarker
// also recognises the two legacy dual comments —
//   <!-- aitm-verified-at: <iso> evidence:"..." sha=... proof=... -->  (PROOF stamp)
//   <!-- aitm-verified-by: `cmd` ... -->                               (DECLARATION)
//
// An execution PROOF (consolidated `aitm-verified` or legacy `aitm-verified-at`)
// is distinct from a bare `aitm-verified-by` DECLARATION: only the former
// satisfies the checkbox-proof invariant. `hasExecutionProof` encodes that.

export function escapeValue(v) {
  return String(v).replace(/"/g, '&quot;');
}

export function unescapeValue(v) {
  return String(v).replace(/&quot;/g, '"');
}

// Serialize an ordered key/value object into one consolidated comment. Key
// insertion order is preserved so writers control attribute ordering.
export function serializeProofMarker(props = {}) {
  const attrs = Object.entries(props || {})
    .map(([k, v]) => `${k}="${escapeValue(v)}"`)
    .join(' ');
  return attrs ? `<!-- aitm-verified ${attrs} -->` : '<!-- aitm-verified -->';
}

// `aitm-verified` followed by whitespace — NOT `aitm-verified-at`/`-by`, whose
// next char is `-`. The `\s` boundary is what disambiguates the consolidated
// marker from the two legacy names.
const CONSOLIDATED_RE = /<!--\s*aitm-verified\s+([\s\S]*?)\s*-->/g;
const ATTR_RE = /([a-zA-Z0-9_-]+)="((?:[^"]|&quot;)*)"/g;
const LEGACY_AT_RE = /<!--\s*aitm-verified-at:\s*([\s\S]*?)\s*-->/g;
const LEGACY_BY_RE = /<!--\s*aitm-verified-by:\s*([\s\S]*?)\s*-->/g;

// Any consolidated or legacy proof/declaration marker on the line. Used to
// strip markers from a label for display.
const ANY_MARKER_RE = /<!--\s*aitm-verified(?:-at|-by)?(?:\s|:)[\s\S]*?-->/g;

// An EXECUTION proof: consolidated `aitm-verified ` or legacy `aitm-verified-at:`.
// Deliberately excludes the bare `aitm-verified-by` declaration.
const EXECUTION_PROOF_RE = /<!--\s*aitm-verified-at:|<!--\s*aitm-verified\s/;

function parseConsolidatedAttrs(text) {
  const out = {};
  for (const m of String(text).matchAll(ATTR_RE)) {
    out[m[1]] = unescapeValue(m[2]);
  }
  return out;
}

function parseLegacyAtInner(inner) {
  const src = String(inner);
  const out = {};
  // verified-at value is the leading token(s) before the first known field.
  const cut = src.search(/\s+(?:evidence:|sha=|proof=)/);
  const at = (cut === -1 ? src : src.slice(0, cut)).trim();
  if (at) out['verified-at'] = at;
  const evidenceM = src.match(/evidence:"([^"]*)"/);
  if (evidenceM) out.evidence = evidenceM[1];
  const shaM = src.match(/\bsha=(\S+)/);
  if (shaM) out.sha = shaM[1];
  const proofM = src.match(/\bproof=(\S+)/);
  if (proofM) out.proof = proofM[1];
  return out;
}

// Parse every proof marker on a line and merge into one key/value object.
// Returns null when the line carries no recognized marker. Consolidated and
// legacy-at PROOF fields take precedence; a legacy-by DECLARATION only fills a
// `verified-by` that no proof marker already supplied.
export function parseProofMarker(line) {
  const src = String(line || '');
  let found = false;
  const out = {};
  for (const m of src.matchAll(CONSOLIDATED_RE)) {
    found = true;
    Object.assign(out, parseConsolidatedAttrs(m[1]));
  }
  for (const m of src.matchAll(LEGACY_AT_RE)) {
    found = true;
    Object.assign(out, parseLegacyAtInner(m[1]));
  }
  for (const m of src.matchAll(LEGACY_BY_RE)) {
    found = true;
    if (!('verified-by' in out)) out['verified-by'] = m[1].trim();
  }
  return found ? out : null;
}

// True when the line carries an execution PROOF (consolidated or legacy-at),
// the signal the checkbox-proof invariant accepts. A bare `aitm-verified-by`
// declaration does NOT count.
export function hasExecutionProof(line) {
  return EXECUTION_PROOF_RE.test(String(line || ''));
}

// Resolve the `verified-by` declaration value (raw, may carry backtick
// commands) from either marker form, or null.
export function resolveVerifiedBy(line) {
  const props = parseProofMarker(line);
  if (!props) return null;
  return 'verified-by' in props ? props['verified-by'] : null;
}

// Remove every proof/declaration marker from a label for display.
export function stripProofMarkers(label) {
  return String(label || '')
    .replace(ANY_MARKER_RE, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}
