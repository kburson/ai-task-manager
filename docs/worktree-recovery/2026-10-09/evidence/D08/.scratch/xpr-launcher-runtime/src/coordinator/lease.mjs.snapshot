import { createHash, randomUUID } from 'node:crypto';
import { existsSync, lstatSync, mkdirSync, readFileSync, unlinkSync } from 'node:fs';
import path from 'node:path';

import { resolveContainedPath } from '../collateral/paths.mjs';
import { AprError } from '../errors.mjs';
import { canonicalProjection } from '../protocol/service.mjs';
import { atomicCreate, atomicWrite } from '../protocol/store.mjs';

const LEASE_SCHEMA = 'ai-peer-review.coordinator-lease/v1';
const LOCK_SCHEMA = 'ai-peer-review.coordinator-lock/v1';
const STOP_SCHEMA = 'ai-peer-review.coordinator-stop/v1';

function fail(code, message, recovery, details = {}) {
  throw new AprError(code, message, { recovery, details });
}

function instant(value) {
  const at = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(at.valueOf())) {
    fail(
      'APR_COORDINATOR_STALE',
      'Coordinator observation time is invalid.',
      'Use a valid current observation time.'
    );
  }
  return at.toISOString();
}

function pathsFor(workspace) {
  const directory = resolveContainedPath(
    workspace,
    path.join(workspace, 'coordinator'),
    'coordinator state'
  ).absolute;
  try {
    const metadata = lstatSync(directory);
    if (!metadata.isDirectory() || metadata.isSymbolicLink()) throw new Error('unsafe directory');
  } catch (cause) {
    if (cause?.code !== 'ENOENT') {
      fail(
        'APR_COORDINATOR_STALE',
        'Coordinator state directory is unsafe.',
        'Preserve the review workspace and remove unsafe indirection before retrying.'
      );
    }
  }
  return Object.freeze({
    directory,
    lock: path.join(directory, 'coordinator.lock'),
    lease: path.join(directory, 'coordinator-lease.json'),
    stop: path.join(directory, 'stop-request.json'),
  });
}

function bytes(value) {
  return Buffer.from(`${canonicalProjection(value)}\n`, 'utf8');
}

function readRegular(file, label) {
  try {
    const metadata = lstatSync(file);
    if (!metadata.isFile() || metadata.isSymbolicLink()) throw new Error('not regular');
    return JSON.parse(readFileSync(file, 'utf8'));
  } catch (cause) {
    fail(
      'APR_COORDINATOR_STALE',
      `${label} is missing or invalid.`,
      'Preserve coordinator evidence and use explicit recovery.',
      { file, cause: cause?.code ?? cause?.message ?? 'unknown' }
    );
  }
}

function validatePair(lock, lease) {
  if (
    lock?.schema !== LOCK_SCHEMA ||
    lease?.schema !== LEASE_SCHEMA ||
    typeof lock.token !== 'string' ||
    typeof lock.instance_id !== 'string' ||
    lock.instance_id !== lease.instance_id ||
    lock.token !== lease.token ||
    !Number.isSafeInteger(lease.heartbeat_sequence) ||
    lease.heartbeat_sequence <= 0 ||
    !Number.isFinite(Date.parse(lease.observed_at)) ||
    !['starting', 'active', 'stopping'].includes(lease.state)
  ) {
    fail(
      'APR_COORDINATOR_STALE',
      'Coordinator lock and lease evidence do not match.',
      'Preserve both records and use explicit coordinator recovery.'
    );
  }
  return Object.freeze({ lock: Object.freeze(lock), lease: Object.freeze(lease) });
}

export function inspectCoordinatorLease(workspace) {
  const paths = pathsFor(workspace);
  const lock = readRegular(paths.lock, 'Coordinator lock');
  const lease = readRegular(paths.lease, 'Coordinator lease');
  return Object.freeze({ ...validatePair(lock, lease), paths });
}

export function inspectCoordinatorLeaseOptional(workspace) {
  const paths = pathsFor(workspace);
  if (!existsSync(paths.lock) && !existsSync(paths.lease)) return null;
  return inspectCoordinatorLease(workspace);
}

function validateStopRequest(value) {
  if (
    value?.schema !== STOP_SCHEMA ||
    typeof value.instance_id !== 'string' ||
    !/^sha256:[0-9a-f]{64}$/.test(value.token) ||
    !Number.isFinite(Date.parse(value.requested_at)) ||
    Object.keys(value).sort().join(',') !== 'instance_id,requested_at,schema,token'
  ) {
    fail(
      'APR_COORDINATOR_STALE',
      'Coordinator stop request is invalid.',
      'Preserve coordinator evidence and request stop for the exact current instance.'
    );
  }
  return Object.freeze(value);
}

