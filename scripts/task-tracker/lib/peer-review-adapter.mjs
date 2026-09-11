import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

import { statusReview as installedStatusReview } from 'ai-peer-review';

import { findMainWorktreePath } from '../fleet-registry.mjs';
import { coReviewIndexPath } from '../paths.mjs';

export const AITM_PEER_REVIEW_CONFIG = Object.freeze({
  reviewsRoot: 'docs/superpowers/reviews',
  reviewPathTemplate: '<issue>/<kind>',
  allowNoCommit: false,
});

export const installedPeerReviewApi = Object.freeze({ statusReview: installedStatusReview });

const LEGACY_REVIEW_CONSUMERS = Object.freeze([
  Object.freeze({
    file: 'scripts/task-tracker/lib/occupancy-lifecycle.mjs',
    marker: '../../review/lib/index.mjs',
  }),
  Object.freeze({
    file: 'scripts/task-tracker/lib/command-surface/entrypoints.mjs',
    marker: 'scripts/review/co-review.mjs',
  }),
  Object.freeze({
    file: 'scripts/lib/self-doc.mjs',
    marker: 'scripts/review/co-review.mjs',
  }),
]);

function positiveIssue(issue) {
  const value = Number(issue);
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new TypeError('peer-review: issue must be a positive safe integer');
  }
  return value;
}

export function peerReviewStartArgs({
  artifact,
  issue,
  kind,
  noCommit = false,
  testMode = false,
  testHumanAuthority,
  maxTurns,
  claimTtl,
}) {
  const artifactPath = String(artifact || '').trim();
  if (!artifactPath) throw new TypeError('peer-review: artifact is required');
  if (!['spec', 'plan'].includes(kind)) {
    throw new TypeError('peer-review: kind must be spec or plan');
  }
  if (noCommit && !testMode) throw new Error('peer-review: no-commit mode is test-only in AITM');
  if (testHumanAuthority && (!testMode || !noCommit)) {
    throw new Error('peer-review: test Human Authority requires explicit no-commit test mode');
  }
  for (const [label, value] of [
    ['maxTurns', maxTurns],
    ['claimTtl', claimTtl],
  ]) {
    if (value !== undefined && (!Number.isSafeInteger(value) || value <= 0)) {
      throw new TypeError(`peer-review: ${label} must be a positive safe integer`);
    }
  }

  return Object.freeze([
    'start',
    artifactPath,
    '--artifact-kind',
    kind,
    '--issue',
    String(positiveIssue(issue)),
    '--reviews-root',
    AITM_PEER_REVIEW_CONFIG.reviewsRoot,
    '--review-path-template',
    AITM_PEER_REVIEW_CONFIG.reviewPathTemplate,
    ...(maxTurns ? ['--max-turns', String(maxTurns)] : []),
    ...(claimTtl ? ['--claim-ttl', String(claimTtl)] : []),
    ...(noCommit ? ['--no-commit'] : []),
    ...(testHumanAuthority ? ['--test-human-authority', String(testHumanAuthority)] : []),
  ]);
}

export function peerReviewStatus({ workspace, api = installedPeerReviewApi }) {
  const status = api.statusReview(workspace);
  return Object.freeze({
    reviewId: status.review_id,
    state: status.state,
    worktree: status.worktree ?? status.paths?.workspace ?? workspace,
  });
}

function readLegacyRows({ projectDir, indexFile }) {
  const file = indexFile
    ? path.resolve(indexFile)
    : coReviewIndexPath(findMainWorktreePath(path.resolve(projectDir || process.cwd())));
  if (!existsSync(file)) return { file, rows: [] };
  let parsed;
  try {
    parsed = JSON.parse(readFileSync(file, 'utf8'));
  } catch (error) {
    throw new Error(`peer-review-migration: unreadable legacy index ${file}: ${error.message}`, {
      cause: error,
    });
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error(`peer-review-migration: invalid legacy index ${file}`);
  }
  return { file, rows: Object.values(parsed) };
}

export function assertLegacyReviewMigrationSafe(input = {}) {
  const observed = input.legacyRows
    ? { file: null, rows: input.legacyRows }
    : readLegacyRows(input);
  if (!Array.isArray(observed.rows)) {
    throw new TypeError('peer-review-migration: legacy rows must be an array');
  }
  const active = observed.rows.find((row) => row?.lifecycle === 'active');
  if (active) {
    throw new Error(
      `peer-review-migration: active legacy review ${String(active.protocolId ?? '')}`
    );
  }
  const projectDir = path.resolve(input.projectDir || process.cwd());
  const consumers = LEGACY_REVIEW_CONSUMERS.filter(({ file, marker }) => {
    const absolute = path.join(projectDir, file);
    return existsSync(absolute) && readFileSync(absolute, 'utf8').includes(marker);
  }).map(({ file }) => file);
  if (consumers.length) {
    throw new Error(
      `peer-review-migration: legacy runtime still has production consumers: ${consumers.join(', ')}`
    );
  }
  return Object.freeze({
    removable: true,
    indexFile: observed.file,
    terminalRows: observed.rows.filter((row) => ['accepted', 'abandoned'].includes(row?.lifecycle))
      .length,
  });
}
