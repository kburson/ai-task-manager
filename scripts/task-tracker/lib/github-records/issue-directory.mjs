import { canonicalRecordJson } from './canonical-json.mjs';
import { locateAuthoritySource } from './authority-locator.mjs';

const DIRECTORY_SCHEMA = 'aitm.directory/v1';
const DIRECTORY_KEYS = ['issueNodeId', 'revision', 'schema', 'singletons'];
export const SINGLETON_KINDS = Object.freeze([
  'delivery-contract',
  'coordination',
  'evidence-projection',
  'timing',
]);
const DIRECTORY_MARKER_RE = /<!--\s*aitm-directory(?=\s|-->)/g;

function directoryError(category) {
  return new TypeError(`issue-directory:${category}`);
}

function hasExactlyKeys(value, expectedKeys) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const keys = Object.keys(value).sort();
  const expected = [...expectedKeys].sort();
  return keys.length === expected.length && keys.every((key, index) => key === expected[index]);
}

function isOpaqueId(value) {
  return (
    typeof value === 'string' &&
    value.length > 0 &&
    value.length <= 256 &&
    value === value.trim() &&
    ![...value].some((character) => {
      const code = character.charCodeAt(0);
      return code <= 0x1f || code === 0x7f;
    })
  );
}

function normalizeDirectory(value) {
  if (!hasExactlyKeys(value, DIRECTORY_KEYS)) throw directoryError('invalid');
  if (value.schema !== DIRECTORY_SCHEMA) throw directoryError('unsupported');
  if (value.revision !== 1 || !isOpaqueId(value.issueNodeId)) throw directoryError('invalid');
  if (!hasExactlyKeys(value.singletons, SINGLETON_KINDS)) throw directoryError('invalid');
  if (Object.values(value.singletons).some((nodeId) => !isOpaqueId(nodeId))) {
    throw directoryError('invalid');
  }
  if (new Set(Object.values(value.singletons)).size !== SINGLETON_KINDS.length) {
    throw directoryError('duplicate-singleton');
  }
  return Object.freeze({
    issueNodeId: value.issueNodeId,
    revision: 1,
    schema: DIRECTORY_SCHEMA,
    singletons: Object.freeze(
      Object.fromEntries(SINGLETON_KINDS.map((kind) => [kind, value.singletons[kind]]))
    ),
  });
}

function mapLocatorError(error) {
  const category = /^authority-directory:([a-z-]+)$/.exec(error?.message ?? '')?.[1];
  if (category === 'duplicate' || category === 'malformed' || category === 'unsupported') {
    throw directoryError(category);
  }
  throw directoryError('invalid');
}

export function createIssueDirectory({ issueNodeId, singletons } = {}) {
  return normalizeDirectory({
    schema: DIRECTORY_SCHEMA,
    revision: 1,
    issueNodeId,
    singletons,
  });
}

/**
 * Reads exactly one body-resident directory. A body without a directory is a
 * legacy body and returns null; malformed or unknown directories fail closed.
 */
export function parseIssueDirectory({ issueBody } = {}) {
  if (typeof issueBody !== 'string') throw directoryError('input');
  if ([...issueBody.matchAll(DIRECTORY_MARKER_RE)].length === 0) return null;
  let located;
  try {
    located = locateAuthoritySource({ issueBody });
  } catch (error) {
    mapLocatorError(error);
  }
  if (located.kind !== 'github-records/v1') throw directoryError('invalid');
  return normalizeDirectory(located.directory);
}

export function renderIssueDirectory(directory) {
  const normalized = normalizeDirectory(directory);
  // A directory is embedded in an HTML comment. Escaping each double hyphen in
  // canonical JSON is value-preserving after JSON parsing and leaves the one
  // closing delimiter as the only literal comment terminator.
  const encoded = canonicalRecordJson(normalized).replaceAll('--', '-\\u002d');
  return `<!-- aitm-directory\n${encoded}\n-->`;
}

export function singletonLogicalIdentity({ repository, issue, kind } = {}) {
  if (
    typeof repository !== 'string' ||
    !/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository) ||
    !Number.isInteger(issue) ||
    issue <= 0 ||
    !SINGLETON_KINDS.includes(kind)
  ) {
    throw directoryError('identity');
  }
  return `aitm.singleton/v1:${repository}#${issue}:${kind}`;
}
