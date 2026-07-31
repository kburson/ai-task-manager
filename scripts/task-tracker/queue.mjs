import { existsSync, readFileSync, writeFileSync, mkdirSync, renameSync } from 'node:fs';
import path from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { legacyPathFor } from './paths.mjs';
import { withLock } from './locks.mjs';
import { isGovernedAuthorityError } from './lib/work-lease/governed-effect.mjs';

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

function write(items, queuePath) {
  mkdirSync(path.dirname(queuePath), { recursive: true });
  const tmp = queuePath + '.tmp';
  writeFileSync(tmp, JSON.stringify(items, null, 2) + '\n', 'utf8');
  renameSync(tmp, queuePath);
}

export function peek(queuePath) {
  return read(queuePath);
}

export function enqueue(event, queuePath) {
  const items = read(queuePath);
  items.push({ ...event, queuedAt: new Date().toISOString() });
  write(items, queuePath);
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

export async function drain(handler, queuePath) {
  return withLock(`${queuePath}.drain.lock`, async () => {
    const items = read(queuePath);
    const succeeded = [];
    let failed = 0;
    for (const item of items) {
      try {
        await handler(item);
        succeeded.push(item);
      } catch {
        failed += 1;
      }
    }
    if (succeeded.length > 0) {
      const latest = read(queuePath);
      for (const item of succeeded) {
        const index = latest.findIndex((candidate) => isDeepStrictEqual(candidate, item));
        if (index >= 0) latest.splice(index, 1);
      }
      write(latest, queuePath);
    }
    return failed === 0;
  });
}

// Remove only the exact entries whose remote effects have already received a
// positive reconciliation proof. A retry after local response loss sees the
// entry already absent and succeeds; changed or newly queued entries never
// match and remain untouched.
export function removeExactQueueEntries(entries, queuePath) {
  if (!Array.isArray(entries)) {
    throw new TypeError('exact queue entries must be an array');
  }
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
  write(items, queuePath);
  return { reconciled: true, removed, alreadyAbsent };
}

// Drain only items matching `predicate`, consuming them regardless of handler
// outcome. Non-matching items are written back untouched. Used at end of
// `/task close` to clear queue entries for the closing issue — once an issue
// is Done, residual rows are not interesting and must not re-queue forever.
export async function drainAndDiscard(handler, queuePath, predicate) {
  return withLock(`${queuePath}.drain.lock`, async () => {
    const items = read(queuePath);
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
      const latest = read(queuePath);
      for (const item of consumed) {
        const index = latest.findIndex((candidate) => isDeepStrictEqual(candidate, item));
        if (index >= 0) latest.splice(index, 1);
      }
      write(latest, queuePath);
    }
    return authorityRefused > 0
      ? { delivered, discarded, authorityRefused }
      : { delivered, discarded };
  });
}
