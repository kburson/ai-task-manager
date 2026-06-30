// Canonical positive Bash allowlist installed into `.claude/settings.json`.
//
// Replaces the previous "broad `Bash` allow + lexical hook classifier" model
// (issue #199). The bash-guard / activity-guard hooks remain in place as
// defense-in-depth, but the primary security boundary is now this enumerated
// list. Anything outside the list prompts the user.
//
// Format: Claude Code permission entries use the syntax `Bash(<glob>)`.
//   `Bash(npm test)`            — exact command match
//   `Bash(npm test:*)`          — npm test plus any args
//   `Bash(node scripts/**/*.mjs:*)` — node-invoked .mjs under scripts/, plus args
//
// Interpreter payload forms (`bash -c`, `sh -c`, `node -e`, `python -c`) are
// deliberately NOT included — they bypass argv parsing and let arbitrary code
// be smuggled past lexical classifiers. Use a script file instead.

export const CLAUDE_BASH_ALLOWLIST = Object.freeze([
  // npm — test/lint/format/install canonical entry points only.
  'Bash(npm test)',
  'Bash(npm test:*)',
  'Bash(npm run lint)',
  'Bash(npm run lint:*)',
  'Bash(npm run format)',
  'Bash(npm run format:check)',
  'Bash(npm ci)',
  'Bash(npm install)',
  'Bash(npm install:*)',

  // Node — project scripts only; no `-e`/`-p`/`--eval` (interpreter payloads).
  'Bash(node scripts/**)',
  'Bash(node bin/**)',
  // Dog-food / consumer-local symlink form: the Pickup Directive drives the
  // task-tracker via `node node_modules/ai-task-manager/scripts/**`, which the
  // `node scripts/**` glob above does not match (#665).
  'Bash(node node_modules/ai-task-manager/scripts/**)',

  // aitm CLI — the canonical consumer entry point (`npx aitm <verb>`). Hot
  // path for every `/task` verb; allowlisting it keeps a flaky permission
  // auto-mode classifier from stalling full-auto drives (#665). No interpreter
  // payload — `aitm` dispatches to vetted project scripts.
  'Bash(npx aitm:*)',

  // Shell scripts — file path only; no `-c`.
  'Bash(bash scripts/**)',
  'Bash(sh scripts/**)',

  // gh — read-only and body-file mutations (the project's create-issue /
  // edit-body wrappers route through bash-guard for further enforcement).
  'Bash(gh issue view:*)',
  'Bash(gh issue list:*)',
  'Bash(gh issue edit:*)',
  'Bash(gh issue comment:*)',
  'Bash(gh pr view:*)',
  'Bash(gh pr diff:*)',
  'Bash(gh pr list:*)',
  'Bash(gh api repos/*)',
  'Bash(gh repo view:*)',
  'Bash(gh label list:*)',

  // git — read + non-destructive writes. push/reset --hard/checkout --/clean
  // are intentionally excluded; the user runs those manually.
  'Bash(git status:*)',
  'Bash(git log:*)',
  'Bash(git diff:*)',
  'Bash(git show:*)',
  'Bash(git rev-parse:*)',
  'Bash(git branch:*)',
  'Bash(git add:*)',
  'Bash(git commit:*)',
  'Bash(git merge --no-ff:*)',
  'Bash(git worktree list:*)',
  'Bash(git stash:*)',

  // Filesystem inspection — read-only.
  'Bash(ls:*)',
  'Bash(cat:*)',
  'Bash(head:*)',
  'Bash(tail:*)',
  'Bash(find:*)',
  'Bash(grep:*)',
  'Bash(rg:*)',
  'Bash(wc:*)',
  'Bash(pwd)',

  // Scratch directory mutations — bash-guard scopes writes to project root
  // (which includes ./.tmp). Explicit entries reduce friction for canonical
  // scratch operations.
  'Bash(mkdir -p .tmp/**)',
  'Bash(mkdir -p ./.tmp/**)',
]);

// Interpreter-payload patterns that must never be added to the allowlist.
// Exported for tests; not consumed by the installer.
export const FORBIDDEN_INTERPRETER_FLAGS = Object.freeze([
  /\bbash\s+-c\b/,
  /\bsh\s+-c\b/,
  /\bzsh\s+-c\b/,
  /\bnode\s+-e\b/,
  /\bnode\s+-p\b/,
  /\bnode\s+--eval\b/,
  /\bnode\s+--print\b/,
  /\bpython3?\s+-c\b/,
  /\bperl\s+-e\b/,
  /\bruby\s+-e\b/,
]);

/**
 * Returns true if any entry in the allowlist contains an interpreter-payload
 * flag (`-c`, `-e`, `--eval`, etc.). Used by the install test to assert that
 * the allowlist remains payload-free.
 *
 * @param {ReadonlyArray<string>} entries
 * @returns {{ entry: string, flag: RegExp } | null}
 */
export function findInterpreterPayloadEntry(entries) {
  for (const entry of entries) {
    for (const flag of FORBIDDEN_INTERPRETER_FLAGS) {
      if (flag.test(entry)) return { entry, flag };
    }
  }
  return null;
}
