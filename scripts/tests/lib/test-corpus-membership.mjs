// @story #1263
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

import { parseCanonicalTestPath } from '../../task-tracker/lib/test-lanes.mjs';

export const POST_SNAPSHOT_REGISTRY_ROOT = 'scripts/tests/fixtures/test-corpus-post-snapshot';

export function recordPathForTestPath(testPath) {
  const parsed = parseCanonicalTestPath(testPath);
  if (!parsed) {
    throw new TypeError(`test-corpus-membership: noncanonical test path: ${testPath}`);
  }
  return `${POST_SNAPSHOT_REGISTRY_ROOT}/${parsed.lane}/${parsed.relative}.json`;
}

export function finalizedFrozenPaths(manifest) {
  const corrections = new Map(
    (manifest.laneCorrections || []).map(({ migrationPath, finalPath }) => [
      migrationPath,
      finalPath,
    ])
  );
  const paths = (manifest.tests || []).map(({ newPath }) => corrections.get(newPath) || newPath);
  if (new Set(paths).size !== paths.length) {
    throw new TypeError('test-corpus-membership: duplicate finalized frozen path');
  }
  return paths.sort();
}

function posixRelative(projectRoot, absolutePath) {
  return path.relative(projectRoot, absolutePath).split(path.sep).join('/');
}

function comparePosix(left, right) {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

function listJsonFiles(projectRoot, directory, errors, isRegistryRoot = false) {
  let entries;
  try {
    entries = readdirSync(directory, { withFileTypes: true });
  } catch (error) {
    errors.push({
      recordFile: posixRelative(projectRoot, directory),
      error: `test-corpus-membership: ${
        isRegistryRoot
          ? 'registry root is unreadable or not a directory'
          : 'unreadable registry directory'
      }: ${error.message}`,
    });
    return [];
  }

  const files = [];
  for (const entry of entries.sort((left, right) => comparePosix(left.name, right.name))) {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...listJsonFiles(projectRoot, absolute, errors));
    } else if (entry.isFile() && entry.name.endsWith('.json')) {
      files.push(absolute);
    }
  }
  return files;
}

function malformedError(recordFile, error) {
  return { recordFile, error: `test-corpus-membership: ${error}` };
}

export function loadPostSnapshotRecords({
  projectRoot,
  registryRoot = POST_SNAPSHOT_REGISTRY_ROOT,
}) {
  const root = path.join(projectRoot, registryRoot);
  if (!existsSync(root)) {
    return { records: [], errors: [], misplacedRecords: [], rootPresent: false };
  }

  const errors = [];
  const records = [];
  const misplacedRecords = [];
  const recordFiles = listJsonFiles(projectRoot, root, errors, true).sort((left, right) =>
    comparePosix(posixRelative(projectRoot, left), posixRelative(projectRoot, right))
  );
  const declaredPaths = new Set();

  for (const absoluteRecordFile of recordFiles) {
    const recordFile = posixRelative(projectRoot, absoluteRecordFile);
    let record;
    try {
      record = JSON.parse(readFileSync(absoluteRecordFile, 'utf8'));
    } catch (error) {
      errors.push(
        malformedError(recordFile, `invalid JSON or unreadable record: ${error.message}`)
      );
      continue;
    }

    if (
      !record ||
      Array.isArray(record) ||
      typeof record !== 'object' ||
      JSON.stringify(Object.keys(record).sort()) !== JSON.stringify(['path', 'schema'])
    ) {
      errors.push(malformedError(recordFile, 'record keys must equal path, schema'));
      continue;
    }
    if (!Number.isInteger(record.schema) || record.schema !== 1) {
      errors.push(malformedError(recordFile, 'record schema must be integer 1'));
      continue;
    }
    if (typeof record.path !== 'string' || !parseCanonicalTestPath(record.path)) {
      errors.push(malformedError(recordFile, `noncanonical test path: ${String(record.path)}`));
      continue;
    }
    if (declaredPaths.has(record.path)) {
      errors.push(malformedError(recordFile, `duplicate declared path: ${record.path}`));
      continue;
    }

    declaredPaths.add(record.path);
    const normalizedRecord = { recordFile, schema: record.schema, path: record.path };
    records.push(normalizedRecord);
    const expectedRecordFile = recordPathForTestPath(record.path);
    if (recordFile !== expectedRecordFile) {
      misplacedRecords.push({ recordFile, expectedRecordFile, path: record.path });
    }
  }

  return { records, errors, misplacedRecords, rootPresent: true };
}
