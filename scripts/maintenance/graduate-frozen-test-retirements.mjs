#!/usr/bin/env node
// @chore
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, rmdirSync, unlinkSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { discoverTestFiles } from '../task-tracker/lib/discover-test-files.mjs';
import {
  FROZEN_RETIREMENT_ROOT,
  loadActiveFrozenRetirements,
  TEMPORARY_RETIREMENT_EVIDENCE_ROOT,
  verifyActiveFrozenRetirementDelivery,
} from '../tests/lib/frozen-test-retirements.mjs';
import {
  finalizedFrozenPaths,
  loadPostSnapshotRecords,
} from '../tests/lib/test-corpus-membership.mjs';

const USAGE = `Usage: npm run graduate:frozen-tests -- (--check|--apply) [--json]`;
const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

function comparePosix(left, right) {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

function digestFile(absolutePath) {
  return createHash('sha256').update(readFileSync(absolutePath)).digest('hex');
}

function normalizedOwnedPath(repositoryPath, root) {
  if (typeof repositoryPath !== 'string') return null;
  const posixPath = repositoryPath.replaceAll('\\', '/');
  if (path.posix.isAbsolute(posixPath) || posixPath.split('/').includes('..')) return null;
  const normalized = path.posix.normalize(posixPath);
  if (normalized !== posixPath || !normalized.startsWith(`${root}/`)) return null;
  return normalized;
}

function assertOwnedRetirementPath(repositoryPath, root) {
  const normalized = normalizedOwnedPath(repositoryPath, root);
  if (!normalized) {
    throw new Error(
      `graduate-frozen-test-retirements: target is outside retirement-owned roots: ${String(repositoryPath)}`
    );
  }
  return normalized;
}

function loadRepositoryAuthority(projectRoot) {
  const manifest = JSON.parse(
    readFileSync(path.join(projectRoot, 'scripts/tests/fixtures/test-corpus-pre-move.json'), 'utf8')
  );
  const frozenPaths = finalizedFrozenPaths(manifest);
  const records = loadPostSnapshotRecords({ projectRoot });
  return loadActiveFrozenRetirements({
    projectRoot,
    finalizedFrozenPaths: frozenPaths,
    postSnapshotRecordPaths: records.records.map(({ path: testPath }) => testPath),
    liveDiscoveredPaths: discoverTestFiles({ projectRoot }),
  });
}

export function parseGraduationArgs(argv) {
  let mode = null;
  let json = false;
  for (const argument of argv) {
    if (argument === '--check' || argument === '--apply') {
      const nextMode = argument.slice(2);
      if (mode) throw new Error(USAGE);
      mode = nextMode;
    } else if (argument === '--json') {
      json = true;
    } else {
      throw new Error(USAGE);
    }
  }
  if (!mode) throw new Error(USAGE);
  return { mode, json };
}

function formatAuthorityErrors(authority) {
  const errors = authority.errors.map(({ receiptFile, error }) => `${receiptFile}: ${error}`);
  const misplaced = authority.misplacedReceipts.map(
    ({ receiptFile, expectedReceiptFile }) =>
      `${receiptFile}: receipt must be located at ${expectedReceiptFile}`
  );
  return [...errors, ...misplaced].sort(comparePosix).join('\n');
}

export function planFrozenRetirementGraduation({
  projectRoot = PROJECT_ROOT,
  loadAuthority = loadRepositoryAuthority,
  proveDelivery = verifyActiveFrozenRetirementDelivery,
} = {}) {
  const authority = loadAuthority(projectRoot);
  if (authority.errors.length > 0 || authority.misplacedReceipts.length > 0) {
    throw new Error(
      `graduate-frozen-test-retirements: invalid active retirement batch\n${formatAuthorityErrors(authority)}`
    );
  }

  const retirements = [...authority.retirements].sort((left, right) =>
    comparePosix(left.receiptFile, right.receiptFile)
  );
  const validation = { receiptDigests: new Map(), evidenceDigests: new Map() };
  for (const retirement of retirements) {
    assertOwnedRetirementPath(retirement.receiptFile, FROZEN_RETIREMENT_ROOT);
    assertOwnedRetirementPath(retirement.evidenceFile, TEMPORARY_RETIREMENT_EVIDENCE_ROOT);
    const receiptPath = path.join(projectRoot, retirement.receiptFile);
    const evidencePath = path.join(projectRoot, retirement.evidenceFile);
    if (!existsSync(receiptPath) || !existsSync(evidencePath)) {
      throw new Error(
        `graduate-frozen-test-retirements: validated retirement files disappeared: ${retirement.receiptFile}`
      );
    }
    validation.receiptDigests.set(retirement.receiptFile, digestFile(receiptPath));
    if (!validation.evidenceDigests.has(retirement.evidenceFile)) {
      validation.evidenceDigests.set(retirement.evidenceFile, digestFile(evidencePath));
    }
  }

  const eligible = [];
  const pending = [];
  for (const retirement of retirements) {
    const proof = proveDelivery({ projectRoot, retirement });
    const reportEntry = {
      receiptFile: retirement.receiptFile,
      testPath: retirement.path,
      lastLiveSha256: retirement.lastLiveSha256,
      evidenceFile: retirement.evidenceFile,
    };
    if (proof.eligible) {
      eligible.push({ ...reportEntry, deliveryCommit: proof.deliveryCommit });
    } else {
      pending.push({ ...reportEntry, reason: proof.reason });
    }
  }

  const pendingEvidence = new Set(pending.map(({ evidenceFile }) => evidenceFile));
  const evidenceToRemove = [
    ...new Set(
      eligible
        .map(({ evidenceFile }) => evidenceFile)
        .filter((evidenceFile) => !pendingEvidence.has(evidenceFile))
    ),
  ].sort(comparePosix);
  const plan = {
    schema: 1,
    eligibleCount: eligible.length,
    pendingCount: pending.length,
    eligible,
    pending,
    evidenceToRemove,
  };
  Object.defineProperty(plan, 'validation', { value: validation });
  return plan;
}

function assertUnchanged(projectRoot, repositoryPath, expectedDigest) {
  const absolutePath = path.join(projectRoot, repositoryPath);
  if (!existsSync(absolutePath) || digestFile(absolutePath) !== expectedDigest) {
    throw new Error(
      `graduate-frozen-test-retirements: target changed after validation: ${repositoryPath}`
    );
  }
}

function removeEmptyOwnedDirectories(projectRoot, repositoryPath, ownedRoot) {
  const root = path.join(projectRoot, ownedRoot);
  let directory = path.dirname(path.join(projectRoot, repositoryPath));
  while (directory === root || directory.startsWith(`${root}${path.sep}`)) {
    try {
      rmdirSync(directory);
    } catch (error) {
      if (error.code === 'ENOENT') break;
      if (error.code === 'ENOTEMPTY' || error.code === 'EEXIST') break;
      throw error;
    }
    if (directory === root) break;
    directory = path.dirname(directory);
  }
}

export function applyFrozenRetirementGraduation(plan, { projectRoot = PROJECT_ROOT } = {}) {
  const receiptTargets = plan.eligible.map(({ receiptFile }) =>
    assertOwnedRetirementPath(receiptFile, FROZEN_RETIREMENT_ROOT)
  );
  const evidenceTargets = plan.evidenceToRemove.map((evidenceFile) =>
    assertOwnedRetirementPath(evidenceFile, TEMPORARY_RETIREMENT_EVIDENCE_ROOT)
  );
  for (const receiptFile of receiptTargets) {
    assertUnchanged(projectRoot, receiptFile, plan.validation.receiptDigests.get(receiptFile));
  }
  for (const evidenceFile of evidenceTargets) {
    assertUnchanged(projectRoot, evidenceFile, plan.validation.evidenceDigests.get(evidenceFile));
  }

  for (const receiptFile of receiptTargets) unlinkSync(path.join(projectRoot, receiptFile));
  for (const evidenceFile of evidenceTargets) unlinkSync(path.join(projectRoot, evidenceFile));
  for (const receiptFile of receiptTargets) {
    removeEmptyOwnedDirectories(projectRoot, receiptFile, FROZEN_RETIREMENT_ROOT);
  }
  for (const evidenceFile of evidenceTargets) {
    removeEmptyOwnedDirectories(projectRoot, evidenceFile, TEMPORARY_RETIREMENT_EVIDENCE_ROOT);
  }
  return { removedReceipts: receiptTargets, removedEvidence: evidenceTargets };
}

function reportObject(plan, mode, application) {
  return {
    mode,
    applied: mode === 'apply',
    ...plan,
    ...(application || {}),
  };
}

export function formatGraduationReport(plan, { mode, json, application } = {}) {
  const report = reportObject(plan, mode, application);
  if (json) return `${JSON.stringify(report, null, 2)}\n`;
  const lines = [
    `Frozen retirement graduation ${mode}: ${plan.eligibleCount} eligible, ${plan.pendingCount} pending.`,
  ];
  for (const item of plan.eligible) {
    lines.push(
      `ELIGIBLE ${item.receiptFile}`,
      `  test: ${item.testPath}`,
      `  digest: ${item.lastLiveSha256}`,
      `  evidence: ${item.evidenceFile}`,
      `  delivery: ${item.deliveryCommit}`
    );
  }
  for (const item of plan.pending) {
    lines.push(
      `PENDING ${item.receiptFile}`,
      `  test: ${item.testPath}`,
      `  digest: ${item.lastLiveSha256}`,
      `  evidence: ${item.evidenceFile}`,
      `  reason: ${item.reason}`
    );
  }
  return `${lines.join('\n')}\n`;
}

export function runGraduationCommand({
  argv = process.argv.slice(2),
  projectRoot = PROJECT_ROOT,
  loadAuthority,
  proveDelivery,
  writeOutput = (value) => process.stdout.write(value),
} = {}) {
  const { mode, json } = parseGraduationArgs(argv);
  const plan = planFrozenRetirementGraduation({
    projectRoot,
    ...(loadAuthority ? { loadAuthority } : {}),
    ...(proveDelivery ? { proveDelivery } : {}),
  });
  const application =
    mode === 'apply' ? applyFrozenRetirementGraduation(plan, { projectRoot }) : undefined;
  const report = reportObject(plan, mode, application);
  writeOutput(formatGraduationReport(plan, { mode, json, application }));
  return report;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    runGraduationCommand();
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  }
}
