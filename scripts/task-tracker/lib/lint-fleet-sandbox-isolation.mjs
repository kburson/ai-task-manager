// #442 — Scoped lint guard: forbid bare `mkdtempSync(projectScratchDir(...))`
// in test files that perform a fleet-REGISTERING operation.
//
// Root cause (see #442 deep-dive): a sandbox created with bare
// `mkdtempSync(path.join(projectScratchDir('test'), ...))` is NOT its own git
// worktree. When code under test then calls `registerTask`, the registry path
// resolves via `findMainWorktreePath` → `git rev-parse --show-toplevel`, which
// escapes the non-git sandbox and lands on THIS repo's real root, corrupting
// the live `.ai-task-manager/task-fleet.json`. The fix is to create such
// sandboxes via `mkdtempProjectIsolated` (git-inits the dir) instead.
//
// SCOPE / known limits: this static lint is a BEST-EFFORT heuristic. The
// authoritative leak guard is the runtime registry-key-set check in
// scripts/run-tests.mjs (AC2) — empirically, no purely-static signal matches
// the real leak set (some tests bind `#N` in a non-git sandbox yet never leak
// because of runtime/env config invisible to a linter; others register but
// git-init their sandbox and are safe). So this guard deliberately:
//   - narrows the signal to REGISTERING operations (CLI new/start/resume/#N-bind,
//     binding-verb calls, or a direct registerTask call), not mere imports;
//   - auto-exempts any file that git-inits its sandbox (that mitigates the leak);
//   - honors an inline `// fleet-sandbox-ok:` opt-out for the few tests that
//     deliberately exercise non-git / bare-worktree paths.

// A file performs a registering OPERATION if it does any of:
//   - exec the task-tracker CLI with a registering subcommand: `new`, `start`,
//     `resume`, or a bare `#<num>` bind (`[CLI, 'new']`, `[CLI, '#200']`, ...);
//   - CALL a binding verb: `verbResume(`, `verbStart(`, `verbNew(`;
//   - CALL `registerTask(` directly.
const REGISTRATION_SIGNALS = [
  /\[\s*CLI\s*,\s*['"](?:new|start|resume|#\d+)['"]/,
  /\bverb(?:Resume|Start|New)\s*\(/,
  /\bregisterTask\s*\(/,
];

export function hasRegistrationSignal(src) {
  return REGISTRATION_SIGNALS.some((re) => re.test(src));
}

// A file is auto-exempt if it git-inits its sandbox — that is the documented
// mitigation, so any bare mkdtemp inside it cannot escape into the live registry.
const GIT_INIT_RE = /\bgit['"]\s*,\s*\[\s*['"]init['"]/;

export function gitInitsSandbox(src) {
  return GIT_INIT_RE.test(src);
}

// A "bare scratch mkdtemp" is a `mkdtempSync(...)` call whose argument routes
// through `projectScratchDir(...)`. `mkdtempProjectIsolated(...)` contains
// neither token, so it is never matched — that is the intended replacement.
const BARE_RE = /\bmkdtempSync\s*\([^\n]*\bprojectScratchDir\s*\(/;

export function hasBareScratchMkdtemp(line) {
  return BARE_RE.test(line);
}

// Inline opt-out: a `// fleet-sandbox-ok:` comment on the offending line or the
// line immediately above it suppresses the finding (for deliberate non-git /
// bare-worktree path tests). The `:` requires a reason to be appended.
const OPT_OUT_RE = /\/\/\s*fleet-sandbox-ok:/;

function isOptedOut(lines, idx) {
  if (OPT_OUT_RE.test(lines[idx])) return true;
  if (idx > 0 && OPT_OUT_RE.test(lines[idx - 1])) return true;
  return false;
}

// `files`: array of `{ path, src }`. Returns `[{ file, line, message }]`.
export function findFleetSandboxViolations(files = []) {
  const offenders = [];
  for (const { path: file, src } of files) {
    if (!hasRegistrationSignal(src)) continue;
    if (gitInitsSandbox(src)) continue;
    const lines = src.split('\n');
    for (let i = 0; i < lines.length; i++) {
      if (!hasBareScratchMkdtemp(lines[i])) continue;
      if (isOptedOut(lines, i)) continue;
      offenders.push({
        file,
        line: i + 1,
        message:
          `bare mkdtempSync(projectScratchDir(...)) in a fleet-registering test — ` +
          `use mkdtempProjectIsolated(...) from lib/scratch-dir.mjs so the sandbox ` +
          `is git-isolated and registerTask cannot escape into the live registry ` +
          `(or add "// fleet-sandbox-ok: <reason>" if this test deliberately ` +
          `exercises a non-git path)`,
      });
    }
  }
  return offenders;
}
