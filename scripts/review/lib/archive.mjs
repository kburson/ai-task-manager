// @story #1268

import { execFileSync } from 'node:child_process';
import { existsSync, realpathSync } from 'node:fs';
import path from 'node:path';

function fail(code, detail) {
  const error = new Error(`co-review:${code}:${detail}; no state changed`);
  error.code = code;
  error.exitCode = 1;
  throw error;
}

function git(cwd, args, { allowFailure = false } = {}) {
  try {
    return execFileSync('git', args, {
      cwd,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: false,
    });
  } catch (error) {
    if (allowFailure) return null;
    fail('git', error.stderr?.toString().trim() || args.join(' '));
  }
}

function repositoryRoot(cwd) {
  return realpathSync(git(cwd, ['rev-parse', '--show-toplevel']).trim());
}

function containedPath(root, candidate, label) {
  if (!String(candidate ?? '').trim() || path.isAbsolute(candidate)) {
    fail('path-outside-repository', `${label}=${String(candidate)}`);
  }
  const absolute = path.resolve(root, candidate);
  const relative = path.relative(root, absolute);
  if (
    !relative ||
    relative === '..' ||
    relative.startsWith(`..${path.sep}`) ||
    path.isAbsolute(relative)
  ) {
    fail('path-outside-repository', `${label}=${candidate}`);
  }
  let existing = absolute;
  const suffix = [];
  while (!existsSync(existing)) {
    const parent = path.dirname(existing);
    if (parent === existing) fail('path-resolution', `${label}=${candidate}`);
    suffix.unshift(path.basename(existing));
    existing = parent;
  }
  const physical = path.resolve(realpathSync(existing), ...suffix);
  const physicalRelative = path.relative(root, physical);
  if (
    !physicalRelative ||
    physicalRelative === '..' ||
    physicalRelative.startsWith(`..${path.sep}`) ||
    path.isAbsolute(physicalRelative)
  ) {
    fail('path-outside-repository', `${label}=${candidate}`);
  }
  return {
    absolute: physical,
    relative: physicalRelative.split(path.sep).join('/'),
  };
}

function inside(parent, candidate) {
  const relative = path.relative(parent, candidate);
  return (
    !relative ||
    (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative))
  );
}

export function resolveArchiveDestination({ cwd = process.cwd(), archiveDir, runtimeDir } = {}) {
  const root = repositoryRoot(cwd);
  const archive = containedPath(root, archiveDir, 'archive-dir');
  const runtime = containedPath(root, runtimeDir, 'dir');
  if (inside(runtime.absolute, archive.absolute)) {
    fail('archive-runtime-conflict', archive.relative);
  }
  if (
    git(root, ['check-ignore', '--quiet', '--', archive.relative], { allowFailure: true }) !== null
  ) {
    fail('archive-ignored', archive.relative);
  }
  return Object.freeze(archive);
}
