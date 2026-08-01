// Read-side authority classification for GitHub-native records. This boundary
// is deliberately pure: lifecycle consumers continue reading legacy bodies
// until a later delivery slice wires the locator into their adapters.

const DIRECTORY_MARKER_RE = /<!--\s*aitm-directory(?=\s|-->)/g;
const DIRECTORY_SCHEMA = 'aitm.directory/v1';
const DIRECTORY_KEYS = ['issueNodeId', 'revision', 'schema', 'singletons'];
const SINGLETON_KEYS = ['coordination', 'delivery-contract', 'evidence-projection', 'timing'];

function directoryError(category) {
  return new TypeError(`authority-directory:${category}`);
}

function hasExactlyKeys(value, expectedKeys) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const keys = Object.keys(value).sort();
  return (
    keys.length === expectedKeys.length && keys.every((key, index) => key === expectedKeys[index])
  );
}

function parseDirectory(issueBody) {
  const matches = [...issueBody.matchAll(DIRECTORY_MARKER_RE)];
  if (matches.length === 0) return null;
  if (matches.length !== 1) throw directoryError('duplicate');

  const match = matches[0];
  const payloadStart = match.index + match[0].length;
  const payloadEnd = issueBody.indexOf('-->', payloadStart);
  if (payloadEnd === -1) throw directoryError('malformed');

  try {
    return JSON.parse(issueBody.slice(payloadStart, payloadEnd).trim());
  } catch {
    throw directoryError('malformed');
  }
}

function validateDirectory(directory) {
  if (!hasExactlyKeys(directory, DIRECTORY_KEYS)) throw directoryError('invalid');
  if (directory.schema !== DIRECTORY_SCHEMA) throw directoryError('unsupported');
  if (
    directory.revision !== 1 ||
    typeof directory.issueNodeId !== 'string' ||
    !directory.issueNodeId
  ) {
    throw directoryError('invalid');
  }
  if (!hasExactlyKeys(directory.singletons, SINGLETON_KEYS)) throw directoryError('invalid');
  if (Object.values(directory.singletons).some((nodeId) => typeof nodeId !== 'string' || !nodeId)) {
    throw directoryError('invalid');
  }

  return Object.freeze({
    schema: directory.schema,
    revision: directory.revision,
    issueNodeId: directory.issueNodeId,
    singletons: Object.freeze({ ...directory.singletons }),
  });
}

/**
 * Classifies the governing authority for one issue body without fetching,
 * mutating, or interpreting any lifecycle data.
 *
 * @param {{ issueBody?: string }} input
 * @returns {{ kind: 'legacy-body/v1' } | { kind: 'github-records/v1', directory: object }}
 */
export function locateAuthoritySource({ issueBody } = {}) {
  const directory = parseDirectory(String(issueBody ?? ''));
  if (directory === null) return Object.freeze({ kind: 'legacy-body/v1' });
  return Object.freeze({ kind: 'github-records/v1', directory: validateDirectory(directory) });
}
