// @chore
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

import { parseCanonicalTestPath } from '../../task-tracker/lib/test-lanes.mjs';

export const FROZEN_RETIREMENT_ROOT = 'scripts/tests/fixtures/test-corpus-frozen-retirements';
export const TEMPORARY_RETIREMENT_EVIDENCE_ROOT = 'docs/evidence/temporary-test-retirements';

const RECEIPT_KEYS = ['evidence', 'lastLiveSha256', 'path', 'reason', 'schema'];
const SHA256_RE = /^[a-f0-9]{64}$/;

function comparePosix(left, right) {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

function posixRelative(projectRoot, absolutePath) {
  return path.relative(projectRoot, absolutePath).split(path.sep).join('/');
}

function normalizeRepositoryPath(repositoryPath) {
  if (typeof repositoryPath !== 'string' || repositoryPath.length === 0) return null;
  const posixPath = repositoryPath.replaceAll('\\', '/');
  if (path.posix.isAbsolute(posixPath) || posixPath.split('/').includes('..')) return null;
  const normalized = path.posix.normalize(posixPath);
  if (normalized === '.' || normalized === '..' || normalized.startsWith('../')) return null;
  return normalized;
}

function normalizedPaths(paths) {
  return new Set((paths || []).map(normalizeRepositoryPath).filter(Boolean));
}

function listJsonFiles(projectRoot, directory, errors, isRoot = false) {
  let entries;
  try {
    entries = readdirSync(directory, { withFileTypes: true });
  } catch (error) {
    errors.push({
      receiptFile: posixRelative(projectRoot, directory),
      error: `frozen-test-retirements: ${
        isRoot ? 'receipt root is unreadable or not a directory' : 'unreadable receipt directory'
      }: ${error.message}`,
    });
    return [];
  }

  const files = [];
  for (const entry of entries.sort((left, right) => comparePosix(left.name, right.name))) {
    const absolutePath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...listJsonFiles(projectRoot, absolutePath, errors));
    } else if (entry.isFile() && entry.name.endsWith('.json')) {
      files.push(absolutePath);
    }
  }
  return files;
}

function receiptError(receiptFile, error) {
  return { receiptFile, error: `frozen-test-retirements: ${error}` };
}

function isExactReceipt(record) {
  return (
    record &&
    !Array.isArray(record) &&
    typeof record === 'object' &&
    JSON.stringify(Object.keys(record).sort()) === JSON.stringify(RECEIPT_KEYS)
  );
}

function validEvidencePath(evidence) {
  const normalized = normalizeRepositoryPath(evidence);
  if (!normalized) return null;
  if (!normalized.startsWith(`${TEMPORARY_RETIREMENT_EVIDENCE_ROOT}/`)) return null;
  if (!normalized.endsWith('.md')) return null;
  return normalized;
}

export function retirementReceiptPathForTestPath(testPath) {
  const normalized = normalizeRepositoryPath(testPath);
  const parsed = normalized && parseCanonicalTestPath(normalized);
  if (!parsed || normalized !== testPath.replaceAll('\\', '/')) {
    throw new TypeError(`frozen-test-retirements: noncanonical test path: ${testPath}`);
  }
  return `${FROZEN_RETIREMENT_ROOT}/${parsed.lane}/${parsed.relative}.json`;
}

/**
 * Loads and validates active frozen-retirement receipts without allowing one
 * malformed file to hide other repair targets.
 */
