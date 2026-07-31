import {
  existsSync,
  readFileSync,
  writeFileSync,
  mkdirSync,
  renameSync,
  rmdirSync,
  statSync,
} from 'node:fs';
import path from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { legacyPathFor } from './paths.mjs';
import { LOCK_RETRY_MS, LOCK_STALE_MS, DEFAULT_TIMEOUT_MS, withLock } from './locks.mjs';
import { isGovernedAuthorityError } from './lib/work-lease/governed-effect.mjs';

export { canonicalTimingQueueProjection } from './lib/timing-queue-projection.mjs';

let tempSequence = 0;

function read(queuePath) {
  let readPath = queuePath;
  if (!existsSync(readPath)) {
    const legacy = legacyPathFor(queuePath);
    if (legacy && existsSync(legacy)) readPath = legacy;
  }
  if (!existsSync(readPath)) return [];
  try {
    const parsed = JSON.parse(readFileSync(readPath, 'utf8'));
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function write(items, queuePath, deps = {}) {
  mkdirSync(path.dirname(queuePath), { recursive: true });
  tempSequence += 1;
  const tmp = `${queuePath}.tmp-${process.pid}-${tempSequence}`;
  deps.beforeTempWrite?.(tmp);
  writeFileSync(tmp, JSON.stringify(items, null, 2) + '\n', 'utf8');
  renameSync(tmp, queuePath);
}

function withQueueMutationLock(queuePath, callback, deps = {}) {
  const lockPath = `${queuePath}.mutation.lock`;
  mkdirSync(path.dirname(lockPath), { recursive: true });
  const timeoutMs = deps.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const deadline = Date.now() + timeoutMs;
  while (true) {
    try {
      mkdirSync(lockPath);
      break;
    } catch (error) {
      if (error.code !== 'EEXIST') throw error;
      try {
        if (Date.now() - statSync(lockPath).mtimeMs > LOCK_STALE_MS) {
          try {
            rmdirSync(lockPath);
          } catch {
            // Another process recovered or released it first.
          }
          continue;
        }
      } catch {
        // The lock vanished between the failed mkdir and stat.
      }
      if (Date.now() > deadline) {
        throw new Error(`queue: timeout acquiring ${lockPath} after ${timeoutMs}ms`);
      }
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, LOCK_RETRY_MS);
    }
  }
  try {
    deps.onMutationLockAcquired?.();
    return callback();
  } finally {
    try {
      rmdirSync(lockPath);
    } catch {
      // Best-effort release after a completed atomic rename.
    }
  }
}

export function peek(queuePath) {
  return read(queuePath);
}

export function enqueue(event, queuePath, deps = {}) {
  return withQueueMutationLock(
    queuePath,
    () => {
      const items = read(queuePath);
      items.push({ ...event, queuedAt: new Date().toISOString() });
      write(items, queuePath, deps);
    },
    deps
  );
}

function requiredProjectionString(value, label) {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new TypeError(`${label} must be a non-empty string`);
  }
  return value;
}

// #1049 — durable timing-projection queue envelope. The exact prebuilt row and
// both stable identities survive a network failure unchanged. Queueing is not a
// positive remote reconciliation proof; the caller must deliver the event and
// use gh-timing-comment.mjs::readTimingProjection before marking completion.
export function enqueueTimingProjection(
  { issue, row, projectionId, subOperationId } = {},
  queuePath
) {
  const stableProjectionId = requiredProjectionString(projectionId, 'timing projectionId');
  const stableSubOperationId = requiredProjectionString(subOperationId, 'timing subOperationId');
  if (typeof row !== 'string' || row === '') {
    throw new TypeError('timing projection row must be a non-empty string');
  }
  enqueue(
    {
      kind: 'timing',
      issue,
      row,
      projectionId: stableProjectionId,
      subOperationId: stableSubOperationId,
    },
    queuePath
  );
  return {
    ok: false,
    queued: true,
    projectionId: stableProjectionId,
    subOperationId: stableSubOperationId,
  };
}

export async function withQueueDrainClaim(queuePath, callback) {
  if (typeof callback !== 'function') {
    throw new TypeError('queue drain claim callback is required');
  }
  return withLock(`${queuePath}.drain.lock`, callback);
}

export async function drain(handler, queuePath, deps = {}) {
  return withQueueDrainClaim(queuePath, async () => {
    const items = withQueueMutationLock(queuePath, () => read(queuePath));
    const succeeded = [];
    let retained = 0;
    let authorityRefused = 0;
    for (const item of items) {
      try {
        await handler(item);
        succeeded.push(item);
      } catch (error) {
        if (isGovernedAuthorityError(error)) authorityRefused += 1;
        else retained += 1;
      }
    }
    if (succeeded.length > 0) {
      await deps.beforeFinalReconcile?.();
      withQueueMutationLock(queuePath, () => {
        const latest = read(queuePath);
        for (const item of succeeded) {
          const index = latest.findIndex((candidate) => isDeepStrictEqual(candidate, item));
          if (index >= 0) latest.splice(index, 1);
        }
        write(latest, queuePath, deps);
      });
    }
    const result = {
      delivered: succeeded.length,
      retained,
      authorityRefused,
    };
    return deps.structuredResult === true ? result : retained === 0 && authorityRefused === 0;
  });
}

// Remove only the exact entries whose remote effects have already received a
// positive reconciliation proof. A retry after local response loss sees the
// entry already absent and succeeds; changed or newly queued entries never
// match and remain untouched.
export function removeExactQueueEntries(entries, queuePath, deps = {}) {
  if (!Array.isArray(entries)) {
    throw new TypeError('exact queue entries must be an array');
  }
  return withQueueMutationLock(
    queuePath,
    () => {
      const items = read(queuePath);
      let removed = 0;
      let alreadyAbsent = 0;
      for (const expected of entries) {
        const index = items.findIndex((item) => isDeepStrictEqual(item, expected));
        if (index < 0) {
          alreadyAbsent += 1;
          continue;
        }
        items.splice(index, 1);
        removed += 1;
      }
      if (removed > 0) write(items, queuePath, deps);
      return { reconciled: true, removed, alreadyAbsent };
    },
    deps
  );
}

// Drain only items matching `predicate`, consuming them regardless of handler
// outcome. Non-matching items are written back untouched. Used at end of
// `/task close` to clear queue entries for the closing issue — once an issue
// is Done, residual rows are not interesting and must not re-queue forever.
export async function drainAndDiscard(handler, queuePath, predicate, deps = {}) {
  return withQueueDrainClaim(queuePath, async () => {
    const items = withQueueMutationLock(queuePath, () => read(queuePath));
    const targeted = items.filter(predicate);
    const consumed = [];
    let delivered = 0;
    let discarded = 0;
    let authorityRefused = 0;
    for (const item of targeted) {
      try {
        await handler(item);
        delivered++;
        consumed.push(item);
      } catch (error) {
        if (isGovernedAuthorityError(error)) {
          authorityRefused++;
        } else {
          discarded++;
          consumed.push(item);
        }
      }
    }
    if (consumed.length > 0) {
      await deps.beforeFinalReconcile?.();
      withQueueMutationLock(queuePath, () => {
        const latest = read(queuePath);
        for (const item of consumed) {
          const index = latest.findIndex((candidate) => isDeepStrictEqual(candidate, item));
          if (index >= 0) latest.splice(index, 1);
        }
        write(latest, queuePath, deps);
      });
    }
    return authorityRefused > 0
      ? { delivered, discarded, authorityRefused }
      : { delivered, discarded };
  });
}