export function requestCoordinatorStop(workspace, now = new Date()) {
  const inspected = inspectCoordinatorLease(workspace);
  const request = {
    schema: STOP_SCHEMA,
    instance_id: inspected.lease.instance_id,
    token: inspected.lock.token,
    requested_at: instant(now),
  };
  try {
    atomicCreate(inspected.paths.stop, bytes(request));
    return Object.freeze(request);
  } catch (cause) {
    if (cause?.code !== 'APR_OUTPUT_COLLISION') throw cause;
    const existing = validateStopRequest(
      readRegular(inspected.paths.stop, 'Coordinator stop request')
    );
    if (existing.instance_id !== request.instance_id || existing.token !== request.token) {
      fail(
        'APR_COORDINATOR_STALE',
        'Coordinator stop request belongs to a different instance.',
        'Preserve the request and do not stop the current coordinator.'
      );
    }
    return existing;
  }
}

export function acquireCoordinatorLease(
  workspace,
  owner = { kind: 'cli', pid: process.pid },
  now = new Date(),
  { instanceId = randomUUID(), nonce = randomUUID() } = {}
) {
  if (
    !['cli', 'app-host'].includes(owner?.kind) ||
    (owner.pid !== null && !Number.isSafeInteger(owner.pid))
  ) {
    fail(
      'APR_COORDINATOR_STALE',
      'Coordinator owner description is invalid.',
      'Use a supported host owner and diagnostic PID or null.'
    );
  }
  const paths = pathsFor(workspace);
  mkdirSync(paths.directory, { recursive: true });
  const token = `sha256:${createHash('sha256').update(`${instanceId}:${nonce}`).digest('hex')}`;
  const lock = { schema: LOCK_SCHEMA, instance_id: instanceId, token };
  const observedAt = instant(now);
  const lease = {
    schema: LEASE_SCHEMA,
    review_id: path.basename(workspace),
    instance_id: instanceId,
    token,
    owner: { kind: owner.kind, pid: owner.pid },
    heartbeat_sequence: 1,
    observed_at: observedAt,
    state: 'active',
  };
  try {
    atomicCreate(paths.lock, bytes(lock));
  } catch (cause) {
    if (cause?.code === 'APR_OUTPUT_COLLISION') {
      fail(
        'APR_COORDINATOR_OWNED',
        'Review already has coordinator ownership evidence.',
        'Inspect coordinator status; never steal a surviving lock.',
        { lock: paths.lock }
      );
    }
    throw cause;
  }
  try {
    atomicCreate(paths.lease, bytes(lease));
  } catch (cause) {
    const current = readRegular(paths.lock, 'Coordinator lock');
    if (current.token === token) unlinkSync(paths.lock);
    throw cause;
  }

  let current = lease;
  let released = false;
  return Object.freeze({
    get lease() {
      return Object.freeze(current);
    },
    paths,
    heartbeat(at = new Date()) {
      if (released) {
        fail(
          'APR_COORDINATOR_STALE',
          'Released coordinator cannot heartbeat.',
          'Acquire a new coordinator lease.'
        );
      }
      const inspected = inspectCoordinatorLease(workspace);
      if (inspected.lock.token !== token || inspected.lease.instance_id !== instanceId) {
        fail(
          'APR_COORDINATOR_STALE',
          'Coordinator ownership changed before heartbeat.',
          'Stop and preserve the foreign coordinator evidence.'
        );
      }
      current = {
        ...current,
        heartbeat_sequence: current.heartbeat_sequence + 1,
        observed_at: instant(at),
      };
      atomicWrite(paths.lease, bytes(current));
      return Object.freeze(current);
    },
    stopRequested() {
      if (!existsSync(paths.stop)) return false;
      const request = validateStopRequest(readRegular(paths.stop, 'Coordinator stop request'));
      if (request.instance_id !== instanceId || request.token !== token) {
        fail(
          'APR_COORDINATOR_STALE',
          'Coordinator stop request does not match current ownership.',
          'Preserve the foreign request and do not stop this coordinator.'
        );
      }
      return true;
    },
    release() {
      if (released) return false;
      released = true;
      let lock;
      try {
        lock = readRegular(paths.lock, 'Coordinator lock');
      } catch {
        return false;
      }
      if (lock.token !== token || lock.instance_id !== instanceId) return false;
      let storedLease = null;
      try {
        storedLease = readRegular(paths.lease, 'Coordinator lease');
      } catch {
        storedLease = null;
      }
      if (
        storedLease?.token === token &&
        storedLease.instance_id === instanceId &&
        existsSync(paths.lease)
      ) {
        unlinkSync(paths.lease);
      }
      if (existsSync(paths.stop)) {
        const request = validateStopRequest(readRegular(paths.stop, 'Coordinator stop request'));
        if (request.instance_id === instanceId && request.token === token) unlinkSync(paths.stop);
      }
      if (existsSync(paths.lock)) unlinkSync(paths.lock);
      return true;
    },
  });
}
