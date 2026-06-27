import { existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';

export const SHARED_DIR = '.ai-task-manager';
export const LEGACY_CLAUDE_DIR = '.claude';

// Subdirectories under SHARED_DIR that hold machine-local runtime state.
export const SESSIONS_SUBDIR = 'sessions';
export const LOCKS_SUBDIR = 'locks';
export const SCRATCH_SUBDIR = 'scratch';

// Single source of truth for the on-disk runtime layout. Every resolver below
// derives from FILE + SHARED_DIR, so EPIC #571's later stories can relocate a
// directory by editing SHARED_DIR (or one FILE entry) instead of hunting
// scattered string literals across the script tree.
const FILE = {
  config: 'task-tracker.json',
  state: 'task-tracker-state.json',
  queue: 'task-tracker-queue.json',
  fleet: 'task-fleet.json',
  orchestratorLock: 'orchestrator.lock',
  pickupDirective: 'pickup-directive.md',
  dod: 'definition-of-done.md',
};

// Project-root-relative runtime paths (e.g. `.ai-task-manager/task-tracker.json`).
// Used where a relative path is the stored/compared value (config defaults,
// candidate lists). Absolute resolvers below build the same layout via path.join.
export const RUNTIME_REL = Object.freeze(
  Object.fromEntries(Object.entries(FILE).map(([k, v]) => [k, `${SHARED_DIR}/${v}`]))
);

// The `/.ai-task-manager/` path segment, used by state.mjs to anchor the
// project root inside an absolute state-file path.
export const SHARED_DIR_SEGMENT = `/${SHARED_DIR}/`;

// Source-edit allowlist prefixes (relative). `.tmp/` plus the shared scratch
// subtree are the only roots a pre-develop session may write.
export const SCRATCH_REL_PREFIX = `${SHARED_DIR}/${SCRATCH_SUBDIR}/`;

const LEGACY_RUNTIME_PATHS = new Map([
  ['.ai-task-manager/task-tracker.json', '.claude/task-tracker.json'],
  ['.ai-task-manager/task-tracker-state.json', '.claude/task-tracker-state.json'],
  ['.ai-task-manager/task-tracker-queue.json', '.claude/task-tracker-queue.json'],
  ['.ai-task-manager/task-fleet.json', '.claude/task-fleet.json'],
  ['.ai-task-manager/pickup-directive.md', '.claude/task-tracker/pickup-directive.md'],
  ['.ai-task-manager/definition-of-done.md', '.claude/task-tracker/definition-of-done.md'],
]);

function normalizeRelative(p) {
  return p.split(path.sep).join('/').replace(/^\.\//, '');
}

export function legacyPathFor(runtimePath) {
  const normalized = normalizeRelative(runtimePath);
  if (LEGACY_RUNTIME_PATHS.has(normalized)) return LEGACY_RUNTIME_PATHS.get(normalized);
  for (const [preferred, legacy] of LEGACY_RUNTIME_PATHS.entries()) {
    if (normalized.endsWith(`/${preferred}`)) {
      return normalized.slice(0, -preferred.length) + legacy;
    }
  }
  return null;
}

export function existingRuntimePath(projectDir, runtimePath) {
  const preferred = path.join(projectDir, runtimePath);
  if (existsSync(preferred)) return preferred;
  const legacy = legacyPathFor(runtimePath);
  if (!legacy) return preferred;
  const legacyAbs = path.join(projectDir, legacy);
  return existsSync(legacyAbs) ? legacyAbs : preferred;
}

// Resolves the project root. Precedence: AI_TASK_MANAGER_PROJECT_DIR > CLAUDE_PROJECT_DIR > cwd.
export function getProjectDir(env = process.env, cwd = process.cwd()) {
  return env.AI_TASK_MANAGER_PROJECT_DIR || env.CLAUDE_PROJECT_DIR || cwd;
}

// Returns a project-local scratch directory, creating it if needed.
// Keeps all ephemeral files inside the gitignored `.tmp/` tree so they never
// dirty the working tree. (`.gitignore` ignores `.tmp/`, NOT `tmp/`.)
export function projectTmpDir(projDir) {
  const dir = path.join(projDir, '.tmp');
  mkdirSync(dir, { recursive: true });
  return dir;
}

// Per-session directory under .ai-task-manager/sessions/<sid>/. Used by
// session-state.mjs and (later in EPIC #207) per-session pause/idle markers.
// Honors getProjectDir() precedence (AI_TASK_MANAGER_PROJECT_DIR > CLAUDE_PROJECT_DIR > cwd).
export function sessionDir(sid, projDir = getProjectDir()) {
  const safe = String(sid || 'default-session').replace(/[^A-Za-z0-9._-]/g, '_');
  return path.join(projDir, SHARED_DIR, SESSIONS_SUBDIR, safe);
}

// Absolute path to the active-task.json file for a given session id.
export function activeTaskPath(sid, projDir = getProjectDir()) {
  return path.join(sessionDir(sid, projDir), 'active-task.json');
}

// ---------------------------------------------------------------------------
// cwd-anchored resolvers — resolve against the project root (getProjectDir()).
// The *-Path helpers that read may transparently fall back to a legacy `.claude`
// twin via existingRuntimePath (preserving today's read behavior); the *Dir
// helpers return the canonical SHARED_DIR location for writes.
// ---------------------------------------------------------------------------

// task-tracker.json (project config). Read-fallback to the legacy `.claude` twin.
export function configPath(projDir = getProjectDir()) {
  return existingRuntimePath(projDir, RUNTIME_REL.config);
}

// task-tracker-state.json. Read-fallback to the legacy `.claude` twin.
export function statePath(projDir = getProjectDir()) {
  return existingRuntimePath(projDir, RUNTIME_REL.state);
}

// task-tracker-queue.json. Read-fallback to the legacy `.claude` twin.
export function queuePath(projDir = getProjectDir()) {
  return existingRuntimePath(projDir, RUNTIME_REL.queue);
}

// pickup-directive.md (runtime install). Read-fallback to the legacy twin.
export function pickupDirectivePath(projDir = getProjectDir()) {
  return existingRuntimePath(projDir, RUNTIME_REL.pickupDirective);
}

// definition-of-done.md (runtime install). Read-fallback to the legacy twin.
export function dodPath(projDir = getProjectDir()) {
  return existingRuntimePath(projDir, RUNTIME_REL.dod);
}

// Directory holding per-session state (sessions/<sid>/…).
export function sessionsDir(projDir = getProjectDir()) {
  return path.join(projDir, SHARED_DIR, SESSIONS_SUBDIR);
}

// Directory holding advisory lock files (locks/*.lock).
export function locksDir(projDir = getProjectDir()) {
  return path.join(projDir, SHARED_DIR, LOCKS_SUBDIR);
}

// Per-issue body-mutation lock file.
export function issueLockPath(issue, projDir = getProjectDir()) {
  return path.join(locksDir(projDir), `issue-${issue}.lock`);
}

// Per-issue timing-comment lock file. `key` is sanitized by the caller.
export function timingLockPath(key, projDir = getProjectDir()) {
  return path.join(locksDir(projDir), `timing-${key}.lock`);
}

// Shared scratch directory (gitignored working files).
export function scratchDir(projDir = getProjectDir()) {
  return path.join(projDir, SHARED_DIR, SCRATCH_SUBDIR);
}

// ---------------------------------------------------------------------------
// main-anchored resolvers — resolve against the MAIN worktree path so sibling
// worktrees share one file. Callers pass the main worktree path (computed via
// fleet-registry's findMainWorktreePath); these helpers own only the layout.
// ---------------------------------------------------------------------------

// task-fleet.json — the fleet registry, anchored to the main worktree.
export function fleetPath(mainWorktreePath) {
  return path.join(mainWorktreePath, SHARED_DIR, FILE.fleet);
}

// orchestrator.lock — the single-orchestrator lock, anchored to the main worktree.
export function orchestratorLockPath(mainWorktreePath) {
  return path.join(mainWorktreePath, SHARED_DIR, FILE.orchestratorLock);
}
