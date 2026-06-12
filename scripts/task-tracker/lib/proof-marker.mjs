// Consolidated PROOF marker (#368, parent epic #367).
//
// Canonical form:  <!-- aitm-verified key="value" ... -->
// Every value is double-quoted; an embedded double-quote is escaped as &quot;
// so the grammar stays unambiguous. One comment carries all properties.
//
// #382 — normalized key contract: the writer emits `cmd`, `sha`, `ts`,
// `evidence`, `proof`. `ts` replaces the old `verified-at` key; the timestamp
// and the commit `sha` are separate properties (no packed `<sha>:<iso>` value);
// `cmd` replaces the old `verified-by` key on a proof stamp.
//
// Back-compat READ path (kept until #369 rewrites the corpus): parseProofMarker
// recognizes the legacy keys and the two legacy dual comments, then normalizes
// them onto the new key names so consumers read one shape regardless of vintage:
//   <!-- aitm-verified verified-at="<iso>" sha=... ... -->       (#368 consolidated)
//   <!-- aitm-verified verified-at="<sha>:<iso>" ... -->         (packed legacy form)
//   <!-- aitm-verified-at: <iso> evidence:"..." sha=... proof=... -->  (PROOF stamp)
//   <!-- aitm-verified-by: `cmd` ... -->                               (DECLARATION)
// Normalization: legacy `verified-at` -> `ts` (splitting a packed `<sha>:<iso>`
// into `sha`+`ts`); legacy `verified-by` -> `cmd`. The legacy keys are retained
// alongside the normalized ones so nothing that still reads them breaks.
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

// A packed legacy `verified-at` value: `<sha>:<iso>`, where the sha is a short
// hex token and the ISO timestamp begins with `YYYY-MM-DDT`. The ISO half also
// contains colons, so the split is anchored on the sha prefix, not a bare
// `.split(':')`.
const PACKED_VERIFIED_AT_RE = /^([0-9a-f]{4,40}):(\d{4}-\d{2}-\d{2}T.*)$/i;

// #382 — normalize legacy proof-marker keys onto the new contract so every
// consumer reads one shape regardless of body vintage. Mutates and returns the
// parsed object. Legacy keys are retained alongside the normalized ones.
//   - `verified-at` -> `ts` (splitting a packed `<sha>:<iso>` into `sha`+`ts`)
//   - `verified-by` -> `cmd`
// New-form markers already carry `ts`/`cmd`/`sha`, so the `in` guards make this
// a no-op for them.
function normalizeProofKeys(out) {
  if ('verified-at' in out && !('ts' in out)) {
    const packed = PACKED_VERIFIED_AT_RE.exec(String(out['verified-at']));
    if (packed) {
      if (!('sha' in out)) out.sha = packed[1];
      out.ts = packed[2];
    } else {
      out.ts = out['verified-at'];
    }
  }
  if ('verified-by' in out && !('cmd' in out)) {
    out.cmd = out['verified-by'];
  }
  return out;
}

// Parse every proof marker on a line and merge into one key/value object.
// Returns null when the line carries no recognized marker. Consolidated and
// legacy-at PROOF fields take precedence; a legacy-by DECLARATION only fills a
// `verified-by` that no proof marker already supplied. Legacy keys are
// normalized onto the new `ts`/`cmd` contract before returning (#382).
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
  return found ? normalizeProofKeys(out) : null;
}

// True when the line carries an execution PROOF (consolidated or legacy-at),
// the signal the checkbox-proof invariant accepts. A bare `aitm-verified-by`
// declaration does NOT count.
export function hasExecutionProof(line) {
  return EXECUTION_PROOF_RE.test(String(line || ''));
}

// Resolve the declaration command (raw, may carry backtick commands) from
// either marker form, or null. Dual-tolerant (#382): prefers the legacy
// `verified-by` key but falls back to the new `cmd` key so a proof stamp
// carrying `cmd` still resolves during the transition.
export function resolveVerifiedBy(line) {
  const props = parseProofMarker(line);
  if (!props) return null;
  if ('verified-by' in props) return props['verified-by'];
  if ('cmd' in props) return props.cmd;
  return null;
}

// Remove every proof/declaration marker from a label for display.
export function stripProofMarkers(label) {
  return String(label || '')
    .replace(ANY_MARKER_RE, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}
