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
