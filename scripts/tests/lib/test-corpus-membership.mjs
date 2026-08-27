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
    } else {
      declaredPaths.add(record.path);
    }

    const normalizedRecord = { recordFile, schema: record.schema, path: record.path };
    records.push(normalizedRecord);
    const expectedRecordFile = recordPathForTestPath(record.path);
    if (recordFile !== expectedRecordFile) {
      misplacedRecords.push({ recordFile, expectedRecordFile, path: record.path });
    }
  }

  return { records, errors, misplacedRecords, rootPresent: true };
}

function sortedStrings(values) {
  return [...values].sort(comparePosix);
}

function sortRecordErrors(errors) {
  return [...errors].sort((left, right) => {
    const fileComparison = comparePosix(left.recordFile, right.recordFile);
    return fileComparison || comparePosix(left.error, right.error);
  });
}

function sortMisplacedRecords(records) {
  return [...records].sort((left, right) => {
    const fileComparison = comparePosix(left.recordFile, right.recordFile);
    return (
      fileComparison ||
      comparePosix(left.expectedRecordFile, right.expectedRecordFile) ||
      comparePosix(left.path, right.path)
    );
  });
}

function sortRetirementErrors(errors) {
  return [...errors].sort((left, right) => {
    const fileComparison = comparePosix(left.receiptFile, right.receiptFile);
    return fileComparison || comparePosix(left.error, right.error);
  });
}

function sortMisplacedRetirements(retirements) {
  return [...retirements].sort((left, right) => {
    const fileComparison = comparePosix(left.receiptFile, right.receiptFile);
    return (
      fileComparison ||
      comparePosix(left.expectedReceiptFile, right.expectedReceiptFile) ||
      comparePosix(left.path, right.path)
    );
  });
}

/**
 * Reconciles canonical live test discovery with frozen and record authorities.
 *
 * @param {object} input reconciliation inputs
 * @returns {object} exact membership result and deterministic diagnostics data
 */
