// Provision the unscoped `node_modules/ai-task-manager` self-link (#791).
//
// This package publishes scoped as `@kburson/ai-task-manager`, but every hook and
// PreToolUse guard command in `settings.json` resolves the UNSCOPED path
// `node_modules/ai-task-manager/scripts/task-tracker/<x>.mjs`. npm never creates that
// unscoped directory, so in a fresh `isolation: "worktree"` worktree the command
// `node <missing path>` errors before any package JS runs and Claude Code treats the
// crashed hook/guard as a non-blocking no-op — a silent fail-open. Because the module
// never loads, no in-module fallback can rescue it; the fix is to create the missing
// self-link the commands resolve through.
//
// Gated to the dogfooding checkout via `isDevPackage()` (`.git` presence at package
// root) so a consumer's installed tree is never touched. Shared root cause for the
// hooks (#791) and the direct-node guards (#792): one link fixes both.

import { existsSync, lstatSync, mkdirSync, realpathSync, rmSync, symlinkSync } from 'node:fs';
import { join } from 'node:path';
import { isDevPackage } from '../../../bin/lib/stamp-skill-version.mjs';

const UNSCOPED_ALIAS = 'ai-task-manager';

// Create (or confirm) `<pkgRoot>/node_modules/ai-task-manager` -> `<pkgRoot>`.
//
// Returns `{ changed, reason, linkPath }`:
//   - not-dev-package  : consumer layout — skipped, nothing created
//   - present          : correct symlink already in place — no-op
//   - real-entry-present: a real dir/file occupies the target — left as-is (no clobber)
//   - linked           : symlink created (fresh, or replacing a stale/broken one)
export function ensureSelfLink({ pkgRoot, isDev } = {}) {
  if (!pkgRoot) throw new Error('ensureSelfLink: pkgRoot required');
  if (isDev === undefined) isDev = isDevPackage(pkgRoot);
  if (!isDev) return { changed: false, reason: 'not-dev-package', linkPath: null };

  const nodeModules = join(pkgRoot, 'node_modules');
  const linkPath = join(nodeModules, UNSCOPED_ALIAS);

  // `lstat` (does not follow) so a broken/stale symlink is still detected.
  let entry = null;
  try {
    entry = lstatSync(linkPath);
  } catch {
    entry = null;
  }

  if (entry) {
    if (entry.isSymbolicLink()) {
      let resolved = null;
      try {
        resolved = realpathSync(linkPath);
      } catch {
        resolved = null;
      }
      if (resolved && resolved === realpathSync(pkgRoot)) {
        return { changed: false, reason: 'present', linkPath };
      }
      // Stale or broken symlink — replace it.
      rmSync(linkPath);
    } else {
      // A real directory/file (genuine install) — refuse to clobber.
      return { changed: false, reason: 'real-entry-present', linkPath };
    }
  }

  if (!existsSync(nodeModules)) mkdirSync(nodeModules, { recursive: true });
  // Relative `..` so the link stays valid if the checkout is relocated:
  // node_modules/ai-task-manager -> node_modules/.. == pkgRoot.
  symlinkSync('..', linkPath, 'dir');
  return { changed: true, reason: 'linked', linkPath };
}
