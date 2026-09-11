// @story #1591

import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import {
  appendFileSync,
  closeSync,
  existsSync as systemExistsSync,
  fsyncSync,
  mkdirSync,
  openSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';

import {
  findMainWorktreePath,
  withLock as systemWithLock,
} from '../../task-tracker/fleet-registry.mjs';
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
  const { projectDir, indexFile, journalFile } = resolveLocations(input);
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

function resolveLocations(input = {}) {
  const projectDir = path.resolve(input.projectDir || process.cwd());
  const mainWorktree = findMainWorktreePath(projectDir);
  const indexFile = path.resolve(input.indexFile || coReviewIndexPath(mainWorktree));
  const journalFile = path.resolve(
    input.journalFile || path.join(path.dirname(indexFile), 'co-review-index-reconciliation.jsonl')
  );
  return { projectDir, indexFile, journalFile };
}

function readJournal(journalFile) {
  if (!systemExistsSync(journalFile)) return [];
  const records = readFileSync(journalFile, 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((line, index) => {
      let record;
      try {
        record = JSON.parse(line);
      } catch (error) {
        throw new Error(
          `co-review-index-reconciliation: malformed journal line ${index + 1}: ${error.message}`
        );
      }
      if (
        record?.schema !== RECONCILIATION_SCHEMA ||
        !['prepared', 'applied'].includes(record.recordType) ||
        !/^sha256:[a-f0-9]{64}$/.test(String(record.operationId || ''))
      ) {
        throw new Error(`co-review-index-reconciliation: invalid journal line ${index + 1}`);
      }
      return record;
    });
  const phases = new Set();
  for (const record of records) {
    const key = `${record.operationId}\0${record.recordType}`;
    if (phases.has(key)) {
      throw new Error(
        `co-review-index-reconciliation: duplicate ${record.recordType} record ${record.operationId}`
      );
    }
    phases.add(key);
  }
  return records;
}

function syncFile(file) {
  const descriptor = openSync(file, 'r');
  try {
    fsyncSync(descriptor);
  } finally {
    closeSync(descriptor);
  }
}

function appendJournal(journalFile, record) {
  mkdirSync(path.dirname(journalFile), { recursive: true });
  appendFileSync(journalFile, `${JSON.stringify(record)}\n`, 'utf8');
  syncFile(journalFile);
}

function writeIndexAtomic(indexFile, bytes) {
  mkdirSync(path.dirname(indexFile), { recursive: true });
  const temporary = `${indexFile}.${process.pid}.${Date.now()}.tmp`;
  writeFileSync(temporary, bytes, { encoding: 'utf8', flag: 'wx' });
  syncFile(temporary);
  renameSync(temporary, indexFile);
}

function same(left, right) {
  return canonicalJson(left) === canonicalJson(right);
}

function resultFor(record, status) {
  const model = record.model;
  return {
    status,
    operationId: record.operationId,
    before: model.beforeIndexSha256,
    after: model.afterIndexSha256,
    removed: model.removed.map(({ protocolId }) => protocolId),
    blockers: model.blockers.map(({ protocolId }) => protocolId),
    archiveSnapshot: structuredClone(model.archiveSnapshot),
  };
}

function appliedRecord(prepared, recordedAt, archiveAfter) {
  return {
    schema: RECONCILIATION_SCHEMA,
    recordType: 'applied',
    operationId: prepared.operationId,
    recordedAt,
    beforeIndexSha256: prepared.model.beforeIndexSha256,
    afterIndexSha256: prepared.model.afterIndexSha256,
    archiveSnapshot: archiveAfter,
  };
}

function recoverPrepared({ prepared, currentDigest, indexFile, journalFile, projectDir, deps }) {
  const archiveSnapshotFn = deps.archiveSnapshot || archiveSnapshot;
  const archiveBeforeRecovery = archiveSnapshotFn(projectDir);
  if (!same(archiveBeforeRecovery, prepared.model.archiveSnapshot)) {
    throw new Error(
      `co-review-index-reconciliation: recovery archive snapshot conflict ${prepared.operationId}`
    );
  }
  if (currentDigest === prepared.model.beforeIndexSha256) {
    const indexed = readProtocolIndex(indexFile);
    for (const { protocolId } of prepared.model.removed) delete indexed[protocolId];
    const afterBytes = `${JSON.stringify(indexed, null, 2)}\n`;
    if (sha256(afterBytes) !== prepared.model.afterIndexSha256) {
      throw new Error(
        `co-review-index-reconciliation: recovery model digest conflict ${prepared.operationId}`
      );
    }
    writeIndexAtomic(indexFile, afterBytes);
    deps.afterIndexWrite?.(prepared.model);
  } else if (currentDigest !== prepared.model.afterIndexSha256) {
    throw new Error(
      `co-review-index-reconciliation: recovery index digest conflict ${prepared.operationId}`
    );
  }
  const archiveAfter = archiveSnapshotFn(projectDir);
  if (!same(archiveAfter, prepared.model.archiveSnapshot)) {
    throw new Error(
      `co-review-index-reconciliation: archive changed during recovery ${prepared.operationId}`
    );
  }
  appendJournal(journalFile, appliedRecord(prepared, new Date().toISOString(), archiveAfter));
  return resultFor(prepared, 'recovered');
}

export function reconcileLegacyIndex(input = {}) {
  const { projectDir, indexFile, journalFile } = resolveLocations(input);
  const deps = input.deps || {};
  const withLock = deps.withLock || systemWithLock;
  return withLock(indexFile, () => {
    const records = readJournal(journalFile);
    const appliedIds = new Set(
      records
        .filter(({ recordType }) => recordType === 'applied')
        .map(({ operationId }) => operationId)
    );
    const pending = records.filter(
      ({ recordType, operationId }) => recordType === 'prepared' && !appliedIds.has(operationId)
    );
    if (pending.length > 1) {
      throw new Error('co-review-index-reconciliation: multiple pending operations');
    }
    const currentDigest = sha256(readFileSync(indexFile));
    if (pending.length === 1) {
      return recoverPrepared({
        prepared: pending[0],
        currentDigest,
        indexFile,
        journalFile,
        projectDir,
        deps,
      });
    }

    const inventory = inventoryLegacyIndex({ ...input, projectDir, indexFile, journalFile, deps });
    const removable = inventory.rows.filter(({ disposition }) => disposition.startsWith('remove-'));
    if (removable.length === 0) {
      const matching = [...records]
        .reverse()
        .find(
          (record) =>
            record.recordType === 'prepared' &&
            appliedIds.has(record.operationId) &&
            record.model.afterIndexSha256 === inventory.indexSha256 &&
            same(record.model.archiveSnapshot, inventory.archiveSnapshot)
        );
      return matching
        ? resultFor(matching, 'unchanged')
        : {
            status: 'unchanged',
            operationId: null,
            before: inventory.indexSha256,
            after: inventory.indexSha256,
            removed: [],
            blockers: inventory.rows
              .filter(({ disposition }) => disposition === 'retain-unresolved')
              .map(({ protocolId }) => protocolId),
            archiveSnapshot: inventory.archiveSnapshot,
          };
    }

    const indexed = readProtocolIndex(indexFile);
    for (const { protocolId } of removable) delete indexed[protocolId];
    const afterBytes = `${JSON.stringify(indexed, null, 2)}\n`;
    const model = {
      schema: RECONCILIATION_SCHEMA,
      beforeIndexSha256: inventory.indexSha256,
      afterIndexSha256: sha256(afterBytes),
      removed: removable.map(({ protocolId, sourceCategory, evidence, row }) => ({
        protocolId,
        sourceCategory,
        evidence,
        row,
      })),
      blockers: inventory.rows
        .filter(({ disposition }) => disposition === 'retain-unresolved')
        .map(({ protocolId, reason }) => ({ protocolId, reason })),
      archiveSnapshot: inventory.archiveSnapshot,
    };
    const operationId = sha256(canonicalJson(model));
    const prepared = {
      schema: RECONCILIATION_SCHEMA,
      recordType: 'prepared',
      operationId,
      recordedAt: new Date().toISOString(),
      model,
    };
    appendJournal(journalFile, prepared);
    deps.afterPrepared?.(model);
    writeIndexAtomic(indexFile, afterBytes);
    deps.afterIndexWrite?.(model);
    const archiveAfter = (deps.archiveSnapshot || archiveSnapshot)(projectDir);
    if (!same(archiveAfter, inventory.archiveSnapshot)) {
      throw new Error(
        `co-review-index-reconciliation: archive changed during apply ${operationId}`
      );
    }
    appendJournal(journalFile, appliedRecord(prepared, new Date().toISOString(), archiveAfter));
    return resultFor(prepared, 'applied');
  });
}

export function verifyLegacyIndexReconciliation() {
  throw new Error('co-review-index-reconciliation: verify not implemented');
}
