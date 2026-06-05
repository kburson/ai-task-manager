// #304 — Project-local scratch directory resolver.
//
// Replaces every `os.tmpdir()` and literal `/tmp/` usage in this repo. Scratch
// space lives under `<projectDir>/.tmp/<purpose>/` so it:
//
//   - is gitignored (see top-level `.gitignore`),
//   - is co-located with the repo (survives the test run and is reviewable),
//   - does not collide with concurrent agents writing to `/tmp/claude-…`,
//   - does not get reaped by the OS mid-test.
//
// The system `/tmp/` is out-of-scope for writes per `bash-guard-tmp-contract`.
// All callers in `scripts/` MUST go through this helper.

import { mkdirSync, mkdtempSync, existsSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir as systemTmpdir } from 'node:os';
import path from 'node:path';

const VALID_PURPOSE_RE = /^[a-z0-9][a-z0-9-]{0,31}$/;

// Resolve `<projectDir>/.tmp/<purpose>/`, creating it if missing. `projectDir`
// defaults to `process.env.AI_TASK_MANAGER_PROJECT_DIR` (the same override the
// task-tracker honours) and then `process.cwd()`. `purpose` is a short slug;
// the canonical buckets are: `test`, `gh`, `plan`, `heal`, `inspect`.
export function projectScratchDir(purpose, projectDir) {
  const slug = String(purpose || '');
  if (!VALID_PURPOSE_RE.test(slug)) {
    throw new Error(`projectScratchDir: purpose must match ${VALID_PURPOSE_RE} — got "${purpose}"`);
  }
  const root = projectDir || process.env.AI_TASK_MANAGER_PROJECT_DIR || process.cwd();
  const dir = path.join(root, '.tmp', slug);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  return dir;
}

// `mkdtempSync` inside `projectScratchDir(purpose)`, then `git init -q` so the
// resulting dir is its own git-worktree root. Required when test code (or code
// under test) walks up via `git rev-parse --show-toplevel` / `findMainWorktreePath`
// — without the init, those walkers escape the sandbox and resolve to this
// repo's real root, corrupting the live `.ai-task-manager/` state.
export function mkdtempProjectIsolated(prefix, purpose = 'test') {
  const dir = mkdtempSync(path.join(projectScratchDir(purpose), prefix));
  execFileSync('git', ['init', '-q', '-b', 'trunk'], { cwd: dir });
  // Stop Node's module-type resolver from walking out of the sandbox and
  // inheriting this repo's `"type": "module"` package.json. Tests that drop
  // CommonJS shims (e.g. git/gh `require('node:fs')` wrappers) need the
  // sandbox to default to CJS the way `/tmp/` used to.
  writeFileSync(path.join(dir, 'package.json'), '{}\n');
  // Ignore everything by default — tests don't want a dirty workspace gate
  // to trip on transient state files (`.ai-task-manager/`, shims, etc.).
  // Sandboxes that need specific tracking can override .gitignore after.
  writeFileSync(path.join(dir, '.gitignore'), '*\n!.gitignore\n');
  const env = {
    ...process.env,
    GIT_AUTHOR_NAME: 'aitm-test',
    GIT_AUTHOR_EMAIL: 'aitm-test@example.com',
    GIT_COMMITTER_NAME: 'aitm-test',
    GIT_COMMITTER_EMAIL: 'aitm-test@example.com',
  };
  execFileSync('git', ['add', '.gitignore'], { cwd: dir, env });
  execFileSync('git', ['commit', '-q', '--no-verify', '-m', 'init'], { cwd: dir, env });
  return dir;
}

// Escape hatch: tests that exercise the "outside any git repo" path need a
// directory the repo-walker can't ascend out of. On a repo-rooted machine the
// only such location is the OS temp dir. Use this ONLY for "no git repo
// found" assertions; everything else must go through `projectScratchDir` or
// `mkdtempProjectIsolated`. The `lint:tmp` guard allowlists this helper.
export function mkdtempOutsideRepo(prefix) {
  return mkdtempSync(path.join(systemTmpdir(), prefix));
}
