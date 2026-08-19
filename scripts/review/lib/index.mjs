import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { isDeepStrictEqual } from 'node:util';

import { findMainWorktreePath, withLock } from '../../task-tracker/fleet-registry.mjs';
import { coReviewIndexPath } from '../../task-tracker/paths.mjs';
import { statusProtocol as defaultStatusProtocol } from './protocol.mjs';

function fileFor(input = {}) {
  if (input.indexFile) return path.resolve(input.indexFile);
  const projectDir = path.resolve(input.projectDir || input.worktreePath || process.cwd());
  return coReviewIndexPath(findMainWorktreePath(projectDir));
}

function clone(value) {
  return structuredClone(value);
}

function writeIndex(file, rows) {
  mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.${Math.random().toString(16).slice(2)}.tmp`;
  writeFileSync(tmp, `${JSON.stringify(rows, null, 2)}\n`, 'utf8');
  renameSync(tmp, file);
}

export function readProtocolIndex(indexFile) {
  const file = path.resolve(indexFile);
  if (!existsSync(file)) return {};
  try {
    const parsed = JSON.parse(readFileSync(file, 'utf8'));
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('shape');
    for (const [protocolId, row] of Object.entries(parsed)) {
      if (
        protocolId !== row?.protocolId ||
        typeof row.dir !== 'string' ||
        typeof row.worktree !== 'string' ||
        typeof row.owner !== 'string' ||
        typeof row.reviewer !== 'string' ||
        typeof row.lifecycle !== 'string' ||
        typeof row.artifact !== 'string'
      ) {
        throw new Error(`row-shape:${protocolId}`);
      }
    }
    return parsed;
  } catch (error) {
    throw new Error(`co-review-index: unreadable authority store ${file}: ${error.message}`, {
      cause: error,
    });
  }
}

function baseRow(state) {
  const protocolId = String(state?.protocolId || '').trim();
  const root = path.resolve(state?.repositoryRoot || state?.worktree || '');
  const runtimeDir = String(state?.initialization?.runtimeDir || '').trim();
  if (!protocolId || !root || !runtimeDir) {
    throw new TypeError('co-review-index: protocol state is incomplete');
  }
  return {
    protocolId,
    dir: path.resolve(root, runtimeDir),
    worktree: path.resolve(state.worktree || root),
    owner: String(state.roles?.owner || ''),
    reviewer: String(state.roles?.reviewer || ''),
    lifecycle: String(state.lifecycle || ''),
    artifact: String(state.artifact?.path || ''),
    pendingReviewPath: null,
    claimedRole: null,
    claimedProvider: null,
    claimedSid: null,
  };
}

function registrationIdentity(row) {
  const { protocolId, dir, worktree, owner, reviewer, artifact } = row;
  return { protocolId, dir, worktree, owner, reviewer, artifact };
}

export function registerProtocol(input) {
  const file = fileFor(input);
  const row = baseRow(input.state);
  return withLock(file, () => {
    const rows = readProtocolIndex(file);
    const existing = rows[row.protocolId];
    if (existing) {
      if (!isDeepStrictEqual(registrationIdentity(existing), registrationIdentity(row))) {
        throw new Error(`co-review-index: conflicting registration for ${row.protocolId}`);
      }
      return { status: 'unchanged', row: clone(existing), indexFile: file };
    }
    rows[row.protocolId] = row;
    writeIndex(file, rows);
    return { status: 'registered', row: clone(row), indexFile: file };
  });
}

export function recordReviewerClaim(input) {
  const file = fileFor(input);
  const protocolId = String(input.protocolId || '').trim();
  const provider = String(input.provider || '').trim();
  const sid = String(input.sid || '').trim();
  const round = Number(input.round);
  if (!protocolId || !provider || !sid || !Number.isInteger(round) || round < 1) {
    throw new TypeError(
      'co-review-index: reviewer claim requires protocol, provider, sid, and round'
    );
  }
  return withLock(file, () => {
    const rows = readProtocolIndex(file);
    const row = rows[protocolId];
    if (!row) throw new Error(`co-review-index: protocol ${protocolId} is not registered`);
    if (row.lifecycle !== 'active') {
      throw new Error(`co-review-index: protocol ${protocolId} is ${row.lifecycle}`);
    }
    const next = {
      ...row,
      pendingReviewPath: path.join(row.dir, `round-${round}-reviewer-review.md`),
      claimedRole: 'reviewer',
      claimedProvider: provider,
      claimedSid: sid,
    };
    if (isDeepStrictEqual(row, next)) return { status: 'unchanged', row: clone(row) };
    if (
      row.claimedSid &&
      row.claimedSid !== sid &&
      row.pendingReviewPath === next.pendingReviewPath
    ) {
      throw new Error(`co-review-index: reviewer claim already prepared for another session`);
    }
    rows[protocolId] = next;
    writeIndex(file, rows);
    return { status: 'claimed', row: clone(next) };
  });
}

export function markProtocolLifecycle(input) {
  const file = fileFor(input);
  const protocolId = String(input.protocolId || '').trim();
  const lifecycle = String(input.lifecycle || '').trim();
  if (!protocolId || !lifecycle) throw new TypeError('co-review-index: lifecycle input incomplete');
  return withLock(file, () => {
    const rows = readProtocolIndex(file);
    const row = rows[protocolId];
    if (!row) throw new Error(`co-review-index: protocol ${protocolId} is not registered`);
    if (row.lifecycle === lifecycle) return { status: 'unchanged', row: clone(row) };
    rows[protocolId] = { ...row, lifecycle };
    writeIndex(file, rows);
    return { status: 'updated', row: clone(rows[protocolId]) };
  });
}

function liveProtocol(row, statusProtocol) {
  try {
    return statusProtocol({
      cwd: row.worktree,
      dir: path.relative(row.worktree, row.dir).split(path.sep).join('/'),
    });
  } catch {
    return null;
  }
}

function liveActive(row, statusProtocol) {
  const live = liveProtocol(row, statusProtocol);
  return live?.protocolId === row.protocolId && live.lifecycle === 'active' && live.integrity?.ok
    ? live
    : null;
}

function liveReviewerClaim(row, statusProtocol) {
  const live = liveActive(row, statusProtocol);
  if (
    !live ||
    row.claimedRole !== 'reviewer' ||
    !row.claimedProvider ||
    !row.claimedSid ||
    !row.pendingReviewPath ||
    live.currentRole !== 'reviewer' ||
    live.turnState !== 'claimed' ||
    live.claim?.role !== 'reviewer' ||
    live.claim?.actor !== row.reviewer
  ) {
    return null;
  }
  return live;
}

export function hasLiveReviewerClaim(input) {
  const statusProtocol = input.statusProtocol || defaultStatusProtocol;
  return Boolean(liveReviewerClaim(input.row, statusProtocol));
}

export function resolveReviewerGrant(input) {
  const file = fileFor(input);
  const rows = readProtocolIndex(file);
  const worktreePath = path.resolve(input.worktreePath || input.projectDir || process.cwd());
  const provider = String(input.provider || '').trim();
  const sid = String(input.sid || '').trim();
  const statusProtocol = input.statusProtocol || defaultStatusProtocol;
  for (const row of Object.values(rows)) {
    if (
      row.lifecycle !== 'active' ||
      path.resolve(row.worktree) !== worktreePath ||
      row.claimedRole !== 'reviewer' ||
      row.claimedProvider !== provider ||
      row.claimedSid !== sid ||
      !row.pendingReviewPath
    ) {
      continue;
    }
    const live = liveReviewerClaim(row, statusProtocol);
    if (!live) continue;
    return Object.freeze({ ...clone(row), liveRevision: live.revision, round: live.round });
  }
  return null;
}

export function isActiveCoReviewWorktree(input) {
  const file = fileFor(input);
  const rows = readProtocolIndex(file);
  const worktreePath = path.resolve(input.worktreePath || input.projectDir || process.cwd());
  const statusProtocol = input.statusProtocol || defaultStatusProtocol;
  return Object.values(rows).some(
    (row) =>
      row.lifecycle === 'active' &&
      path.resolve(row.worktree) === worktreePath &&
      Boolean(liveActive(row, statusProtocol))
  );
}

export function allowsCoReviewOccupancy(input) {
  const file = fileFor(input);
  const rows = readProtocolIndex(file);
  const worktreePath = path.resolve(input.worktreePath || input.projectDir || process.cwd());
  const provider = String(input.requested?.provider || '').trim();
  const sid = String(input.requested?.sid || '').trim();
  const statusProtocol = input.statusProtocol || defaultStatusProtocol;
  if (
    !provider ||
    !sid ||
    input.occupants?.length !== 1 ||
    provider === String(input.existing?.provider || '').trim()
  ) {
    return false;
  }
  return Object.values(rows).some(
    (row) =>
      row.lifecycle === 'active' &&
      path.resolve(row.worktree) === worktreePath &&
      row.claimedProvider === provider &&
      row.claimedSid === sid &&
      Boolean(liveReviewerClaim(row, statusProtocol))
  );
}
