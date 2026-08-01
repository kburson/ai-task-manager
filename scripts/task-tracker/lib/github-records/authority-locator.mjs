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

function hasDuplicateObjectMembers(json) {
  let index = 0;
  let hasDuplicate = false;

  function fail() {
    throw new SyntaxError('invalid JSON');
  }

  function skipWhitespace() {
    while (' \n\r\t'.includes(json[index])) index += 1;
  }

  function parseString() {
    if (json[index] !== '"') fail();
    const start = index;
    index += 1;

    while (index < json.length) {
      const character = json[index];
      if (character === '"') {
        index += 1;
        return JSON.parse(json.slice(start, index));
      }
      if (character.charCodeAt(0) < 0x20) fail();
      if (character === '\\') {
        index += 1;
        const escape = json[index];
        if (['"', '\\', '/', 'b', 'f', 'n', 'r', 't'].includes(escape)) index += 1;
        else if (escape === 'u' && /^[0-9a-fA-F]{4}$/.test(json.slice(index + 1, index + 5))) {
          index += 5;
        } else fail();
      } else {
        index += 1;
      }
    }

    fail();
  }

  function parseValue() {
    skipWhitespace();
    if (json[index] === '{') return parseObject();
    if (json[index] === '[') return parseArray();
    if (json[index] === '"') return parseString();

    for (const literal of ['true', 'false', 'null']) {
      if (json.startsWith(literal, index)) {
        index += literal.length;
        return;
      }
    }

    const number = json.slice(index).match(/^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/);
    if (!number) fail();
    index += number[0].length;
  }

  function parseObject() {
    index += 1;
    skipWhitespace();
    const members = new Set();
    if (json[index] === '}') {
      index += 1;
      return;
    }

    while (true) {
      skipWhitespace();
      const key = parseString();
      if (members.has(key)) hasDuplicate = true;
      members.add(key);
      skipWhitespace();
      if (json[index] !== ':') fail();
      index += 1;
      parseValue();
      skipWhitespace();
      if (json[index] === '}') {
        index += 1;
        return;
      }
      if (json[index] !== ',') fail();
      index += 1;
    }
  }

  function parseArray() {
    index += 1;
    skipWhitespace();
    if (json[index] === ']') {
      index += 1;
      return;
    }

    while (true) {
      parseValue();
      skipWhitespace();
      if (json[index] === ']') {
        index += 1;
        return;
      }
      if (json[index] !== ',') fail();
      index += 1;
    }
  }

  parseValue();
  skipWhitespace();
  if (index !== json.length) fail();
  return hasDuplicate;
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

  const payload = issueBody.slice(payloadStart, payloadEnd).trim();
  let hasDuplicate;
  try {
    hasDuplicate = hasDuplicateObjectMembers(payload);
  } catch {
    throw directoryError('malformed');
  }
  if (hasDuplicate) throw directoryError('duplicate');

  try {
    return JSON.parse(payload);
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
