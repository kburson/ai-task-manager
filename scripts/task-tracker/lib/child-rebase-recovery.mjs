// @story #2068
// Historical location is a target restriction, never a revived lease.
import { existsSync, lstatSync, readFileSync, realpathSync } from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { strictIssueWorktreeLocations } from './issue-worktree-location.mjs';

function refuse(reason) {
  throw new Error('merge-back: child recovery: ' + reason);
}
export const CHILD_PROTECTED_ROOTS = Object.freeze([
  'node_modules',
  '.scratch',
  '.tmp',
  '.ai-task-manager/runtime',
  '.superpowers',
]);

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
    if (
      record.worktreeBranch === ctx.childBranch ||
      record.worktreeBranch === ctx.epicBranch ||
      entries.some((entry) => entry.branch === 'refs/heads/' + record.worktreeBranch)
    )
      refuse('historical ref is not isolated from executor, epic or named holder');
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
    const first = CHILD_PROTECTED_ROOTS.find((name) => file.startsWith(name + '/'));
    if (!first) refuse('untracked or ignored data outside protected roots');
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

// Compare immutable protected subtrees across every replay input and the index.
// Only the two-level runtime prefix needs a second batch; no per-pick Git calls.
export function proveChildProtectedTrees({ trees, entries, extra, readTrees, checkBudget }) {
  function parse({ oid, bytes }) {
    const result = [];
    for (let pos = 0; pos < bytes.length;) {
      const space = bytes.indexOf(32, pos),
        nul = bytes.indexOf(0, space + 1);
      if (space < pos || nul <= space + 1 || nul + 1 + oid.length / 2 > bytes.length)
        refuse('invalid protected tree');
      const mode = bytes.toString('ascii', pos, space);
      const raw = bytes.subarray(space + 1, nul),
        name = raw.toString('utf8');
      if (!Buffer.from(name).equals(raw) || name.includes('/') || !/^[0-7]+$/.test(mode))
        refuse('unsupported protected tree name or mode');
      result.push({
        name,
        mode,
        oid: bytes.subarray(nul + 1, nul + 1 + oid.length / 2).toString('hex'),
      });
      pos = nul + 1 + oid.length / 2;
    }
    return result;
  }
  const parsed = new Map(trees.map((tree) => [tree.oid, parse(tree)]));
  function find(oid, name) {
    const matches = parsed
      .get(oid)
      .filter((entry) => entry.name.toLowerCase() === name.toLowerCase());
    if (matches.length > 1 || matches.some((entry) => entry.name !== name))
      refuse('case-folding protected prefix collision');
    return matches[0];
  }
  const nested = [];
  for (const tree of trees) {
    const ancestor = find(tree.oid, '.ai-task-manager');
    if (ancestor) {
      if (ancestor.mode !== '40000') refuse('protected runtime ancestor is not a tree');
      nested.push(ancestor.oid);
    }
  }
  for (const tree of readTrees(nested)) parsed.set(tree.oid, parse(tree));
  const oidLength = trees[0].oid.length;
  function indexTree(rows) {
    if (!rows.length) return null;
    const groups = new Map();
    for (const [file, entry] of rows) {
      const [name, ...rest] = file.split('/');
      if (!groups.has(name)) groups.set(name, []);
      groups.get(name).push([rest.join('/'), entry]);
    }
    const parts = [...groups]
      .map(([name, members]) => {
        const leaf = members.find(([rest]) => !rest);
        if (leaf && members.length !== 1) refuse('protected index path collision');
        const entry = leaf ? leaf[1] : indexTree(members);
        return { name, ...entry };
      })
      .sort((a, b) =>
        Buffer.compare(
          Buffer.from(a.name + (a.mode === '40000' ? '/' : '')),
          Buffer.from(b.name + (b.mode === '40000' ? '/' : ''))
        )
      );
    const bytes = Buffer.concat(
      parts.flatMap(({ name, mode, oid }) => [
        Buffer.from(mode + ' ' + name + '\0'),
        Buffer.from(oid, 'hex'),
      ])
    );
    return {
      mode: '40000',
      oid: createHash(oidLength === 40 ? 'sha1' : 'sha256')
        .update(Buffer.from('tree ' + bytes.length + '\0'))
        .update(bytes)
        .digest('hex'),
    };
  }
  const protectedIndex = [];
  const identities = CHILD_PROTECTED_ROOTS.map((prefix) => {
    checkBudget();
    const rows = [];
    for (const [file, stages] of entries) {
      const lower = file.toLowerCase(),
        target = prefix.toLowerCase();
      if (!(lower === target || lower.startsWith(target + '/') || target.startsWith(lower + '/')))
        continue;
      if (!file.startsWith(prefix + '/') || !stages[0]) refuse('protected index prefix collision');
      rows.push([file.slice(prefix.length + 1), stages[0]]);
      protectedIndex.push(file);
    }
    const expected = indexTree(rows);
    for (const tree of trees) {
      let entry = { oid: tree.oid, mode: '40000' };
      for (const component of prefix.split('/')) {
        if (!entry) break;
        if (entry.mode !== '40000') refuse('protected prefix is not a tree');
        entry = find(entry.oid, component);
      }
      if (
        JSON.stringify(entry ? { mode: entry.mode, oid: entry.oid } : null) !==
        JSON.stringify(expected)
      )
        refuse('protected tracked subtree changes across replay inputs');
    }
    return { prefix, ...expected };
  });
  for (const file of extra) {
    const lower = file.toLowerCase();
    if (
      protectedIndex.some(
        (tracked) =>
          lower === tracked.toLowerCase() ||
          lower.startsWith(tracked.toLowerCase() + '/') ||
          tracked.toLowerCase().startsWith(lower + '/')
      )
    )
      refuse('untracked data collides with protected tracked path');
  }
  return identities;
}
