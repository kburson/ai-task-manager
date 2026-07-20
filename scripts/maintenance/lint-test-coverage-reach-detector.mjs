// #866 — Detector: a test file that exercises no code in this repo.
//
// The standard (see issue #866 Scope): a `*.test.mjs` must exercise code in
// THIS repo. A test that references no module under `scripts/` cannot appear in
// the `c8` coverage report (`.c8rc.json` scopes `src` to `scripts/` with
// `all: true`), so it costs a process spawn on every full run and proves nothing
// about the product. This detector reports such files so the suite's runtime
// buys coverage of this repo's code and nothing else.
//
// REACH IS NOT THE SAME AS IMPORT (issue #866 Decision). This repo's CLI tests
// reach product code by SPAWNING it (`execFileSync('node', ['scripts/...'])`),
// not only by importing it — and `c8` merges every spawned child's V8 dump, so
// those tests do produce coverage. An import-only rule would wrongly condemn the
// repo's most end-to-end tests. So the detector asks the broader question: does
// this file reference a repo source module AT ALL — as an import specifier or as
// a spawned / resolved path?
//
// DEFAULT-ALLOW ON AMBIGUITY. The asymmetry is deliberate: this lint decides
// whether to REJECT a file, so an unrecognised reach mechanism must not condemn
// a test that may be doing real work. A false negative costs one uncaught
// freeloader; a false positive teaches people the lint is noise. The single
// unifying signal below — "the file names a non-test `.mjs` module" — covers
// both an import specifier (a `.mjs` string literal) and a spawned/resolved path
// (a `.mjs` string literal), and errs toward allowing.

// Match a `.mjs` module path that is anchored to an OPENING quote/backtick and
// composed of contiguous path characters. Anchoring to the opening quote (not
// the closing one) is deliberate — it tolerates the forms real reaches take:
//
//   'scripts/task-tracker/x.mjs'                         plain spawn/resolve path
//   '../../lib/foo.mjs'                                  static import specifier
//   `../../lib/guard-registry.mjs?t=${Date.now()}`      cache-busting dynamic import
//   path.resolve(HERE, '..', 'preflight-issue.mjs')     resolve fragment
//
// The `\b` terminator (rather than a closing quote) lets a `?query`/`${…}` tail
// follow `.mjs`. Because the capture must begin immediately after the opening
// quote and contain only path characters (no spaces), prose that merely mentions
// a filename with surrounding words does not match, and a `.mjs` named only in a
// `//`/`/* */` comment — never inside quotes — is not counted either. Both
// exclusions serve DEFAULT-ALLOW poorly on their face, yet the anchoring keeps
// the signal to genuine module references while still flagging a test that
// quotes no module path at all.
const MJS_LITERAL_RE = /['"`]([A-Za-z0-9_@.\-/]*?\.mjs)\b/g;

// A referenced module "counts as reach" unless its basename is itself a test
// file (`*.test.mjs`) — importing or spawning another TEST is not reaching
// product code. Everything else (a relative source import like
// `../../lib/foo.mjs`, a spawned CLI path like `scripts/task-tracker/x.mjs`, or
// a `path.resolve(HERE, '..', 'preflight-issue.mjs')` fragment) is reach.
function isTestBasename(modulePath) {
  const base = modulePath.split(/[\\/]/).pop() || modulePath;
  return /\.test\.mjs$/.test(base);
}

// Return the de-duplicated list of `.mjs` module references in `src` that count
// as reaching repo source (i.e. every `.mjs` literal whose basename is not a
// `*.test.mjs`). Exported for unit coverage.
export function extractSourceModuleRefs(src) {
  const refs = new Set();
  const text = String(src || '');
  MJS_LITERAL_RE.lastIndex = 0;
  let m;
  while ((m = MJS_LITERAL_RE.exec(text)) !== null) {
    const modulePath = m[1];
    if (isTestBasename(modulePath)) continue;
    refs.add(modulePath);
  }
  return [...refs];
}

// True when the file reaches repo source code by either mechanism (import or
// spawn/resolve). Exported for unit coverage.
export function reachesRepoSource(src) {
  return extractSourceModuleRefs(src).length > 0;
}

// `files`: array of `{ path, src }`. Returns `[{ file, message }]` for every
// file that reaches NO repo source module. File-level (not line-level): the
// finding is "this whole test exercises no code," not a per-line defect.
export function findNoReachTestFiles(files = []) {
  const offenders = [];
  for (const { path: file, src } of files) {
    if (reachesRepoSource(src)) continue;
    offenders.push({
      file,
      message:
        'test file references no repo source module (no import of, and no ' +
        'spawned/resolved path to, any non-test `.mjs`) — it exercises no code ' +
        'in this repo and contributes nothing to the c8 coverage report. Make ' +
        'it exercise a module under scripts/, or move its assertions to a lint ' +
        '(as #852 did) or delete it.',
    });
  }
  return offenders;
}
