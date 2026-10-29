// @story #2088
// @story #2106
// Read-only diagnostic output, never an authority record or mutation admission.
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const helperModuleUrl = import.meta.url;
const byteLimit = 16 * 1024 * 1024;
const hasDotTraversal = (value) =>
  value.split(/[\\/]/).some((part) => part === '.' || part === '..');
const hasTrailingSeparator = (value) => /[\\/]$/.test(value);
const within = (root, target) => {
  const relative = path.relative(root, target);
  return relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
};
function unavailable(reason, status = 'unavailable', links = []) {
  return { status, reason, kind: null, resolvedPath: null, sha256: null, links };
}

// Do not call Node package resolution or realpath on an unexamined candidate:
// either can inspect ancestor/outside paths before its result is checked.
function resolveContained(root, absolute) {
  const links = [],
    visited = new Set();
  if (!within(root, absolute)) return unavailable('outside-project', 'outside-refused');
  let current = root,
    stat = fs.lstatSync(root);
  if (stat.isSymbolicLink() || !stat.isDirectory()) return unavailable('project-root-not-physical');
  const rootStat = stat;
  let pending = path.relative(root, absolute).split(path.sep).filter(Boolean);
  while (pending.length) {
    current = path.join(current, pending.shift());
    stat = fs.lstatSync(current);
    if (stat.isSymbolicLink()) {
      const target = fs.readlinkSync(current);
      links.push({ path: current, target });
      if (hasDotTraversal(target) || hasTrailingSeparator(target))
        return unavailable('noncanonical-link-target', 'unavailable', links);
      const key = `${current}\0${pending.join(path.sep)}`;
      if (visited.has(key) || links.length > 40)
        return unavailable('symlink-cycle', 'unavailable', links);
      visited.add(key);
      const expanded = path.resolve(path.dirname(current), target);
      if (!within(root, expanded)) return unavailable('outside-project', 'outside-refused', links);
      pending = [...path.relative(root, expanded).split(path.sep).filter(Boolean), ...pending];
      current = root;
      stat = rootStat;
    } else if (pending.length && !stat.isDirectory()) {
      return unavailable('non-directory-component', 'missing', links);
    }
  }
  return { status: 'present', resolvedPath: current, stat, links };
}
const sameFile = (left, right) =>
  left.dev === right.dev &&
  left.ino === right.ino &&
  left.size === right.size &&
  left.mtimeMs === right.mtimeMs;

