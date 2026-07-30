import {
  existsSync,
  readFileSync,
  writeFileSync,
  mkdirSync,
  renameSync,
  rmdirSync,
  statSync,
} from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { legacyPathFor, fleetPath } from './paths.mjs';
import { resolveMainWorktreePath } from './lib/main-worktree-path.mjs';
import { GIT_TIMEOUT_MS } from './lib/process-timeouts.mjs';

const LOCK_STALE_MS = 30_000;
const LOCK_RETRY_MS = 25;
const LOCK_MAX_WAIT_MS = 5_000;

export function withLock(registryPath, fn) {
  const lockDir = registryPath + '.lock';
  mkdirSync(path.dirname(registryPath), { recursive: true });
  const deadline = Date.now() + LOCK_MAX_WAIT_MS;
  let held = false;
  while (!held) {
    try {
      mkdirSync(lockDir);
      held = true;
    } catch (err) {
      if (err.code !== 'EEXIST') throw err;
      try {
        const age = Date.now() - statSync(lockDir).mtimeMs;
        if (age > LOCK_STALE_MS) {
          try {
            rmdirSync(lockDir);
          } catch {
            /* best-effort: cleanup; failure is non-fatal */
          }
          continue;
        }
      } catch {
        /* best-effort: cleanup; failure is non-fatal */
      }
      if (Date.now() > deadline) throw new Error(`fleet-registry: lock timeout on ${lockDir}`);
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, LOCK_RETRY_MS);
    }
  }
  try {
    return fn();
  } finally {
    try {
      rmdirSync(lockDir);
    } catch {
      /* best-effort: cleanup; failure is non-fatal */
    }
  }
}

export function findMainWorktreePath(projectDir) {
  return resolveMainWorktreePath(projectDir, { allowFallback: true });
}

export { resolveMainWorktreePath };

export function fleetRegistryPath(mainWorktreePath) {
  return fleetPath(mainWorktreePath);
}

export function currentBranch(projectDir) {
  try {
    return execFileSync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], {
      cwd: projectDir,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
      timeout: GIT_TIMEOUT_MS,
    }).trim();
  } catch {
    return 'unknown';
  }
}

// #441 — default 24h staleness horizon for active entries. Exported so callers
// (fleet prune, guard-time reap) and tests share one constant.
export const STALE_MS_DEFAULT = 24 * 60 * 60 * 1000;

// #441 — discriminate a main-thread bind from a worktree sub-agent bind. The
// robust test is "is this worktreePath the main worktree?", which stays correct
// whether the caller runs on the main thread or inside a sub-agent's worktree.
export function classifyBindKind(projectDir, worktreePath) {
  return worktreePath === findMainWorktreePath(projectDir) ? 'main' : 'worktree';
}

// #441 — effective kind for any entry: honor a stored `kind`, else infer from
// path (legacy/migration entries lacking the tag). When mainWorktreePath is
// unknown, inference is skipped and anything untagged is treated as a worktree.
export function effectiveKind(entry, mainWorktreePath) {
  if (entry?.kind === 'main' || entry?.kind === 'worktree') return entry.kind;
  if (mainWorktreePath && entry?.worktreePath === mainWorktreePath) return 'main';
  return 'worktree';
}

// #441 — pure, injectable staleness predicate. Evicts when: the entry is
// malformed; a `main`-kind bind that is not the currently-active issue; a
// worktree whose directory no longer exists; or an active worktree older than
// the staleness horizon. Clock + fs are injected via ctx so it unit-tests
// without touching the real clock or disk.
export function isStaleEntry(ref, entry, ctx = {}) {
  if (!entry || typeof entry !== 'object') return true;
  const {
    nowMs = Date.now(),
    staleMs = STALE_MS_DEFAULT,
    activeRef,
    mainWorktreePath,
    dirExists = existsSync,
  } = ctx;
  const kind = effectiveKind(entry, mainWorktreePath);
  if (kind === 'main') {
    // A live main bind is owned by the main-thread state. A *paused* main bind
    // is intentional (the user paused and will resume) — keep it. Only an
    // `active` main bind that is not the currently-active issue is leaked
    // garbage (the #405@trunk-class entry).
    if (entry.status !== 'active') return false;
    return ref !== activeRef;
  }
  // worktree kind
  if (typeof entry.worktreePath !== 'string' || !entry.worktreePath) return true;
  if (!dirExists(entry.worktreePath)) return true;
  if (entry.status === 'active') {
    const started = Date.parse(entry.startedAt);
    if (!Number.isNaN(started) && nowMs - started > staleMs) return true;
  }
  return false;
}

// #441 — pure partition of a fleet into kept vs evicted refs.
export function reapStaleEntries(fleet, ctx = {}) {
  const kept = {};
  const evicted = [];
  for (const [ref, entry] of Object.entries(fleet || {})) {
    if (isStaleEntry(ref, entry, ctx)) evicted.push(ref);
    else kept[ref] = entry;
  }
  return { kept, evicted };
}

