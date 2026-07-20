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

// ── #865: docs kind — "the kind declares, the diff decides" ─────────────────
//
// A `docs` kind must NOT statically exclude the `tests` DoD item the way
// `spike`/`research` do: those kinds never carry code, but a `docs` issue can
// quietly edit `scripts/**` and would then launder its way out of the suite by
// annotation alone. So the relief is conditional on the ACTUAL changed-path set
// of the issue's `trunk...HEAD` diff, classified here under a DEFAULT-DENY rule:
// only a provably documentation-only diff drops the item; anything unclassified
// counts as functional and keeps it.

const DOC_EXTENSION_RE = /\.(?:md|markdown)$/i;
// Matches a `docs/` directory segment anywhere in the path (top-level `docs/…`
// or nested `pkg/docs/…`). Normalizes Windows separators defensively.
const DOCS_DIR_RE = /(?:^|\/)docs\//i;

/**
 * True when a single repo-relative path is documentation. Intentionally narrow:
 * a Markdown/Markdown-variant file, or any path under a `docs/` directory. Under
 * default-deny, being conservative here is the SAFE direction — a doc file
 * misjudged as functional merely keeps the suite; the reverse would let code
 * skip it.
 */
export function isDocPath(path) {
  const p = String(path || '')
    .trim()
    .replace(/\\/g, '/');
  if (!p) return false;
  return DOC_EXTENSION_RE.test(p) || DOCS_DIR_RE.test(p);
}

/**
 * True only when `changedPaths` is a non-empty set and EVERY member is a doc
 * path. An empty diff is NOT proven docs-only (default-deny), so it returns
 * false and the suite is kept.
 */
export function diffIsDocsOnly(changedPaths) {
  const paths = (Array.isArray(changedPaths) ? changedPaths : [])
    .map((p) => String(p || '').trim())
    .filter(Boolean);
  if (paths.length === 0) return false;
  return paths.every(isDocPath);
}

/**
 * True when a docs-kind issue may drop the functional-test DoD item for this
 * diff: `kind === 'docs'` AND the diff is provably documentation-only. Any other
 * kind, or any non-doc / unclassified / empty diff, returns false.
 */
export function docsKindDropsTests(kind, changedPaths) {
  return String(kind || '').toLowerCase() === 'docs' && diffIsDocsOnly(changedPaths);
}

// The DoD tag identifying the functional-test item, whose line also seeds the
// `npm run test:all` verification command downstream.
const FUNCTIONAL_TESTS_TAG_RE = /<!--\s*dod:functional:tests\s*-->/i;

/**
 * Diff-aware DoD filter (#865). Delegates to {@link filterDodForKind} first —
 * preserving all #681 static `dod:kinds` behavior — then, ONLY when
 * {@link docsKindDropsTests} holds for `(kind, changedPaths)`, additionally
 * drops the `dod:functional:tests` line (which carries the suite's VC seed).
 *
 * For every non-`docs` kind, and for any `docs` diff that is not provably
 * docs-only, the extra drop never fires and the output is exactly
 * `filterDodForKind(dodText, kind)` — so the code-kind byte-identical guarantee
 * is preserved.
 */
export function filterDodForKindAndDiff(dodText, kind, changedPaths) {
  const base = filterDodForKind(dodText, kind);
  if (!docsKindDropsTests(kind, changedPaths)) return base;
  const kept = base.split('\n').filter((line) => !FUNCTIONAL_TESTS_TAG_RE.test(line));
  return kept.join('\n');
}
