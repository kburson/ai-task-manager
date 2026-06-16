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
// An execution PROOF is distinguished from a verifier DECLARATION by its
// CONTENT, not its marker name (#391). After the #369 corpus migration a
// declaration becomes `<!-- aitm-verified cmd="`cmd`" -->` — byte-identical at
// the name level to a proof stamp. The distinction the grammar makes
// machine-checkable: `cmd` is intent; `ts`/`sha`/`evidence` are record-of-run.
// `hasExecutionProof` parses the line and accepts it only when a record-of-run
// key is present, so a cmd-only marker (consolidated or legacy `aitm-verified-by`)
// is correctly read as a declaration, not proof.

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

// True when the line carries an execution PROOF — the signal the checkbox-proof
// invariant accepts. Content-based (#391): parse the line and accept only when a
// record-of-run key (`ts`, `sha`, or `evidence`) is present. A marker carrying
// only `cmd` is a verifier DECLARATION (consolidated `aitm-verified cmd="..."`
// or legacy `aitm-verified-by`) and does NOT count.
export function hasExecutionProof(line) {
  const props = parseProofMarker(line);
  if (!props) return false;
  return 'ts' in props || 'sha' in props || 'evidence' in props;
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

// #418 — Shared dual-form DECLARATION extractor. Returns the backtick-wrapped
// command(s) declared on a label by EITHER the legacy `aitm-verified-by` marker
// or the consolidated `aitm-verified cmd="..."` form, in document order. This is
// the single source of truth for the per-reader fallbacks that #391/#393/#395
// each open-coded; new dual-form upgrades route through here instead of copying
// a fourth inline regex.
//
// Contract (identical to those helpers): legacy `aitm-verified-by` matches are
// collected unconditionally — that name is always a declaration, never a proof.
// The consolidated `cmd` is read only when no legacy declaration was found (so a
// dual-marker line is not double-counted) AND the line carries no execution
// proof (`hasExecutionProof` false), so a record-of-run stamp (ts/sha/evidence)
// is never mistaken for a verifier declaration.
export function extractVerifiedCommands(label) {
  const haystack = String(label || '');
  const commands = [];
  for (const marker of haystack.matchAll(LEGACY_BY_RE)) {
    for (const cmd of String(marker[1]).matchAll(/`([^`]+)`/g)) commands.push(cmd[1]);
  }
  if (!commands.length && !hasExecutionProof(haystack)) {
    const props = parseProofMarker(haystack);
    if (props && typeof props.cmd === 'string') {
      for (const cmd of props.cmd.matchAll(/`([^`]+)`/g)) commands.push(cmd[1]);
    }
  }
  return commands;
}

// True when a label carries a verifier DECLARATION in either form. The boolean
// counterpart to `extractVerifiedCommands`; use this where a reader only needs
// to know "is this line command-backed?" rather than the commands themselves.
export function hasVerifiedDeclaration(label) {
  return extractVerifiedCommands(label).length > 0;
}

// #423 — validate a declaration `cmd` value. A declaration's `cmd` records HOW
// an AC will be verified, so it must name an actual command (optionally several,
// each backtick-wrapped) — never an unsubstituted placeholder or free prose.
// Returns a human-readable reason string when the value is malformed, or null
// when it is acceptable.
//
// Two malformation signatures (the pair observed corrupting epic #328's
// hand-authored markers, e.g. `cmd="`gh issue view <child> ...` returned CLOSED"`):
//   (a) an unsubstituted angle-bracket placeholder like `<child>` or `<issue#>`.
//       The pattern requires a word-char immediately after `<`, so a real shell
//       redirection (`sort < a > b`) does NOT match — its `<` is followed by
//       whitespace.
//   (b) prose outside backtick spans. This rule fires ONLY when the value
//       contains at least one backtick group: strip every `` `…` `` span and, if
//       any non-whitespace residue remains, that residue is prose (e.g.
//       `returned CLOSED`). A wholly-bare value — a single command, or the
//       comma-joined bare list `auto-tick` emits (`npm run lint, npm run
//       format:check`) — has no backtick group, so this rule is inert and the
//       value passes unchanged.
const DECLARATION_PLACEHOLDER_RE = /<[A-Za-z][^<>]*>/;
export function validateDeclarationCmd(cmd) {
  const s = String(cmd ?? '');
  if (DECLARATION_PLACEHOLDER_RE.test(s)) {
    return 'contains an unsubstituted <…> placeholder';
  }
  if (s.includes('`')) {
    const residue = s.replace(/`[^`]*`/g, '').trim();
    if (residue) return 'carries prose outside backtick-delimited command spans';
  }
  return null;
}

// #423 — collect every consolidated `aitm-verified cmd="…"` declaration in a
// body, returning `{ marker, cmd }` for each (the raw marker text plus its
// decoded cmd value). The raw marker text lets callers de-dupe identical markers
// across a before/after diff. Only markers that actually carry a `cmd` attribute
// are returned; bare proof stamps without `cmd` are skipped.
export function collectDeclarationCmds(body) {
  const out = [];
  for (const m of String(body || '').matchAll(CONSOLIDATED_RE)) {
    const attrs = parseConsolidatedAttrs(m[1]);
    if (typeof attrs.cmd === 'string') out.push({ marker: m[0], cmd: attrs.cmd });
  }
  return out;
}

// Remove every proof/declaration marker from a label for display.
export function stripProofMarkers(label) {
  return String(label || '')
    .replace(ANY_MARKER_RE, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}
