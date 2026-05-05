import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { legacyPathFor } from './paths.mjs';

export const EMPTY_STATE = {
  active: null,
  lastActive: null,
  entryStartTs: null,
  wordsAtEntryStart: 0,
  totalActiveMinutes: 0,
  planBucket: null,
};

export function loadState(statePath) {
  let readPath = statePath;
  if (!existsSync(readPath)) {
    const legacy = legacyPathFor(statePath);
    if (legacy && existsSync(legacy)) readPath = legacy;
  }
  if (!existsSync(readPath)) return { ...EMPTY_STATE };
  try {
    const parsed = JSON.parse(readFileSync(readPath, 'utf8'));
    return { ...EMPTY_STATE, ...parsed };
  } catch {
    return { ...EMPTY_STATE };
  }
}

export function saveState(state, statePath) {
  mkdirSync(path.dirname(statePath), { recursive: true });
  writeFileSync(statePath, JSON.stringify(state, null, 2) + '\n', 'utf8');
}

export function clearActive(statePath) {
  const s = loadState(statePath);
  s.active = null;
  s.entryStartTs = null;
  s.wordsAtEntryStart = 0;
  s.planBucket = null;
  // keep lastActive
  saveState(s, statePath);
}
