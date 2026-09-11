// @story #1591

import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync as systemExistsSync, readFileSync } from 'node:fs';
import path from 'node:path';

import { findMainWorktreePath } from '../../task-tracker/fleet-registry.mjs';
import { coReviewIndexPath } from '../../task-tracker/paths.mjs';
import { readProtocolIndex } from './index.mjs';
import { statusProtocol as systemStatusProtocol } from './protocol.mjs';
import { REAL_REPOSITORY_BOUNDARY } from './repository-boundary.mjs';

export const RECONCILIATION_SCHEMA = 'aitm.co-review-index-reconciliation/v1';

const TEST_IDENTITIES = new Set(['author-agent\0reviewer-agent', 'owner-agent\0reviewer-agent']);

export function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

export function sha256(value) {
  const bytes = Buffer.isBuffer(value) ? value : Buffer.from(String(value));
  return `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
}

function normalized(candidate) {
  return path
    .resolve(String(candidate || ''))
    .split(path.sep)
    .join('/');
}

function recognizedTestPath(row) {
  const candidates = [normalized(row.worktree), normalized(row.dir)];
  return candidates.some(
    (candidate) =>
      candidate.includes('/.tmp/test/') ||
      candidate.includes('/.scratch/test/') ||
      /\/.scratch\/\.task-test-[^/]+\//.test(candidate)
  );
}

function recognizedProbePath(row) {
  return /\/\.tmp\/inspect\/[^/]+\/runtime\/?$/.test(normalized(row.dir));
}

function listTracked(projectDir, pathspec) {
  const output = execFileSync('git', ['ls-files', '--', pathspec], {
    cwd: projectDir,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  return output.split('\n').filter(Boolean).sort();
}

function archiveSnapshot(projectDir) {
  return listTracked(projectDir, 'docs/superpowers/reviews').map((relative) => ({
    path: relative,
    sha256: sha256(readFileSync(path.join(projectDir, relative))),
  }));
}

function parseTrackedArchiveManifest(file) {
  const text = readFileSync(file, 'utf8');
  const matches = [
    ...text.matchAll(
      /<!-- aitm-co-review-manifest:start -->\n```json\n([\s\S]*?\n)```\n<!-- aitm-co-review-manifest:end -->/g
    ),
  ];
  if (matches.length !== 1) return null;
  try {
    return JSON.parse(matches[0][1]);
  } catch {
    return null;
  }
}

function archiveEvidence(projectDir, indexed) {
  const manifests = listTracked(projectDir, 'docs/superpowers/reviews/*/*/README.md');
  const evidence = [];
  for (const relative of manifests) {
    const manifest = parseTrackedArchiveManifest(path.join(projectDir, relative));
    const protocolId = manifest?.protocol?.id;
    const artifact = manifest?.artifact;
    const terminal = indexed[protocolId];
    if (
      manifest?.schema !== 'aitm.co-review.archive/v1' ||
      !terminal ||
      !['accepted', 'abandoned'].includes(terminal.lifecycle) ||
      manifest?.decision?.lifecycle !== 'accepted' ||
      terminal.artifact !== artifact?.sourcePath ||
      !/^[a-f0-9]{40}$/.test(String(artifact?.acceptedCommit || '')) ||
      !/^[a-f0-9]{40}$/.test(String(artifact?.gitBlob || '')) ||
      !/^sha256:[a-f0-9]{64}$/.test(String(artifact?.sha256 || ''))
    ) {
      continue;
    }
    const resolved = REAL_REPOSITORY_BOUNDARY.resolveReachableCommit(
      projectDir,
      artifact.acceptedCommit
    );
    if (resolved.commit !== artifact.acceptedCommit) continue;
    const committed = REAL_REPOSITORY_BOUNDARY.committedArtifact(
      projectDir,
      artifact.acceptedCommit,
      artifact.sourcePath
    );
    if (
      !committed ||
      committed.blob !== artifact.gitBlob ||
      sha256(committed.bytes) !== artifact.sha256
    ) {
      continue;
    }
    evidence.push({
      archivePath: relative,
      protocolId,
      artifactPath: artifact.sourcePath,
      acceptedAt: manifest.decision.at,
      acceptedCommit: artifact.acceptedCommit,
      gitBlob: artifact.gitBlob,
      sha256: artifact.sha256,
      indexLifecycle: terminal.lifecycle,
      archiveContentStatus: 'preserved-snapshot',
    });
  }
  return evidence.sort(
    (left, right) =>
      left.artifactPath.localeCompare(right.artifactPath) ||
      right.acceptedAt.localeCompare(left.acceptedAt) ||
      left.protocolId.localeCompare(right.protocolId)
  );
}

function selectArchive(row, catalog) {
  const candidates = catalog.filter(
    (entry) => entry.artifactPath === row.artifact && entry.protocolId !== row.protocolId
  );
  if (candidates.length === 0) return null;
  const latest = candidates[0];
  if (candidates[1]?.acceptedAt === latest.acceptedAt) return null;
  return latest;
}

function liveStatus(row, { existsSync, statusProtocol }) {
  if (!existsSync(row.worktree) || !existsSync(row.dir)) return null;
  try {
    const status = statusProtocol({
      cwd: row.worktree,
      dir: path.relative(row.worktree, row.dir).split(path.sep).join('/'),
    });
    return status?.protocolId === row.protocolId &&
      status.lifecycle === 'active' &&
      status.integrity?.ok
      ? status
      : null;
  } catch {
    return null;
  }
}

function classifyRow(row, context) {
  const runtimeExists = context.existsSync(row.dir);
  const worktreeExists = context.existsSync(row.worktree);
  const base = {
    protocolId: row.protocolId,
    lifecycle: row.lifecycle,
    sourceCategory: 'terminal-index-row',
    runtimeExists,
    worktreeExists,
    evidence: {},
    disposition: 'retain-terminal',
    reason: `index lifecycle ${row.lifecycle} is preserved`,
    row: structuredClone(row),
  };
  if (row.lifecycle !== 'active') return base;

  const live = liveStatus(row, context);
  if (live) {
    return {
      ...base,
      sourceCategory: 'live-runtime',
      evidence: { live: { protocolId: live.protocolId, lifecycle: live.lifecycle } },
      disposition: 'retain-live',
      reason: 'runtime protocol is active and integrity-valid',
    };
  }

  const identity = `${row.owner}\0${row.reviewer}`;
  if (
    !runtimeExists &&
    !worktreeExists &&
    row.artifact === 'docs/artifact.md' &&
    TEST_IDENTITIES.has(identity) &&
    recognizedTestPath(row)
  ) {
    return {
      ...base,
      sourceCategory: 'test-sandbox',
      evidence: { testIdentity: identity.replace('\0', '/'), pathPattern: 'isolated-test' },
      disposition: 'remove-test-residue',
      reason: 'missing isolated test fixture matches every durable test signal',
    };
  }

  if (
    !runtimeExists &&
    !worktreeExists &&
    row.owner === 'owner-probe' &&
    row.reviewer === 'reviewer-probe' &&
    recognizedProbePath(row)
  ) {
    return {
      ...base,
      sourceCategory: 'inspection-probe',
      evidence: { testIdentity: 'owner-probe/reviewer-probe', pathPattern: 'inspect-probe' },
      disposition: 'remove-inspection-probe',
      reason: 'missing owner provenance probe matches every durable probe signal',
    };
  }

  const archive = !runtimeExists && !worktreeExists ? selectArchive(row, context.archives) : null;
  if (archive) {
    return {
      ...base,
      sourceCategory: 'historical-worktree',
      evidence: { archive: structuredClone(archive) },
      disposition: 'remove-superseded-attempt',
      reason:
        'missing historical attempt is superseded by a validated archive for the exact artifact',
    };
  }

  return {
    ...base,
    sourceCategory: runtimeExists || worktreeExists ? 'unverified-runtime' : 'missing-runtime',
    disposition: 'retain-unresolved',
    reason:
      runtimeExists || worktreeExists
        ? 'runtime evidence is present but not a matching integrity-valid active protocol'
        : 'missing paths are not authority without durable test or archive evidence',
  };
}

function countsFor(rows) {
  const byDisposition = {};
  for (const row of rows) {
    byDisposition[row.disposition] = (byDisposition[row.disposition] || 0) + 1;
  }
  return {
    total: rows.length,
    remove: rows.filter(({ disposition }) => disposition.startsWith('remove-')).length,
    active: rows.filter(({ lifecycle }) => lifecycle === 'active').length,
    unresolved: rows.filter(({ disposition }) => disposition === 'retain-unresolved').length,
    byDisposition,
  };
}

export function inventoryLegacyIndex(input = {}) {
  const projectDir = path.resolve(input.projectDir || process.cwd());
  const mainWorktree = findMainWorktreePath(projectDir);
  const indexFile = path.resolve(input.indexFile || coReviewIndexPath(mainWorktree));
  const journalFile = path.resolve(
    input.journalFile || path.join(path.dirname(indexFile), 'co-review-index-reconciliation.jsonl')
  );
  const existsSync = input.deps?.existsSync || systemExistsSync;
  const statusProtocol = input.deps?.statusProtocol || systemStatusProtocol;
  const indexBytes = readFileSync(indexFile);
  const indexed = readProtocolIndex(indexFile);
  const archives = (input.deps?.archiveEvidence || archiveEvidence)(projectDir, indexed);
  const snapshot = (input.deps?.archiveSnapshot || archiveSnapshot)(projectDir);
  const rows = Object.values(indexed)
    .sort((left, right) => left.protocolId.localeCompare(right.protocolId))
    .map((row) => classifyRow(row, { existsSync, statusProtocol, archives }));
  return {
    projectDir,
    indexFile,
    journalFile,
    indexSha256: sha256(indexBytes),
    archiveSnapshot: snapshot,
    rows,
    counts: countsFor(rows),
  };
}

export function reconcileLegacyIndex() {
  throw new Error('co-review-index-reconciliation: apply not implemented');
}

export function verifyLegacyIndexReconciliation() {
  throw new Error('co-review-index-reconciliation: verify not implemented');
}
