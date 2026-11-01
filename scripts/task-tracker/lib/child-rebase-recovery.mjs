// @story #2068
// Historical location is a target restriction, never a revived lease.
import { existsSync, lstatSync, readFileSync, realpathSync } from 'node:fs';
import path from 'node:path';
import { strictIssueWorktreeLocations } from './issue-worktree-location.mjs';

function refuse(reason) {
  throw new Error('merge-back: child recovery: ' + reason);
}
export const CHILD_PROTECTED_ROOTS = Object.freeze(['node_modules', '.scratch', '.tmp']);

export function selectChildRebaseTarget(ctx, { entries, git, gitDir }) {
  const history = strictIssueWorktreeLocations(ctx.issueBody);
  const latest = history.at(-1);
  if (
    latest?.worktreePath !== ctx.childDir ||
    latest.worktreeBranch !== ctx.childBranch ||
    latest.sessionId !== ctx.sessionId ||
    !Number.isFinite(Date.parse(latest.ts))
  )
    refuse('current repair location differs from history');
  const candidates = new Map();
  for (const record of history.slice(0, -1)) {
    if (
      record.sessionId !== ctx.sessionId ||
      record.worktreePath === ctx.childDir ||
      record.worktreeBranch === 'HEAD'
    )
      continue;
    if (!Number.isFinite(Date.parse(record.ts)) || Date.parse(record.ts) >= Date.parse(latest.ts))
      refuse('invalid historical location order');
    if (
      history.some(
        (row) =>
          row.ts === record.ts &&
          (row.worktreePath !== record.worktreePath ||
            row.worktreeBranch !== record.worktreeBranch ||
            row.sessionId !== record.sessionId)
      )
    )
      refuse('ambiguous historical location');
    const registered = entries.filter((entry) => entry.path === record.worktreePath);
    if (!registered.length) continue;
    if (registered.length !== 1) refuse('ambiguous historical registration');
    const root = record.worktreePath;
    if (realpathSync(root) !== root || !lstatSync(root).isDirectory())
      refuse('nonphysical historical checkout');
    const rebaseDir = path.join(gitDir(root), 'rebase-merge');
    if (!existsSync(rebaseDir)) continue;
    if (realpathSync(rebaseDir) !== rebaseDir) refuse('aliased rebase metadata');
    if (!lstatSync(path.join(rebaseDir, 'head-name')).isFile())
      refuse('invalid rebase branch metadata');
    if (
      readFileSync(path.join(rebaseDir, 'head-name'), 'utf8').trim() !==
      'refs/heads/' + record.worktreeBranch
    )
      continue;
    if (registered[0].branch || git(root, 'branch', '--show-current'))
      refuse('historical rebase is not detached');
    const selected = {
      parentDir: root,
      rebaseDir,
      parentBranch: record.worktreeBranch,
      historicalLocation: record,
    };
    const existing = candidates.get(root);
    if (existing && existing.parentBranch !== selected.parentBranch)
      refuse('ambiguous historical branch');
    candidates.set(root, selected);
  }
  if (candidates.size !== 1) refuse('expected exactly one previous same-session child rebase');
  return [...candidates.values()][0];
}

export function childWorkspaceBoundary(root, files) {
  const roots = new Set();
  for (const file of files) {
    const first = file.split('/')[0];
    if (!CHILD_PROTECTED_ROOTS.includes(first))
      refuse('untracked or ignored data outside protected roots');
    roots.add(first);
  }
  return [...roots].sort().map((name) => {
    const target = path.join(root, name);
    const stat = lstatSync(target);
    if (!stat.isDirectory() || stat.isSymbolicLink() || realpathSync(target) !== target)
      refuse('nonphysical protected root');
    return { name, dev: stat.dev, ino: stat.ino, mode: stat.mode, uid: stat.uid };
  });
}
