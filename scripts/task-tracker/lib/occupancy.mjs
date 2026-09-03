import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

import { findMainWorktreePath, withLock } from '../fleet-registry.mjs';
import { occupancyPath } from '../paths.mjs';

function issueKey(issue) {
  const value = String(issue ?? '')
    .trim()
    .replace(/^#/, '');
  if (!/^\d+$/.test(value)) throw new TypeError('occupancy: issue must be numeric');
  return value;
}

function fileFor(input = {}) {
  if (input.occupancyFile) return path.resolve(input.occupancyFile);
  const projectDir = path.resolve(input.projectDir || process.cwd());
  return occupancyPath(findMainWorktreePath(projectDir));
}

function isoNow(input) {
  const value = typeof input.now === 'function' ? input.now() : new Date().toISOString();
  return String(value);
}

function stable(value) {
  return JSON.stringify(value);
}

function clone(value) {
  return structuredClone(value);
}

export class OccupancyConflictError extends Error {
  constructor(message, code, holder) {
    super(message);
    this.name = 'OccupancyConflictError';
    this.code = code;
    this.holder = holder ? clone(holder) : null;
  }
}

export function readOccupancy(occupancyFile) {
  const file = path.resolve(occupancyFile);
  if (!existsSync(file)) return {};
  try {
    const parsed = JSON.parse(readFileSync(file, 'utf8'));
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('shape');
    for (const [key, row] of Object.entries(parsed)) {
      if (
        !/^\d+$/.test(key) ||
        !row ||
        typeof row !== 'object' ||
        Array.isArray(row) ||
        String(row.issue) !== key ||
        typeof row.sid !== 'string' ||
        !row.sid ||
        typeof row.provider !== 'string' ||
        !row.provider ||
        typeof row.worktreePath !== 'string' ||
        !row.worktreePath ||
        typeof row.boundAt !== 'string' ||
        typeof row.lastHeartbeatAt !== 'string' ||
        (row.bindingGenerationId !== undefined &&
          !/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(
            row.bindingGenerationId
          ))
      ) {
        throw new Error('row-shape');
      }
    }
    return parsed;
  } catch (error) {
    throw new Error(`occupancy: unreadable authority store ${file}: ${error.message}`, {
      cause: error,
    });
  }
}

function writeOccupancy(file, rows) {
  mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.${Math.random().toString(16).slice(2)}.tmp`;
  writeFileSync(tmp, `${JSON.stringify(rows, null, 2)}\n`, 'utf8');
  renameSync(tmp, file);
}

function holderDiagnostic(row) {
  return `provider=${row.provider} worktree=${row.worktreePath} sid=${row.sid.slice(0, 12)}`;
}

export function claimOccupancy(input, options = {}) {
  const file = fileFor(input);
  const issue = issueKey(input.issue);
  const sid = String(input.sid || '').trim();
  const provider = String(input.provider || '').trim();
  const rawWorktreePath = String(input.worktreePath || input.projectDir || '').trim();
  if (!sid) throw new TypeError('occupancy: sid is required');
  if (!provider) throw new TypeError('occupancy: provider is required');
  if (!rawWorktreePath) throw new TypeError('occupancy: worktreePath is required');
  const worktreePath = path.resolve(rawWorktreePath);
  const coReviewAllowsWorktree = options.coReviewAllowsWorktree || (() => false);

  return withLock(file, () => {
    const before = readOccupancy(file);
    const held = before[issue];
    if (held && held.sid !== sid) {
      throw new OccupancyConflictError(
        `occupancy: issue #${issue} is held (${holderDiagnostic(held)})`,
        'occupancy-issue-held',
        held
      );
    }

    const worktreeHolders = Object.values(before).filter(
      (row) => path.resolve(row.worktreePath) === worktreePath && row.sid !== sid
    );
    const worktreeHolder = worktreeHolders[0];
    if (
      worktreeHolder &&
      !coReviewAllowsWorktree({
        worktreePath,
        existing: clone(worktreeHolder),
        occupants: clone(worktreeHolders),
        requested: { issue: Number(issue), sid, provider, worktreePath },
      })
    ) {
      throw new OccupancyConflictError(
        `occupancy: worktree is held (${holderDiagnostic(worktreeHolder)}); use an isolated worktree or an active co-review`,
        'occupancy-worktree-held',
        worktreeHolder
      );
    }

    if (
      held &&
      held.sid === sid &&
      held.provider === provider &&
      path.resolve(held.worktreePath) === worktreePath
    ) {
      if (options.heartbeatExisting) {
        const after = clone(before);
        after[issue] = { ...held, lastHeartbeatAt: isoNow(input) };
        writeOccupancy(file, after);
        return {
          status: 'updated',
          row: clone(after[issue]),
          occupancyFile: file,
        };
      }
      return { status: 'unchanged', row: clone(held), occupancyFile: file };
    }

    const at = isoNow(input);
    const after = clone(before);
    let moved = false;
    for (const [key, row] of Object.entries(after)) {
      if (key !== issue && row.sid === sid) {
        delete after[key];
        moved = true;
      }
    }
    const row = {
      issue: Number(issue),
      sid,
      provider,
      worktreePath,
      boundAt: at,
      lastHeartbeatAt: at,
      bindingGenerationId: input.bindingGenerationId || randomUUID(),
      ...(input.cycleId ? { cycleId: String(input.cycleId) } : {}),
      ...(input.repositoryId ? { repositoryId: structuredClone(input.repositoryId) } : {}),
    };
    after[issue] = row;
    writeOccupancy(file, after);
    return {
      status: moved ? 'moved' : 'claimed',
      row: clone(row),
      occupancyFile: file,
      before: clone(before),
      claimed: clone(after),
    };
  });
}

