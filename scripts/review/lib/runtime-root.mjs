import { realpathSync } from 'node:fs';
import path from 'node:path';

export class RuntimeRootError extends Error {
  constructor(code, detail) {
    super(`${code}: ${detail}`);
    this.name = 'RuntimeRootError';
    this.code = code;
    this.detail = detail;
  }
}

function canonicalRepositoryRoot(repository, candidate) {
  try {
    return realpathSync(repository.repositoryRoot(candidate));
  } catch (error) {
    throw new RuntimeRootError(
      'not-a-repository',
      error.stderr?.toString().trim() || String(candidate)
    );
  }
}

function commonDirectory(repository, root) {
  if (typeof repository.commonDirectory !== 'function') {
    throw new RuntimeRootError('repository-identity', `${root} has no common-directory boundary`);
  }
  try {
    return realpathSync(repository.commonDirectory(root));
  } catch (error) {
    throw new RuntimeRootError(
      'repository-identity',
      error.stderr?.toString().trim() || String(root)
    );
  }
}

export function resolveRuntimeRoot({ cwd = process.cwd(), dir, repository }) {
  const callerRoot = canonicalRepositoryRoot(repository, cwd);
  if (!path.isAbsolute(String(dir || ''))) return { callerRoot, root: callerRoot };

  const runtime = path.resolve(String(dir));
  const root = canonicalRepositoryRoot(repository, runtime);
  if (root !== callerRoot) {
    const callerCommon = commonDirectory(repository, callerRoot);
    const runtimeCommon = commonDirectory(repository, root);
    if (callerCommon !== runtimeCommon) {
      throw new RuntimeRootError('repository-identity', `${runtime} is not a linked worktree`);
    }
  }
  return { callerRoot, root };
}
