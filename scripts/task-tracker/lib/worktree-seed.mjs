// Classify a project root's seed state (#869). Pure: lstat + realpath only,
// no writes. Dev vs consumer branches on isDevPackage (.git presence). The
// heal decision lives in ensure-worktree-seeded.mjs; this module only reports.
//
//   seeded         : self-link exists and realpaths to projectRoot
//   missing-link   : dev checkout, no node_modules/ai-task-manager → healable
//   foreign-link   : link resolves OUTSIDE projectRoot (the trunk-code trap) → healable
//   deps-missing   : consumer, no aitm reachable at all → instruct npm ci, not healable
//   not-applicable : consumer with a genuine install intact
import { lstatSync, realpathSync } from 'node:fs';
import { join } from 'node:path';
import { isDevPackage } from '../../../bin/lib/stamp-skill-version.mjs';

const UNSCOPED_ALIAS = 'ai-task-manager';

export function inspectSeed({ projectRoot } = {}) {
  if (!projectRoot) throw new Error('inspectSeed: projectRoot required');
  const linkPath = join(projectRoot, 'node_modules', UNSCOPED_ALIAS);
  const isDev = isDevPackage(projectRoot);

  let entry = null;
  try {
    entry = lstatSync(linkPath);
  } catch {
    entry = null;
  }

  if (!entry) {
    return isDev
      ? { status: 'missing-link', detail: `no ${UNSCOPED_ALIAS} self-link in dev worktree` }
      : { status: 'deps-missing', detail: `${UNSCOPED_ALIAS} not installed (consumer)` };
  }

  if (!entry.isSymbolicLink()) {
    // A real directory/file — a genuine install occupies the slot.
    return isDev
      ? { status: 'seeded', detail: 'real install present in dev checkout' }
      : { status: 'not-applicable', detail: 'consumer install intact' };
  }

  let resolved = null;
  try {
    resolved = realpathSync(linkPath);
  } catch {
    resolved = null;
  }
  const rootReal = realpathSync(projectRoot);
  if (resolved && resolved === rootReal) {
    return { status: 'seeded', detail: 'self-link resolves to projectRoot' };
  }
  return {
    status: 'foreign-link',
    detail: `self-link resolves to ${resolved ?? '<broken>'}, not ${rootReal}`,
  };
}
