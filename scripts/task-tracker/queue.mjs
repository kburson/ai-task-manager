import { assertRevisionStageHostEffect } from './lib/criteria-revision/transport-quarantine.mjs';
import { existsSync, readFileSync, writeFileSync, mkdirSync, renameSync } from 'node:fs';
import path from 'node:path';
import { legacyPathFor } from './paths.mjs';
import { randomUUID } from 'node:crypto';
import { withLock } from './fleet-registry.mjs';
import { parseTimingRow } from './lib/timing-row-reader.mjs';

const SCHEMA = 'aitm.timing-queue/v1';
function invalid() {
  const error = new Error('Timing queue is malformed, unsupported, or changed during delivery');
  error.code = 'TIMING_QUEUE_INVALID';
  throw error;
}
function eventValid(event) {
  if (!event || typeof event !== 'object' || Array.isArray(event)) invalid();
  if (typeof event.row === 'string' && event.row.includes('aitm-actor:')) parseTimingRow(event.row);
  return event;
}
export function validateTimingQueue(record) {
  if (Array.isArray(record))
    return record.map((event) => ({ id: randomUUID(), event: eventValid(event) }));
  if (
    !record ||
    record.schema !== SCHEMA ||
    !Array.isArray(record.items) ||
    Object.keys(record).some((key) => !['schema', 'items'].includes(key))
  )
    invalid();
  const ids = new Set();
  for (const item of record.items) {
    if (
      !item ||
      typeof item.id !== 'string' ||
      !item.id ||
      ids.has(item.id) ||
      Object.keys(item).sort().join(',') !== 'event,id'
    )
      invalid();
    ids.add(item.id);
    eventValid(item.event);
  }
  return record.items;
}

function read(queuePath) {
  let readPath = queuePath;
  if (!existsSync(readPath)) {
    const legacy = legacyPathFor(queuePath);
    if (legacy && existsSync(legacy)) readPath = legacy;
  }
  if (!existsSync(readPath)) return [];
  try {
    const parsed = JSON.parse(readFileSync(readPath, 'utf8'));
    return validateTimingQueue(parsed);
  } catch {
    invalid();
  }
}

function write(items, queuePath) {
  mkdirSync(path.dirname(queuePath), { recursive: true });
  const tmp = queuePath + '.tmp';
  writeFileSync(tmp, JSON.stringify({ schema: SCHEMA, items }, null, 2) + '\n', 'utf8');
  renameSync(tmp, queuePath);
}

export function peek(queuePath) {
  return read(queuePath).map((item) => item.event);
}

export function enqueue(event, queuePath) {
  assertRevisionStageHostEffect();
  return withLock(queuePath, () => {
    const items = read(queuePath);
    items.push({
      id: randomUUID(),
      event: eventValid({ ...event, queuedAt: new Date().toISOString() }),
    });
    write(items, queuePath);
  });
}
function snapshot(queuePath) {
  assertRevisionStageHostEffect();
  return withLock(queuePath, () => {
    const items = read(queuePath);
    write(items, queuePath);
    return items;
  });
}
function consume(queuePath, completed) {
  assertRevisionStageHostEffect();
  return withLock(queuePath, () => {
    const current = read(queuePath);
    for (const item of current) {
      if (completed.has(item.id) && JSON.stringify(item.event) !== completed.get(item.id))
        invalid();
    }
    write(
      current.filter((item) => !completed.has(item.id)),
      queuePath
    );
  });
}

export async function drain(handler, queuePath) {
  const items = snapshot(queuePath);
  const completed = new Map();
  let failed = 0;
  for (const item of items) {
    try {
      await handler(structuredClone(item.event));
      completed.set(item.id, JSON.stringify(item.event));
    } catch {
      failed++;
    }
  }
  consume(queuePath, completed);
  return failed === 0;
}

// Drain only matching items while retaining failed deliveries for a later
// retry. Terminal evidence uses this stricter variant: an issue must not freeze
// an immutable outcome while one of its timing rows is still only local.
export async function drainMatching(handler, queuePath, predicate) {
  const items = snapshot(queuePath);
  const completed = new Map();
  let delivered = 0;
  let pending = 0;
  for (const item of items) {
    if (!predicate(structuredClone(item.event))) {
      continue;
    }
    try {
      await handler(structuredClone(item.event));
      completed.set(item.id, JSON.stringify(item.event));
      delivered++;
    } catch {
      pending++;
    }
  }
  consume(queuePath, completed);
  return { delivered, pending };
}

// Drain only items matching `predicate`, consuming them regardless of handler
// outcome. Non-matching items are written back untouched. Callers may supply a
// `shouldRetainOnFailure` predicate for rows whose sequence meaning must survive
// the terminal drain; all other failed matches retain the historical discard
// behavior.
export async function drainAndDiscard(
  handler,
  queuePath,
  predicate,
  shouldRetainOnFailure = () => false
) {
  const items = snapshot(queuePath);
  const completed = new Map();
  const targeted = [];
  for (const item of items) {
    if (predicate(structuredClone(item.event))) targeted.push(item);
  }
  let delivered = 0;
  let discarded = 0;
  let retained = 0;
  for (const item of targeted) {
    try {
      await handler(structuredClone(item.event));
      completed.set(item.id, JSON.stringify(item.event));
      delivered++;
    } catch {
      if (shouldRetainOnFailure(structuredClone(item.event))) {
        retained++;
      } else {
        completed.set(item.id, JSON.stringify(item.event));
        discarded++;
      }
    }
  }
  consume(queuePath, completed);
  return { delivered, discarded, retained };
}
