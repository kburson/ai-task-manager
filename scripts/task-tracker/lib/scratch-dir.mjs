// #304 — Project-local scratch directory resolver.
//
// Replaces every `os.tmpdir()` and literal `/tmp/` usage in this repo. Scratch
// space lives under `<projectDir>/.scratch/<purpose>/` so it:
//
//   - is gitignored (see top-level `.gitignore`),
//   - is co-located with the repo (survives the test run and is reviewable),
//   - does not collide with concurrent agents writing to `/tmp/claude-…`,
//   - does not get reaped by the OS mid-test.
//
// The system `/tmp/` is out-of-scope for writes per `bash-guard-tmp-contract`.
// All callers in `scripts/` MUST go through this helper.

import { cpSync, mkdirSync, mkdtempSync, existsSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir as systemTmpdir } from 'node:os';
import path from 'node:path';
import { BoundWorktreeMissingError, resolveProjectDir } from './project-dir.mjs';

const VALID_PURPOSE_RE = /^[a-z0-9][a-z0-9-]{0,31}$/;

// Resolve `<projectDir>/.scratch/<purpose>/`, creating it if missing. `projectDir`
// defaults to the recorded issue-bound worktree (#1164), then
// `process.env.AI_TASK_MANAGER_PROJECT_DIR`, then `process.cwd()`.
//
// The bound-worktree lookup is best-effort by design. Scratch space is not
// execution authority: this helper is called from CI, from `node --test`, from
// PreToolUse hooks, and from every unbound `scripts/` entry point, none of which
// hold an active-task record. #1164 made the lookup fail closed for verbs, where
// running in the wrong tree is a real defect; propagating that refusal here just
// denies an unbound process a temp directory it is entitled to. So a
// `BoundWorktreeMissingError` degrades to the pre-#1164 resolution order rather
// than aborting the caller.
//
// `purpose` is a short slug; the canonical buckets are: `test`, `gh`, `plan`,
// `heal`, `inspect`.
export function projectScratchDir(purpose, projectDir) {
  const slug = String(purpose || '');
  if (!VALID_PURPOSE_RE.test(slug)) {
    throw new Error(`projectScratchDir: purpose must match ${VALID_PURPOSE_RE} — got "${purpose}"`);
  }
  const root = resolveScratchRoot(projectDir);
  const dir = path.join(root, '.scratch', slug);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  return dir;
}

// Bound worktree first, then the historical fallbacks. Only the
// "no bind record" case degrades; any other resolver failure still propagates,
// because it means the record exists and is unusable.
export function resolveScratchRoot(projectDir, deps = {}) {
  const resolve = deps.resolveProjectDir || resolveProjectDir;
  const env = deps.env || process.env;
  const cwd = deps.cwd || (() => process.cwd());
  try {
    return resolve({ deps: { projectDir } });
  } catch (error) {
    if (!(error instanceof BoundWorktreeMissingError)) throw error;
    return projectDir || env.AI_TASK_MANAGER_PROJECT_DIR || cwd();
  }
}

// `mkdtempSync` inside `projectScratchDir(purpose)`, then `git init -q` so the
// resulting dir is its own git-worktree root. Required when test code (or code
// under test) walks up via `git rev-parse --show-toplevel` / `findMainWorktreePath`
// — without the init, those walkers escape the sandbox and resolve to this
// repo's real root, corrupting the live `.ai-task-manager/` state.
// #1412 — the sandbox contract is "a directory that is its own git-worktree root
// carrying one commit". Callers cannot observe HOW it got that way, which is what
// makes the prototype-and-copy below safe.
//
// It matters because this used to spawn three `git` processes per call. A traced
// unit-lane run counted 1976 `git` spawns and ~900s of aggregate `git` time, of
// which this helper was the single largest contributor at ~540 spawns / ~380s.
// At that saturation individual calls inflate wildly — a bare `git init -q -b
// trunk` was measured at 10.5s — until something trips the 10s `GIT_TIMEOUT_MS`
// and a test fails for reasons unrelated to the code under test.
//
// So: build the prototype once per process, then copy it. First call pays three
// spawns, every later call pays a directory copy and none. A `git init`
// repository is self-contained — no worktree links, no absolute paths inside
// `.git` — so a copy is a valid independent repository rather than a second
// reference to the first.
const GIT_TEST_IDENTITY = {
  GIT_AUTHOR_NAME: 'aitm-test',
  GIT_AUTHOR_EMAIL: 'aitm-test@example.com',
  GIT_COMMITTER_NAME: 'aitm-test',
  GIT_COMMITTER_EMAIL: 'aitm-test@example.com',
};

let prototypeDir = null;
let prototypeBuilds = 0;

function buildSandboxPrototype(purpose) {
  const dir = mkdtempSync(path.join(projectScratchDir(purpose), 'aitm-sandbox-prototype-'));
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
  const env = { ...process.env, ...GIT_TEST_IDENTITY };
  execFileSync('git', ['add', '.gitignore'], { cwd: dir, env });
  execFileSync('git', ['commit', '-q', '--no-verify', '-m', 'init'], { cwd: dir, env });
  prototypeBuilds += 1;
  return dir;
}

// Test-only accessor: how many times this process built the prototype. The
// contract test asserts it stays at one across repeated sandbox creation, which
// is the whole point of the change.
export function sandboxPrototypeBuildCount() {
  return prototypeBuilds;
}

export function mkdtempProjectIsolated(prefix, purpose = 'test') {
  if (prototypeDir === null || !existsSync(prototypeDir)) {
    prototypeDir = buildSandboxPrototype(purpose);
  }
  const dir = mkdtempSync(path.join(projectScratchDir(purpose), prefix));
  cpSync(prototypeDir, dir, { recursive: true });
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
