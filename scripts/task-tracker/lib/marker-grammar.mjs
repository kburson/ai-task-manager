// Generic hidden-comment marker grammar (#373, parent epic #367).
//
// Canonical form:  <!-- aitm-NAME key="value" ... -->
// Every value is double-quoted; an embedded double-quote is escaped as &quot;
// so the grammar stays unambiguous. One comment carries all properties, and
// attribute insertion order is preserved so writers control ordering.
//
// This is the marker-name-agnostic generalization of the `key="value"` grammar
// that #368 pioneered inside proof-marker.mjs. Sibling migration children
// (#374–#381) build their per-marker writers/readers on these two primitives.
// The helper is pure: no I/O, no issue-body surgery, no legacy dual-read path —
// legacy colon-form recognition stays the responsibility of each migration
// child until #369 sweeps the corpus.

export function escapeValue(v) {
  return String(v).replace(/"/g, '&quot;');
}

export function unescapeValue(v) {
  return String(v).replace(/&quot;/g, '"');
}

// Serialize a marker name + ordered key/value object into one comment. Key
// insertion order is preserved. With no props, returns the prop-less form.
export function serializeMarker(name, props = {}) {
  if (typeof name !== 'string' || name.length === 0) {
    throw new Error(
      `serializeMarker: 'name' must be a non-empty string — got ${JSON.stringify(name)}`
    );
  }
  const attrs = Object.entries(props || {})
    .map(([k, v]) => `${k}="${escapeValue(v)}"`)
    .join(' ');
  return attrs ? `<!-- aitm-${name} ${attrs} -->` : `<!-- aitm-${name} -->`;
}

// Anchored full-marker pattern: `aitm-` name token, then zero or more
// well-formed ` key="value"` attribute groups, then `-->`. A legacy colon-form
// marker (`<!-- aitm-verified-at: ... -->`) fails this match because `:` is
// neither whitespace, a quoted pair, nor `-->`, so parseMarker returns null
// rather than mis-parsing it.
const MARKER_RE = /^<!--\s*aitm-([a-zA-Z0-9_-]+)((?:\s+[a-zA-Z0-9_-]+="(?:[^"]|&quot;)*")*)\s*-->$/;
const ATTR_RE = /([a-zA-Z0-9_-]+)="((?:[^"]|&quot;)*)"/g;

// Parse a single marker comment. Returns { name, props } on a well-formed
// match, or null for any non-marker / legacy-form line, without throwing.
export function parseMarker(line) {
  const src = String(line || '').trim();
  const m = src.match(MARKER_RE);
  if (!m) return null;
  const name = m[1];
  const props = {};
  for (const a of String(m[2]).matchAll(ATTR_RE)) {
    props[a[1]] = unescapeValue(a[2]);
  }
  return { name, props };
}
