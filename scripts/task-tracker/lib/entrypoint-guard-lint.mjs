// #723 — detects one-off scripts whose top-level (module-scope) code performs
// a live GitHub write without gating it behind an entry-point check. ES module
// top-level statements run on `import()` regardless of whether the module is
// later "run directly" — a script that calls `mutateIssueBody` (or any other
// GitHub-writing primitive) unconditionally at module scope fires that write
// the moment anything imports it for inspection or reuse, not just when it is
// invoked as a CLI.
//
// The sanctioned pattern (see docs/guides/entrypoint-guard.md):
//   if (import.meta.url === `file://${process.argv[1]}`) { await main(); }
// or the fileURLToPath-normalized equivalent:
//   const isMain = fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
//   if (isMain) { main(...); }
//
// This module is a heuristic source-text scanner, not a real AST-scoped
// checker: it looks for write-call sites and asks whether an entry-point-guard
// conditional appears anywhere earlier in the file. That's sufficient to
// catch the actual defect class (calling main()/a write unconditionally at
// the bottom of the file) without needing a JS parser dependency.

// Any call site capable of a live GitHub write, anywhere in the file
// (including inside a `main()` body) — used only to decide whether a write
// capability exists at all, not where.
const WRITE_CALL_RE =
  /\bmutateIssueBody\s*\(|\bversionedWriteBody\s*\(|execFile(?:Sync)?\s*\(\s*['"]gh['"][^)]*\b(?:edit|create)\b[^)]*--body/s;

// A write call sitting directly at module scope (column 0) — no `main()`
// indirection at all, so no guard could ever intervene.
const TOP_LEVEL_WRITE_RE =
  /^(?:await\s+)?(?:mutateIssueBody|versionedWriteBody)\s*\(|^execFile(?:Sync)?\s*\(\s*['"]gh['"][^)]*\b(?:edit|create)\b[^)]*--body/m;

// The file defines a `main` function...
const MAIN_FUNCTION_RE = /\b(?:async\s+)?function\s+main\s*\(/;
// ...and calls it unconditionally at module scope (no `if (isMain)` etc.
// wrapping it) — the actual defect shape: `main()` / `main().catch(...)`.
const TOP_LEVEL_MAIN_CALL_RE = /^(?:await\s+)?main\s*\(/m;

const GUARD_RE =
  /import\.meta\.url\s*===\s*`file:\/\/\$\{process\.argv\[1\]\}`|fileURLToPath\(import\.meta\.url\)\s*===\s*path\.resolve\(process\.argv\[1\]\)/;

/**
 * @param {string} source full file text
 * @returns {{hasWriteCapability: boolean, hasGuard: boolean, violation: boolean}}
 */
export function lintEntrypointGuard(source) {
  const src = String(source);
  const hasWriteCapability = WRITE_CALL_RE.test(src);
  const hasGuard = GUARD_RE.test(src);

  // Reachable-without-a-guard write: either the write call sits directly at
  // module scope, or `main` (which contains the write, per hasWriteCapability)
  // is invoked unconditionally. A file with no write capability at all
  // (read-only scripts like preflight-issue.mjs) is never a violation no
  // matter how its `main()` is invoked. A pure library (no `main` function,
  // no top-level direct write — e.g. runtime.mjs, whose exported functions
  // are called by verbs, not by the module itself) is never a violation
  // either: nothing fires on plain `import()`.
  const reachableAtModuleScope =
    TOP_LEVEL_WRITE_RE.test(src) ||
    (MAIN_FUNCTION_RE.test(src) && TOP_LEVEL_MAIN_CALL_RE.test(src) && hasWriteCapability);

  const violation = reachableAtModuleScope && !hasGuard;

  return { hasWriteCapability, hasGuard, violation };
}
