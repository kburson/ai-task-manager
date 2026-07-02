// Kind-aware Definition-of-Done filtering (#681).
//
// The DoD template is authored kind-blind: every Functional item renders for
// every issue kind. Some items are code-oriented — the `tests` item and its
// derived `npm run test:all` verification command — and can never be honestly
// satisfied by a no-code kind (a `spike` or `research` issue ships findings,
// not code). This module lets the template author scope an individual DoD item
// to a set of kinds with a declarative, human-editable HTML-comment annotation
// that sits on the same line as the item, beside its `dod:functional:KEY` tag:
//
//     - [ ] All automated tests pass  <!-- aitm-verified cmd="…" -->  <!-- dod:functional:tests -->  <!-- dod:kinds exclude="spike,research" -->
//
// Grammar and precedence:
//   <!-- dod:kinds exclude="a,b" -->  item renders for every kind EXCEPT a, b.
//   <!-- dod:kinds include="a,b" -->  item renders ONLY for kinds a, b.
//   (no annotation)                   item renders for every kind (the default).
//
// `exclude` and `include` are mutually exclusive on one line; the first
// annotation on the line wins. Kind names are matched case-insensitively.
//
// This module is PURE (string transforms only) so the render path in
// preflight-issue.mjs can filter without any I/O dependency.

const KIND_ANNOTATION_RE = /<!--\s*dod:kinds\s+(exclude|include)="([^"]*)"\s*-->/i;

/**
 * Parse the `dod:kinds` annotation from a single DoD line.
 * Returns `{ mode: 'exclude'|'include', kinds: string[] }` or `null` when the
 * line carries no annotation. Kind names are lowercased and de-blanked.
 */
export function parseDodKindsAnnotation(line) {
  const m = String(line || '').match(KIND_ANNOTATION_RE);
  if (!m) return null;
  const mode = m[1].toLowerCase();
  const kinds = m[2]
    .split(',')
    .map((k) => k.trim().toLowerCase())
    .filter(Boolean);
  return { mode, kinds };
}

/**
 * True when a DoD line should render for `kind`. Unannotated lines always
 * render (the documented default). An `exclude` line renders unless `kind` is
 * listed; an `include` line renders only when `kind` is listed.
 */
export function dodLineAppliesToKind(line, kind) {
  const ann = parseDodKindsAnnotation(line);
  if (!ann) return true;
  const k = String(kind || '').toLowerCase();
  return ann.mode === 'exclude' ? !ann.kinds.includes(k) : ann.kinds.includes(k);
}

/**
 * Drop every DoD line whose `dod:kinds` annotation excludes `kind`. Lines with
 * no annotation are preserved verbatim, so for any kind not named by any
 * annotation the transform is a no-op (byte-identical output) — the property
 * the code-kind back-compat regression guard depends on.
 */
export function filterDodForKind(dodText, kind) {
  const lines = String(dodText).split('\n');
  const kept = lines.filter((line) => dodLineAppliesToKind(line, kind));
  return kept.join('\n');
}
