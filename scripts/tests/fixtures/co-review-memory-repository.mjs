// @story #1292

import { createHash } from 'node:crypto';
import { readFileSync, realpathSync, writeFileSync } from 'node:fs';
import path from 'node:path';

function oid(kind, bytes) {
  return createHash('sha256').update(kind).update(Buffer.from(bytes)).digest('hex').slice(0, 40);
}

function copyFiles(files) {
  return new Map([...files].map(([name, bytes]) => [name, Buffer.from(bytes)]));
}

function normalize(relative) {
  return String(relative).split(path.sep).join('/').replace(/^\.\//, '');
}

export function createMemoryRepository({
  root,
  branch = 'trunk',
  artifact = 'docs/artifact.md',
  bytes = Buffer.from('# Artifact\n\nRevision one.\n'),
} = {}) {
  const repositoryRoot = realpathSync(root);
  const artifactPath = normalize(artifact);
  const worktree = new Map([[artifactPath, Buffer.from(bytes)]]);
  const index = copyFiles(worktree);
  const commits = new Map();
  const parents = new Map();
  let head = null;

  function blob(bytesValue) {
    return oid('blob\0', bytesValue);
  }

  function snapshotId(parent, message, files) {
    const payload = [...files]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([name, value]) => `${name}\0${blob(value)}`)
      .join('\n');
    return oid('commit\0', `${parent ?? ''}\n${message}\n${payload}`);
  }

  function publish(message) {
    const snapshot = copyFiles(index);
    const commit = snapshotId(head, message, snapshot);
    commits.set(commit, snapshot);
    parents.set(commit, head);
    head = commit;
    return commit;
  }

  const initialCommit = publish('initial artifact');

  function isReachable(commit) {
    let current = head;
    while (current !== null) {
      if (current === commit) return true;
      current = parents.get(current) ?? null;
    }
    return false;
  }

  function write(relative, value) {
    const normalized = normalize(relative);
    const buffer = Buffer.from(value);
    worktree.set(normalized, buffer);
    writeFileSync(path.join(repositoryRoot, normalized), buffer);
    return normalized;
  }

  return Object.freeze({
    initialCommit,

    repositoryRoot() {
      return repositoryRoot;
    },

    runtimeStatus(_root, relative) {
      const normalized = normalize(relative).replace(/\/$/, '');
      return {
        ignored: normalized === '.tmp' || normalized.startsWith('.tmp/'),
        tracked:
          index.has(normalized) ||
          [...index.keys()].some((name) => name.startsWith(`${normalized}/`)),
      };
    },

    trackedArtifact(_root, relative) {
      const normalized = normalize(relative);
      const headBytes = commits.get(head)?.get(normalized);
      const indexBytes = index.get(normalized);
      const worktreeBytes = readFileSync(path.join(repositoryRoot, normalized));
      if (!headBytes || !indexBytes) return null;
      return {
        worktree: Buffer.from(worktreeBytes),
        index: Buffer.from(indexBytes),
        head: Buffer.from(headBytes),
        commit: head,
        blob: blob(headBytes),
      };
    },

    resolveReachableCommit(_root, revision) {
      const commit = revision === 'HEAD' ? head : commits.has(revision) ? revision : null;
      return { commit, reachable: commit !== null && isReachable(commit) };
    },

    committedArtifact(_root, commit, relative) {
      const value = commits.get(commit)?.get(normalize(relative));
      return value ? { bytes: Buffer.from(value), blob: blob(value) } : null;
    },

    identity() {
      return { branch, head };
    },

    setIndex(relative, value) {
      index.set(normalize(relative), Buffer.from(value));
    },

    setWorktree(relative, value) {
      write(relative, value);
    },

    commit(relative, value, message = 'revise artifact') {
      const normalized = write(relative, value);
      index.set(normalized, Buffer.from(value));
      return publish(message);
    },
  });
}
