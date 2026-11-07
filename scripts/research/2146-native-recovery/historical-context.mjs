// @story #2146
// Bounded read-only context. Never imports the archived harness or searches old roots.
import { createHash } from 'node:crypto';
import { lstatSync, readFileSync, realpathSync } from 'node:fs';
import path from 'node:path';

const MANIFEST_SHA = '78afd54726726495057aacba467593b922b218d602081bf6b392274bc2514781';
const OLD_ROOT =
  '/Users/kpburson/.codex/worktrees/3d20/ai-task-manager/.scratch/native-recovery-spike/followup-20261103T233057Z';
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');
const fail = (reason) => {
  throw new Error('historical:' + reason);
};
const physical = (root) => {
  if (
    !path.isAbsolute(root) ||
    path.resolve(root) !== root ||
    realpathSync(root) !== root ||
    !lstatSync(root).isDirectory()
  )
    fail('root');
  return root;
};
const canonical = (relative) => {
  if (
    !relative ||
    path.isAbsolute(relative) ||
    relative.includes('\\') ||
    relative.includes('\0') ||
    /^[a-z]:/i.test(relative) ||
    relative.split('/').some((s) => ['', '.', '..', '.git'].includes(s))
  )
    fail('path');
  return relative;
};
function member(root, relative) {
  physical(root);
  const pieces = canonical(relative).split('/');
  let current = root;
  for (const [index, piece] of pieces.entries()) {
    current = path.join(current, piece);
    const stat = lstatSync(current);
    if (stat.isSymbolicLink()) fail('symlink');
    if (index === pieces.length - 1 ? !stat.isFile() : !stat.isDirectory()) fail('member-kind');
  }
  return current;
}

export function createHistoricalContext({ sourceRoot, restoredEvidence, sourceGit }) {
  const ownerRoot = physical(sourceRoot),
    evidence = physical(restoredEvidence);
  const manifestBytes = readFileSync(member(evidence, 'manifest-v2.json'));
  if (sha(manifestBytes) !== MANIFEST_SHA) fail('manifest-pin');
  const manifest = JSON.parse(manifestBytes);
  const files = new Set([...Object.keys(manifest.artifacts), 'manifest-v2.json']);
  const sources = new Set(Object.keys(manifest.sources));
  const directories = new Set();
  for (const file of files) {
    const parts = canonical(file).split('/');
    parts.pop();
    while (parts.length) {
      directories.add(parts.join('/'));
      parts.pop();
    }
  }
  const lookup = (target) => {
    if (typeof target !== 'string' || path.resolve(target) !== target) fail('read-path');
    for (const [root, inventory] of [
      [evidence, files],
      [ownerRoot, sources],
    ]) {
      if (!target.startsWith(root + path.sep)) continue;
      const relative = canonical(target.slice(root.length + 1));
      if (inventory.has(relative)) return member(root, relative);
    }
    return fail('unlisted-read');
  };
  const boundedFs = Object.freeze({
    readFileSync: (target, encoding) => readFileSync(lookup(target), encoding),
    existsSync: (target) => {
      try {
        lookup(target);
        return true;
      } catch (error) {
        if (error.code === 'ENOENT') return false;
        throw error;
      }
    },
  });
  return Object.freeze({
    fs: boundedFs,
    evidence,
    ownerRoot,
    sha,
    readJson: (target) => JSON.parse(boundedFs.readFileSync(target, 'utf8')),
    resolveHistoricalOutput: (target) => {
      if (typeof target !== 'string' || !target.startsWith(OLD_ROOT + '/')) fail('output-prefix');
      const relative = canonical(target.slice(OLD_ROOT.length + 1));
      if (!directories.has(relative)) fail('output-directory');
      return relative;
    },
    execFileSync: (command, args, options) => {
      if (
        command !== 'git' ||
        options?.cwd !== ownerRoot ||
        ![
          ['rev-parse', 'HEAD'],
          ['status', '--porcelain', '--untracked-files=all'],
        ].some((allowed) => JSON.stringify(allowed) === JSON.stringify(args))
      )
        fail('git-command');
      return sourceGit(args);
    },
  });
}
