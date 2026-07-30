import { projectDatabasePath } from '../../paths.mjs';
import { resolveMainWorktreePath } from '../main-worktree-path.mjs';

export function resolveProjectDatabasePath(projectDir, options = {}) {
  const mainWorktree = resolveMainWorktreePath(projectDir, {
    ...options,
    allowFallback: false,
  });
  return projectDatabasePath(mainWorktree);
}
