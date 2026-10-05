// @story #1857
// Coordination primitives only; live writers adopt them during the coupled cutover.
import {
  mkdirSync,
  readFileSync,
  readdirSync,
  unlinkSync,
  rmdirSync,
  openSync,
  writeFileSync,
  fsyncSync,
  closeSync,
  renameSync,
  lstatSync,
} from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { detectProvider } from '../../providers/index.mjs';
import { resolveSessionId, FALLBACK_SESSION_ID } from './session-id.mjs';
import {
  runtimeStoragePaths,
  assertRuntimeStoragePath,
  RuntimeRootError,
} from './runtime-storage.mjs';

const processToken = randomUUID();
const sameOwner = (a, b) =>
  ['provider', 'sid', 'pid', 'processToken'].every((key) => a?.[key] === b?.[key]);
const fail = (code, message) => {
  throw new RuntimeRootError(code, message);
};
const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const validOwner = (value) =>
  isObject(value) &&
  ['provider', 'sid', 'processToken'].every(
    (key) => typeof value[key] === 'string' && value[key]
  ) &&
  value.sid !== FALLBACK_SESSION_ID &&
  Number.isSafeInteger(value.pid) &&
  value.pid > 0;

function identity(adapters) {
  const value = adapters.identity
    ? adapters.identity()
    : {
        provider: detectProvider({ env: process.env }).name,
        sid: resolveSessionId(),
        pid: process.pid,
        processToken,
      };
  if (
    !isObject(value) ||
    !['provider', 'sid', 'processToken'].every(
      (key) => typeof value[key] === 'string' && value[key]
    ) ||
    value.sid === FALLBACK_SESSION_ID ||
    !Number.isSafeInteger(value.pid) ||
    value.pid <= 0
  ) {
    fail(
      'RUNTIME_MIGRATION_IDENTITY_REQUIRED',
      'A genuine process and provider session are required'
    );
  }
  return {
    provider: value.provider,
    sid: value.sid,
    pid: value.pid,
    processToken: value.processToken,
  };
}

function locations(input) {
  const layout = runtimeStoragePaths(input);
  const base = layout.migrationRoot;
  const paths = {
    base,
    lock: path.join(base, 'coordinator.lock'),
    fence: path.join(base, 'fence.json'),
    writers: path.join(base, 'writers'),
  };
  for (const target of Object.values(paths))
    assertRuntimeStoragePath(target, layout.sharedRuntimeRoot, 'RUNTIME_CONTROL_INVALID');
  return { ...paths, registeredRoots: layout.registeredRoots };
}