export function inspectRuntimePath({ projectRoot, candidate } = {}) {
  // The caller supplies an already-established physical project root. Reject
  // raw dot traversal before normalization: symlink/.. is not lexical .. .
  if (
    typeof projectRoot !== 'string' ||
    !path.isAbsolute(projectRoot) ||
    typeof candidate !== 'string' ||
    candidate.includes('\0') ||
    hasDotTraversal(projectRoot) ||
    hasDotTraversal(candidate) ||
    hasTrailingSeparator(candidate) ||
    path.resolve(projectRoot) !== projectRoot
  ) {
    return unavailable('invalid-path');
  }
  const root = path.resolve(projectRoot),
    absolute = path.resolve(root, candidate);
  if (!within(root, absolute)) return unavailable('outside-project', 'outside-refused');
  try {
    const observed = resolveContained(root, absolute);
    if (observed.status !== 'present') return observed;
    const { stat, resolvedPath, links } = observed;
    if (!stat.isFile()) {
      return {
        status: 'present',
        kind: stat.isDirectory() ? 'directory' : 'other',
        resolvedPath,
        sha256: null,
        links,
      };
    }
    if (stat.size > byteLimit) return unavailable('file-too-large');
    const descriptor = fs.openSync(resolvedPath, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
    let bytes;
    try {
      if (!sameFile(stat, fs.fstatSync(descriptor)))
        return unavailable('changed-during-observation');
      const beforeRead = resolveContained(root, absolute);
      if (
        beforeRead.status !== 'present' ||
        beforeRead.resolvedPath !== resolvedPath ||
        !sameFile(stat, beforeRead.stat)
      ) {
        return unavailable('changed-during-observation');
      }
      // Bound the descriptor read itself, even if a file grows after its stat.
      bytes = Buffer.alloc(stat.size);
      let offset = 0;
      while (offset < bytes.length) {
        const count = fs.readSync(descriptor, bytes, offset, bytes.length - offset, offset);
        if (!count) return unavailable('changed-during-observation');
        offset += count;
      }
      const afterRead = resolveContained(root, absolute);
      if (
        afterRead.status !== 'present' ||
        afterRead.resolvedPath !== resolvedPath ||
        !sameFile(stat, afterRead.stat) ||
        !sameFile(stat, fs.fstatSync(descriptor))
      ) {
        return unavailable('changed-during-observation');
      }
    } finally {
      fs.closeSync(descriptor);
    }
    return {
      status: 'present',
      kind: 'file',
      resolvedPath,
      size: bytes.length,
      sha256: createHash('sha256').update(bytes).digest('hex'),
      links,
    };
  } catch (error) {
    return unavailable(
      error.code || 'inspection-failed',
      error.code === 'ENOENT' || error.code === 'ENOTDIR' ? 'missing' : 'unavailable'
    );
  }
}

export function predictRuntimeEntrypoint({ projectRoot, relativeEntrypoint } = {}) {
  const evidence = 'configuration-prediction-not-execution';
  if (
    typeof relativeEntrypoint !== 'string' ||
    path.isAbsolute(relativeEntrypoint) ||
    relativeEntrypoint.split(/[\\/]/).includes('..')
  ) {
    return { selection: 'unavailable', selected: null, loadableFile: false, evidence };
  }
  for (const [selection, candidate] of [
    ['scoped-package', `node_modules/@kburson/ai-task-manager/${relativeEntrypoint}`],
    ['repository', relativeEntrypoint],
  ]) {
    const observed = inspectRuntimePath({ projectRoot, candidate });
    if (observed.status === 'present')
      return { selection, selected: observed, loadableFile: observed.kind === 'file', evidence };
    if (observed.status !== 'missing')
      return {
        selection: 'unavailable',
        selected: null,
        loadableFile: false,
        evidence,
        refusal: observed,
      };
  }
  return { selection: 'missing', selected: null, loadableFile: false, evidence };
}

function moduleFile(projectRoot, url) {
  try {
    return inspectRuntimePath({ projectRoot, candidate: fileURLToPath(url) });
  } catch {
    return unavailable('non-file-module-url');
  }
}
export function observeRuntimeProvenance({
  projectRoot,
  callerModuleUrl = null,
  dependencyCandidates = [],
  configPaths = [],
  entrypoints = [],
} = {}) {
  return {
    schema: 'aitm.runtime-observation/v1',
    helperModule: {
      url: helperModuleUrl,
      evidence: 'actual-helper-module-only',
      file: moduleFile(projectRoot, helperModuleUrl),
    },
    callerMetadata:
      callerModuleUrl === null
        ? null
        : {
            url: callerModuleUrl,
            evidence: 'caller-supplied-not-origin-proof',
            file: moduleFile(projectRoot, callerModuleUrl),
          },
    processFacts: {
      execPath: process.execPath,
      version: process.version,
      executableBytes: 'unverified-trusted-toolchain',
      argvEntrypoint: process.argv[1] ?? null,
      argvEntrypointVerified: false,
    },
    dependencies: dependencyCandidates.map((candidate) => ({
      candidate,
      evidence: 'caller-listed-candidate-not-node-resolution',
      file: inspectRuntimePath({ projectRoot, candidate }),
    })),
    configuration: configPaths.map((candidate) => inspectRuntimePath({ projectRoot, candidate })),
    entrypointPredictions: entrypoints.map((relativeEntrypoint) => ({
      relativeEntrypoint,
      ...predictRuntimeEntrypoint({ projectRoot, relativeEntrypoint }),
    })),
  };
}