export function reconcileCorpusMembership({
  discovered,
  frozenPaths,
  records,
  recordErrors = [],
  misplacedRecords = [],
  retirements = [],
  retirementErrors = [],
  misplacedRetirements = [],
}) {
  const noncanonicalDiscoveredPaths = sortedStrings(
    discovered.filter((testPath) => !parseCanonicalTestPath(testPath))
  );
  const canonicalDiscovered = sortedStrings(
    discovered.filter((testPath) => parseCanonicalTestPath(testPath))
  );
  const canonicalDiscoveredSet = new Set(canonicalDiscovered);
  const frozen = new Set(frozenPaths);
  const declaredRecords = new Map();
  const declaredRetirements = new Map();

  for (const record of records) {
    const entries = declaredRecords.get(record.path) || [];
    entries.push(record);
    declaredRecords.set(record.path, entries);
  }

  for (const retirement of retirements) {
    const entries = declaredRetirements.get(retirement.path) || [];
    entries.push(retirement);
    declaredRetirements.set(retirement.path, entries);
  }

  const duplicatePaths = [...declaredRecords.entries()]
    .filter(([, declarations]) => declarations.length > 1)
    .map(([path, declarations]) => ({
      path,
      recordFiles: sortedStrings(declarations.map(({ recordFile }) => recordFile)),
    }))
    .sort((left, right) => comparePosix(left.path, right.path));

  const overlapPaths = [...declaredRecords.entries()]
    .filter(([testPath]) => frozen.has(testPath))
    .map(([path, declarations]) => ({
      path,
      recordFiles: sortedStrings(declarations.map(({ recordFile }) => recordFile)),
    }))
    .sort((left, right) => comparePosix(left.path, right.path));

  const duplicateRetirementPaths = [...declaredRetirements.entries()]
    .filter(([, declarations]) => declarations.length > 1)
    .map(([path, declarations]) => ({
      path,
      receiptFiles: sortedStrings(declarations.map(({ receiptFile }) => receiptFile)),
    }))
    .sort((left, right) => comparePosix(left.path, right.path));

  const invalidRetirementAuthorityPaths = [...declaredRetirements.entries()]
    .flatMap(([path, declarations]) => {
      if (!frozen.has(path)) {
        return [
          {
            path,
            receiptFiles: sortedStrings(declarations.map(({ receiptFile }) => receiptFile)),
            reason: 'is not a finalized frozen path',
          },
        ];
      }
      if (declaredRecords.has(path)) {
        return [
          {
            path,
            receiptFiles: sortedStrings(declarations.map(({ receiptFile }) => receiptFile)),
            reason: 'overlaps a post-snapshot membership record',
          },
        ];
      }
      return [];
    })
    .sort((left, right) => comparePosix(left.path, right.path));

  const receiptTestOverlapPaths = [...declaredRetirements.entries()]
    .filter(([testPath]) => canonicalDiscoveredSet.has(testPath))
    .map(([path, declarations]) => ({
      path,
      receiptFiles: sortedStrings(declarations.map(({ receiptFile }) => receiptFile)),
    }))
    .sort((left, right) => comparePosix(left.path, right.path));

  const invalidRetirementPaths = new Set([
    ...duplicateRetirementPaths.map(({ path }) => path),
    ...invalidRetirementAuthorityPaths.map(({ path }) => path),
    ...receiptTestOverlapPaths.map(({ path }) => path),
  ]);
  const retired = new Set(
    [...declaredRetirements.entries()]
      .filter(
        ([testPath, declarations]) =>
          declarations.length === 1 && !invalidRetirementPaths.has(testPath)
      )
      .map(([testPath]) => testPath)
  );
  const activeFrozen = new Set(frozenPaths.filter((testPath) => !retired.has(testPath)));

  const declaredPaths = new Set(declaredRecords.keys());
  const declaredMembership = new Set([...activeFrozen, ...declaredPaths]);
  const undeclaredPaths = canonicalDiscovered.filter(
    (testPath) => !declaredMembership.has(testPath)
  );
  const missingPaths = [
    ...[...activeFrozen]
      .filter((testPath) => !canonicalDiscoveredSet.has(testPath))
      .map((path) => ({ path, authority: 'frozen', recordFile: null })),
    ...[...declaredRecords.entries()]
      .filter(([testPath]) => !canonicalDiscoveredSet.has(testPath))
      .map(([path, declarations]) => ({
        path,
        authority: 'record',
        recordFile: declarations[0].recordFile,
      })),
  ].sort((left, right) => {
    const pathComparison = comparePosix(left.path, right.path);
    return pathComparison || comparePosix(left.authority, right.authority);
  });
  const malformedRecords = sortRecordErrors(recordErrors);
  const sortedMisplacedRecords = sortMisplacedRecords(misplacedRecords);
  const malformedRetirements = sortRetirementErrors(retirementErrors);
  const sortedMisplacedRetirements = sortMisplacedRetirements(misplacedRetirements);
  const counts = { all: 0, unit: 0, integration: 0, slow: 0 };

  for (const testPath of canonicalDiscovered) {
    counts.all += 1;
    counts[parseCanonicalTestPath(testPath).lane] += 1;
  }

  const result = {
    ok: false,
    noncanonicalDiscoveredPaths,
    undeclaredPaths,
    missingPaths,
    duplicatePaths,
    overlapPaths,
    duplicateRetirementPaths,
    invalidRetirementAuthorityPaths,
    receiptTestOverlapPaths,
    malformedRecords,
    misplacedRecords: sortedMisplacedRecords,
    malformedRetirements,
    misplacedRetirements: sortedMisplacedRetirements,
    counts,
  };
  result.ok = Object.entries(result)
    .filter(([key]) => key !== 'ok' && key !== 'counts')
    .every(([, value]) => value.length === 0);
  return result;
}

function formatRecordFiles(recordFiles) {
  return sortedStrings(recordFiles)
    .map((recordFile) => `  ${recordFile}`)
    .join('\n');
}

/**
 * Formats deterministic, actionable corpus membership diagnostics without mutating state.
 *
 * @param {object} result reconciliation result
 * @returns {string} path-specific diagnostic sections in repair order
 */
