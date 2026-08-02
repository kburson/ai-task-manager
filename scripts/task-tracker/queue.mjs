import { existsSync, readFileSync, writeFileSync, mkdirSync, renameSync } from 'node:fs';
import path from 'node:path';
import { legacyPathFor } from './paths.mjs';

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

export async function drain(handler, queuePath) {
  const items = read(queuePath);
  const failed = [];
  for (const item of items) {
    try {
      await handler(item);
    } catch {
      failed.push(item);
    }
  }
  write(failed, queuePath);
  return failed.length === 0;
}

// Drain only matching items while retaining failed deliveries for a later
// retry. Terminal evidence uses this stricter variant: an issue must not freeze
// an immutable outcome while one of its timing rows is still only local.
export async function drainMatching(handler, queuePath, predicate) {
  const items = read(queuePath);
  const kept = [];
  let delivered = 0;
  let pending = 0;
  for (const item of items) {
    if (!predicate(item)) {
      kept.push(item);
      continue;
    }
    try {
      await handler(item);
      delivered++;
    } catch {
      kept.push(item);
      pending++;
    }
  }
  write(kept, queuePath);
  return { delivered, pending };
}

// Drain only items matching `predicate`, consuming them regardless of handler
// outcome. Non-matching items are written back untouched. Used at end of
// `/task close` to clear queue entries for the closing issue — once an issue
// is Done, residual rows are not interesting and must not re-queue forever.
export async function drainAndDiscard(handler, queuePath, predicate) {
  const items = read(queuePath);
  const kept = [];
  const targeted = [];
  for (const item of items) {
    if (predicate(item)) targeted.push(item);
    else kept.push(item);
  }
  let delivered = 0;
  let discarded = 0;
  for (const item of targeted) {
    try {
      await handler(item);
      delivered++;
    } catch {
      discarded++;
    }
  }
  write(kept, queuePath);
  return { delivered, discarded };
}