export function touchOccupancy(input, options = {}) {
  return claimOccupancy(input, { ...options, heartbeatExisting: true });
}

export function rollbackOccupancyClaim(claim) {
  if (!claim?.occupancyFile || !claim.before || !claim.claimed) {
    return { status: 'not-applicable' };
  }
  return withLock(claim.occupancyFile, () => {
    const current = readOccupancy(claim.occupancyFile);
    if (stable(current) !== stable(claim.claimed)) return { status: 'superseded' };
    writeOccupancy(claim.occupancyFile, claim.before);
    return { status: 'rolled-back' };
  });
}

export function heartbeatOccupancy(input) {
  const file = fileFor(input);
  const issue = issueKey(input.issue);
  const sid = String(input.sid || '').trim();
  return withLock(file, () => {
    const rows = readOccupancy(file);
    const row = rows[issue];
    if (!row || row.sid !== sid) {
      throw new OccupancyConflictError(
        `occupancy: heartbeat refused for #${issue}; exact session claim not found`,
        'occupancy-heartbeat-refused',
        row
      );
    }
    rows[issue] = { ...row, lastHeartbeatAt: isoNow(input) };
    writeOccupancy(file, rows);
    return { status: 'updated', row: clone(rows[issue]) };
  });
}

export function releaseOccupancy(input) {
  const file = fileFor(input);
  const issue = issueKey(input.issue);
  const sid = String(input.sid || '').trim();
  return withLock(file, () => {
    const rows = readOccupancy(file);
    const row = rows[issue];
    if (!row) return { status: 'absent', row: null };
    if (
      !sid ||
      row.sid !== sid ||
      (input.bindingGenerationId && row.bindingGenerationId !== input.bindingGenerationId)
    ) {
      throw new OccupancyConflictError(
        `occupancy: release refused for #${issue}; held by ${holderDiagnostic(row)}`,
        'occupancy-release-refused',
        row
      );
    }
    delete rows[issue];
    writeOccupancy(file, rows);
    return { status: 'released', row: clone(row) };
  });
}

export function releaseOccupancyAtOrBefore(input) {
  const file = fileFor(input);
  const issue = issueKey(input.issue);
  const sid = String(input.sid || '').trim();
  const closedAt = Date.parse(String(input.closedAt || ''));
  if (!Number.isFinite(closedAt)) throw new TypeError('occupancy: closedAt must be an ISO instant');
  return withLock(file, () => {
    const rows = readOccupancy(file);
    const row = rows[issue];
    if (!row) return { status: 'absent', row: null };
    const boundAt = Date.parse(row.boundAt);
    if (!sid || row.sid !== sid || !Number.isFinite(boundAt) || boundAt > closedAt) {
      throw new OccupancyConflictError(
        `occupancy: terminal release refused for #${issue}; claim supersedes close authority`,
        'occupancy-terminal-release-refused',
        row
      );
    }
    delete rows[issue];
    writeOccupancy(file, rows);
    return { status: 'released', row: clone(row) };
  });
}

export function forceReleaseOccupancy(input) {
  const file = fileFor(input);
  const issue = issueKey(input.issue);
  return withLock(file, () => {
    const rows = readOccupancy(file);
    const row = rows[issue];
    if (!row) return { status: 'absent', row: null };
    delete rows[issue];
    writeOccupancy(file, rows);
    return { status: 'released', row: clone(row) };
  });
}
