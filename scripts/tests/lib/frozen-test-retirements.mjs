// @chore
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

import { parseCanonicalTestPath } from '../../task-tracker/lib/test-lanes.mjs';

export const FROZEN_RETIREMENT_ROOT = 'scripts/tests/fixtures/test-corpus-frozen-retirements';
export const TEMPORARY_RETIREMENT_EVIDENCE_ROOT = 'docs/evidence/temporary-test-retirements';

const RECEIPT_KEYS = ['evidence', 'lastLiveSha256', 'path', 'reason', 'schema'];
const SHA256_RE = /^[a-f0-9]{64}$/;
const FETCH_CANONICAL_HISTORY = 'fetch complete canonical history for origin/trunk and retry';

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

function defaultGit(projectRoot, args) {
  return execFileSync('git', args, {
    cwd: projectRoot,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

function historicalError(message) {
  return new Error(`frozen-test-retirements: ${message}`);
}

function gitOutput(runGit, args) {
  return String(runGit(args)).trim();
}

function gitSucceeds(runGit, args) {
  try {
    gitOutput(runGit, args);
    return true;
  } catch {
    return false;
  }
}

function splitLines(output) {
  return output ? output.split('\n').filter(Boolean) : [];
}

function requireCanonicalHistory(runGit, receiptFile) {
  let shallow;
  try {
    shallow = gitOutput(runGit, ['rev-parse', '--is-shallow-repository']);
  } catch {
    throw historicalError(
      `cannot inspect canonical history for ${receiptFile}; ${FETCH_CANONICAL_HISTORY}`
    );
  }
  if (shallow !== 'false') {
    throw historicalError(
      `canonical history is shallow for ${receiptFile}; ${FETCH_CANONICAL_HISTORY}`
    );
  }
  if (!gitSucceeds(runGit, ['rev-parse', '--verify', 'origin/trunk^{commit}'])) {
    throw historicalError(
      `canonical ref origin/trunk is unavailable for ${receiptFile}; ${FETCH_CANONICAL_HISTORY}`
    );
  }
}

function relevantCanonicalCommits(runGit, receiptFile, testPath) {
  try {
    return splitLines(
      gitOutput(runGit, ['rev-list', '--full-history', 'origin/trunk', '--', receiptFile, testPath])
    );
  } catch {
    throw historicalError(
      `canonical commits are incomplete for ${receiptFile}; ${FETCH_CANONICAL_HISTORY}`
    );
  }
}

function directParents(runGit, commit, receiptFile) {
  let ancestry;
  try {
    ancestry = gitOutput(runGit, ['rev-list', '--parents', '-n', '1', commit]);
  } catch {
    throw historicalError(
      `canonical commit ancestry is incomplete for ${receiptFile}; ${FETCH_CANONICAL_HISTORY}`
    );
  }
  return ancestry.split(' ').slice(1);
}

function treeHasPath(runGit, commit, repositoryPath) {
  return gitSucceeds(runGit, ['cat-file', '-e', `${commit}:${repositoryPath}`]);
}

function showTreePath(runGit, commit, repositoryPath) {
  return String(runGit(['show', `${commit}:${repositoryPath}`]));
}

function treeBlobOid(runGit, commit, repositoryPath) {
  let entry;
  try {
    entry = gitOutput(runGit, ['ls-tree', commit, '--', repositoryPath]);
  } catch {
    return { present: false, historyMissing: true };
  }
  if (!entry) return { present: false, historyMissing: false };
  const match = /^\d+\s+blob\s+([a-f0-9]+)\t/.exec(entry);
  return match
    ? { present: true, historyMissing: false, oid: match[1] }
    : { present: false, historyMissing: true };
}

function normalizeHistoricalReceipt(receipt, testPath, receiptFile) {
  if (!isExactReceipt(receipt)) {
    throw historicalError(
      `historical receipt keys must equal evidence, lastLiveSha256, path, reason, schema: ${receiptFile}`
    );
  }
  if (!Number.isInteger(receipt.schema) || receipt.schema !== 1) {
    throw historicalError(`historical receipt schema must be integer 1: ${receiptFile}`);
  }
  const declaredTestPath = normalizeRepositoryPath(receipt.path);
  if (
    !declaredTestPath ||
    !parseCanonicalTestPath(declaredTestPath) ||
    declaredTestPath !== receipt.path.replaceAll('\\', '/') ||
    declaredTestPath !== testPath
  ) {
    throw historicalError(`historical receipt does not declare ${testPath}: ${receiptFile}`);
  }
  if (retirementReceiptPathForTestPath(declaredTestPath) !== receiptFile) {
    throw historicalError(`historical receipt is not at its deterministic path: ${receiptFile}`);
  }
  if (typeof receipt.reason !== 'string' || !/[.!?]$/.test(receipt.reason.trim())) {
    throw historicalError(`historical receipt reason must be a non-empty sentence: ${receiptFile}`);
  }
  if (typeof receipt.lastLiveSha256 !== 'string' || !SHA256_RE.test(receipt.lastLiveSha256)) {
    throw historicalError(`historical receipt has an invalid lastLiveSha256: ${receiptFile}`);
  }
  const evidenceFile = validEvidencePath(receipt.evidence);
  if (!evidenceFile) {
    throw historicalError(`historical receipt has an invalid evidence path: ${receiptFile}`);
  }
  return {
    receiptFile,
    evidenceFile,
    source: 'historical',
    schema: receipt.schema,
    path: declaredTestPath,
    reason: receipt.reason,
    lastLiveSha256: receipt.lastLiveSha256,
    evidence: evidenceFile,
  };
}

function hasReachableGraduation(runGit, deliveryCommit, receiptFile) {
  let receiptCommits;
  try {
    receiptCommits = splitLines(
      gitOutput(runGit, ['rev-list', '--full-history', 'origin/trunk', '--', receiptFile])
    );
  } catch {
    return false;
  }
  for (const commit of receiptCommits) {
    if (!gitSucceeds(runGit, ['merge-base', '--is-ancestor', deliveryCommit, commit])) continue;
    if (treeHasPath(runGit, commit, receiptFile)) continue;
    const parents = directParents(runGit, commit, receiptFile);
    if (
      parents.some(
        (parent) =>
          gitSucceeds(runGit, ['merge-base', '--is-ancestor', deliveryCommit, parent]) &&
          treeHasPath(runGit, parent, receiptFile)
      )
    ) {
      return true;
    }
  }
  return false;
}

/**
 * Hydrates one graduated receipt exclusively from complete origin/trunk history.
 */
export function hydrateHistoricalFrozenRetirement({
  projectRoot,
  testPath,
  receiptFile = retirementReceiptPathForTestPath(testPath),
  git: gitOverride,
} = {}) {
  const normalizedTestPath = normalizeRepositoryPath(testPath);
  if (
    !normalizedTestPath ||
    !parseCanonicalTestPath(normalizedTestPath) ||
    normalizedTestPath !== testPath.replaceAll('\\', '/')
  ) {
    throw historicalError(`noncanonical historical test path: ${String(testPath)}`);
  }
  const expectedReceiptFile = retirementReceiptPathForTestPath(normalizedTestPath);
  if (receiptFile !== expectedReceiptFile) {
    throw historicalError(
      `historical receipt path must be deterministic: expected ${expectedReceiptFile}`
    );
  }

  const runGit = gitOverride || ((args) => defaultGit(projectRoot, args));
  requireCanonicalHistory(runGit, receiptFile);
  const commits = relevantCanonicalCommits(runGit, receiptFile, normalizedTestPath);
  const deliveryCandidates = [];
  let digestMismatch = null;
  let missingEvidence = false;
  let missingParentBlob = false;
  let malformedReceiptError = null;

  for (const commit of commits) {
    if (!gitSucceeds(runGit, ['cat-file', '-e', `${commit}^{commit}`])) {
      throw historicalError(
        `canonical commit is missing for ${receiptFile}; ${FETCH_CANONICAL_HISTORY}`
      );
    }
    if (!gitSucceeds(runGit, ['merge-base', '--is-ancestor', commit, 'origin/trunk'])) continue;
    if (!treeHasPath(runGit, commit, receiptFile)) continue;
    if (treeHasPath(runGit, commit, normalizedTestPath)) continue;

    let receipt;
    try {
      receipt = JSON.parse(showTreePath(runGit, commit, receiptFile));
    } catch (error) {
      malformedReceiptError = historicalError(
        `invalid historical receipt at ${receiptFile}: ${error.message}`
      );
      continue;
    }

    let normalizedReceipt;
    try {
      normalizedReceipt = normalizeHistoricalReceipt(receipt, normalizedTestPath, receiptFile);
    } catch (error) {
      malformedReceiptError = error;
      continue;
    }
    if (!treeHasPath(runGit, commit, normalizedReceipt.evidenceFile)) {
      missingEvidence = true;
      continue;
    }

    let foundLiveParent = false;
    let foundMatchingParent = false;
    for (const parent of directParents(runGit, commit, receiptFile)) {
      const entry = treeBlobOid(runGit, parent, normalizedTestPath);
      if (entry.historyMissing) {
        missingParentBlob = true;
        continue;
      }
      if (!entry.present) continue;
      foundLiveParent = true;
      if (!gitSucceeds(runGit, ['cat-file', '-e', `${parent}:${normalizedTestPath}`])) {
        missingParentBlob = true;
        continue;
      }
      let parentBytes;
      try {
        parentBytes = showTreePath(runGit, parent, normalizedTestPath);
      } catch {
        missingParentBlob = true;
        continue;
      }
      const digest = createHash('sha256').update(parentBytes).digest('hex');
      if (digest === normalizedReceipt.lastLiveSha256) {
        foundMatchingParent = true;
        break;
      }
    }
    if (!foundMatchingParent) {
      if (foundLiveParent) {
        digestMismatch = {
          testPath: normalizedTestPath,
          expectedDigest: normalizedReceipt.lastLiveSha256,
        };
      }
      continue;
    }
    deliveryCandidates.push({ commit, retirement: normalizedReceipt });
  }

  for (const candidate of deliveryCandidates) {
    if (hasReachableGraduation(runGit, candidate.commit, receiptFile)) {
      return candidate.retirement;
    }
  }
  if (deliveryCandidates.length > 0) {
    throw historicalError(`receipt graduation is not reachable for ${receiptFile}`);
  }
  if (missingParentBlob) {
    throw historicalError(`required parent blob is missing for ${receiptFile}`);
  }
  if (missingEvidence) {
    throw historicalError(
      `historical evidence is missing from the receipt tree for ${receiptFile}`
    );
  }
  if (digestMismatch) {
    throw historicalError(
      `test ${digestMismatch.testPath} does not match expected digest ${digestMismatch.expectedDigest}`
    );
  }
  if (malformedReceiptError) throw malformedReceiptError;
  throw historicalError(
    `origin/trunk history does not contain a delivered retirement at ${receiptFile}`
  );
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

/**
 * Combines current-tree receipts with graduated receipts proved by canonical
 * origin/trunk history. Historical inspection is reserved for frozen paths
 * that are absent from both live discovery and active receipt authority.
 */
export function loadFrozenRetirements(options = {}) {
  const {
    projectRoot,
    finalizedFrozenPaths = [],
    postSnapshotRecordPaths = [],
    liveDiscoveredPaths = [],
    git,
  } = options;
  const active = loadActiveFrozenRetirements({
    projectRoot,
    finalizedFrozenPaths,
    postSnapshotRecordPaths,
    liveDiscoveredPaths,
  });
  const retirements = [...active.retirements];
  const errors = [...active.errors];
  const activePaths = new Set(active.retirements.map((retirement) => retirement.path));
  const livePaths = normalizedPaths(liveDiscoveredPaths);
  const postSnapshotPaths = normalizedPaths(postSnapshotRecordPaths);
  const misplacedPaths = new Set(active.misplacedReceipts.map((receipt) => receipt.path));
  const frozenPaths = [...normalizedPaths(finalizedFrozenPaths)].sort(comparePosix);

  for (const testPath of frozenPaths) {
    if (
      livePaths.has(testPath) ||
      postSnapshotPaths.has(testPath) ||
      activePaths.has(testPath) ||
      misplacedPaths.has(testPath)
    ) {
      continue;
    }
    const receiptFile = retirementReceiptPathForTestPath(testPath);
    if (existsSync(path.join(projectRoot, receiptFile))) continue;
    try {
      retirements.push(
        hydrateHistoricalFrozenRetirement({ projectRoot, testPath, receiptFile, git })
      );
    } catch (error) {
      errors.push({ receiptFile, error: error.message });
    }
  }

  retirements.sort((left, right) => comparePosix(left.receiptFile, right.receiptFile));
  errors.sort((left, right) => {
    const fileComparison = comparePosix(left.receiptFile, right.receiptFile);
    return fileComparison || comparePosix(left.error, right.error);
  });
  return {
    retirements,
    errors,
    misplacedReceipts: active.misplacedReceipts,
  };
}
