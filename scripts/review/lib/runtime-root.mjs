import { existsSync, realpathSync } from 'node:fs';
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

function nearestExistingAncestor(candidate) {
  let current = path.resolve(candidate);
  while (!existsSync(current)) {
    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }
  return current;
}

function runtimeRepositoryRoot(repository, runtimePath, callerRoot) {
  try {
    return canonicalRepositoryRoot(repository, nearestExistingAncestor(runtimePath));
  } catch (error) {
    const relative = path.relative(callerRoot, runtimePath);
    const lexicallyInside =
      relative &&
      relative !== '..' &&
      !relative.startsWith(`..${path.sep}`) &&
      !path.isAbsolute(relative);
    // A lexically contained runtime symlink may physically target an external
    // non-repository directory. Route it through protocol path containment so
    // the caller receives the precise path-outside-repository diagnostic.
    if (lexicallyInside && error instanceof RuntimeRootError && error.code === 'not-a-repository') {
      return callerRoot;
    }
    throw error;
  }
}

export function resolveRuntimeRoot({ cwd = process.cwd(), dir, repository }) {
  const callerRoot = canonicalRepositoryRoot(repository, cwd);
  const runtimePath = path.resolve(callerRoot, String(dir || ''));
  const root = runtimeRepositoryRoot(repository, runtimePath, callerRoot);
  if (root !== callerRoot) {
    throw new RuntimeRootError('repository-identity', `caller=${callerRoot}; runtime=${root}`);
  }
  return { callerRoot, root };
}