function atomicJson(file, value) {
  const temporary = file + '.' + randomUUID() + '.pending';
  const fd = openSync(temporary, 'wx', 0o600);
  try {
    writeFileSync(fd, JSON.stringify(value) + '\n');
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
  renameSync(temporary, file);
  const dir = openSync(path.dirname(file), 'r');
  try {
    fsyncSync(dir);
  } finally {
    closeSync(dir);
  }
}

function readRecord(file, optional = false) {
  try {
    if (!lstatSync(file).isFile())
      fail('RUNTIME_CONTROL_INVALID', 'Coordination record must be a regular file');
    return JSON.parse(readFileSync(file, 'utf8'));
  } catch (error) {
    if (optional && error.code === 'ENOENT') return undefined;
    if (error instanceof RuntimeRootError) throw error;
    fail('RUNTIME_CONTROL_INVALID', 'Unreadable runtime coordination record');
  }
}

function coordinated(paths, owner, operation) {
  mkdirSync(paths.base, { recursive: true });
  try {
    mkdirSync(paths.lock);
  } catch (error) {
    if (error.code === 'EEXIST')
      fail(
        'RUNTIME_MIGRATION_BUSY',
        'Coordinator ownership requires explicit recovery; age is not authority'
      );
    throw error;
  }
  const ownerFile = path.join(paths.lock, 'owner.json');
  const originalLock = lstatSync(paths.lock);
  try {
    atomicJson(ownerFile, owner);
    return operation();
  } finally {
    assertRuntimeStoragePath(ownerFile, paths.base, 'RUNTIME_MIGRATION_CONFLICT');
    const currentLock = lstatSync(paths.lock);
    const currentOwner = readRecord(ownerFile);
    if (
      currentLock.dev !== originalLock.dev ||
      currentLock.ino !== originalLock.ino ||
      !sameOwner(currentOwner, owner)
    ) {
      fail('RUNTIME_MIGRATION_CONFLICT', 'Coordinator ownership changed; preserve for recovery');
    }
    unlinkSync(ownerFile);
    rmdirSync(paths.lock);
  }
}

function readFence(paths) {
  const value = readRecord(paths.fence, true);
  if (value === undefined) return null;
  if (
    !isObject(value) ||
    value.schema !== 'aitm.runtime-fence/v1' ||
    !validOwner(value.owner) ||
    typeof value.transactionId !== 'string' ||
    typeof value.planDigest !== 'string'
  ) {
    fail('RUNTIME_CONTROL_INVALID', 'Unsupported runtime fence');
  }
  return value;
}

function leases(paths) {
  mkdirSync(paths.writers, { recursive: true });
  return readdirSync(paths.writers).map((name) => {
    if (!new RegExp('^[a-f0-9-]+\\.json$').test(name))
      fail('RUNTIME_CONTROL_INVALID', 'Unknown writer lease entry');
    const value = readRecord(path.join(paths.writers, name));
    if (
      value.schema !== 'aitm.runtime-writer/v1' ||
      !validOwner(value.owner) ||
      typeof value.projectRoot !== 'string' ||
      !paths.registeredRoots.includes(value.projectRoot) ||
      name !== value.leaseId + '.json'
    ) {
      fail('RUNTIME_CONTROL_INVALID', 'Unsupported writer lease');
    }
    return value;
  });
}

function acquireWriterLease(input) {
  const owner = identity(input.adapters || {});
  const paths = locations(input);
  const leaseId = randomUUID();
  const file = path.join(paths.writers, leaseId + '.json');
  coordinated(paths, owner, () => {
    if (readFence(paths))
      fail('RUNTIME_TRANSACTION_INCOMPLETE', 'Runtime writers are fenced for migration');
    leases(paths);
    atomicJson(file, {
      schema: 'aitm.runtime-writer/v1',
      leaseId,
      owner,
      projectRoot: input.projectRoot,
    });
  });
  return () =>
    coordinated(paths, owner, () => {
      assertRuntimeStoragePath(file, paths.base, 'RUNTIME_MIGRATION_CONFLICT');
      const lease = readRecord(file);
      if (!sameOwner(lease.owner, owner) || lease.leaseId !== leaseId) {
        fail('RUNTIME_MIGRATION_CONFLICT', 'Writer lease identity changed');
      }
      unlinkSync(file);
    });
}

export async function withRuntimeWriterLease(input, operation) {
  const release = acquireWriterLease(input);
  try {
    return await operation();
  } finally {
    release();
  }
}

export function withRuntimeWriterLeaseSync(input, operation) {
  const release = acquireWriterLease(input);
  let safeToRelease = true;
  try {
    const result = operation();
    if (result && typeof result.then === 'function') {
      // Retain authority evidence: an accidentally unawaited writer may still run.
      safeToRelease = false;
      fail(
        'RUNTIME_SYNC_WRITER_ASYNC',
        'Synchronous writer returned a promise; lease retained for recovery'
      );
    }
    return result;
  } finally {
    if (safeToRelease) release();
  }
}

export async function fenceRuntimeWriters(input) {
  const { transactionId, approvedPlanDigest, adapters = {} } = input;
  if (
    !new RegExp('^[a-zA-Z0-9][a-zA-Z0-9-]{0,95}$').test(transactionId || '') ||
    !new RegExp('^sha256:[a-f0-9]{64}$').test(approvedPlanDigest || '')
  ) {
    fail(
      'RUNTIME_MIGRATION_APPROVAL_REQUIRED',
      'Exact transaction and approved plan digest are required'
    );
  }
  const owner = identity(adapters);
  const paths = locations(input);
  return coordinated(paths, owner, () => {
    const existing = readFence(paths);
    if (
      existing &&
      (existing.transactionId !== transactionId ||
        existing.planDigest !== approvedPlanDigest ||
        !sameOwner(existing.owner, owner))
    ) {
      fail('RUNTIME_MIGRATION_CONFLICT', 'A different migration owns the durable fence');
    }
    // A production census must observe both current and older uncooperative writers.
    // Absence of an adapter is unknown, never an empty census.
    const census = adapters.writerCensus?.();
    if (
      !census ||
      census.complete !== true ||
      !Array.isArray(census.writers) ||
      !Array.isArray(census.claims)
    ) {
      fail('RUNTIME_WRITER_CENSUS_UNKNOWN', 'Complete writer and claim observation is required');
    }
    const active = leases(paths);
    if (
      census.writers.some(
        (writer) =>
          !sameOwner(writer, owner) &&
          !(writer.cooperative === true && active.some((lease) => sameOwner(lease.owner, writer)))
      ) ||
      census.claims.some((claim) => claim.provider !== owner.provider || claim.sid !== owner.sid)
    ) {
      fail(
        'RUNTIME_WRITERS_ACTIVE',
        'Other live or uncooperative writers and claims block migration'
      );
    }
    const fence = existing || {
      schema: 'aitm.runtime-fence/v1',
      transactionId,
      planDigest: approvedPlanDigest,
      owner,
    };
    if (!existing) {
      adapters.prepareTransaction?.({ owner, transactionId, approvedPlanDigest });
      atomicJson(paths.fence, fence);
    }
    return { status: active.length ? 'draining' : 'quiesced', fence, leases: active };
  });
}

export const writeMigrationRecord = atomicJson;
export const readMigrationRecord = readRecord;
export const observeMigrationIdentity = identity;
export const isRuntimeMigrationOwner = validOwner;

export function completeRuntimeFence(input) {
  const owner = identity(input.adapters || {});
  const paths = locations(input);
  return coordinated(paths, owner, () => {
    const fence = readFence(paths);
    if (
      !fence ||
      fence.transactionId !== input.transactionId ||
      fence.planDigest !== input.approvedPlanDigest ||
      !sameOwner(fence.owner, owner)
    ) {
      fail('RUNTIME_MIGRATION_CONFLICT', 'Only the exact owning migrator can complete its fence');
    }
    const manifestFile = path.join(paths.base, fence.transactionId, 'manifest.json');
    assertRuntimeStoragePath(manifestFile, paths.base, 'RUNTIME_CONTROL_INVALID');
    const manifest = readRecord(manifestFile);
    if (
      manifest.schema !== 'aitm.runtime-migration/v1' ||
      manifest.status !== 'complete' ||
      manifest.transactionId !== fence.transactionId ||
      manifest.planDigest !== fence.planDigest ||
      !Array.isArray(manifest.roots) ||
      manifest.roots.length === 0
    ) {
      fail(
        'RUNTIME_TRANSACTION_INCOMPLETE',
        'All-root publication must complete before releasing the fence'
      );
    }
    if (
      JSON.stringify([...manifest.roots].sort()) !==
      JSON.stringify([...paths.registeredRoots].sort())
    ) {
      fail('RUNTIME_MIGRATION_CONFLICT', 'Worktree census changed before fence release');
    }
    for (const root of manifest.roots) {
      const layout = runtimeStoragePaths({ projectRoot: root, mainRoot: input.mainRoot });
      assertRuntimeStoragePath(
        layout.controlPath,
        layout.localRuntimeRoot,
        'RUNTIME_CONTROL_INVALID'
      );
      const control = readRecord(layout.controlPath);
      if (
        control.schema !== 'aitm.runtime-control/v1' ||
        control.status !== 'active' ||
        control.projectRoot !== root ||
        control.mainRoot !== input.mainRoot ||
        control.transactionId !== fence.transactionId ||
        control.planDigest !== fence.planDigest
      ) {
        fail('RUNTIME_TRANSACTION_INCOMPLETE', 'A participating root is not activated');
      }
    }
    unlinkSync(paths.fence);
  });
}

export function recoverRuntimeFence(input) {
  const owner = identity(input.adapters || {});
  const paths = locations(input);
  return coordinated(paths, owner, () => {
    const fence = readFence(paths);
    if (!fence)
      fail('RUNTIME_MIGRATION_FENCE_MISSING', 'Durable transaction requires fence recovery');
    if (
      fence.transactionId !== input.transactionId ||
      fence.planDigest !== input.approvedPlanDigest
    ) {
      fail('RUNTIME_MIGRATION_CONFLICT', 'Recovery requires the exact durable fence');
    }
    if (!sameOwner(fence.owner, owner)) {
      const observation = input.adapters?.observeOwner?.(fence.owner);
      if (observation?.status !== 'dead' || !sameOwner(observation.identity, fence.owner)) {
        fail(
          'RUNTIME_MIGRATION_OWNER_UNCONFIRMED',
          'Previous owner death is unconfirmed; PID reuse and age cannot authorize recovery'
        );
      }
      fence.previousOwners = [...(fence.previousOwners || []), fence.owner];
      fence.owner = owner;
      atomicJson(paths.fence, fence);
    }
    return fence;
  });
}

export function assertRecoveryOwner(previous, adapters = {}) {
  const owner = identity(adapters);
  if (!sameOwner(previous, owner)) {
    const observation = adapters.observeOwner?.(previous);
    if (
      !validOwner(previous) ||
      observation?.status !== 'dead' ||
      !sameOwner(observation.identity, previous)
    ) {
      fail('RUNTIME_MIGRATION_OWNER_UNCONFIRMED', 'Previous process death is unconfirmed');
    }
  }
  return owner;
}
