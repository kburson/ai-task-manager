import { existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';

export const SHARED_DIR = '.ai-task-manager';
export const LEGACY_CLAUDE_DIR = '.claude';

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

// Returns a project-local tmp directory, creating it if needed.
// Keeps all ephemeral files inside the project tree.
export function projectTmpDir(projDir) {
  const dir = path.join(projDir, 'tmp');
  mkdirSync(dir, { recursive: true });
  return dir;
}
