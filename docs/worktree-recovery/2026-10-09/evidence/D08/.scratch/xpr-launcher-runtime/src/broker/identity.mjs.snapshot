import { createHash } from 'node:crypto';
import path from 'node:path';

import { AprError } from '../errors.mjs';

const ROOT_SCHEMA = 'ai-peer-review.broker-root/v1';

function invalid(message, details = {}) {
  return new AprError('APR_BROKER_PATH_INVALID', message, {
    recovery: 'Use a canonical project path and retry broker startup.',
    details,
  });
}

function pathApi(platform) {
  return platform?.kind === 'win32' ? path.win32 : path.posix;
}

function canonicalPath(platform, value, label) {
  if (typeof platform?.canonicalPath !== 'function') {
    throw invalid('Broker platform cannot canonicalize paths.', { label });
  }
  const resolved = platform.canonicalPath(value);
  if (typeof resolved !== 'string' || !resolved || !pathApi(platform).isAbsolute(resolved)) {
    throw invalid('Broker path is not a canonical absolute path.', { label, value: resolved });
  }
  return resolved;
}

function projectLocation(platform, cwd) {
  const observed = platform?.repository?.physicalLocation?.(cwd) ?? null;
  if (observed === null) {
    return { physicalRoot: canonicalPath(platform, cwd, 'project root'), commonDirectory: null };
  }
  if (!observed || typeof observed !== 'object') {
    throw invalid('Broker platform returned an invalid project location.');
  }
  return {
    physicalRoot: canonicalPath(platform, observed.physicalRoot, 'project root'),
    commonDirectory:
      observed.commonDirectory === null
        ? null
        : canonicalPath(platform, observed.commonDirectory, 'Git common directory'),
  };
}

function canonicalUserId(platform) {
  if (typeof platform?.userId !== 'function') {
    throw invalid('Broker platform cannot identify the operating-system user.');
  }
  const value = platform.userId();
  if (typeof value !== 'string' || !value.trim()) {
    throw invalid('Broker platform returned an invalid operating-system user ID.');
  }
  return value;
}

export function rootDigest(tuple) {
  if (
    !Array.isArray(tuple) ||
    tuple.length !== 4 ||
    tuple[0] !== ROOT_SCHEMA ||
    typeof tuple[1] !== 'string' ||
    (tuple[2] !== null && typeof tuple[2] !== 'string') ||
    typeof tuple[3] !== 'string'
  ) {
    throw invalid('Broker root identity tuple is invalid.');
  }
  return createHash('sha256').update(JSON.stringify(tuple), 'utf8').digest('hex');
}

export function canonicalProjectIdentity({ cwd, platform } = {}) {
  const { physicalRoot, commonDirectory } = projectLocation(platform, cwd);
  const userId = canonicalUserId(platform);
  const tuple = Object.freeze([ROOT_SCHEMA, physicalRoot, commonDirectory, userId]);
  return Object.freeze({
    tuple,
    digest: rootDigest(tuple),
    physicalRoot,
    commonDirectory,
    userId,
  });
}
