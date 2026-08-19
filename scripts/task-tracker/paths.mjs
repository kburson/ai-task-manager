import { existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';

export const SHARED_DIR = '.ai-task-manager';
export const LEGACY_CLAUDE_DIR = '.claude';

// Subdirectories under SHARED_DIR that hold machine-local runtime state.
export const SESSIONS_SUBDIR = 'sessions';
export const LOCKS_SUBDIR = 'locks';
export const SCRATCH_SUBDIR = 'scratch';

// Tracked markdown/reference templates consolidated under one folder (#574,
// EPIC #571). The skill-installed behavior-defining templates (pickup-directive,
// definition-of-done, the body/report scaffolds, references/) all live under
// `.ai-task-manager/templates/`, separating tracked template content from the
// JSON config that sits at the SHARED_DIR root.
export const TEMPLATES_SUBDIR = 'templates';

// Machine-local / transient runtime tree (#573, EPIC #571). Every artifact that
// is NOT a behavior-defining shared file is relocated under this base, which
// nests inside the already-gitignored `.tmp/` root, so the tracked config
// folders (`.ai-task-manager/`, `.claude/`) shrink to the worktree-required set.
// Sub-directory vocabulary mirrors the legacy SHARED_DIR layout.
export const TMP_AITM_REL = '.tmp/aitm';
export const STATE_SUBDIR = 'state';
export const FLEET_SUBDIR = 'fleet';
export const GATES_SUBDIR = 'gates';

// The `/.tmp/aitm/` path segment — state.mjs anchors the project root on it now
// that the runtime state file lives under this tree (rightmost match wins, per
// the #332 worktree rule).
export const TMP_AITM_SEGMENT = '/.tmp/aitm/';

// Single source of truth for the on-disk runtime layout. Every resolver below
// derives from FILE + SHARED_DIR, so EPIC #571's later stories can relocate a
// directory by editing SHARED_DIR (or one FILE entry) instead of hunting
// scattered string literals across the script tree.
const FILE = {
  config: 'task-tracker.json',
  state: 'task-tracker-state.json',
  queue: 'task-tracker-queue.json',
  fleet: 'task-fleet.json',
  occupancy: 'occupancy.json',
  coReviewIndex: 'co-review-index.json',
  orchestratorLock: 'orchestrator.lock',
  pickupDirective: 'pickup-directive.md',
  dod: 'definition-of-done.md',
};

// Keys of FILE whose target lives under the tracked templates subdir (#574)
// rather than directly at the SHARED_DIR root.
const TEMPLATE_KEYS = new Set(['pickupDirective', 'dod']);

// Project-root-relative runtime paths (e.g. `.ai-task-manager/task-tracker.json`).
// Used where a relative path is the stored/compared value (config defaults,
// candidate lists). Absolute resolvers below build the same layout via path.join.
// Template-family entries nest under `${SHARED_DIR}/${TEMPLATES_SUBDIR}/` (#574).
export const RUNTIME_REL = Object.freeze(
  Object.fromEntries(
    Object.entries(FILE).map(([k, v]) => [
      k,
      TEMPLATE_KEYS.has(k) ? `${SHARED_DIR}/${TEMPLATES_SUBDIR}/${v}` : `${SHARED_DIR}/${v}`,
    ])
  )
);

// Project-root-relative paths for the machine-local runtime artifacts that #573
// relocated under `.tmp/aitm/`. These are the stored config defaults that the
// runtime/hook consumers `path.join(projectDir, …)` against; they resolve to the
// exact same on-disk location as the absolute `statePath()`/`queuePath()` helpers
// below, but as a relative string so the existing override mechanism keeps working.
export const TMP_RUNTIME_REL = Object.freeze({
  state: `${TMP_AITM_REL}/${STATE_SUBDIR}/${FILE.state}`,
  queue: `${TMP_AITM_REL}/${STATE_SUBDIR}/${FILE.queue}`,
});

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
  ['.ai-task-manager/templates/pickup-directive.md', '.claude/task-tracker/pickup-directive.md'],
  [
    '.ai-task-manager/templates/definition-of-done.md',
    '.claude/task-tracker/definition-of-done.md',
  ],
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

// Base of the machine-local / transient runtime tree (`<projDir>/.tmp/aitm/`).
// All state/queue/cache/locks/sessions/gates/app artifacts nest under here so the
// tracked config roots hold only behavior-defining shared files (#573, EPIC #571).
export function tmpAitmDir(projDir = getProjectDir()) {
  return path.join(projDir, '.tmp', 'aitm');
}

// Base dir handed to verifier-cache.mjs::storePath (which appends `cache/`).
// Lands the cache at `<projDir>/.tmp/aitm/cache/verifier-results.json`.
export function verifierCacheBaseDir(projDir = getProjectDir()) {
  return tmpAitmDir(projDir);
}

// Per-session directory under .ai-task-manager/sessions/<sid>/. Used by
// session-state.mjs and (later in EPIC #207) per-session pause/idle markers.
// Honors getProjectDir() precedence (AI_TASK_MANAGER_PROJECT_DIR > CLAUDE_PROJECT_DIR > cwd).
export function sessionDir(sid, projDir = getProjectDir()) {
  const safe = String(sid || 'default-session').replace(/[^A-Za-z0-9._-]/g, '_');
  return path.join(tmpAitmDir(projDir), SESSIONS_SUBDIR, safe);
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

// task-tracker-state.json. Relocated under `.tmp/aitm/state/` (#573). Hard cut:
// no legacy `.claude`/SHARED_DIR read-fallback (single-user unpublished package).
export function statePath(projDir = getProjectDir()) {
  return path.join(tmpAitmDir(projDir), STATE_SUBDIR, FILE.state);
}

// task-tracker-queue.json. Relocated under `.tmp/aitm/state/` (#573). Hard cut:
// no legacy read-fallback (see statePath).
export function queuePath(projDir = getProjectDir()) {
  return path.join(tmpAitmDir(projDir), STATE_SUBDIR, FILE.queue);
}

// pickup-directive.md (runtime install). Read-fallback to the legacy twin.
export function pickupDirectivePath(projDir = getProjectDir()) {
  return existingRuntimePath(projDir, RUNTIME_REL.pickupDirective);
}

// definition-of-done.md (runtime install). Read-fallback to the legacy twin.
export function dodPath(projDir = getProjectDir()) {
  return existingRuntimePath(projDir, RUNTIME_REL.dod);
}

// Directory holding per-session state (.tmp/aitm/sessions/<sid>/…).
export function sessionsDir(projDir = getProjectDir()) {
  return path.join(tmpAitmDir(projDir), SESSIONS_SUBDIR);
}

// Directory holding advisory lock files (.tmp/aitm/locks/*.lock).
export function locksDir(projDir = getProjectDir()) {
  return path.join(tmpAitmDir(projDir), LOCKS_SUBDIR);
}

// Directory holding session-scoped gate override files
// (.tmp/aitm/gates/task-tracker.session.<sid>.json). Env-honoring like every
// other #573 runtime artifact, so `AI_TASK_MANAGER_PROJECT_DIR` isolates it
// consistently with project config (#682). In real runs no isolation env is
// set → getProjectDir() falls back to cwd → the resolved path is byte-identical
// to the legacy cwd-relative `.tmp/aitm/gates`.
export function gatesDir(projDir = getProjectDir()) {
  return path.join(tmpAitmDir(projDir), GATES_SUBDIR);
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

// Tracked templates directory (.ai-task-manager/templates/) — the consolidated
// home for skill-installed markdown templates and references/ (#574).
export function templatesDir(projDir = getProjectDir()) {
  return path.join(projDir, SHARED_DIR, TEMPLATES_SUBDIR);
}

// ---------------------------------------------------------------------------
// main-anchored resolvers — resolve against the MAIN worktree path so sibling
// worktrees share one file. Callers pass the main worktree path (computed via
// fleet-registry's findMainWorktreePath); these helpers own only the layout.
// ---------------------------------------------------------------------------

// task-fleet.json — the fleet registry, anchored to the main worktree. Relocated
// under `.tmp/aitm/fleet/` (#573); only the layout segment changes, the main-worktree
// anchor is preserved so sibling worktrees still share one registry.
export function fleetPath(mainWorktreePath) {
  return path.join(mainWorktreePath, '.tmp', 'aitm', FLEET_SUBDIR, FILE.fleet);
}

export function occupancyPath(mainWorktreePath) {
  return path.join(mainWorktreePath, '.tmp', 'aitm', FLEET_SUBDIR, FILE.occupancy);
}

export function coReviewIndexPath(mainWorktreePath) {
  return path.join(mainWorktreePath, '.tmp', 'aitm', FLEET_SUBDIR, FILE.coReviewIndex);
}

// orchestrator.lock — the single-orchestrator lock, anchored to the main worktree.
// Relocated under `.tmp/aitm/fleet/` (#573); anchor preserved (see fleetPath).
export function orchestratorLockPath(mainWorktreePath) {
  return path.join(mainWorktreePath, '.tmp', 'aitm', FLEET_SUBDIR, FILE.orchestratorLock);
}