export function formatCorpusMembershipErrors(result) {
  const sections = [];
  const malformedRecords = sortRecordErrors(result.malformedRecords || []);
  const misplacedRecords = sortMisplacedRecords(result.misplacedRecords || []);
  const malformedRetirements = sortRetirementErrors(result.malformedRetirements || []);
  const misplacedRetirements = sortMisplacedRetirements(result.misplacedRetirements || []);
  const noncanonicalDiscoveredPaths = sortedStrings(result.noncanonicalDiscoveredPaths || []);
  const duplicatePaths = [...(result.duplicatePaths || [])].sort((left, right) =>
    comparePosix(left.path, right.path)
  );
  const overlapPaths = [...(result.overlapPaths || [])].sort((left, right) =>
    comparePosix(left.path, right.path)
  );
  const duplicateRetirementPaths = [...(result.duplicateRetirementPaths || [])].sort(
    (left, right) => comparePosix(left.path, right.path)
  );
  const invalidRetirementAuthorityPaths = [...(result.invalidRetirementAuthorityPaths || [])].sort(
    (left, right) => comparePosix(left.path, right.path)
  );
  const receiptTestOverlapPaths = [...(result.receiptTestOverlapPaths || [])].sort((left, right) =>
    comparePosix(left.path, right.path)
  );
  const undeclaredPaths = sortedStrings(result.undeclaredPaths || []);
  const missingPaths = [...(result.missingPaths || [])].sort((left, right) => {
    const pathComparison = comparePosix(left.path, right.path);
    return pathComparison || comparePosix(left.authority, right.authority);
  });

  if (malformedRecords.length > 0) {
    sections.push(
      `Malformed membership records:\n${malformedRecords
        .map(({ recordFile, error }) => `! ${recordFile}\n  ${error}`)
        .join('\n')}`
    );
  }
  if (misplacedRecords.length > 0) {
    sections.push(
      `Misplaced membership records:\n${misplacedRecords
        .map(
          ({ recordFile, expectedRecordFile, path }) =>
            `! ${path}\n  ${recordFile}\n  Expected: ${expectedRecordFile}\n  move or repair that record.`
        )
        .join('\n')}`
    );
  }
  if (malformedRetirements.length > 0) {
    sections.push(
      `Malformed frozen-retirement receipts:\n${malformedRetirements
        .map(({ receiptFile, error }) => `! ${receiptFile}\n  ${error}`)
        .join('\n')}`
    );
  }
  if (misplacedRetirements.length > 0) {
    sections.push(
      `Misplaced frozen-retirement receipts:\n${misplacedRetirements
        .map(
          ({ receiptFile, expectedReceiptFile, path }) =>
            `! ${path}\n  ${receiptFile}\n  Expected: ${expectedReceiptFile}\n  move or repair that receipt.`
        )
        .join('\n')}`
    );
  }
  if (noncanonicalDiscoveredPaths.length > 0) {
    sections.push(
      `Noncanonical discovered test files:\n${noncanonicalDiscoveredPaths
        .map((testPath) => `! ${testPath}`)
        .join(
          '\n'
        )}\n\nMove each file under scripts/tests/{unit,integration,slow}/<subsystem>/.\nSee: scripts/tests/integration/meta/test-tree-layout.test.mjs\nNo membership record can be created until the path is canonical.`
    );
  }
  if (duplicatePaths.length > 0) {
    sections.push(
      `Duplicate membership declarations:\n${duplicatePaths
        .map(({ path, recordFiles }) => `! ${path}\n${formatRecordFiles(recordFiles)}`)
        .join('\n')}`
    );
  }
  if (overlapPaths.length > 0) {
    sections.push(
      `Post-snapshot records overlapping frozen destinations:\n${overlapPaths
        .map(({ path, recordFiles }) => `! ${path}\n${formatRecordFiles(recordFiles)}`)
        .join('\n')}`
    );
  }
  if (duplicateRetirementPaths.length > 0) {
    sections.push(
      `Duplicate frozen-retirement receipts:\n${duplicateRetirementPaths
        .map(({ path, receiptFiles }) => `! ${path}\n${formatRecordFiles(receiptFiles)}`)
        .join('\n')}`
    );
  }
  if (invalidRetirementAuthorityPaths.length > 0) {
    sections.push(
      `Invalid retirement authority overlap:\n${invalidRetirementAuthorityPaths
        .map(
          ({ path, receiptFiles, reason }) =>
            `! ${path}\n  ${reason}.\n${formatRecordFiles(receiptFiles)}`
        )
        .join('\n')}`
    );
  }
  if (receiptTestOverlapPaths.length > 0) {
    sections.push(
      `Frozen-retirement receipts overlapping live tests:\n${receiptTestOverlapPaths
        .map(
          ({ path, receiptFiles }) =>
            `! ${path}\n  receipt overlaps a live discovered test.\n${formatRecordFiles(receiptFiles)}`
        )
        .join('\n')}`
    );
  }
  if (undeclaredPaths.length > 0) {
    sections.push(
      `Undeclared test files:\n${undeclaredPaths
        .map((testPath) => `+ ${testPath}\n\nCreate:\n${recordPathForTestPath(testPath)}`)
        .join('\n')}`
    );
  }
  if (missingPaths.length > 0) {
    sections.push(
      `Declared tests missing from disk:\n${missingPaths
        .map(({ path, authority, recordFile }) => {
          if (authority === 'frozen') {
            return `- ${path}\n  restore or repair the frozen destination.`;
          }
          return `- ${path}\n\nRemove or repair:\n${recordFile}`;
        })
        .join('\n')}`
    );
  }

  return sections.join('\n\n');
}