export function readFleet(registryPath, opts) {
  let fleet;
  try {
    let readPath = registryPath;
    if (!existsSync(readPath)) {
      const legacy = legacyPathFor(registryPath);
      if (legacy && existsSync(legacy)) readPath = legacy;
    }
    fleet = !existsSync(readPath) ? {} : JSON.parse(readFileSync(readPath, 'utf8'));
  } catch {
    fleet = {};
  }
  // #441 — opt-in lazy auto-reap. Default (one-arg) call stays pure: no lock,
  // no write — every hot path is unaffected. With opts.reap we compute the
  // stale set and only take the lock + rewrite when at least one entry is
  // stale, so a clean registry costs one extra in-memory scan and nothing more.
  if (!opts?.reap) return fleet;
  const ctx = { staleMs: STALE_MS_DEFAULT, dirExists: existsSync, ...(opts.reapCtx || {}) };
  const { kept, evicted } = reapStaleEntries(fleet, ctx);
  if (evicted.length === 0) return fleet;
  withLock(registryPath, () => {
    const fresh = readFleet(registryPath);
    const recomputed = reapStaleEntries(fresh, ctx);
    writeFleet(registryPath, recomputed.kept);
  });
  return kept;
}

// #441 — operator-facing prune. Shares isStaleEntry with the guard-time reap so
// `fleet prune` and lazy auto-reap never diverge. dryRun computes without
// writing; otherwise evicts under lock and returns the plan either way.
export function pruneFleet(registryPath, ctx = {}, { dryRun = false } = {}) {
  const fullCtx = { staleMs: STALE_MS_DEFAULT, dirExists: existsSync, ...ctx };
  const fleet = readFleet(registryPath);
  const { kept, evicted } = reapStaleEntries(fleet, fullCtx);
  if (!dryRun && evicted.length > 0) {
    withLock(registryPath, () => {
      const fresh = readFleet(registryPath);
      const recomputed = reapStaleEntries(fresh, fullCtx);
      writeFleet(registryPath, recomputed.kept);
    });
  }
  return { kept, evicted };
}

export function writeFleet(registryPath, data) {
  mkdirSync(path.dirname(registryPath), { recursive: true });
  const tmp = registryPath + '.tmp';
  writeFileSync(tmp, JSON.stringify(data, null, 2) + '\n', 'utf8');
  renameSync(tmp, registryPath);
}

function testRmwDelay() {
  const ms = Number(process.env.FLEET_REGISTRY_TEST_DELAY_MS || 0);
  if (ms > 0) Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

export function registerTask(projectDir, issueRef, worktreePath, branch, kind) {
  const mainPath = findMainWorktreePath(projectDir);
  const rPath = fleetRegistryPath(mainPath);
  // #441 — derive kind when the caller omits it (back-compat): a bind whose
  // worktreePath is the main worktree is a `main` bind, everything else is a
  // `worktree` sub-agent bind. An explicit kind arg always wins.
  const effKind = kind ?? (worktreePath === mainPath ? 'main' : 'worktree');
  withLock(rPath, () => {
    const fleet = readFleet(rPath);
    testRmwDelay();
    const existing = fleet[issueRef];
    fleet[issueRef] = {
      worktreePath,
      branch,
      kind: effKind,
      startedAt: existing?.startedAt ?? new Date().toISOString(),
      status: 'active',
    };
    writeFleet(rPath, fleet);
  });
}

export function registerTaskProjection(projectDir, input, projectionId) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new TypeError('fleet projection input must be an object');
  }
  for (const field of ['issue', 'worktreePath', 'branch', 'startedAt', 'status']) {
    if (typeof input[field] !== 'string' || input[field].trim() === '') {
      throw new TypeError(`fleet projection ${field} is required`);
    }
  }
  if (typeof projectionId !== 'string' || projectionId.trim() === '') {
    throw new TypeError('fleet projectionId is required');
  }
  if (!/^#[1-9]\d*$/.test(input.issue) || input.status !== 'active') {
    throw new TypeError('fleet projection requires a canonical active issue binding');
  }
  const mainPath = findMainWorktreePath(projectDir);
  const registryPath = fleetRegistryPath(mainPath);
  const kind = input.kind ?? (input.worktreePath === mainPath ? 'main' : 'worktree');
  if (!['main', 'worktree'].includes(kind)) {
    throw new TypeError('fleet projection kind is invalid');
  }
  const projected = {
    worktreePath: input.worktreePath,
    branch: input.branch,
    kind,
    startedAt: input.startedAt,
    status: input.status,
    projectionId,
  };
  withLock(registryPath, () => {
    const fleet = readFleet(registryPath);
    const existing = fleet[input.issue];
    if (existing && JSON.stringify(existing) === JSON.stringify(projected)) return;
    fleet[input.issue] = projected;
    writeFleet(registryPath, fleet);
  });
  const receipt = readFleet(registryPath)[input.issue];
  if (JSON.stringify(receipt) !== JSON.stringify(projected)) {
    throw new Error('fleet projection read-back does not match');
  }
  return receipt;
}

export function deregisterTask(projectDir, issueRef) {
  const mainPath = findMainWorktreePath(projectDir);
  const rPath = fleetRegistryPath(mainPath);
  withLock(rPath, () => {
    const fleet = readFleet(rPath);
    testRmwDelay();
    delete fleet[issueRef];
    writeFleet(rPath, fleet);
  });
}

export function setTaskStatus(projectDir, issueRef, status) {
  const mainPath = findMainWorktreePath(projectDir);
  const rPath = fleetRegistryPath(mainPath);
  withLock(rPath, () => {
    const fleet = readFleet(rPath);
    testRmwDelay();
    if (!fleet[issueRef]) return;
    fleet[issueRef].status = status;
    writeFleet(rPath, fleet);
  });
}
