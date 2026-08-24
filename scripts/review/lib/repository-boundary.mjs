// @story #1292
// cspell:ignore ACDMRTUXB

import { execFileSync } from 'node:child_process';
import { readFileSync, realpathSync } from 'node:fs';
import path from 'node:path';

export function createRealRepositoryBoundary({ execFileSyncImpl = execFileSync } = {}) {
  function run(cwd, args, { buffer = false, allowFailure = false } = {}) {
    try {
      return execFileSyncImpl('git', args, {
        cwd,
        encoding: buffer ? null : 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
        shell: false,
      });
    } catch (error) {
      if (allowFailure) return null;
      throw error;
    }
  }

  return Object.freeze({
    repositoryRoot(cwd) {
      return realpathSync(run(cwd, ['rev-parse', '--show-toplevel']).trim());
    },

    runtimeStatus(root, relative) {
      return {
        ignored:
          run(root, ['check-ignore', '--quiet', '--', relative], { allowFailure: true }) !== null,
        tracked:
          run(root, ['ls-files', '--error-unmatch', '--', relative], { allowFailure: true }) !==
          null,
      };
    },

    trackedChanges(root) {
      const unstaged = run(root, ['diff', '--name-only', '--diff-filter=ACDMRTUXB', '--']);
      const staged = run(root, [
        'diff',
        '--cached',
        '--name-only',
        '--diff-filter=ACDMRTUXB',
        '--',
      ]);
      return [...new Set(`${unstaged}\n${staged}`.split('\n').filter(Boolean))].sort();
    },

    changedPathsBetween(root, from, to) {
      const output = run(root, ['diff', '--name-only', '--diff-filter=ACDMRTUXB', from, to, '--']);
      return output.split('\n').filter(Boolean).sort();
    },

    trackedArtifact(root, relative) {
      return {
        worktree: readFileSync(path.join(root, relative)),
        index: run(root, ['show', `:${relative}`], { buffer: true }),
        head: run(root, ['show', `HEAD:${relative}`], { buffer: true }),
        commit: run(root, ['rev-parse', 'HEAD']).trim(),
        blob: run(root, ['rev-parse', `HEAD:${relative}`]).trim(),
      };
    },

    resolveReachableCommit(root, revision) {
      const resolved = run(root, ['rev-parse', '--verify', `${revision}^{commit}`], {
        allowFailure: true,
      });
      if (resolved === null) return { commit: null, reachable: false };
      const commit = resolved.trim();
      const reachable = run(root, ['merge-base', '--is-ancestor', commit, 'HEAD'], {
        allowFailure: true,
      });
      return { commit, reachable: reachable !== null };
    },

    committedArtifact(root, commit, relative) {
      const bytes = run(root, ['show', `${commit}:${relative}`], {
        buffer: true,
        allowFailure: true,
      });
      if (bytes === null) return null;
      const blob = run(root, ['rev-parse', `${commit}:${relative}`], { allowFailure: true });
      return blob === null ? null : { bytes, blob: blob.trim() };
    },

    identity(root) {
      return {
        branch: run(root, ['branch', '--show-current']).trim(),
        head: run(root, ['rev-parse', 'HEAD']).trim(),
      };
    },
  });
}

export const REAL_REPOSITORY_BOUNDARY = createRealRepositoryBoundary();