export function loadActiveFrozenRetirements({
  projectRoot,
  finalizedFrozenPaths = [],
  postSnapshotRecordPaths = [],
  liveDiscoveredPaths = [],
} = {}) {
  const root = path.join(projectRoot, FROZEN_RETIREMENT_ROOT);
  if (!existsSync(root)) {
    return { retirements: [], errors: [], misplacedReceipts: [], rootPresent: false };
  }

  const errors = [];
  const candidates = [];
  const misplacedReceipts = [];
  const frozenPaths = normalizedPaths(finalizedFrozenPaths);
  const postSnapshotPaths = normalizedPaths(postSnapshotRecordPaths);
  const livePaths = normalizedPaths(liveDiscoveredPaths);
  const declarationCounts = new Map();
  const receiptFiles = listJsonFiles(projectRoot, root, errors, true).sort((left, right) =>
    comparePosix(posixRelative(projectRoot, left), posixRelative(projectRoot, right))
  );
  for (const absoluteReceiptFile of receiptFiles) {
    const receiptFile = posixRelative(projectRoot, absoluteReceiptFile);
    let receipt;
    try {
      receipt = JSON.parse(readFileSync(absoluteReceiptFile, 'utf8'));
    } catch (error) {
      errors.push(
        receiptError(receiptFile, `invalid JSON or unreadable receipt: ${error.message}`)
      );
      continue;
    }
    const declaredTestPath = normalizeRepositoryPath(receipt?.path);
    if (
      typeof receipt?.path === 'string' &&
      declaredTestPath &&
      parseCanonicalTestPath(declaredTestPath) &&
      declaredTestPath === receipt.path.replaceAll('\\', '/') &&
      frozenPaths.has(declaredTestPath) &&
      !postSnapshotPaths.has(declaredTestPath)
    ) {
      const declarationCount = (declarationCounts.get(declaredTestPath) || 0) + 1;
      declarationCounts.set(declaredTestPath, declarationCount);
      if (declarationCount > 1) {
        errors.push(receiptError(receiptFile, `duplicate declared path: ${declaredTestPath}`));
      }
      const expectedReceiptFile = retirementReceiptPathForTestPath(declaredTestPath);
      if (receiptFile !== expectedReceiptFile) {
        misplacedReceipts.push({
          receiptFile,
          expectedReceiptFile,
          path: declaredTestPath,
        });
      }
    }
    if (!isExactReceipt(receipt)) {
      errors.push(
        receiptError(
          receiptFile,
          'receipt keys must equal evidence, lastLiveSha256, path, reason, schema'
        )
      );
      continue;
    }
    if (!Number.isInteger(receipt.schema) || receipt.schema !== 1) {
      errors.push(receiptError(receiptFile, 'receipt schema must be integer 1'));
      continue;
    }

    const testPath = normalizeRepositoryPath(receipt.path);
    if (
      !testPath ||
      !parseCanonicalTestPath(testPath) ||
      testPath !== receipt.path.replaceAll('\\', '/')
    ) {
      errors.push(receiptError(receiptFile, `noncanonical test path: ${String(receipt.path)}`));
      continue;
    }
    if (!frozenPaths.has(testPath)) {
      errors.push(receiptError(receiptFile, `path is not a finalized frozen path: ${testPath}`));
      continue;
    }
    if (postSnapshotPaths.has(testPath)) {
      errors.push(receiptError(receiptFile, `path overlaps a post-snapshot record: ${testPath}`));
      continue;
    }
    if (typeof receipt.reason !== 'string' || !/[.!?]$/.test(receipt.reason.trim())) {
      errors.push(receiptError(receiptFile, 'reason must be a non-empty sentence'));
      continue;
    }
    if (typeof receipt.lastLiveSha256 !== 'string' || !SHA256_RE.test(receipt.lastLiveSha256)) {
      errors.push(
        receiptError(receiptFile, 'lastLiveSha256 must be a 64-character lowercase SHA-256 digest')
      );
      continue;
    }
    const evidenceFile = validEvidencePath(receipt.evidence);
    if (!evidenceFile) {
      errors.push(
        receiptError(
          receiptFile,
          'evidence path must be a non-escaping Markdown file beneath the temporary retirement evidence root'
        )
      );
      continue;
    }
    if (!existsSync(path.join(projectRoot, evidenceFile))) {
      errors.push(receiptError(receiptFile, `evidence file is missing: ${evidenceFile}`));
      continue;
    }

    const normalizedReceipt = {
      receiptFile,
      evidenceFile,
      source: 'active',
      schema: receipt.schema,
      path: testPath,
      reason: receipt.reason,
      lastLiveSha256: receipt.lastLiveSha256,
      evidence: evidenceFile,
    };
    const expectedReceiptFile = retirementReceiptPathForTestPath(testPath);
    const isMisplaced = receiptFile !== expectedReceiptFile;
    const overlapsLiveTest = livePaths.has(testPath);
    candidates.push({ normalizedReceipt, isMisplaced, overlapsLiveTest });
    if (overlapsLiveTest) {
      errors.push(
        receiptError(receiptFile, `receipt overlaps a live discovered test: ${testPath}`)
      );
    }
  }

  errors.sort((left, right) => {
    const fileComparison = comparePosix(left.receiptFile, right.receiptFile);
    return fileComparison || comparePosix(left.error, right.error);
  });
  misplacedReceipts.sort((left, right) => {
    const fileComparison = comparePosix(left.receiptFile, right.receiptFile);
    return (
      fileComparison ||
      comparePosix(left.expectedReceiptFile, right.expectedReceiptFile) ||
      comparePosix(left.path, right.path)
    );
  });
  const retirements = candidates
    .filter(
      ({ normalizedReceipt, isMisplaced, overlapsLiveTest }) =>
        declarationCounts.get(normalizedReceipt.path) === 1 && !isMisplaced && !overlapsLiveTest
    )
    .map(({ normalizedReceipt }) => normalizedReceipt);
  return { retirements, errors, misplacedReceipts, rootPresent: true };
}
