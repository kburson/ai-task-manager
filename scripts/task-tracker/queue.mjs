import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';

function read(queuePath) {
  if (!existsSync(queuePath)) return [];
  try {
    const parsed = JSON.parse(readFileSync(queuePath, 'utf8'));
    return Array.isArray(parsed) ? parsed : [];
  } catch { return []; }
}

function write(items, queuePath) {
  mkdirSync(path.dirname(queuePath), { recursive: true });
  writeFileSync(queuePath, JSON.stringify(items, null, 2) + '\n', 'utf8');
}

export function peek(queuePath) { return read(queuePath); }

export function enqueue(event, queuePath) {
  const items = read(queuePath);
  items.push({ ...event, queuedAt: new Date().toISOString() });
  write(items, queuePath);
}

export async function drain(handler, queuePath) {
  const items = read(queuePath);
  let i = 0;
  try {
    for (; i < items.length; i++) {
      await handler(items[i]);
    }
    write([], queuePath);
    return true;
  } catch (err) {
    write(items.slice(i), queuePath);
    return false;
  }
}
